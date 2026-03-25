import { ethers } from "hardhat";

/**
 * Brain Finance — Full Deployment Script
 *
 * Deployment order:
 *   1. PolicyValidator
 *   2. AgentRegistry
 *   3. LiquidityMigrator
 *   4. LaunchpadFactory
 *
 * BrainAccount is deployed per-user via a factory (not included here).
 * Aerodrome addresses are Base mainnet — update for Sepolia testnet forks.
 */

// Base Sepolia test addresses (replace with mainnet for production)
const AERODROME_ROUTER_SEPOLIA = "0x0000000000000000000000000000000000000001"; // placeholder
const AERODROME_FACTORY_SEPOLIA = "0x0000000000000000000000000000000000000002"; // placeholder
const WETH_BASE_SEPOLIA = "0x4200000000000000000000000000000000000006";

// Base Mainnet addresses
const AERODROME_ROUTER_MAINNET = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const AERODROME_FACTORY_MAINNET = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
const WETH_BASE_MAINNET = "0x4200000000000000000000000000000000000006";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Brain Finance contracts...");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const network = await ethers.provider.getNetwork();
  const isMainnet = network.chainId === 8453n;
  const aerodromeRouter = isMainnet ? AERODROME_ROUTER_MAINNET : AERODROME_ROUTER_SEPOLIA;
  const aerodromeFactory = isMainnet ? AERODROME_FACTORY_MAINNET : AERODROME_FACTORY_SEPOLIA;
  const weth = isMainnet ? WETH_BASE_MAINNET : WETH_BASE_SEPOLIA;
  const feeCollector = deployer.address; // Update to multisig in production

  console.log(`\nNetwork: ${isMainnet ? "Base Mainnet" : "Base Sepolia"}`);

  // 1. PolicyValidator
  console.log("\n1. Deploying PolicyValidator...");
  const PolicyValidator = await ethers.getContractFactory("PolicyValidator");
  const policyValidator = await PolicyValidator.deploy(deployer.address, deployer.address);
  await policyValidator.waitForDeployment();
  console.log("   PolicyValidator:", await policyValidator.getAddress());

  // 2. AgentRegistry
  console.log("\n2. Deploying AgentRegistry...");
  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const agentRegistry = await AgentRegistry.deploy();
  await agentRegistry.waitForDeployment();
  console.log("   AgentRegistry:", await agentRegistry.getAddress());

  // 3. LiquidityMigrator
  console.log("\n3. Deploying LiquidityMigrator...");
  const LiquidityMigrator = await ethers.getContractFactory("LiquidityMigrator");
  const liquidityMigrator = await LiquidityMigrator.deploy(aerodromeRouter, aerodromeFactory, weth);
  await liquidityMigrator.waitForDeployment();
  console.log("   LiquidityMigrator:", await liquidityMigrator.getAddress());

  // 4. LaunchpadFactory
  console.log("\n4. Deploying LaunchpadFactory...");
  const LaunchpadFactory = await ethers.getContractFactory("LaunchpadFactory");
  const launchpadFactory = await LaunchpadFactory.deploy(
    await agentRegistry.getAddress(),
    await liquidityMigrator.getAddress(),
    feeCollector
  );
  await launchpadFactory.waitForDeployment();
  console.log("   LaunchpadFactory:", await launchpadFactory.getAddress());

  // Summary
  console.log("\n====== DEPLOYMENT COMPLETE ======");
  console.log("Add these to your .env file:");
  console.log(`POLICY_VALIDATOR=${await policyValidator.getAddress()}`);
  console.log(`AGENT_REGISTRY=${await agentRegistry.getAddress()}`);
  console.log(`LIQUIDITY_MIGRATOR=${await liquidityMigrator.getAddress()}`);
  console.log(`LAUNCHPAD_FACTORY=${await launchpadFactory.getAddress()}`);
  console.log(`AERODROME_ROUTER=${aerodromeRouter}`);
  console.log(`AERODROME_FACTORY=${aerodromeFactory}`);
  console.log(`WETH_BASE=${weth}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
