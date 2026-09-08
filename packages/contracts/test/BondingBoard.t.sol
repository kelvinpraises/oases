// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BondingBoard} from "../src/vault/BondingBoard.sol";

contract BondingBoardTest is Test {
    function testPriceMonotonicity() public pure {
        uint256 p0 = BondingBoard.price(0);
        uint256 p1 = BondingBoard.price(1_000e6);
        uint256 p2 = BondingBoard.price(10_000e6);
        uint256 p3 = BondingBoard.price(100_000e6);

        assertGt(p1, p0, "Price should strictly increase with pool size");
        assertGt(p2, p1, "Price should strictly increase with pool size");
        assertGt(p3, p2, "Price should strictly increase with pool size");
    }

    function testZeroRateOrTime() public pure {
        (uint256 newPool1, uint256 dG1) = BondingBoard.segMath(1_000e6, 0, 100);
        assertEq(newPool1, 1_000e6, "Pool should not change with zero rate");
        assertEq(dG1, 0, "dG should be 0 with zero rate");

        (uint256 newPool2, uint256 dG2) = BondingBoard.segMath(1_000e6, 10e6, 0);
        assertEq(newPool2, 1_000e6, "Pool should not change with zero dt");
        assertEq(dG2, 0, "dG should be 0 with zero dt");
    }

    function testPoolGrowth() public pure {
        uint256 initialPool = 5_000e6;
        uint256 rate = 50e6; // 50 USDC/sec
        uint256 dt = 120; // 2 minutes

        (uint256 newPool, uint256 dG) = BondingBoard.segMath(initialPool, rate, dt);
        assertEq(newPool, initialPool + rate * dt, "Pool must equal pool + rate * dt");
        assertGt(dG, 0, "dG must be strictly positive");
    }

    function testTelescopingLinearity() public pure {
        uint256 pool0 = 10_000e6;
        uint256 rate = 25e6;
        uint256 dt1 = 600;
        uint256 dt2 = 1200;

        (uint256 pool1, uint256 dg1) = BondingBoard.segMath(pool0, rate, dt1);
        (uint256 pool2, uint256 dg2) = BondingBoard.segMath(pool1, rate, dt2);
        (uint256 poolCombined, uint256 dgCombined) = BondingBoard.segMath(pool0, rate, dt1 + dt2);

        assertEq(pool2, poolCombined, "Final pool must be identical");
        // Relative error below 1e14 (0.00001%) accounts for 1-wei lnWad integer precision scaling
        assertApproxEqRel(dg1 + dg2, dgCombined, 1e14, "Telescoping dG must match single segment");
    }

    function testFuzzTelescopingLinearity(
        uint256 pool0,
        uint256 rate,
        uint32 dt1,
        uint32 dt2
    ) public pure {
        pool0 = bound(pool0, 0, 10_000_000e6);
        rate = bound(rate, 1e6, 1_000e6);
        dt1 = uint32(bound(dt1, 1, 30 days));
        dt2 = uint32(bound(dt2, 1, 30 days));

        (uint256 pool1, uint256 dg1) = BondingBoard.segMath(pool0, rate, dt1);
        (uint256 pool2, uint256 dg2) = BondingBoard.segMath(pool1, rate, dt2);
        (uint256 poolCombined, uint256 dgCombined) = BondingBoard.segMath(pool0, rate, uint256(dt1) + uint256(dt2));

        assertEq(pool2, poolCombined, "Pool growth must telescope exactly");
        assertApproxEqRel(dg1 + dg2, dgCombined, 1e14, "dG sum must telescope within relative tolerance");
    }
}
