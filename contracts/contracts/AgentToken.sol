// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentToken
 * @notice ERC-20 token representing a tokenized AI agent on the Brain Finance Launchpad.
 *         Supply is minted via the bonding curve until graduation.
 *         On graduation, remaining supply is minted to the Aerodrome liquidity pool.
 *         LP tokens are burned — liquidity is permanently locked (anti-rug).
 */
contract AgentToken is ERC20, ERC20Burnable, Ownable {
    bytes32 public agentId;
    string public agentMetadataURI;
    bool public graduated;
    address public bondingCurve;

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;        // 1 billion tokens
    uint256 public constant GRADUATION_SUPPLY = 800_000_000 * 1e18;   // 800M sold via curve

    event Graduated(address indexed liquidityPool, uint256 liquidityLocked);
    event BondingCurveSet(address indexed bondingCurve);

    modifier onlyBondingCurve() {
        require(msg.sender == bondingCurve, "AgentToken: only bonding curve");
        _;
    }

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

    /**
     * @notice Set the bonding curve address (called by LaunchpadFactory after deployment).
     */
    function setBondingCurve(address bondingCurve_) external onlyOwner {
        require(bondingCurve == address(0), "AgentToken: bonding curve already set");
        bondingCurve = bondingCurve_;
        emit BondingCurveSet(bondingCurve_);
    }

    /**
     * @notice Mint tokens — only callable by the bonding curve.
     */
    function mint(address to, uint256 amount) external onlyBondingCurve {
        require(!graduated, "AgentToken: already graduated");
        require(totalSupply() + amount <= GRADUATION_SUPPLY, "AgentToken: exceeds graduation supply");
        _mint(to, amount);
    }

    /**
     * @notice Graduate the token to Aerodrome DEX.
     *         Mints the remaining 20% to the liquidity pool (permanently locked).
     *         Called by the bonding curve upon reaching graduation threshold.
     */
    function graduate(address liquidityPool, uint256 liquidityAmount) external onlyOwner {
        require(!graduated, "AgentToken: already graduated");
        graduated = true;
        uint256 remaining = MAX_SUPPLY - totalSupply();
        if (remaining > 0) {
            _mint(liquidityPool, remaining);
        }
        emit Graduated(liquidityPool, liquidityAmount);
    }
}
