/**
 * Brain Finance — Policy Engine
 *
 * The Policy Engine is the off-chain enforcement layer that sits between the AI agent
 * reasoning loop and the on-chain BrainAccount/PolicyValidator contracts.
 *
 * Responsibilities:
 * 1. Evaluate PaymentIntents and TradeIntents against agent policy configuration.
 * 2. Sign approved intents with the Brain trusted signer key, producing policy proofs.
 * 3. Return signed proofs to the Payment/Trading Orchestrator for on-chain submission.
 *
 * The policy proof is an ECDSA signature over:
 *   keccak256(DOMAIN_TAG ‖ agentId ‖ intentHash ‖ expiry)
 *
 * This matches PolicyValidator.sol's verification logic exactly.
 *
 * Security model:
 * - The POLICY_SIGNER_PRIVATE_KEY must be stored securely (env var or secrets vault).
 * - Proofs expire in PROOF_EXPIRY_SECONDS (default: 120s).
 * - Proofs are single-use — PolicyValidator burns each proof after verification.
 */

import { createHash } from "crypto";
import { keccak256, encodePacked, toBytes, hexToBytes, privateKeyToAccount, type Address, type Hex } from "viem";
import { privateKeyToAccount as privToAccount } from "viem/accounts";

// ── Domain tags (must match PolicyValidator.sol constants) ────────────────────
const PAYMENT_DOMAIN_TAG = keccak256(toBytes("BrainFinance:PaymentProof:v1")) as Hex;
const TRADE_DOMAIN_TAG   = keccak256(toBytes("BrainFinance:TradeProof:v1")) as Hex;

// ── Config ────────────────────────────────────────────────────────────────────
const PROOF_EXPIRY_SECONDS = parseInt(process.env.PROOF_EXPIRY_SECONDS ?? "120");
const RAW_SIGNER_KEY = process.env.POLICY_SIGNER_PRIVATE_KEY ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentPolicy {
  agentId: string;                  // bytes32 hex
  spendLimit: bigint;               // USDC, 6 decimals
  timeWindowSeconds: number;
  spentInWindow: bigint;
  windowStart: number;              // UNIX timestamp
  approvalThreshold: bigint;        // single-tx requiring human approval (0 = never)
  allowedAssets: string[];          // ERC-20 addresses
  allowedMerchants?: string[];      // optional allowlist
  tradingEnabled: boolean;
  allowedMarkets?: string[];        // e.g. ["BTC-USDC", "ETH-USDC"]
  maxPositionSize: bigint;
  maxDailyLoss: bigint;
  cooldownWindowSeconds: number;
  maxCumulativeExposure: bigint;
}

export interface PaymentIntent {
  agentId: string;                  // bytes32 hex
  resourceUri: string;              // HTTP resource being paid for
  amount: bigint;                   // USDC, 6 decimals
  asset: string;                    // ERC-20 address
  merchant: string;                 // recipient address
  expiry: number;                   // UNIX timestamp (from x402 server)
  nonce: string;                    // unique per payment
}

export interface TradeIntent {
  agentId: string;                  // bytes32 hex
  asset: string;                    // e.g. "BTC-USDC"
  side: "long" | "short";
  size: bigint;                     // notional, USDC 6 decimals
  orderType: "market" | "limit";
  priceLimit?: bigint;              // for limit orders
  timestamp: number;
}

export interface PolicyProof {
  proof: Hex;                       // ECDSA signature
  expiry: number;                   // UNIX timestamp
  intentHash: Hex;                  // keccak256 of the intent
  approved: true;
}

export interface PolicyRejection {
  approved: false;
  reason: string;
}

export type PolicyResult = PolicyProof | PolicyRejection;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeKey(key: string): Hex {
  if (!key || key.length < 32) {
    throw new Error("POLICY_SIGNER_PRIVATE_KEY not configured or too short");
  }
  return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
}

function buildPaymentIntentHash(intent: PaymentIntent): Hex {
  return keccak256(encodePacked(
    ["bytes32", "string", "uint256", "address", "address", "uint256", "string"],
    [
      intent.agentId as Hex,
      intent.resourceUri,
      intent.amount,
      intent.asset as Address,
      intent.merchant as Address,
      BigInt(intent.expiry),
      intent.nonce,
    ]
  ));
}

function buildTradeIntentHash(intent: TradeIntent): Hex {
  return keccak256(encodePacked(
    ["bytes32", "string", "string", "uint256", "uint256"],
    [
      intent.agentId as Hex,
      intent.asset,
      intent.side,
      intent.size,
      BigInt(intent.timestamp),
    ]
  ));
}

function buildProofMessage(domainTag: Hex, agentId: string, intentHash: Hex, expiry: number): Hex {
  return keccak256(encodePacked(
    ["bytes32", "bytes32", "bytes32", "uint256"],
    [domainTag, agentId as Hex, intentHash, BigInt(expiry)]
  ));
}

// ── Policy Evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate a PaymentIntent against the agent's policy.
 * Returns the rejection reason if any rule is violated.
 */
export function evaluatePaymentIntent(
  intent: PaymentIntent,
  policy: AgentPolicy
): string | null {
  const now = Math.floor(Date.now() / 1000);

  // Expiry check
  if (intent.expiry < now) {
    return "Payment intent has expired";
  }

  // Asset allowlist
  if (policy.allowedAssets.length > 0) {
    const normalizedAssets = policy.allowedAssets.map(a => a.toLowerCase());
    if (!normalizedAssets.includes(intent.asset.toLowerCase())) {
      return `Asset ${intent.asset} not in allowed list`;
    }
  }

  // Merchant allowlist (if configured)
  if (policy.allowedMerchants && policy.allowedMerchants.length > 0) {
    const normalizedMerchants = policy.allowedMerchants.map(m => m.toLowerCase());
    if (!normalizedMerchants.includes(intent.merchant.toLowerCase())) {
      return `Merchant ${intent.merchant} not in allowed list`;
    }
  }

  // Rolling spend window check
  let spentInWindow = policy.spentInWindow;
  const windowExpiry = policy.windowStart + policy.timeWindowSeconds;
  if (now >= windowExpiry) {
    spentInWindow = BigInt(0); // window has reset
  }

  if (spentInWindow + intent.amount > policy.spendLimit) {
    const remaining = policy.spendLimit - spentInWindow;
    return `Spend limit exceeded. Remaining: ${remaining} / ${policy.spendLimit} USDC in this window`;
  }

  // Amount vs approval threshold
  if (policy.approvalThreshold > BigInt(0) && intent.amount >= policy.approvalThreshold) {
    return `Amount ${intent.amount} meets or exceeds approval threshold ${policy.approvalThreshold} — human approval required`;
  }

  return null; // approved
}

/**
 * Evaluate a TradeIntent against the agent's trading policy.
 */
export function evaluateTradeIntent(
  intent: TradeIntent,
  policy: AgentPolicy,
  currentExposure: bigint = BigInt(0)
): string | null {
  if (!policy.tradingEnabled) {
    return "Trading not enabled for this agent";
  }

  // Market allowlist
  if (policy.allowedMarkets && policy.allowedMarkets.length > 0) {
    if (!policy.allowedMarkets.includes(intent.asset)) {
      return `Market ${intent.asset} not in allowed list`;
    }
  }

  // Max position size
  if (policy.maxPositionSize > BigInt(0) && intent.size > policy.maxPositionSize) {
    return `Position size ${intent.size} exceeds maxPositionSize ${policy.maxPositionSize}`;
  }

  // Cumulative exposure
  if (policy.maxCumulativeExposure > BigInt(0)) {
    if (currentExposure + intent.size > policy.maxCumulativeExposure) {
      return `Cumulative exposure would exceed ${policy.maxCumulativeExposure}`;
    }
  }

  return null; // approved
}

// ── Signing ───────────────────────────────────────────────────────────────────

/**
 * Sign an approved PaymentIntent and return the on-chain policy proof.
 * The signature uses Ethereum personal_sign (eth_sign prefix), matching
 * MessageHashUtils.toEthSignedMessageHash() in PolicyValidator.sol.
 */
export async function signPaymentIntent(intent: PaymentIntent): Promise<PolicyProof> {
  const intentHash = buildPaymentIntentHash(intent);
  const expiry = Math.floor(Date.now() / 1000) + PROOF_EXPIRY_SECONDS;
  const message = buildProofMessage(PAYMENT_DOMAIN_TAG, intent.agentId, intentHash, expiry);

  const account = privToAccount(normalizeKey(RAW_SIGNER_KEY));
  // Sign the raw message bytes — wallet signs keccak256(prefix + message)
  const proof = await account.signMessage({ message: { raw: hexToBytes(message) } });

  return { proof, expiry, intentHash, approved: true };
}

/**
 * Sign an approved TradeIntent and return the on-chain policy proof.
 */
export async function signTradeIntent(intent: TradeIntent): Promise<PolicyProof> {
  const intentHash = buildTradeIntentHash(intent);
  const expiry = Math.floor(Date.now() / 1000) + PROOF_EXPIRY_SECONDS;
  const message = buildProofMessage(TRADE_DOMAIN_TAG, intent.agentId, intentHash, expiry);

  const account = privToAccount(normalizeKey(RAW_SIGNER_KEY));
  const proof = await account.signMessage({ message: { raw: hexToBytes(message) } });

  return { proof, expiry, intentHash, approved: true };
}

// ── Main Entry Points ─────────────────────────────────────────────────────────

/**
 * Full pipeline: evaluate + sign a PaymentIntent.
 * Called by the Payment Orchestrator before submitting a UserOperation.
 */
export async function processPaymentIntent(
  intent: PaymentIntent,
  policy: AgentPolicy
): Promise<PolicyResult> {
  const rejection = evaluatePaymentIntent(intent, policy);
  if (rejection) {
    return { approved: false, reason: rejection };
  }

  if (!RAW_SIGNER_KEY) {
    console.warn("[PolicyEngine] No POLICY_SIGNER_PRIVATE_KEY — returning demo proof");
    return {
      proof: "0x" + "aa".repeat(65) as Hex,
      expiry: Math.floor(Date.now() / 1000) + PROOF_EXPIRY_SECONDS,
      intentHash: buildPaymentIntentHash(intent),
      approved: true,
    };
  }

  return signPaymentIntent(intent);
}

/**
 * Full pipeline: evaluate + sign a TradeIntent.
 * Called by the Trading Orchestrator before submitting to Hyperliquid.
 */
export async function processTradeIntent(
  intent: TradeIntent,
  policy: AgentPolicy,
  currentExposure: bigint = BigInt(0)
): Promise<PolicyResult> {
  const rejection = evaluateTradeIntent(intent, policy, currentExposure);
  if (rejection) {
    return { approved: false, reason: rejection };
  }

  if (!RAW_SIGNER_KEY) {
    console.warn("[PolicyEngine] No POLICY_SIGNER_PRIVATE_KEY — returning demo proof");
    return {
      proof: "0x" + "bb".repeat(65) as Hex,
      expiry: Math.floor(Date.now() / 1000) + PROOF_EXPIRY_SECONDS,
      intentHash: buildTradeIntentHash(intent),
      approved: true,
    };
  }

  return signTradeIntent(intent);
}

/**
 * Compute the keccak256 policy hash for a policy config object.
 * Used for BrainAccount.setPolicy() and AgentRegistry.setPolicyHash().
 */
export function computePolicyHash(policy: Omit<AgentPolicy, "spentInWindow" | "windowStart">): Hex {
  const encoded = JSON.stringify({
    agentId: policy.agentId,
    spendLimit: policy.spendLimit.toString(),
    timeWindowSeconds: policy.timeWindowSeconds,
    approvalThreshold: policy.approvalThreshold.toString(),
    allowedAssets: policy.allowedAssets,
    tradingEnabled: policy.tradingEnabled,
    allowedMarkets: policy.allowedMarkets ?? [],
    maxPositionSize: policy.maxPositionSize.toString(),
    maxDailyLoss: policy.maxDailyLoss.toString(),
    cooldownWindowSeconds: policy.cooldownWindowSeconds,
    maxCumulativeExposure: policy.maxCumulativeExposure.toString(),
  });
  return keccak256(toBytes(encoded));
}
