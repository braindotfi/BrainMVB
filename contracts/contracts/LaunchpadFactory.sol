// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AgentToken.sol";
import "./BondingCurve.sol";
import "./AgentRegistry.sol";

interface ILiquidityMigratorFactory {
    function migrate(address agentToken, uint256 tokenAmount) external payable returns (address pool);
}

/**
 * @title LaunchpadFactory
 * @notice One-click deployment: registers an agent + deploys AgentToken + BondingCurve atomically.
 *         Analogous to pump.fun's factory contract but for AI agents on Base.
 *         Anyone can call launchAgent() — no whitelisting.
 */
contract LaunchpadFactory {
    AgentRegistry public immutable registry;
    address public immutable migrator;
    address public feeCollector;

    struct LaunchConfig {
        address agentToken;
        address bondingCurve;
        bytes32 agentId;
        address creator;
        uint256 launchedAt;
        bool graduated;
    }

    LaunchConfig[] public launches;
    mapping(address => uint256[]) public creatorLaunches;
    mapping(bytes32 => uint256) public agentLaunchIndex;  // agentId => launchId

    event AgentLaunched(
        uint256 indexed launchId,
        bytes32 indexed agentId,
        address agentToken,
        address bondingCurve,
        address indexed creator
    );
    event LaunchGraduated(uint256 indexed launchId, address indexed pool);

    constructor(address registry_, address migrator_, address feeCollector_) {
        registry = AgentRegistry(registry_);
        migrator = migrator_;
        feeCollector = feeCollector_;
    }

    /**
     * @notice Deploy a new agent token + bonding curve in one transaction.
     * @param name              ERC-20 token name (e.g. "AlphaFlow Token")
     * @param symbol            ERC-20 ticker (e.g. "ALPHA")
     * @param metadataURI       IPFS URI with agent description, image, capabilities JSON
     * @param executionWallet   AI agent's hot wallet for on-chain actions
     * @return launchId         Index into the launches array
     * @return agentId          bytes32 agent identifier from AgentRegistry
     * @return tokenAddr        Deployed AgentToken address
     * @return curveAddr        Deployed BondingCurve address
     */
    function launchAgent(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        address executionWallet
    ) external returns (
        uint256 launchId,
        bytes32 agentId,
        address tokenAddr,
        address curveAddr
    ) {
        // 1. Register agent in the on-chain registry
        agentId = registry.registerAgent(executionWallet, metadataURI);

        // 2. Deploy AgentToken (bonding curve set to address(0) initially)
        AgentToken token = new AgentToken(
            name,
            symbol,
            agentId,
            metadataURI,
            address(0),  // bondingCurve set below
            msg.sender   // owner
        );
        tokenAddr = address(token);

        // 3. Deploy BondingCurve
        BondingCurve curve = new BondingCurve(
            tokenAddr,
            migrator,
            feeCollector
        );
        curveAddr = address(curve);

        // 4. Link curve as minting authority on the token
        token.setBondingCurve(curveAddr);

        // 5. Record launch
        launchId = launches.length;
        agentLaunchIndex[agentId] = launchId;
        launches.push(LaunchConfig({
            agentToken: tokenAddr,
            bondingCurve: curveAddr,
            agentId: agentId,
            creator: msg.sender,
            launchedAt: block.timestamp,
            graduated: false
        }));
        creatorLaunches[msg.sender].push(launchId);

        emit AgentLaunched(launchId, agentId, tokenAddr, curveAddr, msg.sender);
    }

    /**
     * @notice Called by the bonding curve (via event or directly) when graduation occurs.
     */
    function markGraduated(uint256 launchId, address pool) external {
        LaunchConfig storage launch = launches[launchId];
        require(msg.sender == launch.bondingCurve, "LaunchpadFactory: not bonding curve");
        launch.graduated = true;
        emit LaunchGraduated(launchId, pool);
    }

    function getLaunchCount() external view returns (uint256) {
        return launches.length;
    }

    function getCreatorLaunches(address creator) external view returns (uint256[] memory) {
        return creatorLaunches[creator];
    }
}
