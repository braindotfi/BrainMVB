// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentRegistry
 * @notice On-chain registry for Brain Finance AI agents (ERC-8004 inspired).
 *
 *         Architecture:
 *         Every deployed Brain agent receives a persistent bytes32 agentId generated
 *         deterministically from (owner, executionWallet, nonce). The registry stores
 *         agent metadata, type, policy hash commitment, and validation history.
 *
 *         Indexed by a subgraph for off-chain queries by the Brain frontend and API.
 *
 *         Steps in deployment flow:
 *         - Step 10: registerAgent() → persistent agentId assigned.
 *         - Step 8 (policy): setPolicyHash() → on-chain policy commitment.
 *         - Step 19/20: recordValidation() → payment/trade receipt indexed.
 */
contract AgentRegistry {

    // ─── Types ────────────────────────────────────────────────────────────────
    enum AgentType {
        Payment,  // x402 payment agent
        Trading,  // Hyperliquid trading agent
        Research, // Data/research agent
        Custom    // User-defined
    }

    enum AgentStatus {
        Active,
        Paused,
        Deactivated
    }

    struct AgentRecord {
        bytes32 agentId;
        address owner;
        address executionWallet;      // Crossmint Agent Wallet address
        string metadataURI;           // IPFS JSON: name, description, capabilities, avatar
        AgentType agentType;
        AgentStatus status;
        bytes32 policyHash;           // keccak256 of the policy config (set after deployment)
        uint256 registeredAt;
        uint256 lastActiveAt;
        uint256 validationCount;      // total payment/trade receipts recorded
        uint256 totalVolumeUsdc;      // cumulative USDC volume (6 decimals)
    }

    struct ValidationRecord {
        bytes32 txHash;               // on-chain transaction hash
        string resourceUri;           // HTTP resource or Hyperliquid order ID
        uint256 amount;               // USDC amount (6 decimals); 0 for trades
        uint256 timestamp;
        bool isTrade;
    }

    // ─── State ────────────────────────────────────────────────────────────────
    mapping(bytes32 => AgentRecord) public agents;
    mapping(address => bytes32[]) public ownerAgents;
    mapping(bytes32 => ValidationRecord[]) private validationRecords;
    uint256 private _nonce;

    // ─── Events ───────────────────────────────────────────────────────────────
    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed owner,
        address indexed executionWallet,
        AgentType agentType,
        string metadataURI
    );
    event AgentStatusChanged(bytes32 indexed agentId, AgentStatus status);
    event PolicyHashSet(bytes32 indexed agentId, bytes32 policyHash);
    event ValidationRecorded(
        bytes32 indexed agentId,
        bytes32 indexed txHash,
        string resourceUri,
        uint256 amount,
        bool isTrade
    );
    event MetadataUpdated(bytes32 indexed agentId, string newMetadataURI);
    event ExecutionWalletUpdated(bytes32 indexed agentId, address newWallet);

    // ─── Registration ─────────────────────────────────────────────────────────

    /**
     * @notice Register a new AI agent and receive a persistent agentId.
     *         Step 10 in the Brain deployment flow.
     *
     * @param executionWallet  Crossmint Agent Wallet — the signing address.
     * @param metadataURI      IPFS URI (JSON with name, description, capabilities, avatar).
     * @param agentType        Payment | Trading | Research | Custom.
     * @return agentId         Deterministic bytes32 identifier.
     */
    function registerAgent(
        address executionWallet,
        string calldata metadataURI,
        AgentType agentType
    ) external returns (bytes32 agentId) {
        require(executionWallet != address(0), "AgentRegistry: zero execution wallet");
        require(bytes(metadataURI).length > 0, "AgentRegistry: empty metadata URI");

        agentId = keccak256(abi.encodePacked(msg.sender, executionWallet, ++_nonce, block.chainid));

        agents[agentId] = AgentRecord({
            agentId: agentId,
            owner: msg.sender,
            executionWallet: executionWallet,
            metadataURI: metadataURI,
            agentType: agentType,
            status: AgentStatus.Active,
            policyHash: bytes32(0),
            registeredAt: block.timestamp,
            lastActiveAt: block.timestamp,
            validationCount: 0,
            totalVolumeUsdc: 0
        });

        ownerAgents[msg.sender].push(agentId);
        emit AgentRegistered(agentId, msg.sender, executionWallet, agentType, metadataURI);
    }

    // ─── Policy ───────────────────────────────────────────────────────────────

    /**
     * @notice Commit the policy hash to the registry (mirrors BrainAccount.setPolicy).
     *         Provides a permanent, indexed record of the agent's policy at deployment time.
     */
    function setPolicyHash(bytes32 agentId, bytes32 policyHash) external {
        require(agents[agentId].owner == msg.sender, "AgentRegistry: not owner");
        agents[agentId].policyHash = policyHash;
        emit PolicyHashSet(agentId, policyHash);
    }

    // ─── Validation Recording ─────────────────────────────────────────────────

    /**
     * @notice Record an on-chain validation event (payment settled or trade filled).
     *         Step 19-20 in the x402 flow and step 6-7 in the trading flow.
     *
     *         Callable by agent owner or execution wallet.
     *
     * @param agentId     The agent identifier.
     * @param txHash      On-chain transaction hash (bytes32 for cross-chain compatibility).
     * @param resourceUri HTTP resource URI (x402) or Hyperliquid order ID (trading).
     * @param amount      USDC amount settled (6 decimals); 0 for trades.
     * @param isTrade     True for trade records, false for payment records.
     */
    function recordValidation(
        bytes32 agentId,
        bytes32 txHash,
        string calldata resourceUri,
        uint256 amount,
        bool isTrade
    ) external {
        AgentRecord storage agent = agents[agentId];
        require(
            agent.owner == msg.sender || agent.executionWallet == msg.sender,
            "AgentRegistry: unauthorized"
        );
        require(agent.status == AgentStatus.Active, "AgentRegistry: agent not active");

        agent.validationCount++;
        agent.lastActiveAt = block.timestamp;
        if (!isTrade && amount > 0) {
            agent.totalVolumeUsdc += amount;
        }

        validationRecords[agentId].push(ValidationRecord({
            txHash: txHash,
            resourceUri: resourceUri,
            amount: amount,
            timestamp: block.timestamp,
            isTrade: isTrade
        }));

        emit ValidationRecorded(agentId, txHash, resourceUri, amount, isTrade);
    }

    // ─── Agent Management ─────────────────────────────────────────────────────

    function updateMetadata(bytes32 agentId, string calldata newMetadataURI) external {
        require(agents[agentId].owner == msg.sender, "AgentRegistry: not owner");
        require(bytes(newMetadataURI).length > 0, "AgentRegistry: empty URI");
        agents[agentId].metadataURI = newMetadataURI;
        emit MetadataUpdated(agentId, newMetadataURI);
    }

    function updateExecutionWallet(bytes32 agentId, address newWallet) external {
        require(agents[agentId].owner == msg.sender, "AgentRegistry: not owner");
        require(newWallet != address(0), "AgentRegistry: zero address");
        agents[agentId].executionWallet = newWallet;
        emit ExecutionWalletUpdated(agentId, newWallet);
    }

    function pauseAgent(bytes32 agentId) external {
        require(agents[agentId].owner == msg.sender, "AgentRegistry: not owner");
        agents[agentId].status = AgentStatus.Paused;
        emit AgentStatusChanged(agentId, AgentStatus.Paused);
    }

    function reactivateAgent(bytes32 agentId) external {
        require(agents[agentId].owner == msg.sender, "AgentRegistry: not owner");
        agents[agentId].status = AgentStatus.Active;
        emit AgentStatusChanged(agentId, AgentStatus.Active);
    }

    function deactivateAgent(bytes32 agentId) external {
        require(agents[agentId].owner == msg.sender, "AgentRegistry: not owner");
        agents[agentId].status = AgentStatus.Deactivated;
        emit AgentStatusChanged(agentId, AgentStatus.Deactivated);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    function getAgent(bytes32 agentId) external view returns (AgentRecord memory) {
        return agents[agentId];
    }

    function getOwnerAgents(address owner_) external view returns (bytes32[] memory) {
        return ownerAgents[owner_];
    }

    function getValidationRecords(bytes32 agentId) external view returns (ValidationRecord[] memory) {
        return validationRecords[agentId];
    }

    function getValidationCount(bytes32 agentId) external view returns (uint256) {
        return agents[agentId].validationCount;
    }

    function getTotalVolume(bytes32 agentId) external view returns (uint256) {
        return agents[agentId].totalVolumeUsdc;
    }
}
