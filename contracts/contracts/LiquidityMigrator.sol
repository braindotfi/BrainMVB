// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAerodromeRouter {
    function addLiquidityETH(
        address token,
        bool stable,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);

    function addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
}

interface IAerodromeFactory {
    function getPool(address tokenA, address tokenB, bool stable) external view returns (address);
    function createPool(address tokenA, address tokenB, bool stable) external returns (address pool);
}

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title LiquidityMigrator
 * @notice Migrates bonding curve liquidity to Aerodrome Finance on Base.
 *         Creates a volatile (non-stable) AgentToken/WETH pool.
 *         LP tokens are burned to address(0) — permanently locking liquidity.
 *         This is the anti-rug mechanic: no one can drain the pool post-graduation.
 *
 * Aerodrome Base Mainnet:
 *   Router:  0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
 *   Factory: 0x420DD381b31aEf6683db6B902084cB0FFECe40Da
 *   WETH:    0x4200000000000000000000000000000000000006
 */
contract LiquidityMigrator {
    IAerodromeRouter public immutable aerodromeRouter;
    IAerodromeFactory public immutable aerodromeFactory;
    IWETH public immutable WETH;

    event LiquidityMigrated(
        address indexed agentToken,
        address indexed pool,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 lpBurned
    );

    constructor(address router_, address factory_, address weth_) {
        aerodromeRouter = IAerodromeRouter(router_);
        aerodromeFactory = IAerodromeFactory(factory_);
        WETH = IWETH(weth_);
    }

    /**
     * @notice Migrate ETH + agent tokens to Aerodrome as locked liquidity.
     *         LP tokens are immediately burned to address(0).
     * @param agentToken    The AgentToken ERC-20 contract address.
     * @param tokenAmount   Amount of agent tokens to add as liquidity.
     * @return pool         The Aerodrome pool address.
     */
    function migrate(
        address agentToken,
        uint256 tokenAmount
    ) external payable returns (address pool) {
        require(msg.value > 0, "LiquidityMigrator: no ETH provided");

        // Wrap ETH → WETH
        WETH.deposit{value: msg.value}();

        // Approve router to spend WETH + agent tokens
        WETH.approve(address(aerodromeRouter), msg.value);
        IERC20(agentToken).approve(address(aerodromeRouter), tokenAmount);

        // Create pool if not exists
        pool = aerodromeFactory.getPool(agentToken, address(WETH), false);
        if (pool == address(0)) {
            pool = aerodromeFactory.createPool(agentToken, address(WETH), false);
        }

        // Add liquidity — volatile pool (stable=false)
        (,, uint256 lpAmount) = aerodromeRouter.addLiquidity(
            agentToken,
            address(WETH),
            false,                          // volatile pool
            tokenAmount,
            msg.value,
            (tokenAmount * 95) / 100,       // 5% slippage tolerance
            (msg.value * 95) / 100,
            address(this),                  // LP tokens to this contract
            block.timestamp + 600           // 10 min deadline
        );

        // Burn LP tokens — lock liquidity permanently
        IERC20(pool).transfer(address(0), lpAmount);

        emit LiquidityMigrated(agentToken, pool, msg.value, tokenAmount, lpAmount);
    }

    receive() external payable {}
}
