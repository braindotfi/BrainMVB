# BRAIN FINANCE — Full-Stack Replit Build Prompt

## PROJECT OVERVIEW

Build **Brain Finance** — a programmable neobank and AI agent marketplace running on Base (Ethereum L2). The app combines:
- A **stablecoin neobank** (USDC accounts, debit card via WireX)
- An **AI Agent Marketplace** to discover, deploy, and manage autonomous financial agents
- An **AI Agent Launchpad** (like pump.fun) where anyone can tokenize an AI agent, raise capital via a bonding curve, and graduate to Aerodrome DEX on Base
- An **ERC-4337 smart account system** with on-chain policy enforcement
- A **real-time notifications system**
- A **3-column dashboard UI** matching the Brain Finance design system

---

## TECH STACK

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion |
| Smart Contracts | Solidity 0.8.24, Hardhat, OpenZeppelin, ERC-4337, ERC-8004 |
| Backend / API | Next.js API Routes + Node.js microservices |
| Cloud | Microsoft Azure (App Service, Azure Functions, Azure Cosmos DB, Azure Service Bus, Azure Key Vault, Azure Notification Hubs) |
| Blockchain RPC | Alchemy (Base Mainnet + Sepolia testnet) |
| Wallet | Coinbase Embedded Wallets SDK (user), Coinbase Agentic Wallets (agent execution) |
| AI Reasoning | Anthropic Claude API (tool use / function calling) |
| Vector Memory | pgvector on Azure Database for PostgreSQL |
| Auth | SIWE (Sign-In With Ethereum) via NextAuth.js |
| DEX Integration | Aerodrome Finance on Base |
| Banking | WireX API (stablecoin account + debit card) |
| Payments Protocol | x402 (machine-to-machine HTTP payments) |
| Indexing | The Graph (subgraph for on-chain events) |
| Token Standard | ERC-20 (agent tokens) + Uniswap V2-style bonding curve |

---

## FOLDER STRUCTURE

```
brain-finance/
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # Main dashboard (3-column)
│   │   │   ├── (auth)/
│   │   │   │   └── signin/
│   │   │   ├── marketplace/
│   │   │   ├── launchpad/
│   │   │   ├── agents/
│   │   │   ├── banking/
│   │   │   └── notifications/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── MarketplacePanel.tsx
│   │   │   │   └── BankingPanel.tsx
│   │   │   ├── marketplace/
│   │   │   │   ├── FeaturedAgent.tsx
│   │   │   │   ├── AgentCard.tsx
│   │   │   │   ├── AgentGrid.tsx
│   │   │   │   └── TrendingAgents.tsx
│   │   │   ├── launchpad/
│   │   │   │   ├── LaunchpadHero.tsx
│   │   │   │   ├── BondingCurveChart.tsx
│   │   │   │   ├── TokenizationWizard.tsx
│   │   │   │   ├── AgentTokenCard.tsx
│   │   │   │   └── GraduationProgress.tsx
│   │   │   ├── banking/
│   │   │   │   ├── AccountCard.tsx
│   │   │   │   ├── AssetList.tsx
│   │   │   │   ├── TransactionFeed.tsx
│   │   │   │   └── DebitCard.tsx
│   │   │   ├── notifications/
│   │   │   │   ├── NotificationBell.tsx
│   │   │   │   ├── NotificationDrawer.tsx
│   │   │   │   └── NotificationItem.tsx
│   │   │   └── ui/
│   │   │       ├── Button.tsx
│   │   │       ├── Modal.tsx
│   │   │       └── Badge.tsx
│   │   └── lib/
│   │       ├── wagmi.ts
│   │       ├── alchemy.ts
│   │       ├── claude.ts
│   │       └── notifications.ts
│   └── contracts/                  # Hardhat project
│       ├── contracts/
│       │   ├── BrainAccount.sol
│       │   ├── PolicyValidator.sol
│       │   ├── AgentRegistry.sol    # ERC-8004
│       │   ├── AgentToken.sol       # ERC-20 agent token
│       │   ├── BondingCurve.sol
│       │   ├── LaunchpadFactory.sol
│       │   └── LiquidityMigrator.sol
│       ├── scripts/
│       │   ├── deploy.ts
│       │   └── verify.ts
│       └── test/
├── services/
│   ├── agent-runtime/              # Azure Function App — ReAct loop
│   ├── payment-orchestrator/       # x402 flow
│   ├── notification-service/       # Azure Service Bus + Notification Hubs
│   └── indexer/                    # The Graph subgraph
└── infra/
    └── azure/                      # Bicep IaC templates
```

---

## PART 1 — SMART CONTRACTS

### 1.1 BrainAccount.sol (ERC-4337 Smart Account)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@account-abstraction/contracts/core/BaseAccount.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract BrainAccount is BaseAccount {
    address public owner;
    IEntryPoint private immutable _entryPoint;
    IPolicyValidator public policyValidator;

    // agentId => AgentConfig
    mapping(bytes32 => AgentConfig) public agents;
    // agentId => balance
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
    event PaymentExecuted(bytes32 indexed agentId, address merchant, uint256 amount, bytes32 intentHash);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyAgent(bytes32 agentId) {
        require(msg.sender == agents[agentId].executionWallet, "Not agent wallet");
        _;
    }

    constructor(IEntryPoint entryPoint_, address owner_, address policyValidator_) {
        _entryPoint = entryPoint_;
        owner = owner_;
        policyValidator = IPolicyValidator(policyValidator_);
    }

    function entryPoint() public view override returns (IEntryPoint) { return _entryPoint; }

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

    function allocateCapital(bytes32 agentId, address asset, uint256 amount) external onlyOwner {
        IERC20(asset).transferFrom(owner, address(this), amount);
        agentBalances[agentId] += amount;
        emit AgentCapitalAllocated(agentId, amount);
    }

    function executeAgentPayment(
        bytes32 agentId,
        address asset,
        address merchant,
        uint256 amount,
        bytes32 intentHash,
        bytes calldata policyProof
    ) external onlyAgent(agentId) {
        AgentConfig storage agent = agents[agentId];
        require(agent.active, "Agent not active");
        require(agentBalances[agentId] >= amount, "Insufficient agent balance");

        // Reset window if expired
        if (block.timestamp >= agent.windowStart + agent.timeWindowSeconds) {
            agent.spentInWindow = 0;
            agent.windowStart = block.timestamp;
        }
        require(agent.spentInWindow + amount <= agent.spendLimit, "Spend limit exceeded");
        require(policyValidator.verifyProof(agentId, intentHash, policyProof), "Invalid policy proof");

        agent.spentInWindow += amount;
        agentBalances[agentId] -= amount;
        IERC20(asset).transfer(merchant, amount);

        emit PaymentExecuted(agentId, merchant, amount, intentHash);
    }

    function _validateSignature(UserOperation calldata userOp, bytes32 userOpHash)
        internal view override returns (uint256) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        if (owner == hash.recover(userOp.signature)) return 0;
        return SIG_VALIDATION_FAILED;
    }
}
```

### 1.2 PolicyValidator.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract PolicyValidator {
    using ECDSA for bytes32;

    address public trustedSigner; // Brain backend policy engine signer

    mapping(bytes32 => bool) public usedProofs;

    constructor(address trustedSigner_) {
        trustedSigner = trustedSigner_;
    }

    function verifyProof(
        bytes32 agentId,
        bytes32 intentHash,
        bytes calldata proof
    ) external returns (bool) {
        bytes32 message = keccak256(abi.encodePacked(agentId, intentHash));
        bytes32 ethHash = message.toEthSignedMessageHash();
        address recovered = ethHash.recover(proof);
        require(!usedProofs[message], "Proof already used");
        require(recovered == trustedSigner, "Invalid proof signer");
        usedProofs[message] = true;
        return true;
    }
}
```

### 1.3 AgentRegistry.sol (ERC-8004)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    struct AgentRecord {
        bytes32 agentId;
        address owner;
        address executionWallet;
        string metadataURI;      // IPFS: name, description, capabilities, avatar
        uint256 registeredAt;
        bool active;
        uint256 validationCount;
    }

    mapping(bytes32 => AgentRecord) public agents;
    mapping(address => bytes32[]) public ownerAgents;

    event AgentRegistered(bytes32 indexed agentId, address indexed owner, string metadataURI);
    event ValidationRecorded(bytes32 indexed agentId, bytes32 txHash, string resourceUri);

    uint256 private nonce;

    function registerAgent(
        address executionWallet,
        string calldata metadataURI
    ) external returns (bytes32 agentId) {
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

    function recordValidation(bytes32 agentId, bytes32 txHash, string calldata resourceUri) external {
        require(agents[agentId].owner == msg.sender || agents[agentId].executionWallet == msg.sender, "Unauthorized");
        agents[agentId].validationCount++;
        emit ValidationRecorded(agentId, txHash, resourceUri);
    }
}
```

### 1.4 AgentToken.sol (ERC-20 for tokenized agents)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AgentToken is ERC20, Ownable {
    bytes32 public agentId;
    string public agentMetadataURI;
    bool public graduated;       // true = listed on Aerodrome
    address public bondingCurve; // minting authority pre-graduation

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18; // 1 billion tokens
    uint256 public constant GRADUATION_SUPPLY = 800_000_000 * 1e18; // sold via curve

    event Graduated(address liquidityPool, uint256 liquidityLocked);

    constructor(
        string memory name_,
        string memory symbol_,
        bytes32 agentId_,
        string memory metadataURI_,
        address bondingCurve_,
        address creator_
    ) ERC20(name_, symbol_) Ownable(creator_) {
        agentId = agentId_;
        agentMetadataURI = metadataURI_;
        bondingCurve = bondingCurve_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == bondingCurve, "Only bonding curve");
        require(!graduated, "Already graduated");
        require(totalSupply() + amount <= GRADUATION_SUPPLY, "Exceeds graduation supply");
        _mint(to, amount);
    }

    function graduate(address liquidityPool, uint256 liquidityAmount) external onlyOwner {
        require(!graduated, "Already graduated");
        graduated = true;
        // Mint remaining 20% to liquidity pool (locked)
        uint256 remaining = MAX_SUPPLY - totalSupply();
        _mint(liquidityPool, remaining);
        emit Graduated(liquidityPool, liquidityAmount);
    }
}
```

### 1.5 BondingCurve.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./AgentToken.sol";
import "./LiquidityMigrator.sol";

/**
 * Bonding Curve using BASE (WETH on Base) as the quote token.
 * Price formula: P = k * S^2  (quadratic curve)
 * where S = current supply sold, k = curve steepness constant.
 *
 * Graduation threshold: $69,000 equivalent in BASE raised.
 * Upon graduation: locked liquidity pool is auto-created on Aerodrome.
 */
contract BondingCurve {
    using Math for uint256;

    address public immutable BASE_TOKEN;   // WETH on Base
    AgentToken public immutable agentToken;
    LiquidityMigrator public immutable migrator;

    uint256 public constant GRADUATION_THRESHOLD = 69_000 * 1e18; // ~$69k in BASE
    uint256 public constant CURVE_CONSTANT_K = 1e9;                // steepness
    uint256 public constant PLATFORM_FEE_BPS = 100;                // 1% fee

    uint256 public totalBaseRaised;
    bool public graduated;
    address public feeCollector;

    mapping(address => uint256) public contributions;

    event TokensPurchased(address indexed buyer, uint256 baseIn, uint256 tokensOut, uint256 newPrice);
    event TokensSold(address indexed seller, uint256 tokensIn, uint256 baseOut, uint256 newPrice);
    event CurveGraduated(address indexed pool, uint256 liquidityBase, uint256 liquidityTokens);

    constructor(
        address baseToken_,
        address agentToken_,
        address migrator_,
        address feeCollector_
    ) {
        BASE_TOKEN = baseToken_;
        agentToken = AgentToken(agentToken_);
        migrator = LiquidityMigrator(migrator_);
        feeCollector = feeCollector_;
    }

    /// @notice Get buy price for `tokenAmount` tokens given current supply
    function getBuyPrice(uint256 tokenAmount) public view returns (uint256 baseRequired) {
        uint256 supply = agentToken.totalSupply();
        // Integral of k*s^2 from supply to supply+amount
        uint256 a = supply;
        uint256 b = supply + tokenAmount;
        baseRequired = CURVE_CONSTANT_K * (b**3 - a**3) / (3 * 1e18 * 1e18);
    }

    /// @notice Get sell return for `tokenAmount` tokens
    function getSellReturn(uint256 tokenAmount) public view returns (uint256 baseReturned) {
        uint256 supply = agentToken.totalSupply();
        uint256 a = supply - tokenAmount;
        uint256 b = supply;
        baseReturned = CURVE_CONSTANT_K * (b**3 - a**3) / (3 * 1e18 * 1e18);
    }

    function currentPrice() public view returns (uint256) {
        uint256 supply = agentToken.totalSupply();
        return CURVE_CONSTANT_K * supply**2 / (1e18 * 1e18);
    }

    function buy(uint256 minTokensOut) external payable {
        require(!graduated, "Graduated — trade on Aerodrome");
        uint256 baseIn = msg.value; // Accept ETH (BASE native)
        uint256 fee = (baseIn * PLATFORM_FEE_BPS) / 10_000;
        uint256 netBase = baseIn - fee;

        // Calculate tokens to mint
        uint256 tokensOut = _calcTokensForBase(netBase);
        require(tokensOut >= minTokensOut, "Slippage exceeded");

        // Transfer fee
        (bool ok,) = feeCollector.call{value: fee}("");
        require(ok, "Fee transfer failed");

        contributions[msg.sender] += netBase;
        totalBaseRaised += netBase;

        agentToken.mint(msg.sender, tokensOut);
        emit TokensPurchased(msg.sender, baseIn, tokensOut, currentPrice());

        // Check graduation threshold
        if (totalBaseRaised >= GRADUATION_THRESHOLD) {
            _graduate();
        }
    }

    function sell(uint256 tokenAmount, uint256 minBaseOut) external {
        require(!graduated, "Graduated — trade on Aerodrome");
        uint256 baseOut = getSellReturn(tokenAmount);
        uint256 fee = (baseOut * PLATFORM_FEE_BPS) / 10_000;
        uint256 netBase = baseOut - fee;
        require(netBase >= minBaseOut, "Slippage exceeded");

        agentToken.transferFrom(msg.sender, address(this), tokenAmount);
        agentToken.burn(tokenAmount); // or hold if preferred
        totalBaseRaised -= baseOut;

        (bool ok,) = feeCollector.call{value: fee}("");
        require(ok, "Fee transfer failed");
        (bool ok2,) = msg.sender.call{value: netBase}("");
        require(ok2, "Base transfer failed");

        emit TokensSold(msg.sender, tokenAmount, netBase, currentPrice());
    }

    function _graduate() internal {
        graduated = true;
        // Migrate all raised BASE + corresponding tokens to Aerodrome
        uint256 baseForLiquidity = address(this).balance;
        uint256 tokensForLiquidity = agentToken.balanceOf(address(this));
        
        agentToken.approve(address(migrator), tokensForLiquidity);
        address pool = migrator.migrate{value: baseForLiquidity}(
            address(agentToken),
            tokensForLiquidity
        );
        agentToken.graduate(pool, baseForLiquidity);
        emit CurveGraduated(pool, baseForLiquidity, tokensForLiquidity);
    }

    function _calcTokensForBase(uint256 baseAmount) internal view returns (uint256) {
        // Inverse integral — binary search or closed-form approximation
        uint256 supply = agentToken.totalSupply();
        // Simplified: tokens = cbrt(3 * baseAmount / k + supply^3) - supply
        uint256 s3 = supply**3;
        uint256 newS3 = s3 + (3 * baseAmount * 1e18 * 1e18) / CURVE_CONSTANT_K;
        return _cbrt(newS3) - supply;
    }

    function _cbrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = x;
        uint256 y = x / 3 + 1;
        while (y < z) { z = y; y = (2 * y + x / (y * y)) / 3; }
        return z;
    }

    receive() external payable {}
}
```

### 1.6 LiquidityMigrator.sol (Auto-migrate to Aerodrome)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAerodromeRouter.sol";
import "./interfaces/IAerodromeFactory.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Migrates bonding curve liquidity to Aerodrome on Base.
 * Creates a stable=false (volatile) pool: AgentToken / WETH.
 * LP tokens are burned (sent to address(0)) to lock liquidity permanently.
 * This prevents rug pulls — liquidity is locked forever on graduation.
 */
contract LiquidityMigrator {
    IAerodromeRouter public immutable aerodromeRouter;
    IAerodromeFactory public immutable aerodromeFactory;
    address public immutable WETH;

    // Aerodrome Base Mainnet addresses
    // Router: 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
    // Factory: 0x420DD381b31aEf6683db6B902084cB0FFECe40Da

    event LiquidityMigrated(
        address indexed agentToken,
        address indexed pool,
        uint256 baseAmount,
        uint256 tokenAmount,
        uint256 lpBurned
    );

    constructor(address router_, address factory_, address weth_) {
        aerodromeRouter = IAerodromeRouter(router_);
        aerodromeFactory = IAerodromeFactory(factory_);
        WETH = weth_;
    }

    function migrate(
        address agentToken,
        uint256 tokenAmount
    ) external payable returns (address pool) {
        require(msg.value > 0, "No BASE provided");

        // Wrap ETH to WETH
        IWETH(WETH).deposit{value: msg.value}();
        IERC20(WETH).approve(address(aerodromeRouter), msg.value);
        IERC20(agentToken).approve(address(aerodromeRouter), tokenAmount);

        // Create volatile pool (not stable)
        (,, uint256 lpAmount) = aerodromeRouter.addLiquidity(
            agentToken,
            WETH,
            false,           // volatile pool
            tokenAmount,
            msg.value,
            (tokenAmount * 95) / 100,   // 5% slippage
            (msg.value * 95) / 100,
            address(this),              // LP tokens sent here
            block.timestamp + 600
        );

        // Get pool address
        pool = aerodromeFactory.getPool(agentToken, WETH, false);

        // Burn LP tokens — locks liquidity permanently (anti-rug)
        IERC20(pool).transfer(address(0), lpAmount);

        emit LiquidityMigrated(agentToken, pool, msg.value, tokenAmount, lpAmount);
    }
}
```

### 1.7 LaunchpadFactory.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AgentToken.sol";
import "./BondingCurve.sol";
import "./AgentRegistry.sol";

contract LaunchpadFactory {
    AgentRegistry public registry;
    LiquidityMigrator public migrator;
    address public feeCollector;
    address public immutable WETH;

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

    event AgentLaunched(
        uint256 indexed launchId,
        bytes32 indexed agentId,
        address agentToken,
        address bondingCurve,
        address creator
    );

    constructor(address registry_, address migrator_, address feeCollector_, address weth_) {
        registry = AgentRegistry(registry_);
        migrator = LiquidityMigrator(migrator_);
        feeCollector = feeCollector_;
        WETH = weth_;
    }

    function launchAgent(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,    // IPFS JSON: description, image, capabilities
        address executionWallet
    ) external returns (uint256 launchId, bytes32 agentId, address tokenAddr, address curveAddr) {
        // Register in ERC-8004 registry
        agentId = registry.registerAgent(executionWallet, metadataURI);

        // Deploy AgentToken
        AgentToken token = new AgentToken(
            name, symbol, agentId, metadataURI, address(0), msg.sender
        );
        tokenAddr = address(token);

        // Deploy BondingCurve
        BondingCurve curve = new BondingCurve(
            WETH, tokenAddr, address(migrator), feeCollector
        );
        curveAddr = address(curve);

        // Set curve as minting authority on token
        // (owner calls setBondingCurve after deploy — or do it here via factory ownership)

        launchId = launches.length;
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

    function getLaunchCount() external view returns (uint256) { return launches.length; }
}
```

---

## PART 2 — AZURE CLOUD INFRASTRUCTURE

### 2.1 Core Azure Services

Provision the following via Bicep IaC (`infra/azure/main.bicep`):

| Service | Purpose |
|---|---|
| Azure App Service (P2v3) | Host Next.js frontend + API routes |
| Azure Function App (Consumption) | Agent runtime (ReAct loop), payment orchestrator |
| Azure Cosmos DB (serverless) | Agent configs, marketplace metadata, user sessions |
| Azure Database for PostgreSQL Flexible | pgvector for agent memory + transaction logs |
| Azure Service Bus (Standard tier) | Async message queue: payment intents, agent events |
| Azure Notification Hubs | Push notifications (mobile + web) |
| Azure Key Vault | Store: Alchemy API key, Anthropic API key, WireX credentials, signer private key |
| Azure Blob Storage | IPFS fallback for agent metadata/avatars |
| Azure API Management | Rate limiting, auth gateway for all API routes |
| Azure Application Insights | Monitoring, distributed tracing |

### 2.2 Environment Variables (Azure Key Vault → App Settings)

```env
# Blockchain
ALCHEMY_API_KEY=
ALCHEMY_BASE_RPC=https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}
ALCHEMY_BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}

# Contracts
BRAIN_ACCOUNT_FACTORY=0x...
POLICY_VALIDATOR=0x...
AGENT_REGISTRY=0x...
LAUNCHPAD_FACTORY=0x...
LIQUIDITY_MIGRATOR=0x...
AERODROME_ROUTER=0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
AERODROME_FACTORY=0x420DD381b31aEf6683db6B902084cB0FFECe40Da
WETH_BASE=0x4200000000000000000000000000000000000006

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=  # fallback

# Banking
WIREX_API_KEY=
WIREX_API_SECRET=
WIREX_WEBHOOK_SECRET=

# Coinbase
CDP_API_KEY_NAME=
CDP_API_KEY_PRIVATE_KEY=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Azure
AZURE_SERVICE_BUS_CONNECTION_STRING=
AZURE_NOTIFICATION_HUB_CONNECTION_STRING=
AZURE_NOTIFICATION_HUB_NAME=
AZURE_COSMOS_DB_CONNECTION_STRING=
DATABASE_URL=postgresql://...  # pgvector

# Wallet
POLICY_SIGNER_PRIVATE_KEY=  # Backend signer for PolicyValidator
```

---

## PART 3 — BACKEND SERVICES

### 3.1 Agent Runtime — Azure Function (ReAct Loop)

File: `services/agent-runtime/index.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { getAgentMemory, storeObservation } from "./memory";
import { getPolicyConfig } from "./policy";
import { callTool } from "./tools";

const client = new Anthropic();

const BRAIN_TOOLS: Anthropic.Tool[] = [
  {
    name: "pay_x402",
    description: "Execute an x402 payment to an external service URL",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target resource URL" },
        amount: { type: "string", description: "Amount in USDC" },
        merchant: { type: "string", description: "Merchant wallet address" },
      },
      required: ["url", "amount", "merchant"],
    },
  },
  {
    name: "check_balance",
    description: "Check current USDC balance of the agent sub-account",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_policy",
    description: "Retrieve the agent's current policy configuration",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "record_action",
    description: "Write an observation or decision to agent memory",
    input_schema: {
      type: "object",
      properties: {
        observation: { type: "string" },
        actionType: { type: "string" },
      },
      required: ["observation"],
    },
  },
];

export async function runAgentLoop(agentId: string, objective: string) {
  const policy = await getPolicyConfig(agentId);
  const memory = await getAgentMemory(agentId, 20);
  
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `
You are an autonomous financial agent on the Brain Finance platform.
Agent ID: ${agentId}
Objective: ${objective}
Policy: ${JSON.stringify(policy)}
Recent memory: ${JSON.stringify(memory)}

Execute the objective within your policy constraints. 
Use tools to act. Stop when the objective is complete or if policy prevents execution.
      `,
    },
  ];

  let maxIterations = 10;

  while (maxIterations-- > 0) {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      tools: BRAIN_TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await callTool(agentId, block.name, block.input as Record<string, unknown>);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
          await storeObservation(agentId, block.name, result);
        }
      }
      messages.push({ role: "user", content: toolResults });
    }
  }

  return messages;
}
```

### 3.2 Payment Orchestrator — x402 Flow

File: `services/payment-orchestrator/x402.ts`

```typescript
import { ethers } from "ethers";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";

interface PaymentIntent {
  agentId: string;
  resourceUri: string;
  amount: bigint;
  asset: string;
  merchant: string;
  expiry: number;
  nonce: string;
}

export async function handleX402Flow(agentId: string, targetUrl: string) {
  // Step 1: Initial request → expect 402
  const res = await fetch(targetUrl, {
    headers: { "Agent-ID": agentId },
  });

  if (res.status !== 402) {
    return { success: true, data: await res.json() };
  }

  // Step 2: Parse 402 payment header
  const paymentHeader = res.headers.get("X-402-Payment");
  if (!paymentHeader) throw new Error("Missing X-402-Payment header");
  const { amount, asset, merchant, expiry, nonce } = JSON.parse(paymentHeader);

  const intent: PaymentIntent = {
    agentId,
    resourceUri: targetUrl,
    amount: BigInt(amount),
    asset,
    merchant,
    expiry,
    nonce,
  };

  // Step 3: Policy check
  const policyProof = await evaluateAndSignPolicy(intent);
  if (!policyProof) throw new Error("Policy rejected payment");

  // Step 4: Submit UserOperation via Alchemy bundler
  const txHash = await submitUserOperation(intent, policyProof);

  // Step 5: Retry with receipt
  const receipt = await fetch(targetUrl, {
    headers: {
      "Agent-ID": agentId,
      "X-402-Receipt": JSON.stringify({ txHash, intentHash: hashIntent(intent) }),
    },
  });

  return { success: true, txHash, data: await receipt.json() };
}

async function evaluateAndSignPolicy(intent: PaymentIntent): Promise<string | null> {
  // Call Azure Function: policy engine evaluates budget, allowlist, frequency
  const res = await fetch(`${process.env.AZURE_FUNCTION_URL}/policy/evaluate`, {
    method: "POST",
    body: JSON.stringify(intent),
    headers: { "Content-Type": "application/json" },
  });
  const { approved, proof } = await res.json();
  return approved ? proof : null;
}

function hashIntent(intent: PaymentIntent): string {
  return ethers.solidityPackedKeccak256(
    ["bytes32", "string", "uint256", "address", "uint256", "bytes32"],
    [intent.agentId, intent.resourceUri, intent.amount, intent.merchant, intent.expiry, intent.nonce]
  );
}

async function submitUserOperation(intent: PaymentIntent, policyProof: string) {
  // Build and submit ERC-4337 UserOperation via Alchemy
  // Implementation uses @alchemy/aa-core
  // Returns tx hash
}
```

### 3.3 Notification Service

File: `services/notification-service/index.ts`

```typescript
import { ServiceBusClient } from "@azure/service-bus";
import { NotificationHubsClient } from "@azure/notification-hubs";

export type NotificationType =
  | "AGENT_PAYMENT_EXECUTED"
  | "AGENT_POLICY_REJECTED"
  | "AGENT_GRADUATED"        // Bonding curve graduated
  | "AGENT_THRESHOLD_REACHED" // Market cap milestone
  | "TRANSACTION_CONFIRMED"
  | "CARD_TRANSACTION"
  | "BALANCE_LOW"
  | "NEW_AGENT_LISTED"
  | "TOKEN_PRICE_ALERT"
  | "AGENT_OBJECTIVE_COMPLETE";

export interface NotificationPayload {
  type: NotificationType;
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  timestamp: number;
  read: boolean;
  id: string;
}

const sbClient = new ServiceBusClient(process.env.AZURE_SERVICE_BUS_CONNECTION_STRING!);
const nhClient = new NotificationHubsClient(
  process.env.AZURE_NOTIFICATION_HUB_CONNECTION_STRING!,
  process.env.AZURE_NOTIFICATION_HUB_NAME!
);

export async function publishNotification(payload: NotificationPayload) {
  // 1. Save to Cosmos DB for in-app notification center
  await saveToDb(payload);

  // 2. Send via Azure Service Bus → triggers push notification
  const sender = sbClient.createSender("notifications");
  await sender.sendMessages({ body: payload });
  await sender.close();
}

// Azure Function trigger on Service Bus → push via Notification Hubs
export async function pushToDevice(payload: NotificationPayload) {
  await nhClient.sendNotification({
    body: {
      aps: {
        alert: { title: payload.title, body: payload.body },
        badge: 1,
        sound: "default",
      },
      data: payload.data,
    },
    tags: [`userId:${payload.userId}`],
  } as any);
}

// Notification event helpers
export async function notifyAgentPayment(userId: string, agentName: string, amount: string, merchant: string) {
  await publishNotification({
    id: crypto.randomUUID(),
    type: "AGENT_PAYMENT_EXECUTED",
    userId,
    title: `${agentName} executed a payment`,
    body: `Paid ${amount} USDC to ${merchant}`,
    data: { agentName, amount, merchant },
    timestamp: Date.now(),
    read: false,
  });
}

export async function notifyGraduation(userId: string, agentName: string, tokenSymbol: string, poolAddress: string) {
  await publishNotification({
    id: crypto.randomUUID(),
    type: "AGENT_GRADUATED",
    userId,
    title: `🎓 ${agentName} graduated to Aerodrome!`,
    body: `$${tokenSymbol} is now trading on Aerodrome DEX. Liquidity locked permanently.`,
    data: { agentName, tokenSymbol, poolAddress },
    timestamp: Date.now(),
    read: false,
  });
}

async function saveToDb(payload: NotificationPayload) {
  // Save to Azure Cosmos DB notifications container
}
```

---

## PART 4 — FRONTEND (Next.js)

### 4.1 Design System

**Exact color palette from the Brain Finance UI:**
```css
:root {
  --bg-primary: #0f1117;          /* Main dark background */
  --bg-secondary: #161b25;        /* Sidebar + panel background */
  --bg-card: #1e2535;             /* Card surfaces */
  --bg-card-hover: #252d3d;
  --accent-purple: #7c3aed;       /* Primary purple (logo, active states) */
  --accent-purple-light: #9d5cf5;
  --accent-gold: #f59e0b;         /* Gold (create agent button, highlights) */
  --accent-gold-dark: #d97706;
  --accent-red: #ef4444;          /* Logout, sell */
  --accent-green: #22c55e;        /* Positive values */
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #475569;
  --border: #2d3748;
  --card-orange: #f97316;         /* WireX card color */
  --featured-bg: linear-gradient(135deg, #3b1f8c 0%, #4c1d95 50%, #5b21b6 100%);
}
```

**Typography:** Use `Sora` (headings) + `DM Sans` (body). Load from Google Fonts.

### 4.2 Main Dashboard Layout — `app/page.tsx`

```tsx
// 3-column fixed layout matching Brain Finance design
export default function Dashboard() {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      {/* LEFT: Sidebar Navigation */}
      <Sidebar />
      
      {/* CENTER: Marketplace / Content Area */}
      <main className="flex-1 overflow-y-auto border-x border-[var(--border)]">
        <MarketplacePanel />
      </main>
      
      {/* RIGHT: Banking Panel */}
      <aside className="w-[380px] overflow-y-auto">
        <BankingPanel />
      </aside>
    </div>
  );
}
```

### 4.3 Sidebar — `components/layout/Sidebar.tsx`

```tsx
const menuItems = [
  { icon: <SparklesIcon />, label: "Assistant", href: "/assistant" },
  { icon: <CpuChipIcon />, label: "Agents", href: "/agents" },
  { icon: <ShoppingBagIcon />, label: "Marketplace", href: "/marketplace", active: true, children: [
    { label: "Trading", href: "/marketplace/trading" },
    { label: "Payments", href: "/marketplace/payments" },
    { label: "Lending", href: "/marketplace/lending" },
  ]},
  { icon: <RocketLaunchIcon />, label: "Launchpad", href: "/launchpad", badge: "NEW" },
];

// Other section
const otherItems = [
  { icon: <BellIcon />, label: "Notifications", href: "/notifications", count: 12 },
  { icon: <CogIcon />, label: "Settings", href: "/settings" },
];
```

**Sidebar must include:**
- Brain logo at top (purple gradient brain icon + "brain" wordmark)
- Navigation items with hover states, active purple left border
- Expandable Marketplace with sub-items (Trading, Payments, Lending)
- Launchpad with "NEW" badge
- Notifications with unread count badge
- "Create an Agent" CTA button (gold gradient)
- "Logout" button (red, outlined)
- Copyright footer

### 4.4 Marketplace Panel — `components/layout/MarketplacePanel.tsx`

**Sections to implement:**

**1. Featured Agent Banner (carousel)**
```tsx
// Rotating banner with gradient purple background
// Shows: "FEATURED" label, agent name, description, robot avatar
// Dots for carousel navigation
const featured = [
  {
    label: "FEATURED",
    name: "Momentum Trader",
    description: "A smart assistant designed to analyze market trends and execute trades on your behalf.",
    avatar: "/agents/momentum-trader.png",
  },
  // ... more featured agents
];
```

**2. Trending Agents Grid**
```tsx
// "Trending Agents" header + "See All >" button
// 3-column grid of AgentCard components
// Each card: avatar, name, description excerpt, + add button
const trendingAgents = [
  { name: "AlphaFlow", description: "Executes automated trading strategies across..." },
  { name: "Yield Pilot", description: "Manages capital allocation across DeFi pr..." },
  { name: "Risk Sentinel", description: "Continuously monitors positions and transactio..." },
  { name: "Signal Seer", description: "Aggregates news, social signals, and on-chain d..." },
  { name: "TrendRadar", description: "Detects emerging trends across markets, social pl..." },
  { name: "TaskForge Pro", description: "Automates repetitive workflows across tools, A..." },
];
```

**3. New and Noteworthy Grid**
```tsx
// Same layout as trending
const newAgents = [
  { name: "InboxZero", description: "Manages email, filters priority messages, and d..." },
  { name: "Ops Commander", description: "Coordinates multi-step workflows across system..." },
  { name: "Pay Stream", description: "Executes real-time payments for APIs and s..." },
  { name: "Invoice Bot", description: "Generates invoices, tracks payments, and automat..." },
  { name: "Deal Closer", description: "Negotiates and executes transactions between a..." },
  { name: "SwarmAlpha", description: "Coordinates multiple agents to execute compl..." },
];
```

**4. Launchpad Section (NEW — pump.fun style)**

Below the standard marketplace sections, add the Launchpad discovery area:

```tsx
// Header: "Agent Launchpad 🚀" + "Create Agent Token >"
// Live bonding curve cards showing:
//   - Agent avatar + name + ticker ($SYMBOL)
//   - Creator address (truncated)
//   - Progress bar: BASE raised / graduation threshold
//   - Current market cap
//   - "LIVE" or "GRADUATED" badge
//   - Buy button

interface LaunchpadCard {
  agentName: string;
  symbol: string;
  creator: string;
  avatar: string;
  description: string;
  baseRaised: number;
  graduationThreshold: number; // ~$69k
  marketCap: number;
  price: number;
  graduated: boolean;
  aerodromePool?: string;
  createdAt: number;
  holders: number;
  txCount: number;
}
```

**Launchpad Detail Page — `/launchpad/[address]`:**
- Full bonding curve chart (recharts LineChart showing price vs supply)
- Buy / Sell interface with slippage tolerance
- Graduation progress bar with milestone markers
- Top holders table
- Recent transactions feed
- Agent info: name, description, capabilities, agentId
- Aerodrome pool link (post-graduation)
- Social links (Twitter, Telegram from metadata)

**Create Agent Token Wizard — `/launchpad/create`:**

Step 1: Agent Details
- Name, Ticker Symbol, Description
- Upload avatar image (→ Azure Blob → IPFS pin)
- Capabilities checklist (Trading, Payments, Research, Automation)
- Agent execution wallet address

Step 2: Token Configuration
- Token name and symbol (auto-populated)
- Initial buy amount (optional — creator can buy first)
- Preview bonding curve chart

Step 3: Review & Deploy
- Shows estimated gas cost
- Confirms LaunchpadFactory.launchAgent() transaction
- Deploys AgentToken + BondingCurve atomically

### 4.5 Banking Panel — `components/layout/BankingPanel.tsx`

```tsx
// RIGHT COLUMN — matches the design exactly

// Header: "Your Account" with checkmark + dropdown
// WireX Debit Card (orange gradient):
//   - Balance: 865,040.30 AED
//   - "Debit Card" label
//   - Card number: 1652 0400 3201 6995
//   - Name, Expiry, CVC
//   - Mastercard logo
//   - Carousel dots for multiple cards

// Action buttons row: Add | Send | Exchange

// Tabs: Assets | Transactions
// Filter: All | Cash | Crypto

// Asset list items:
//   - Token icon, name, symbol
//   - Balance in USD + token amount
//   - Color-coded value (green = positive)
// Assets: ETH, USD, MATIC (Polygon), BNB, etc.

// Agent Token Portfolio section:
//   - Shows all agent tokens user holds
//   - Current value via bonding curve price
//   - Graduated tokens show Aerodrome link
```

### 4.6 Notifications System — `components/notifications/`

**NotificationBell.tsx** — in top bar:
```tsx
// Bell icon with unread count badge (purple)
// Click → opens NotificationDrawer (slide-in from right)
```

**NotificationDrawer.tsx:**
```tsx
// Full notification center panel
// Tabs: All | Agents | Banking | Launchpad
// Each notification:
//   - Icon by type (💳 card, 🤖 agent, 🎓 graduation, ⚠️ alert)
//   - Title + body text
//   - Relative timestamp ("2m ago")
//   - Unread dot indicator
//   - Click to mark as read + navigate to relevant page

// Notification types to handle:
const NOTIFICATION_ICONS = {
  AGENT_PAYMENT_EXECUTED: "🤖",
  AGENT_POLICY_REJECTED: "⚠️",
  AGENT_GRADUATED: "🎓",
  AGENT_THRESHOLD_REACHED: "📈",
  TRANSACTION_CONFIRMED: "✅",
  CARD_TRANSACTION: "💳",
  BALANCE_LOW: "🔴",
  NEW_AGENT_LISTED: "🚀",
  TOKEN_PRICE_ALERT: "📊",
  AGENT_OBJECTIVE_COMPLETE: "🏁",
};
```

**Real-time updates:** Use Azure SignalR Service or SSE endpoint (`/api/notifications/stream`) for live notification delivery without polling.

```typescript
// app/api/notifications/stream/route.ts
export async function GET(req: Request) {
  const { userId } = await getSession(req);
  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to Azure Service Bus topic for this user
      // Push SSE events as notifications arrive
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

---

## PART 5 — API ROUTES

### 5.1 Core API Routes (Next.js App Router)

```
POST   /api/auth/signin           → SIWE authentication
GET    /api/agents                → List marketplace agents
GET    /api/agents/[agentId]      → Agent detail
POST   /api/agents                → Create/deploy agent
POST   /api/agents/[agentId]/run  → Trigger agent objective

GET    /api/launchpad             → List all token launches
GET    /api/launchpad/[address]   → Launch detail + bonding curve state
POST   /api/launchpad/create      → Create agent token (calls LaunchpadFactory)
GET    /api/launchpad/[address]/price  → Current price from curve
GET    /api/launchpad/[address]/holders → Token holders list
GET    /api/launchpad/trending    → Trending by volume / market cap

GET    /api/account/balance       → USDC balance from BrainAccount
GET    /api/account/assets        → All asset balances
GET    /api/account/transactions  → Transaction history
POST   /api/account/deposit       → Coinbase on-ramp
POST   /api/account/allocate      → Allocate capital to agent

GET    /api/notifications         → Paginated notification list
POST   /api/notifications/[id]/read → Mark as read
DELETE /api/notifications/[id]    → Delete notification
GET    /api/notifications/stream  → SSE stream for real-time updates
GET    /api/notifications/count   → Unread count

GET    /api/card                  → WireX card details
GET    /api/card/transactions     → Card transaction history
POST   /api/card/freeze           → Freeze/unfreeze card
```

---

## PART 6 — DATABASE SCHEMA

### 6.1 Azure Cosmos DB Collections

```typescript
// agents container
interface AgentDocument {
  id: string;             // agentId (bytes32 hex)
  ownerId: string;        // userId
  name: string;
  description: string;
  category: string;
  avatarUrl: string;
  metadataUri: string;    // IPFS
  executionWallet: string;
  brainAccountAddress: string;
  policy: {
    spendLimit: string;
    timeWindowSeconds: number;
    allowedAssets: string[];
    approvalThreshold: string;
  };
  status: "active" | "paused" | "graduated";
  createdAt: number;
  lastActiveAt: number;
  totalPaymentsExecuted: number;
  totalVolumeUsdc: string;
  // Launchpad fields (if tokenized)
  tokenAddress?: string;
  bondingCurveAddress?: string;
  marketCap?: number;
  graduated?: boolean;
  aerodromePool?: string;
}

// notifications container
interface NotificationDocument {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  timestamp: number;
  read: boolean;
  _ttl: number;  // Auto-expire after 30 days
}

// marketplace_listings container
interface MarketplaceListing {
  id: string;
  agentId: string;
  name: string;
  description: string;
  category: "trading" | "payments" | "research" | "automation" | "swarm";
  rating: number;
  installs: number;
  price: string;  // "free" | "0.1 USDC/month"
  featured: boolean;
  trending: boolean;
  newAndNoteworthy: boolean;
  previewImages: string[];
  capabilities: string[];
  createdAt: number;
}
```

### 6.2 PostgreSQL + pgvector Schema

```sql
-- Agent memory (vector search)
CREATE TABLE agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  action_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON agent_memory USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX ON agent_memory (agent_id, created_at DESC);

-- Transaction log
CREATE TABLE agent_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  intent_hash TEXT,
  resource_uri TEXT,
  amount_usdc NUMERIC(18,6),
  merchant TEXT,
  status TEXT,  -- pending | confirmed | failed
  block_number BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bonding curve snapshots (for charts)
CREATE TABLE bonding_curve_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curve_address TEXT NOT NULL,
  agent_token_address TEXT NOT NULL,
  price_eth NUMERIC(30,18),
  supply NUMERIC(30,0),
  market_cap_usd NUMERIC(20,2),
  base_raised NUMERIC(30,18),
  tx_hash TEXT,
  event_type TEXT,  -- buy | sell | graduate
  buyer_seller TEXT,
  amount_tokens NUMERIC(30,0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON bonding_curve_snapshots (curve_address, created_at DESC);
```

---

## PART 7 — SUBGRAPH (The Graph)

Deploy a subgraph on Base to index:
- `AgentLaunched` events from LaunchpadFactory
- `TokensPurchased` / `TokensSold` from BondingCurve
- `CurveGraduated` from BondingCurve / LiquidityMigrator
- `PaymentExecuted` from BrainAccount
- `AgentAuthorized` from BrainAccount

Subgraph entities: `Agent`, `BondingCurve`, `Trade`, `Payment`, `Graduation`

---

## PART 8 — DEPLOYMENT CHECKLIST

### Replit Configuration

**`.replit`:**
```toml
run = "npm run dev"
entrypoint = "apps/web/app/page.tsx"

[nix]
channel = "stable-23_11"

[deployment]
run = ["sh", "-c", "npm run build && npm start"]
deploymentTarget = "cloudrun"

[[ports]]
localPort = 3000
externalPort = 80
```

**`replit.nix`:**
```nix
{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.yarn
    pkgs.nodePackages.typescript
    pkgs.solc
    pkgs.git
  ];
}
```

### Deployment Order

1. **Deploy contracts** to Base Sepolia testnet via Hardhat
2. **Provision Azure services** via Bicep (`az deployment group create`)
3. **Set environment variables** in Azure Key Vault + Replit Secrets
4. **Deploy subgraph** to The Graph (Base network)
5. **Run `npm run dev`** — app starts on port 3000
6. **Test core loop:** Sign in → Deposit → Create agent → Run agent → Check notification

### NPM Dependencies

```json
{
  "dependencies": {
    "next": "14.2.0",
    "react": "18.3.0",
    "typescript": "5.4.0",
    "tailwindcss": "3.4.0",
    "framer-motion": "11.0.0",
    "@anthropic-ai/sdk": "0.25.0",
    "wagmi": "2.9.0",
    "viem": "2.13.0",
    "@coinbase/coinbase-sdk": "0.10.0",
    "ethers": "6.11.0",
    "@alchemy/aa-core": "3.15.0",
    "@azure/service-bus": "7.9.0",
    "@azure/notification-hubs": "1.1.0",
    "@azure/cosmos": "4.0.0",
    "@azure/keyvault-secrets": "4.8.0",
    "next-auth": "4.24.7",
    "siwe": "2.3.2",
    "@tanstack/react-query": "5.40.0",
    "recharts": "2.12.0",
    "pg": "8.12.0",
    "pgvector": "0.2.0",
    "openai": "4.52.0",
    "axios": "1.7.0",
    "zustand": "4.5.0",
    "date-fns": "3.6.0",
    "@heroicons/react": "2.1.3",
    "clsx": "2.1.1"
  },
  "devDependencies": {
    "hardhat": "2.22.0",
    "@nomicfoundation/hardhat-toolbox": "5.0.0",
    "@openzeppelin/contracts": "5.0.2",
    "@account-abstraction/contracts": "0.7.0"
  }
}
```

---

## PART 9 — SECURITY REQUIREMENTS

1. **No private key exposure** — All signing via Coinbase CDP SDK. Policy signer key stored in Azure Key Vault, accessed only by Azure Function at runtime.
2. **Replay protection** — All PaymentIntents have nonces + expiry timestamps, enforced on-chain.
3. **Rug pull prevention** — LP tokens burned on graduation. Liquidity is permanently locked in Aerodrome pool.
4. **Policy isolation** — Each agent's capital is isolated in BrainAccount sub-account. Smart contract enforces limits independent of application logic.
5. **Prompt injection protection** — Tool registry is fixed. LLM cannot call unlisted tools. PolicyValidator acts as final on-chain arbiter.
6. **Input validation** — All API routes validate with Zod. Smart contracts validate all inputs with require().
7. **Rate limiting** — Azure API Management enforces per-user and per-agent rate limits.
8. **SIWE auth** — All authenticated routes verify Ethereum signature server-side via next-auth.

---

## PART 10 — KEY IMPLEMENTATION NOTES

- **Bonding curve graduation at ~$69k in BASE raised** (configurable constant in BondingCurve.sol)
- **LP tokens burned at address(0)** on graduation — verifiable on Basescan, prevents rug pulls
- **Aerodrome volatile (non-stable) pool** for AgentToken/WETH pair
- **Market cap = currentPrice × totalSupply** — displayed live on launchpad cards
- **Graduation auto-triggers** inside the `buy()` function — no manual step needed
- **Notifications fire** on every on-chain event via The Graph webhook → Azure Service Bus → SSE stream → frontend
- **Agent avatars** stored in Azure Blob Storage, pinned to IPFS via Pinata for decentralization
- **pgvector semantic search** retrieves top-20 most relevant memories per agent turn
- **Claude tool use** is the only way agents can act — no free-form code execution
- **WireX integration** runs in parallel — card and IBAN do not block the core agent + bonding curve demo

---

## START HERE

Begin with:
```bash
npx create-next-app@latest brain-finance --typescript --tailwind --app --src-dir=false
cd brain-finance
mkdir -p apps/web apps/contracts services/agent-runtime services/payment-orchestrator services/notification-service infra/azure
```

Then implement in this order:
1. Smart contracts + Hardhat config + deploy to Base Sepolia
2. Azure infrastructure (Bicep) + environment variables
3. Next.js 3-column layout + design system (colors, fonts, Sidebar, MarketplacePanel, BankingPanel)
4. Authentication (SIWE + NextAuth)
5. Launchpad: BondingCurveChart + TokenizationWizard + LaunchpadCard components
6. Agent runtime (Azure Function) + ReAct loop
7. Notifications system (Service Bus + SSE stream + NotificationDrawer)
8. Banking panel + WireX integration
9. x402 payment orchestrator
10. Subgraph deployment + real-time data feeds
