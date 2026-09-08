// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

library BondingBoard {
    uint256 internal constant BASE_PRICE = 100_000;   // 1e5
    uint256 internal constant CURVE_K = 10_000e6;     // 1e10 (10,000 USDC with 6 decimals)
    uint256 internal constant SHARE_SCALE = 1e6;      // 1e6
    uint256 internal constant WAD = 1e18;

    function price(uint256 pool) internal pure returns (uint256) {
        return BASE_PRICE + (BASE_PRICE * pool) / CURVE_K;
    }

    function segMath(
        uint256 pool,
        uint256 sideRate,
        uint256 dt
    ) internal pure returns (uint256 newPool, uint256 dG) {
        uint256 p0 = price(pool);
        newPool = pool + sideRate * dt;
        uint256 p1 = price(newPool);
        if (p1 <= p0) return (newPool, 0);
        uint256 ratioWad = (p1 * WAD) / p0;
        int256 lnv = FixedPointMathLib.lnWad(int256(ratioWad));
        dG = (SHARE_SCALE * CURVE_K * uint256(lnv)) / (BASE_PRICE * sideRate);
    }
}
