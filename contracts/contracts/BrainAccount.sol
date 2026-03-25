// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IPolicyValidator {
    function verifyProof(bytes32 agentId, bytes32 intentHash, bytes calldata proof) external returns (bool);
}

interface IEntryPoint {
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
}

/**
 * @title BrainAccount
 * @notice ERC-4337-compatible smart account for Brain Finance.
 *         Each user deploys one BrainAccount which holds USDC and
 *         manages sub-accounts (capital allocations) for AI agents.
 */
contract BrainAccount {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public owner;
    IEntryPoint private immutable _entryPoint;
    IPolicyValidator public policyValidator;

    uint256 public constant SIG_VALIDATION_FAILED = 1;

    // agentId => AgentConfig
    mapping(bytes32 => AgentConfig) public agents;
    // agentId => balance (in USDC, 6 decimals)
    mapping(bytes32 => uint256) public agentBalances;

    struct AgentConfig {
        address executionWallet;
        uint256 spendLimit;
        uint256 timeWindowSeconds;
        uint256 spentInWindow;
        uint256 windowStart;
        address[] allowedAssets;
        bool active;
    }

    event AgentAuthorized(bytes32 indexed agentId, address executionWallet, uint256 spendLimit);
    event AgentCapitalAllocated(bytes32 indexed agentId, uint256 amount);
    event AgentCapitalDeallocated(bytes32 indexed agentId, uint256 amount);
    event PaymentExecuted(bytes32 indexed agentId, address merchant, uint256 amount, bytes32 intentHash);
    event AgentDeactivated(bytes32 indexed agentId);

    modifier onlyOwner() {
        require(msg.sender == owner, "BrainAccount: not owner");
        _;
    }

    modifier onlyAgent(bytes32 agentId) {
        require(msg.sender == agents[agentId].executionWallet, "BrainAccount: not agent wallet");
        _;
    }

    constructor(address entryPoint_, address owner_, address policyValidator_) {
        _entryPoint = IEntryPoint(entryPoint_);
        owner = owner_;
        policyValidator = IPolicyValidator(policyValidator_);
    }

    function entryPoint() public view returns (IEntryPoint) {
        return _entryPoint;
    }

    /**
     * @notice Authorize an AI agent to spend from this account.
     */
    function authorizeAgent(
        bytes32 agentId,
        address executionWallet,
        uint256 spendLimit,
        uint256 timeWindowSeconds,
        address[] calldata allowedAssets
    ) external onlyOwner {
        agents[agentId] = AgentConfig({
            executionWallet: executionWallet,
            spendLimit: spendLimit,
            timeWindowSeconds: timeWindowSeconds,
            spentInWindow: 0,
            windowStart: block.timestamp,
            allowedAssets: allowedAssets,
            active: true
        });
        emit AgentAuthorized(agentId, executionWallet, spendLimit);
    }

    /**
     * @notice Allocate USDC capital to an agent sub-account.
     */
    function allocateCapital(bytes32 agentId, address asset, uint256 amount) external onlyOwner {
        require(agents[agentId].active, "BrainAccount: agent not active");
        IERC20(asset).transferFrom(owner, address(this), amount);
        agentBalances[agentId] += amount;
        emit AgentCapitalAllocated(agentId, amount);
    }

    /**
     * @notice Deallocate capital back to owner.
     */
    function deallocateCapital(bytes32 agentId, address asset, uint256 amount) external onlyOwner {
        require(agentBalances[agentId] >= amount, "BrainAccount: insufficient balance");
        agentBalances[agentId] -= amount;
        IERC20(asset).transfer(owner, amount);
        emit AgentCapitalDeallocated(agentId, amount);
    }

    /**
     * @notice Agent executes a payment after policy proof is verified.
     */
    function executeAgentPayment(
        bytes32 agentId,
        address asset,
        address merchant,
        uint256 amount,
        bytes32 intentHash,
        bytes calldata policyProof
    ) external onlyAgent(agentId) {
        AgentConfig storage agent = agents[agentId];
        require(agent.active, "BrainAccount: agent not active");
        require(agentBalances[agentId] >= amount, "BrainAccount: insufficient agent balance");

        // Reset window if expired
        if (block.timestamp >= agent.windowStart + agent.timeWindowSeconds) {
            agent.spentInWindow = 0;
            agent.windowStart = block.timestamp;
        }
        require(agent.spentInWindow + amount <= agent.spendLimit, "BrainAccount: spend limit exceeded");

        // Verify policy proof from Brain backend
        require(
            policyValidator.verifyProof(agentId, intentHash, policyProof),
            "BrainAccount: invalid policy proof"
        );

        agent.spentInWindow += amount;
        agentBalances[agentId] -= amount;
        IERC20(asset).transfer(merchant, amount);

        emit PaymentExecuted(agentId, merchant, amount, intentHash);
    }

    /**
     * @notice Deactivate an agent.
     */
    function deactivateAgent(bytes32 agentId) external onlyOwner {
        agents[agentId].active = false;
        emit AgentDeactivated(agentId);
    }

    /**
     * @notice Validate a UserOperation signature (ERC-4337).
     */
    function validateUserOp(
        bytes calldata userOp,
        bytes32 userOpHash,
        uint256 /*missingAccountFunds*/
    ) external returns (uint256 validationData) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        (address recovered,,) = hash.tryRecover(abi.decode(userOp, (bytes)));
        if (owner == recovered) return 0;
        return SIG_VALIDATION_FAILED;
    }

    receive() external payable {}
}
