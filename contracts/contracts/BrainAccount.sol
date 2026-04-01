// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPolicyValidator {
    function verifyPaymentProof(
        bytes32 agentId,
        bytes32 intentHash,
        uint256 expiry,
        bytes calldata proof
    ) external returns (bool);

    function verifyTradeProof(
        bytes32 agentId,
        bytes32 tradeIntentHash,
        uint256 expiry,
        bytes calldata proof
    ) external returns (bool);
}

interface IEntryPoint {
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
    function handleOps(bytes[] calldata ops, address payable beneficiary) external;
}

/**
 * @title BrainAccount
 * @notice ERC-4337-compatible smart account for Brain Finance.
 *
 *         Architecture:
 *         - One BrainAccount per user, deployed by BrainAccountFactory.
 *         - Owner is the user's Crossmint Embedded Wallet address.
 *         - Each AI agent has an isolated sub-account (capital pool) inside this contract.
 *         - Agents can only spend from their allocated capital.
 *         - All agent payments require a valid signed policy proof from Brain's policy engine.
 *         - Policy configuration is stored both on-chain (hash) and enforced per-call.
 *
 *         ERC-4337 integration:
 *         - validateUserOp() validates the owner's signature over a UserOperation hash.
 *         - executeUserOp() dispatches the calldata to this account.
 *         - Gas sponsorship handled externally via Alchemy Paymaster.
 */
contract BrainAccount is ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────────
    uint256 public constant SIG_VALIDATION_FAILED = 1;
    uint256 public constant SIG_VALIDATION_SUCCESS = 0;

    // ─── State ────────────────────────────────────────────────────────────────
    address public owner;
    IEntryPoint public immutable entryPoint;
    IPolicyValidator public policyValidator;

    // agentId => AgentConfig
    mapping(bytes32 => AgentConfig) public agents;
    // agentId => allocated USDC balance (6 decimals)
    mapping(bytes32 => uint256) public agentBalances;
    // agentId => policy hash stored on-chain (keccak256 of PolicyConfig fields)
    mapping(bytes32 => bytes32) public agentPolicyHashes;
    // nonce for ERC-4337 userOp validation
    uint256 public nonce;

    // ─── Structs ──────────────────────────────────────────────────────────────
    struct AgentConfig {
        address executionWallet;       // Crossmint Agent Wallet address
        uint256 spendLimit;            // max USDC per time window (6 decimals)
        uint256 timeWindowSeconds;     // rolling window duration
        uint256 spentInWindow;         // USDC spent in current window
        uint256 windowStart;           // timestamp of current window start
        uint256 approvalThreshold;     // single-tx amount requiring human approval (0 = never)
        bool tradingEnabled;           // whether this agent can execute trades
        uint256 maxPositionSize;       // max notional per trade (0 = unlimited)
        uint256 cumulativeExposure;    // current cumulative open exposure
        uint256 maxCumulativeExposure; // cap on total open exposure
        bool active;
    }

    // ─── Events ───────────────────────────────────────────────────────────────
    event AgentAuthorized(
        bytes32 indexed agentId,
        address executionWallet,
        uint256 spendLimit,
        uint256 timeWindowSeconds
    );
    event PolicySet(bytes32 indexed agentId, bytes32 policyHash);
    event AgentCapitalAllocated(bytes32 indexed agentId, uint256 amount);
    event AgentCapitalDeallocated(bytes32 indexed agentId, uint256 amount);
    event PaymentExecuted(
        bytes32 indexed agentId,
        address indexed asset,
        address indexed merchant,
        uint256 amount,
        bytes32 intentHash
    );
    event TradeExecuted(
        bytes32 indexed agentId,
        bytes32 indexed tradeIntentHash,
        uint256 notional
    );
    event AgentDeactivated(bytes32 indexed agentId);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner || msg.sender == address(entryPoint), "BrainAccount: unauthorized");
        _;
    }

    modifier onlyAgent(bytes32 agentId) {
        require(msg.sender == agents[agentId].executionWallet, "BrainAccount: not agent wallet");
        _;
    }

    modifier agentActive(bytes32 agentId) {
        require(agents[agentId].active, "BrainAccount: agent not active");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address entryPoint_, address owner_, address policyValidator_) {
        require(entryPoint_ != address(0), "BrainAccount: zero entryPoint");
        require(owner_ != address(0), "BrainAccount: zero owner");
        require(policyValidator_ != address(0), "BrainAccount: zero policyValidator");
        entryPoint = IEntryPoint(entryPoint_);
        owner = owner_;
        policyValidator = IPolicyValidator(policyValidator_);
    }

    // ─── Ownership ────────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "BrainAccount: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function updatePolicyValidator(address newValidator) external onlyOwner {
        require(newValidator != address(0), "BrainAccount: zero address");
        policyValidator = IPolicyValidator(newValidator);
    }

    // ─── Agent Lifecycle ──────────────────────────────────────────────────────

    /**
     * @notice Authorize an AI agent and configure its policy.
     *         Called by the owner after registering the agent in AgentRegistry.
     *         Step 11 in the deployment flow.
     */
    function authorizeAgent(
        bytes32 agentId,
        address executionWallet,
        uint256 spendLimit,
        uint256 timeWindowSeconds,
        uint256 approvalThreshold,
        bool tradingEnabled,
        uint256 maxPositionSize,
        uint256 maxCumulativeExposure
    ) external onlyOwner {
        require(executionWallet != address(0), "BrainAccount: zero execution wallet");
        require(spendLimit > 0, "BrainAccount: zero spend limit");
        require(timeWindowSeconds > 0, "BrainAccount: zero time window");

        agents[agentId] = AgentConfig({
            executionWallet: executionWallet,
            spendLimit: spendLimit,
            timeWindowSeconds: timeWindowSeconds,
            spentInWindow: 0,
            windowStart: block.timestamp,
            approvalThreshold: approvalThreshold,
            tradingEnabled: tradingEnabled,
            maxPositionSize: maxPositionSize,
            cumulativeExposure: 0,
            maxCumulativeExposure: maxCumulativeExposure,
            active: true
        });

        emit AgentAuthorized(agentId, executionWallet, spendLimit, timeWindowSeconds);
    }

    /**
     * @notice Write the policy hash on-chain.
     *         Step 8 in the deployment flow: setPolicy writes a commitment
     *         to the policy configuration that was applied off-chain.
     * @param agentId    The agent's bytes32 identifier.
     * @param policyHash keccak256 of the JSON-encoded policy config.
     */
    function setPolicy(bytes32 agentId, bytes32 policyHash) external onlyOwner {
        require(agents[agentId].executionWallet != address(0), "BrainAccount: agent not registered");
        agentPolicyHashes[agentId] = policyHash;
        emit PolicySet(agentId, policyHash);
    }

    /**
     * @notice Deactivate an agent — freezes all future executions.
     */
    function deactivateAgent(bytes32 agentId) external onlyOwner {
        agents[agentId].active = false;
        emit AgentDeactivated(agentId);
    }

    // ─── Capital Management ───────────────────────────────────────────────────

    /**
     * @notice Allocate USDC from the owner's wallet into an agent's sub-account.
     *         Step 12 in the deployment flow.
     * @param agentId The target agent.
     * @param asset   ERC-20 token address (USDC on Base).
     * @param amount  Amount to allocate (6 decimals for USDC).
     */
    function allocateCapital(
        bytes32 agentId,
        address asset,
        uint256 amount
    ) external onlyOwner agentActive(agentId) nonReentrant {
        require(amount > 0, "BrainAccount: zero amount");
        IERC20(asset).safeTransferFrom(owner, address(this), amount);
        agentBalances[agentId] += amount;
        emit AgentCapitalAllocated(agentId, amount);
    }

    /**
     * @notice Deallocate capital back to the owner (emergency withdrawal or agent shutdown).
     */
    function deallocateCapital(
        bytes32 agentId,
        address asset,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(agentBalances[agentId] >= amount, "BrainAccount: insufficient agent balance");
        agentBalances[agentId] -= amount;
        IERC20(asset).safeTransfer(owner, amount);
        emit AgentCapitalDeallocated(agentId, amount);
    }

    // ─── Agent Execution: Payments ────────────────────────────────────────────

    /**
     * @notice Execute an agent payment after policy proof is verified on-chain.
     *         Implements step 18 in the x402 payment flow.
     *
     *         Security guarantees:
     *         - Spend window enforcement (rolling budget).
     *         - Policy proof from Brain's trusted signer verified by PolicyValidator.
     *         - Proof is single-use (replay prevention in PolicyValidator).
     *         - Amount verified against agent's allocated sub-account balance.
     *
     * @param agentId     The agent's bytes32 identifier.
     * @param asset       ERC-20 token (USDC).
     * @param merchant    Recipient address.
     * @param amount      Payment amount (6 decimals for USDC).
     * @param intentHash  keccak256 of the PaymentIntent struct.
     * @param expiry      Timestamp after which the proof is invalid.
     * @param policyProof ECDSA signature from Brain's trusted signer.
     */
    function executeAgentPayment(
        bytes32 agentId,
        address asset,
        address merchant,
        uint256 amount,
        bytes32 intentHash,
        uint256 expiry,
        bytes calldata policyProof
    ) external onlyAgent(agentId) agentActive(agentId) nonReentrant {
        require(block.timestamp < expiry, "BrainAccount: proof expired");
        require(merchant != address(0), "BrainAccount: zero merchant");
        require(amount > 0, "BrainAccount: zero amount");
        require(agentBalances[agentId] >= amount, "BrainAccount: insufficient agent balance");

        AgentConfig storage agent = agents[agentId];

        // Rolling window enforcement
        if (block.timestamp >= agent.windowStart + agent.timeWindowSeconds) {
            agent.spentInWindow = 0;
            agent.windowStart = block.timestamp;
        }
        require(
            agent.spentInWindow + amount <= agent.spendLimit,
            "BrainAccount: spend limit exceeded"
        );

        // On-chain policy proof verification
        require(
            policyValidator.verifyPaymentProof(agentId, intentHash, expiry, policyProof),
            "BrainAccount: invalid policy proof"
        );

        // Execute
        agent.spentInWindow += amount;
        agentBalances[agentId] -= amount;
        IERC20(asset).safeTransfer(merchant, amount);

        emit PaymentExecuted(agentId, asset, merchant, amount, intentHash);
    }

    // ─── Agent Execution: Trades ──────────────────────────────────────────────

    /**
     * @notice Record a trade policy approval and update exposure tracking.
     *         The actual trade is executed off-chain via Hyperliquid API;
     *         this function enforces on-chain policy constraints and records
     *         the intent before the Hyperliquid order is submitted.
     *
     * @param agentId          The agent's bytes32 identifier.
     * @param notional         Notional size of the trade (6 decimals).
     * @param tradeIntentHash  keccak256 of the TradeIntent struct.
     * @param expiry           Proof expiry timestamp.
     * @param policyProof      ECDSA signature from Brain's trusted signer.
     */
    function approveTradeIntent(
        bytes32 agentId,
        uint256 notional,
        bytes32 tradeIntentHash,
        uint256 expiry,
        bytes calldata policyProof
    ) external onlyAgent(agentId) agentActive(agentId) nonReentrant {
        require(block.timestamp < expiry, "BrainAccount: proof expired");
        require(notional > 0, "BrainAccount: zero notional");

        AgentConfig storage agent = agents[agentId];
        require(agent.tradingEnabled, "BrainAccount: trading not enabled");

        if (agent.maxPositionSize > 0) {
            require(notional <= agent.maxPositionSize, "BrainAccount: exceeds maxPositionSize");
        }
        if (agent.maxCumulativeExposure > 0) {
            require(
                agent.cumulativeExposure + notional <= agent.maxCumulativeExposure,
                "BrainAccount: exceeds cumulative exposure"
            );
        }

        require(
            policyValidator.verifyTradeProof(agentId, tradeIntentHash, expiry, policyProof),
            "BrainAccount: invalid trade proof"
        );

        agent.cumulativeExposure += notional;
        emit TradeExecuted(agentId, tradeIntentHash, notional);
    }

    /**
     * @notice Called by the agent after a trade position is closed to release exposure.
     */
    function releaseTradeExposure(bytes32 agentId, uint256 notional) external onlyAgent(agentId) {
        AgentConfig storage agent = agents[agentId];
        if (agent.cumulativeExposure >= notional) {
            agent.cumulativeExposure -= notional;
        } else {
            agent.cumulativeExposure = 0;
        }
    }

    // ─── ERC-4337: UserOperation Validation ──────────────────────────────────

    /**
     * @notice Validate a UserOperation signature.
     *         Called by the EntryPoint during ERC-4337 bundler processing.
     *         Returns 0 (success) or SIG_VALIDATION_FAILED.
     */
    function validateUserOp(
        bytes calldata userOpData,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        require(msg.sender == address(entryPoint), "BrainAccount: only entryPoint");

        bytes32 hash = userOpHash.toEthSignedMessageHash();
        (bytes memory sig) = abi.decode(userOpData, (bytes));
        (address recovered,,) = hash.tryRecover(sig);

        if (recovered != owner) return SIG_VALIDATION_FAILED;

        // Pay missing funds to EntryPoint
        if (missingAccountFunds > 0) {
            (bool ok,) = payable(address(entryPoint)).call{value: missingAccountFunds}("");
            require(ok, "BrainAccount: prefund failed");
        }

        return SIG_VALIDATION_SUCCESS;
    }

    /**
     * @notice Execute a call from the EntryPoint (ERC-4337).
     */
    function execute(address dest, uint256 value, bytes calldata data) external onlyOwner {
        (bool ok, bytes memory result) = dest.call{value: value}(data);
        if (!ok) {
            assembly { revert(add(result, 32), mload(result)) }
        }
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    function getAgentConfig(bytes32 agentId) external view returns (AgentConfig memory) {
        return agents[agentId];
    }

    function getAgentBalance(bytes32 agentId) external view returns (uint256) {
        return agentBalances[agentId];
    }

    function getAgentPolicyHash(bytes32 agentId) external view returns (bytes32) {
        return agentPolicyHashes[agentId];
    }

    function getRemainingBudget(bytes32 agentId) external view returns (uint256) {
        AgentConfig storage agent = agents[agentId];
        if (block.timestamp >= agent.windowStart + agent.timeWindowSeconds) {
            return agent.spendLimit; // window would reset
        }
        if (agent.spentInWindow >= agent.spendLimit) return 0;
        return agent.spendLimit - agent.spentInWindow;
    }

    // ─── Receive ──────────────────────────────────────────────────────────────
    receive() external payable {}
}
