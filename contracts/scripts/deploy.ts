/**
 * Brain Finance — Contract Deployment Script
 * Target: Base Sepolia (testnet) or Base Mainnet
 *
 * Deployment order:
 * 1. PolicyValidator (needs trusted signer address)
 * 2. BrainAccountFactory (needs EntryPoint + PolicyValidator addresses)
 *
 * AgentRegistry is standalone — deploy in parallel with #1.
 *
 * Run:
 *   npx hardhat run scripts/deploy.ts --network baseSepolia
 *   npx hardhat run scripts/deploy.ts --network base
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY    — deployer EOA private key
 *   POLICY_SIGNER_ADDRESS   — Brain backend policy engine signer address
 *   ALCHEMY_API_KEY         — for Alchemy RPC
 */

import { ethers } from "hardhat";

// Base Sepolia ERC-4337 EntryPoint v0.7
const BASE_SEPOLIA_ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
// Base Mainnet ERC-4337 EntryPoint v0.7
const BASE_MAINNET_ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  Brain Finance Contract Deployment   ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`\nNetwork:   ${network.name} (chainId: ${chainId})`);
  console.log(`Deployer:  ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:   ${ethers.formatEther(balance)} ETH\n`);

  // EntryPoint address (ERC-4337 v0.7 — same on Base and Base Sepolia)
  const entryPointAddress = chainId === 8453
    ? BASE_MAINNET_ENTRY_POINT
    : BASE_SEPOLIA_ENTRY_POINT;

  // Policy signer — Brain's backend signing key
  const policySigner = process.env.POLICY_SIGNER_ADDRESS ?? deployer.address;
  console.log(`EntryPoint:     ${entryPointAddress}`);
  console.log(`PolicySigner:   ${policySigner}\n`);

  // ── 1. Deploy PolicyValidator ──────────────────────────────────────────────
  console.log("1/3  Deploying PolicyValidator...");
  const PolicyValidator = await ethers.getContractFactory("PolicyValidator");
  const policyValidator = await PolicyValidator.deploy(policySigner, deployer.address);
  await policyValidator.waitForDeployment();
  const pvAddress = await policyValidator.getAddress();
  console.log(`     PolicyValidator:       ${pvAddress}`);

  // ── 2. Deploy AgentRegistry ────────────────────────────────────────────────
  console.log("2/3  Deploying AgentRegistry...");
  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const agentRegistry = await AgentRegistry.deploy();
  await agentRegistry.waitForDeployment();
  const arAddress = await agentRegistry.getAddress();
  console.log(`     AgentRegistry:         ${arAddress}`);

  // ── 3. Deploy BrainAccountFactory ─────────────────────────────────────────
  console.log("3/3  Deploying BrainAccountFactory...");
  const BrainAccountFactory = await ethers.getContractFactory("BrainAccountFactory");
  const factory = await BrainAccountFactory.deploy(entryPointAddress, pvAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`     BrainAccountFactory:   ${factoryAddress}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    Deployment Summary                       ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  PolicyValidator:       ${pvAddress}  ║`);
  console.log(`║  AgentRegistry:         ${arAddress}  ║`);
  console.log(`║  BrainAccountFactory:   ${factoryAddress}  ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("\nNext steps:");
  console.log("  1. Set these addresses in .env:");
  console.log(`     POLICY_VALIDATOR_ADDRESS=${pvAddress}`);
  console.log(`     AGENT_REGISTRY_ADDRESS=${arAddress}`);
  console.log(`     BRAIN_ACCOUNT_FACTORY_ADDRESS=${factoryAddress}`);
  console.log("  2. Run verify:");
  console.log(`     npx hardhat verify --network ${network.name} ${pvAddress} "${policySigner}" "${deployer.address}"`);
  console.log(`     npx hardhat verify --network ${network.name} ${arAddress}`);
  console.log(`     npx hardhat verify --network ${network.name} ${factoryAddress} "${entryPointAddress}" "${pvAddress}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
