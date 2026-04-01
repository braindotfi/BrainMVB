// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PolicyValidator
 * @notice On-chain enforcement of Brain Finance policy proofs.
 *
 *         Architecture:
 *         The Brain Finance backend ("Policy Engine") holds a private key (trusted signer).
 *         Before any agent payment or trade can execute, the Policy Engine evaluates the
 *         intent off-chain against the configured policy. If approved, it signs a structured
 *         hash of the intent + expiry and returns the proof to the agent.
 *
 *         This contract verifies the proof on-chain:
 *         1. Recovers the signer from the ECDSA signature.
 *         2. Compares against `trustedSigner`.
 *         3. Checks the proof has not expired.
 *         4. Marks the proof as used (single-use, prevents replay attacks).
 *
 *         Security model:
 *         - Nonces: each proof is keyed by (agentId, intentHash) — unique per intent.
 *         - Expiry: proofs expire after a configurable window (set by backend, e.g. 60s).
 *         - Replay prevention: used proof hashes are stored in `usedProofs`.
 *         - Signer separation: payment proofs and trade proofs use different domain tags.
 */
contract PolicyValidator is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ─── Constants ────────────────────────────────────────────────────────────
    // EIP-712 domain separators for payment vs trade proofs
    bytes32 public constant PAYMENT_DOMAIN_TAG = keccak256("BrainFinance:PaymentProof:v1");
    bytes32 public constant TRADE_DOMAIN_TAG   = keccak256("BrainFinance:TradeProof:v1");

    // ─── State ────────────────────────────────────────────────────────────────
    address public trustedSigner;
    mapping(bytes32 => bool) public usedProofs;

    // ─── Events ───────────────────────────────────────────────────────────────
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event PaymentProofVerified(bytes32 indexed agentId, bytes32 indexed intentHash);
    event TradeProofVerified(bytes32 indexed agentId, bytes32 indexed tradeIntentHash);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address trustedSigner_, address owner_) Ownable(owner_) {
        require(trustedSigner_ != address(0), "PolicyValidator: zero signer");
        trustedSigner = trustedSigner_;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Rotate the trusted signer key without redeploying the contract.
     *         Used when the Brain backend signer key is rotated.
     */
    function setTrustedSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "PolicyValidator: zero address");
        emit TrustedSignerUpdated(trustedSigner, newSigner);
        trustedSigner = newSigner;
    }

    // ─── Payment Proof Verification ───────────────────────────────────────────

    /**
     * @notice Verify a single-use payment policy proof.
     *
     *         The backend constructs:
     *           message = keccak256(PAYMENT_DOMAIN_TAG ‖ agentId ‖ intentHash ‖ expiry)
     *         and signs it with `trustedSigner`'s private key.
     *
     *         On-chain, we reproduce the message, recover the signer,
     *         and enforce expiry + single-use constraints.
     *
     * @param agentId     The agent's bytes32 identifier.
     * @param intentHash  keccak256 of the PaymentIntent struct (built by backend).
     * @param expiry      UNIX timestamp after which this proof is invalid.
     * @param proof       ECDSA signature (65 bytes) from the trusted signer.
     * @return            True if valid; reverts if invalid.
     */
    function verifyPaymentProof(
        bytes32 agentId,
        bytes32 intentHash,
        uint256 expiry,
        bytes calldata proof
    ) external returns (bool) {
        require(block.timestamp < expiry, "PolicyValidator: proof expired");

        bytes32 message = keccak256(abi.encodePacked(
            PAYMENT_DOMAIN_TAG, agentId, intentHash, expiry
        ));
        bytes32 ethHash = message.toEthSignedMessageHash();
        address recovered = ethHash.recover(proof);

        require(!usedProofs[message], "PolicyValidator: proof already used");
        require(recovered == trustedSigner, "PolicyValidator: invalid payment proof signer");

        usedProofs[message] = true;
        emit PaymentProofVerified(agentId, intentHash);
        return true;
    }

    // ─── Trade Proof Verification ─────────────────────────────────────────────

    /**
     * @notice Verify a single-use trade policy proof.
     *
     *         Same structure as payment proof but uses TRADE_DOMAIN_TAG,
     *         ensuring payment and trade proofs cannot be confused.
     *
     * @param agentId          The agent's bytes32 identifier.
     * @param tradeIntentHash  keccak256 of the TradeIntent struct.
     * @param expiry           UNIX timestamp after which this proof is invalid.
     * @param proof            ECDSA signature from the trusted signer.
     * @return                 True if valid; reverts if invalid.
     */
    function verifyTradeProof(
        bytes32 agentId,
        bytes32 tradeIntentHash,
        uint256 expiry,
        bytes calldata proof
    ) external returns (bool) {
        require(block.timestamp < expiry, "PolicyValidator: proof expired");

        bytes32 message = keccak256(abi.encodePacked(
            TRADE_DOMAIN_TAG, agentId, tradeIntentHash, expiry
        ));
        bytes32 ethHash = message.toEthSignedMessageHash();
        address recovered = ethHash.recover(proof);

        require(!usedProofs[message], "PolicyValidator: proof already used");
        require(recovered == trustedSigner, "PolicyValidator: invalid trade proof signer");

        usedProofs[message] = true;
        emit TradeProofVerified(agentId, tradeIntentHash);
        return true;
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    /**
     * @notice Check if a payment proof has been used (off-chain utility).
     */
    function isPaymentProofUsed(
        bytes32 agentId,
        bytes32 intentHash,
        uint256 expiry
    ) external view returns (bool) {
        bytes32 message = keccak256(abi.encodePacked(
            PAYMENT_DOMAIN_TAG, agentId, intentHash, expiry
        ));
        return usedProofs[message];
    }

    /**
     * @notice Check if a trade proof has been used (off-chain utility).
     */
    function isTradeProofUsed(
        bytes32 agentId,
        bytes32 tradeIntentHash,
        uint256 expiry
    ) external view returns (bool) {
        bytes32 message = keccak256(abi.encodePacked(
            TRADE_DOMAIN_TAG, agentId, tradeIntentHash, expiry
        ));
        return usedProofs[message];
    }

    /**
     * @notice Reconstruct the payment proof message for off-chain signing.
     *         Backend uses this same encoding to produce proofs.
     */
    function paymentProofMessage(
        bytes32 agentId,
        bytes32 intentHash,
        uint256 expiry
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            PAYMENT_DOMAIN_TAG, agentId, intentHash, expiry
        ));
    }

    /**
     * @notice Reconstruct the trade proof message for off-chain signing.
     */
    function tradeProofMessage(
        bytes32 agentId,
        bytes32 tradeIntentHash,
        uint256 expiry
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            TRADE_DOMAIN_TAG, agentId, tradeIntentHash, expiry
        ));
    }
}
