// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentRegistry
 * @notice On-chain registry for Brain Finance AI agents (inspired by ERC-8004).
 *         Stores agent metadata URI (IPFS), execution wallet, and validation count.
 *         Emits events indexed by The Graph subgraph.
 */
contract AgentRegistry {
    struct AgentRecord {
        bytes32 agentId;
        address owner;
        address executionWallet;
        string metadataURI;       // IPFS JSON: name, description, capabilities, avatar
        uint256 registeredAt;
        bool active;
        uint256 validationCount;
    }

    mapping(bytes32 => AgentRecord) public agents;
    mapping(address => bytes32[]) public ownerAgents;

    uint256 private nonce;

    event AgentRegistered(bytes32 indexed agentId, address indexed owner, string metadataURI);
    event AgentDeactivated(bytes32 indexed agentId);
    event ValidationRecorded(bytes32 indexed agentId, bytes32 txHash, string resourceUri);
    event MetadataUpdated(bytes32 indexed agentId, string newMetadataURI);

    /**
     * @notice Register a new AI agent.
     * @param executionWallet  The wallet address used by the AI agent to execute transactions.
     * @param metadataURI      IPFS URI containing agent name, description, capabilities, avatar.
     * @return agentId         Deterministic bytes32 identifier for this agent.
     */
    function registerAgent(
        address executionWallet,
        string calldata metadataURI
    ) external returns (bytes32 agentId) {
        require(executionWallet != address(0), "AgentRegistry: zero execution wallet");
        agentId = keccak256(abi.encodePacked(msg.sender, executionWallet, ++nonce));
        agents[agentId] = AgentRecord({
            agentId: agentId,
            owner: msg.sender,
            executionWallet: executionWallet,
            metadataURI: metadataURI,
            registeredAt: block.timestamp,
            active: true,
            validationCount: 0
        });
        ownerAgents[msg.sender].push(agentId);
        emit AgentRegistered(agentId, msg.sender, metadataURI);
    }

    /**
     * @notice Record an on-chain validation action (e.g. payment confirmed).
     */
    function recordValidation(
        bytes32 agentId,
        bytes32 txHash,
        string calldata resourceUri
    ) external {
        AgentRecord storage agent = agents[agentId];
        require(
            agent.owner == msg.sender || agent.executionWallet == msg.sender,
            "AgentRegistry: unauthorized"
        );
        agent.validationCount++;
        emit ValidationRecorded(agentId, txHash, resourceUri);
    }

    /**
     * @notice Update the agent metadata URI (owner only).
     */
    function updateMetadata(bytes32 agentId, string calldata newMetadataURI) external {
        require(agents[agentId].owner == msg.sender, "AgentRegistry: not owner");
        agents[agentId].metadataURI = newMetadataURI;
        emit MetadataUpdated(agentId, newMetadataURI);
    }

    /**
     * @notice Deactivate an agent (owner only).
     */
    function deactivateAgent(bytes32 agentId) external {
        require(agents[agentId].owner == msg.sender, "AgentRegistry: not owner");
        agents[agentId].active = false;
        emit AgentDeactivated(agentId);
    }

    /**
     * @notice Get all agent IDs owned by an address.
     */
    function getOwnerAgents(address owner_) external view returns (bytes32[] memory) {
        return ownerAgents[owner_];
    }
}
