// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./AgentToken.sol";

interface ILiquidityMigrator {
    function migrate(address agentToken, uint256 tokenAmount) external payable returns (address pool);
}

/**
 * @title BondingCurve
 * @notice Quadratic bonding curve for Brain Finance agent token launchpad.
 *
 *   Price formula:  P(s) = k * s^2
 *   where s = current supply sold, k = CURVE_CONSTANT_K
 *
 *   Buy price (integral): cost = k * (b^3 - a^3) / 3   (a = current supply, b = supply after buy)
 *   Graduation threshold: ~$69,000 in ETH raised on Base
 *
 *   On graduation:
 *     1. All raised ETH + corresponding tokens migrated to Aerodrome volatile pool
 *     2. LP tokens burned at address(0) — liquidity permanently locked
 */
contract BondingCurve {
    using Math for uint256;

    AgentToken public immutable agentToken;
    ILiquidityMigrator public immutable migrator;

    uint256 public constant GRADUATION_THRESHOLD = 69_000 ether;    // ~$69k in ETH
    uint256 public constant CURVE_CONSTANT_K = 1e9;                   // steepness
    uint256 public constant PLATFORM_FEE_BPS = 100;                   // 1% fee

    uint256 public totalBaseRaised;
    bool public graduated;
    address public feeCollector;

    mapping(address => uint256) public contributions;

    event TokensPurchased(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 newPrice);
    event TokensSold(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 newPrice);
    event CurveGraduated(address indexed pool, uint256 liquidityEth, uint256 liquidityTokens);

    constructor(
        address agentToken_,
        address migrator_,
        address feeCollector_
    ) {
        agentToken = AgentToken(agentToken_);
        migrator = ILiquidityMigrator(migrator_);
        feeCollector = feeCollector_;
    }

    /**
     * @notice Get the ETH cost to buy `tokenAmount` tokens given current supply.
     */
    function getBuyPrice(uint256 tokenAmount) public view returns (uint256 ethRequired) {
        uint256 supply = agentToken.totalSupply();
        uint256 a = supply;
        uint256 b = supply + tokenAmount;
        // integral of k*s^2 from a to b = k*(b^3 - a^3)/3 / 1e36
        ethRequired = CURVE_CONSTANT_K * ((b * b * b) - (a * a * a)) / (3 * 1e36);
    }

    /**
     * @notice Get the ETH returned from selling `tokenAmount` tokens.
     */
    function getSellReturn(uint256 tokenAmount) public view returns (uint256 ethReturned) {
        uint256 supply = agentToken.totalSupply();
        require(tokenAmount <= supply, "BondingCurve: exceeds supply");
        uint256 a = supply - tokenAmount;
        uint256 b = supply;
        ethReturned = CURVE_CONSTANT_K * ((b * b * b) - (a * a * a)) / (3 * 1e36);
    }

    /**
     * @notice Current spot price in ETH per token.
     */
    function currentPrice() public view returns (uint256) {
        uint256 supply = agentToken.totalSupply();
        return CURVE_CONSTANT_K * supply * supply / (1e36);
    }

    /**
     * @notice Buy tokens. Sends ETH, receives agent tokens.
     * @param minTokensOut  Minimum tokens expected (slippage protection).
     */
    function buy(uint256 minTokensOut) external payable {
        require(!graduated, "BondingCurve: graduated — trade on Aerodrome");
        require(msg.value > 0, "BondingCurve: no ETH sent");

        uint256 fee = (msg.value * PLATFORM_FEE_BPS) / 10_000;
        uint256 netEth = msg.value - fee;

        uint256 tokensOut = _calcTokensForEth(netEth);
        require(tokensOut >= minTokensOut, "BondingCurve: slippage exceeded");
        require(tokensOut > 0, "BondingCurve: zero tokens");

        // Transfer platform fee
        (bool feeOk,) = feeCollector.call{value: fee}("");
        require(feeOk, "BondingCurve: fee transfer failed");

        contributions[msg.sender] += netEth;
        totalBaseRaised += netEth;

        agentToken.mint(msg.sender, tokensOut);
        emit TokensPurchased(msg.sender, msg.value, tokensOut, currentPrice());

        // Auto-graduate when threshold reached
        if (totalBaseRaised >= GRADUATION_THRESHOLD) {
            _graduate();
        }
    }

    /**
     * @notice Sell tokens back to the curve for ETH.
     * @param tokenAmount  Number of tokens to sell.
     * @param minEthOut    Minimum ETH expected (slippage protection).
     */
    function sell(uint256 tokenAmount, uint256 minEthOut) external {
        require(!graduated, "BondingCurve: graduated — trade on Aerodrome");
        require(tokenAmount > 0, "BondingCurve: zero tokens");

        uint256 ethOut = getSellReturn(tokenAmount);
        uint256 fee = (ethOut * PLATFORM_FEE_BPS) / 10_000;
        uint256 netEth = ethOut - fee;
        require(netEth >= minEthOut, "BondingCurve: slippage exceeded");

        agentToken.transferFrom(msg.sender, address(this), tokenAmount);
        agentToken.burn(tokenAmount);
        totalBaseRaised -= ethOut;

        (bool feeOk,) = feeCollector.call{value: fee}("");
        require(feeOk, "BondingCurve: fee transfer failed");
        (bool payOk,) = msg.sender.call{value: netEth}("");
        require(payOk, "BondingCurve: ETH transfer failed");

        emit TokensSold(msg.sender, tokenAmount, netEth, currentPrice());
    }

    /**
     * @notice Migrate all liquidity to Aerodrome upon graduation.
     */
    function _graduate() internal {
        graduated = true;
        uint256 ethForLiquidity = address(this).balance;
        uint256 tokensForLiquidity = agentToken.balanceOf(address(this));

        if (tokensForLiquidity > 0) {
            agentToken.approve(address(migrator), tokensForLiquidity);
        }

        address pool = migrator.migrate{value: ethForLiquidity}(
            address(agentToken),
            tokensForLiquidity
        );

        // Transfer token ownership to trigger graduate()
        agentToken.graduate(pool, ethForLiquidity);

        emit CurveGraduated(pool, ethForLiquidity, tokensForLiquidity);
    }

    /**
     * @notice Calculate tokens received for a given ETH amount.
     *         Inverse of buy price integral — solved via cube root.
     *         tokens = cbrt(3 * eth / k * 1e36 + supply^3) - supply
     */
    function _calcTokensForEth(uint256 ethAmount) internal view returns (uint256) {
        uint256 supply = agentToken.totalSupply();
        uint256 s3 = supply * supply * supply;
        uint256 newS3 = s3 + (3 * ethAmount * 1e36) / CURVE_CONSTANT_K;
        return _cbrt(newS3) - supply;
    }

    function _cbrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = x;
        uint256 y = x / 3 + 1;
        while (y < z) {
            z = y;
            y = (2 * y + x / (y * y)) / 3;
        }
        return z;
    }

    receive() external payable {}
}
