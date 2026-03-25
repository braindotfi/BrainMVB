// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PolicyValidator
 * @notice Verifies that an agent payment was approved by the Brain Finance policy engine.
 *         The backend signer (stored in Azure Key Vault) signs a hash of (agentId, intentHash).
 *         The proof is a single-use ECDSA signature, verified on-chain against the trusted signer.
 *         Replay attacks are prevented by the `usedProofs` mapping.
 */
contract PolicyValidator is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public trustedSigner;

    mapping(bytes32 => bool) public usedProofs;

    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event ProofVerified(bytes32 indexed agentId, bytes32 indexed intentHash);

    constructor(address trustedSigner_, address owner_) Ownable(owner_) {
        trustedSigner = trustedSigner_;
    }

    /**
     * @notice Update the trusted policy signer.
     */
    function setTrustedSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "PolicyValidator: zero address");
        emit TrustedSignerUpdated(trustedSigner, newSigner);
        trustedSigner = newSigner;
    }

    /**
     * @notice Verify a single-use policy proof.
     * @param agentId     The agent's bytes32 identifier.
     * @param intentHash  Hash of the payment intent.
     * @param proof       ECDSA signature from the trusted signer.
     */
    function verifyProof(
        bytes32 agentId,
        bytes32 intentHash,
        bytes calldata proof
    ) external returns (bool) {
        bytes32 message = keccak256(abi.encodePacked(agentId, intentHash));
        bytes32 ethHash = message.toEthSignedMessageHash();
        address recovered = ethHash.recover(proof);

        require(!usedProofs[message], "PolicyValidator: proof already used");
        require(recovered == trustedSigner, "PolicyValidator: invalid proof signer");

        usedProofs[message] = true;
        emit ProofVerified(agentId, intentHash);
        return true;
    }

    /**
     * @notice Check if a proof has already been used (off-chain utility).
     */
    function isProofUsed(bytes32 agentId, bytes32 intentHash) external view returns (bool) {
        bytes32 message = keccak256(abi.encodePacked(agentId, intentHash));
        return usedProofs[message];
    }
}
