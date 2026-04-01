/**
 * Brain Finance — Contract Service
 *
 * Off-chain interface to the Brain smart contracts on Base.
 * Uses viem for type-safe contract reads and writes.
 *
 * Supported operations:
 * - Read agent config, balance, policy hash from BrainAccount
 * - Read agent registry records
 * - Compute BrainAccount addresses (counterfactual deployment)
 * - Submit transactions (requires a funded deployer wallet)
 *
 * All contract interactions run in simulation mode when
 * CONTRACT_MODE=demo (default) — returning mock data without
 * touching the blockchain.
 */

import { createPublicClient, createWalletClient, http, keccak256, toBytes, type Address, type Hex } from "viem";
import { baseSepolia, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import BrainAccountABI from "../contracts/abis/BrainAccount.json" assert { type: "json" };
import AgentRegistryABI from "../contracts/abis/AgentRegistry.json" assert { type: "json" };
import BrainAccountFactoryABI from "../contracts/abis/BrainAccountFactory.json" assert { type: "json" };

// ── Config ────────────────────────────────────────────────────────────────────

const CONTRACT_MODE = process.env.CONTRACT_MODE ?? "demo";
const CHAIN_ID = parseInt(process.env.CHAIN_ID ?? "84532"); // Base Sepolia default

const DEPLOYED_ADDRESSES = {
  policyValidator:      (process.env.POLICY_VALIDATOR_ADDRESS      ?? "") as Address,
  agentRegistry:        (process.env.AGENT_REGISTRY_ADDRESS        ?? "") as Address,
  brainAccountFactory:  (process.env.BRAIN_ACCOUNT_FACTORY_ADDRESS ?? "") as Address,
};

const ALCHEMY_RPC = process.env.ALCHEMY_API_KEY
  ? `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  : "https://sepolia.base.org";

const chain = CHAIN_ID === 8453 ? base : baseSepolia;

// ── viem clients ──────────────────────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain,
  transport: http(ALCHEMY_RPC),
});

function getWalletClient() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  return createWalletClient({ chain, transport: http(ALCHEMY_RPC), account });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OnChainAgentConfig {
  executionWallet: Address;
  spendLimit: bigint;
  timeWindowSeconds: bigint;
  spentInWindow: bigint;
  windowStart: bigint;
  approvalThreshold: bigint;
  tradingEnabled: boolean;
  maxPositionSize: bigint;
  cumulativeExposure: bigint;
  maxCumulativeExposure: bigint;
  active: boolean;
}

export interface AgentRegistryRecord {
  agentId: Hex;
  owner: Address;
  executionWallet: Address;
  metadataURI: string;
  agentType: number;
  status: number;
  policyHash: Hex;
  registeredAt: bigint;
  lastActiveAt: bigint;
  validationCount: bigint;
  totalVolumeUsdc: bigint;
}

// ── Demo fallback data ────────────────────────────────────────────────────────

const DEMO_AGENT_CONFIG: OnChainAgentConfig = {
  executionWallet: "0x0000000000000000000000000000000000000001",
  spendLimit: BigInt(100_000_000), // 100 USDC
  timeWindowSeconds: BigInt(86400),
  spentInWindow: BigInt(12_500_000), // 12.50 USDC
  windowStart: BigInt(Math.floor(Date.now() / 1000) - 3600),
  approvalThreshold: BigInt(0),
  tradingEnabled: true,
  maxPositionSize: BigInt(500_000_000), // 500 USDC
  cumulativeExposure: BigInt(0),
  maxCumulativeExposure: BigInt(1_000_000_000),
  active: true,
};

// ── BrainAccount reads ────────────────────────────────────────────────────────

/**
 * Read an agent's on-chain configuration from their BrainAccount.
 */
export async function getOnChainAgentConfig(
  brainAccountAddress: Address,
  agentId: Hex
): Promise<OnChainAgentConfig> {
  if (CONTRACT_MODE === "demo" || !brainAccountAddress || brainAccountAddress === "0x") {
    return DEMO_AGENT_CONFIG;
  }
  try {
    const config = await publicClient.readContract({
      address: brainAccountAddress,
      abi: BrainAccountABI,
      functionName: "getAgentConfig",
      args: [agentId],
    }) as OnChainAgentConfig;
    return config;
  } catch (err) {
    console.warn("[ContractService] getOnChainAgentConfig failed, using demo:", err);
    return DEMO_AGENT_CONFIG;
  }
}

/**
 * Read an agent's allocated capital balance.
 */
export async function getAgentBalance(
  brainAccountAddress: Address,
  agentId: Hex
): Promise<bigint> {
  if (CONTRACT_MODE === "demo" || !brainAccountAddress) {
    return BigInt(87_500_000); // 87.50 USDC demo
  }
  try {
    return await publicClient.readContract({
      address: brainAccountAddress,
      abi: BrainAccountABI,
      functionName: "getAgentBalance",
      args: [agentId],
    }) as bigint;
  } catch {
    return BigInt(87_500_000);
  }
}

/**
 * Read remaining budget in the current spend window.
 */
export async function getRemainingBudget(
  brainAccountAddress: Address,
  agentId: Hex
): Promise<bigint> {
  if (CONTRACT_MODE === "demo" || !brainAccountAddress) {
    return BigInt(87_500_000);
  }
  try {
    return await publicClient.readContract({
      address: brainAccountAddress,
      abi: BrainAccountABI,
      functionName: "getRemainingBudget",
      args: [agentId],
    }) as bigint;
  } catch {
    return BigInt(87_500_000);
  }
}

/**
 * Read the on-chain policy hash commitment.
 */
export async function getAgentPolicyHash(
  brainAccountAddress: Address,
  agentId: Hex
): Promise<Hex> {
  if (CONTRACT_MODE === "demo" || !brainAccountAddress) {
    return "0x" + "00".repeat(32) as Hex;
  }
  try {
    return await publicClient.readContract({
      address: brainAccountAddress,
      abi: BrainAccountABI,
      functionName: "getAgentPolicyHash",
      args: [agentId],
    }) as Hex;
  } catch {
    return "0x" + "00".repeat(32) as Hex;
  }
}

// ── AgentRegistry reads ───────────────────────────────────────────────────────

/**
 * Read an agent's registry record.
 */
export async function getRegistryRecord(agentId: Hex): Promise<AgentRegistryRecord | null> {
  const address = DEPLOYED_ADDRESSES.agentRegistry;
  if (CONTRACT_MODE === "demo" || !address) return null;
  try {
    return await publicClient.readContract({
      address,
      abi: AgentRegistryABI,
      functionName: "getAgent",
      args: [agentId],
    }) as AgentRegistryRecord;
  } catch {
    return null;
  }
}

/**
 * Get all agentIds registered to an owner address.
 */
export async function getOwnerAgents(ownerAddress: Address): Promise<Hex[]> {
  const address = DEPLOYED_ADDRESSES.agentRegistry;
  if (CONTRACT_MODE === "demo" || !address) return [];
  try {
    return await publicClient.readContract({
      address,
      abi: AgentRegistryABI,
      functionName: "getOwnerAgents",
      args: [ownerAddress],
    }) as Hex[];
  } catch {
    return [];
  }
}

// ── BrainAccountFactory ───────────────────────────────────────────────────────

/**
 * Compute the deterministic BrainAccount address for a user (pre-deployment).
 * Returns the counterfactual address before the account is deployed.
 */
export async function computeBrainAccountAddress(ownerAddress: Address): Promise<Address> {
  const factoryAddress = DEPLOYED_ADDRESSES.brainAccountFactory;
  if (CONTRACT_MODE === "demo" || !factoryAddress) {
    // Return a deterministic mock address
    const hash = keccak256(toBytes(ownerAddress));
    return `0x${hash.slice(26)}` as Address;
  }
  try {
    const salt = keccak256(toBytes(ownerAddress)) as Hex;
    return await publicClient.readContract({
      address: factoryAddress,
      abi: BrainAccountFactoryABI,
      functionName: "computeAddress",
      args: [ownerAddress, salt],
    }) as Address;
  } catch {
    const hash = keccak256(toBytes(ownerAddress));
    return `0x${hash.slice(26)}` as Address;
  }
}

/**
 * Get the deployed BrainAccount address for an owner.
 * Returns empty address if not yet deployed.
 */
export async function getDeployedAccount(ownerAddress: Address): Promise<Address | null> {
  const factoryAddress = DEPLOYED_ADDRESSES.brainAccountFactory;
  if (CONTRACT_MODE === "demo" || !factoryAddress) return null;
  try {
    const result = await publicClient.readContract({
      address: factoryAddress,
      abi: BrainAccountFactoryABI,
      functionName: "getAccount",
      args: [ownerAddress],
    }) as Address;
    return result === "0x0000000000000000000000000000000000000000" ? null : result;
  } catch {
    return null;
  }
}

// ── Writes (require DEPLOYER_PRIVATE_KEY) ────────────────────────────────────

/**
 * Deploy a BrainAccount for a user via the factory.
 * Returns the deployed account address.
 */
export async function deployBrainAccount(ownerAddress: Address): Promise<{ hash: Hex; address: Address }> {
  if (CONTRACT_MODE === "demo") {
    const mockAddress = await computeBrainAccountAddress(ownerAddress);
    return { hash: ("0x" + "cc".repeat(32)) as Hex, address: mockAddress };
  }

  const wallet = getWalletClient();
  const factoryAddress = DEPLOYED_ADDRESSES.brainAccountFactory;
  if (!factoryAddress) throw new Error("BRAIN_ACCOUNT_FACTORY_ADDRESS not configured");

  const salt = keccak256(toBytes(ownerAddress)) as Hex;
  const hash = await wallet.writeContract({
    address: factoryAddress,
    abi: BrainAccountFactoryABI,
    functionName: "createAccount",
    args: [ownerAddress, salt],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  const accountAddress = await computeBrainAccountAddress(ownerAddress);
  return { hash, address: accountAddress };
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function formatUsdc(amount: bigint): string {
  const whole = amount / BigInt(1_000_000);
  const frac = amount % BigInt(1_000_000);
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "") || "00"}`;
}

export function parseUsdc(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * BigInt(1_000_000) + BigInt(fracPadded);
}

export { DEPLOYED_ADDRESSES, CONTRACT_MODE };
