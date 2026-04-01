// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./BrainAccount.sol";

/**
 * @title BrainAccountFactory
 * @notice Deploys one BrainAccount per user using CREATE2 for deterministic addresses.
 *
 *         Architecture:
 *         A single factory is deployed once. Each user's BrainAccount address can be
 *         computed off-chain before deployment using `computeAddress()`. This means
 *         the user can be shown their account address and fund it via Coinbase on-ramp
 *         before the BrainAccount is actually deployed on-chain (counterfactual deployment).
 *
 *         The factory stores the EntryPoint and PolicyValidator addresses so all
 *         BrainAccounts are wired to the same infrastructure.
 *
 *         Steps:
 *         - Step 4 in account setup: BrainAccount deployed, owner set to user's Crossmint wallet.
 *         - Step 5: User deposits USDC. Funds land in BrainAccount (address known before deploy).
 */
contract BrainAccountFactory {

    // ─── State ────────────────────────────────────────────────────────────────
    address public immutable entryPoint;
    address public immutable policyValidator;

    mapping(address => address) public accountOf; // owner => BrainAccount
    address[] public allAccounts;

    // ─── Events ───────────────────────────────────────────────────────────────
    event AccountCreated(
        address indexed owner,
        address indexed account,
        bytes32 salt
    );

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address entryPoint_, address policyValidator_) {
        require(entryPoint_ != address(0), "Factory: zero entryPoint");
        require(policyValidator_ != address(0), "Factory: zero policyValidator");
        entryPoint = entryPoint_;
        policyValidator = policyValidator_;
    }

    // ─── Deployment ───────────────────────────────────────────────────────────

    /**
     * @notice Deploy a BrainAccount for `owner` using CREATE2.
     *         Idempotent: returns existing account if already deployed.
     *
     * @param owner  The user's Crossmint Embedded Wallet address.
     * @param salt   Entropy bytes — use keccak256(owner abi.encode) for determinism.
     * @return account  Address of the deployed (or existing) BrainAccount.
     */
    function createAccount(address owner, bytes32 salt) external returns (address account) {
        // Check if already deployed
        bytes32 deployKey = keccak256(abi.encodePacked(owner, salt));
        account = accountOf[owner];
        if (account != address(0)) return account;

        // Deploy with CREATE2
        bytes memory bytecode = abi.encodePacked(
            type(BrainAccount).creationCode,
            abi.encode(entryPoint, owner, policyValidator)
        );

        assembly {
            account := create2(0, add(bytecode, 32), mload(bytecode), deployKey)
        }
        require(account != address(0), "Factory: CREATE2 failed");

        accountOf[owner] = account;
        allAccounts.push(account);

        emit AccountCreated(owner, account, salt);
    }

    // ─── Address Computation ──────────────────────────────────────────────────

    /**
     * @notice Compute the deterministic address of a BrainAccount before deployment.
     *         Use this to show the user their account address before deploying.
     *
     * @param owner  User's wallet address.
     * @param salt   Same salt used in createAccount.
     * @return       The pre-computed BrainAccount address.
     */
    function computeAddress(address owner, bytes32 salt) external view returns (address) {
        bytes32 deployKey = keccak256(abi.encodePacked(owner, salt));
        bytes memory bytecode = abi.encodePacked(
            type(BrainAccount).creationCode,
            abi.encode(entryPoint, owner, policyValidator)
        );
        bytes32 hash = keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            deployKey,
            keccak256(bytecode)
        ));
        return address(uint160(uint256(hash)));
    }

    /**
     * @notice Get the deployed BrainAccount for an owner.
     *         Returns address(0) if not yet deployed.
     */
    function getAccount(address owner) external view returns (address) {
        return accountOf[owner];
    }

    function totalAccounts() external view returns (uint256) {
        return allAccounts.length;
    }
}
