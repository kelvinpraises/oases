// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Protocol} from "../src/Protocol.sol";
import {Vault} from "../src/vault/Vault.sol";
import {Side} from "../src/vault/Side.sol";
import {DripsStreaming} from "../src/streaming/DripsStreaming.sol";
import {ManagedProxy} from "../src/streaming/Managed.sol";
import {VaultDriver, IMarketRegistry} from "../src/streaming/drivers/VaultDriver.sol";
import {AgentRegistry} from "../src/registries/AgentRegistry.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockMarketRegistry is IMarketRegistry {
    mapping(bytes32 => bool) public markets;
    mapping(bytes32 => bytes32[]) public marketVaults;

    function setMarket(bytes32 marketId, bool exists) external {
        markets[marketId] = exists;
    }

    function marketExists(bytes32 marketId) external view override returns (bool) {
        return markets[marketId];
    }

    function addVault(bytes32 marketId, bytes32 vaultId) external override {
        marketVaults[marketId].push(vaultId);
    }
}

contract VaultStreamingTest is Test {
    MockUSDC public usdc;
    DripsStreaming public drips;
    Protocol public protocol;
    Vault public vault;
    VaultDriver public vaultDriver;
    MockMarketRegistry public marketRegistry;
    AgentRegistry public agentRegistry;

    address public creator = address(0xAA11);
    address public funderB = address(0xAA22);
    address public yieldPayer = address(0xBB22);
    bytes32 public marketId = keccak256("market.eth.10k");

    function setUp() public {
        usdc = new MockUSDC();
        DripsStreaming dripsImpl = new DripsStreaming(10); // 10-second cycles
        ManagedProxy proxy = new ManagedProxy(dripsImpl, address(this), "");
        drips = DripsStreaming(address(proxy));

        protocol = new Protocol(address(this));
        vault = new Vault(protocol, IERC20(address(usdc)));
        marketRegistry = new MockMarketRegistry();
        marketRegistry.setMarket(marketId, true);
        agentRegistry = new AgentRegistry(address(this));
        agentRegistry.registerAgent(creator, "Authorized Test Agent");

        vaultDriver = new VaultDriver(protocol, address(drips), address(0), IERC20(address(usdc)));
        vaultDriver.bootstrapStreaming();

        protocol.setMarketRegistry(address(marketRegistry));
        protocol.setAgentRegistry(address(agentRegistry));
        protocol.setVault(address(vault));
        protocol.setDripsStreaming(address(drips));
        protocol.setVaultDriver(address(vaultDriver));
        protocol.setMarketDriver(address(this));

        // Fund test accounts
        usdc.mint(creator, 100_000e6);
        usdc.mint(funderB, 100_000e6);
        usdc.mint(yieldPayer, 100_000e6);

        vm.startPrank(creator);
        usdc.approve(address(vaultDriver), type(uint256).max);
        usdc.approve(address(drips), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(funderB);
        usdc.approve(address(vaultDriver), type(uint256).max);
        usdc.approve(address(drips), type(uint256).max);
        vm.stopPrank();

        vm.prank(yieldPayer);
        usdc.approve(address(vault), type(uint256).max);
    }

    function testCreateVaultAndSeed() public {
        vm.prank(creator);
        bytes32 vaultId = vaultDriver.createVault(
            marketId, "Will ETH break 10k?", "eyJzb2x2ZXIiOiJ0ZXN0In0=", Side.Yes, 1e6, 100e6
        );

        (
            bytes32 id,
            bytes32 mId,
            string memory q,
            string memory cfg,
            address c,
            Vault.Status status,
            Vault.Outcome outcome,
            ,
            bool exists
        ) = vault.vaults(vaultId);

        assertTrue(exists, "Vault should exist");
        assertEq(id, vaultId, "Vault id matches");
        assertEq(mId, marketId, "Market id matches");
        assertEq(q, "Will ETH break 10k?", "Question matches");
        assertEq(cfg, "eyJzb2x2ZXIiOiJ0ZXN0In0=", "Solver config matches");
        assertEq(c, creator, "Creator matches");
        assertEq(uint8(status), uint8(Vault.Status.Open), "Status is open");
        assertEq(uint8(outcome), uint8(Vault.Outcome.Pending), "Outcome is pending");

        (Side s, uint256 r, bool active) = vaultDriver.seeds(vaultId, creator);
        assertTrue(active, "Seed should be active");
        assertEq(uint8(s), uint8(Side.Yes), "Seed side is Yes");
        assertEq(r, 1e6, "Rate is 1 USDC/sec");
    }

    function testStreamingAdvancementAndResolution() public {
        vm.prank(creator);
        bytes32 vaultId = vaultDriver.createVault(
            marketId, "Will ETH break 10k?", "eyJzb2x2ZXIiOiJ0ZXN0In0=", Side.Yes, 1e6, 100e6
        );

        // Advance 50 seconds (5 complete 10-second cycles)
        vm.warp(block.timestamp + 50);

        // Harvest delivered funds to vault
        uint256 harvested = vaultDriver.harvest(vaultId, Side.Yes);
        assertGt(harvested, 0, "Delivered tokens should be harvested");

        // Inject 25 USDC external query yield
        vm.prank(yieldPayer);
        vault.injectYield(vaultId, 25e6);
        assertEq(vault.yieldPot(vaultId), 25e6, "Yield pot should reflect 25 USDC");

        // Stop the seed to refund remainder
        uint256 initialBal = usdc.balanceOf(creator);
        vm.prank(creator);
        uint256 refunded = vaultDriver.stopSeed(vaultId);
        assertGt(refunded, 0, "Unstreamed seed should be refunded");
        assertEq(usdc.balanceOf(creator), initialBal + refunded, "Refund transferred to creator");

        // Harvest any final delivered stream
        vaultDriver.harvest(vaultId, Side.Yes);

        // Resolve vault as YES
        vault.resolve(vaultId, Vault.Outcome.Yes);
        (,,,,, Vault.Status status, Vault.Outcome outcome,,) = vault.vaults(vaultId);
        assertEq(uint8(status), uint8(Vault.Status.Resolved), "Status is resolved");
        assertEq(uint8(outcome), uint8(Vault.Outcome.Yes), "Outcome is Yes");

        // Warp past the cycle boundary to finalize settlement
        vm.warp(block.timestamp + 10);

        // Creator claims payout
        uint256 preWithdraw = usdc.balanceOf(creator);
        vm.prank(creator);
        uint256 payout = vaultDriver.withdraw(vaultId);
        assertGt(payout, 0, "Payout must be positive");
        assertEq(usdc.balanceOf(creator), preWithdraw + payout, "Payout transferred to creator");

        // Subsequent withdrawal returns 0 cleanly (revert-free when already claimed)
        vm.prank(creator);
        uint256 secondPayout = vaultDriver.withdraw(vaultId);
        assertEq(secondPayout, 0, "Subsequent withdrawal must return 0");
    }

    /// @notice Requirement 1: Depletion boundary stops phantom accrual
    function testDepletionStopsAccrual() public {
        vm.prank(creator);
        bytes32 vaultId = vaultDriver.createVault(
            marketId, "Depletion Test", "eyJzb2x2ZXIiOiJ0ZXN0In0=", Side.Yes, 1e6, 50e6
        );

        // Advance time 200 seconds without intermediate pokes
        vm.warp(block.timestamp + 200);

        // Poke advance
        vault.advance(vaultId, Side.Yes);

        Vault.Board memory board = vault.getBoard(vaultId, Side.Yes);
        assertEq(board.pool, 50e6, "Pool must be capped at 50 USDC deposit");

        uint256 seedAcct = vaultDriver.seedAccount(creator, vaultId);
        (uint256 rate,, uint256 sharesAccrued,, bool depleted) =
            vault.getPosition(vaultId, Side.Yes, seedAcct);

        assertEq(rate, 0, "Rate must be 0 after depletion");
        assertTrue(depleted, "Position must be depleted");
        assertGt(sharesAccrued, 0, "Accrued shares must be positive");

        // Advancing another 100 seconds should not change pool or shares
        vm.warp(block.timestamp + 100);
        vault.advance(vaultId, Side.Yes);

        Vault.Board memory boardAfter = vault.getBoard(vaultId, Side.Yes);
        assertEq(boardAfter.pool, 50e6, "Pool must remain 50 USDC after further advance");
        (,, uint256 sharesAfter,,) = vault.getPosition(vaultId, Side.Yes, seedAcct);
        assertEq(sharesAfter, sharesAccrued, "No shares may accrue after depletion");
    }

    /// @notice Requirement 2: Mid-cycle resolution locks claims until cycle finalizes
    function testMidCycleResolutionPending() public {
        vm.prank(creator);
        bytes32 vaultId = vaultDriver.createVault(
            marketId, "MidCycle Test", "eyJzb2x2ZXIiOiJ0ZXN0In0=", Side.Yes, 1e6, 100e6
        );

        // Advance 25 seconds (mid-cycle: cycle length is 10s, so cycle 2 ends at 30s)
        vm.warp(block.timestamp + 25);

        // Resolve mid-cycle
        vault.resolve(vaultId, Vault.Outcome.Yes);

        // Immediate mid-cycle claim must revert with SettlementPending
        vm.prank(creator);
        vm.expectRevert();
        vaultDriver.withdraw(vaultId);

        // Stop seed so unstreamed remainder is refunded
        vm.prank(creator);
        vaultDriver.stopSeed(vaultId);

        // Warp past cycle boundary (to t = 40)
        vm.warp(block.timestamp + 20);

        // Harvest delivered tokens
        vaultDriver.harvest(vaultId, Side.Yes);

        // Claim succeeds with full payout, zero shortchange
        vm.prank(creator);
        uint256 payout = vaultDriver.withdraw(vaultId);
        assertGt(payout, 0, "Full payout received post-settlement");
    }

    /// @notice Requirement 3: Multi-winner pro-rata payout with frozen pot and zero dust loss
    function testMultiWinnerProRataPayout() public {
        bytes32 vaultId = vault.createVault(marketId, "MultiWinner Test", "eyJzb2x2ZXIiOiJ0ZXN0In0=", creator);
        marketRegistry.addVault(marketId, vaultId);

        uint256 acctA = 1001;
        uint256 acctB = 1002;

        uint32 maxEnd = uint32(block.timestamp + 100);

        // Funder A streams 2 USDC/sec, Funder B streams 1 USDC/sec
        vault.onFund(acctA, vaultId, Side.Yes, 2e6, maxEnd);
        vault.onFund(acctB, vaultId, Side.Yes, 1e6, maxEnd);

        // Advance 50 seconds
        vm.warp(block.timestamp + 50);

        // Stop both funders
        vault.onStop(acctA, vaultId, Side.Yes);
        vault.onStop(acctB, vaultId, Side.Yes);

        // Resolve vault as YES
        vault.resolve(vaultId, Vault.Outcome.Yes);

        // Warp past cycle
        vm.warp(block.timestamp + 20);

        // Fund vault with the pool amount to simulate token custody
        uint256 totalPot = vault.collect(vaultId);
        usdc.mint(address(vault), totalPot);

        // Sequential withdrawals
        uint256 payoutA = vault.withdraw(acctA, vaultId, creator);
        uint256 payoutB = vault.withdraw(acctB, vaultId, funderB);

        assertApproxEqRel(payoutA, payoutB * 2, 1e15, "Payout A must be 2x Payout B");
        assertApproxEqAbs(payoutA + payoutB, totalPot, 2, "Zero unclaimable dust");
    }

    /// @notice Requirement 4: Trailing delta step-cap continuation
    function testStepCapDepletionContinuation() public {
        bytes32 vaultId = vault.createVault(marketId, "StepCap Test", "eyJzb2x2ZXIiOiJ0ZXN0In0=", creator);
        marketRegistry.addVault(marketId, vaultId);

        uint32 matureAt = uint32(block.timestamp + 50);

        // Queue 70 distinct funder positions all maturing at t = 50
        for (uint256 i = 1; i <= 70; i++) {
            vault.onFund(i, vaultId, Side.Yes, 1e6, matureAt);
        }

        // Warp time past maturity to t = 100
        vm.warp(block.timestamp + 100);

        // First step-cap advance: capped at 64 steps
        vault.advance(vaultId, Side.Yes, 64);

        (uint256 total, uint256 head) = vault.getBoundaryQueue(vaultId, Side.Yes);
        assertEq(total, 70, "Total boundaries in queue is 70");
        assertEq(head, 64, "Head advanced to exactly 64");

        Vault.Board memory b1 = vault.getBoard(vaultId, Side.Yes);
        assertEq(b1.lastAdvance, matureAt, "lastAdvance must remain at 50, NOT 100!");

        // Second advance call: processes remaining 6 boundaries and cleanly steps to 100
        vault.advance(vaultId, Side.Yes, 64);

        (, uint256 headAfter) = vault.getBoundaryQueue(vaultId, Side.Yes);
        assertEq(headAfter, 70, "All 70 boundaries processed");

        Vault.Board memory b2 = vault.getBoard(vaultId, Side.Yes);
        assertEq(b2.lastAdvance, block.timestamp, "lastAdvance cleanly advances to 100");
        assertEq(b2.sideRate, 0, "All 70 positions depleted, sideRate is 0");
    }

    /// @notice Requirement 5: Uncontested market resolution prevents locked capital
    function testUncontestedMarketResolution() public {
        bytes32 vaultId = vault.createVault(marketId, "Uncontested Test", "eyJzb2x2ZXIiOiJ0ZXN0In0=", creator);
        marketRegistry.addVault(marketId, vaultId);

        uint256 noFunder = 999;
        uint32 maxEnd = uint32(block.timestamp + 100);

        // Fund ONLY Side.No with $1,000 USDC. Side.Yes has 0 funders.
        vault.onFund(noFunder, vaultId, Side.No, 10e6, maxEnd);

        vm.warp(block.timestamp + 50);
        vault.onStop(noFunder, vaultId, Side.No);

        // Resolve to YES (uncontested outcome with 0 Yes shares)
        vault.resolve(vaultId, Vault.Outcome.Yes);

        // Warp past cycle
        vm.warp(block.timestamp + 20);

        uint256 totalPot = vault.collect(vaultId);
        assertGt(totalPot, 0, "Pot has capital from No side");
        usdc.mint(address(vault), totalPot);

        // No funder withdraws: uncontested fallback refunds the No depositors pro-rata
        uint256 refunded = vault.withdraw(noFunder, vaultId, creator);
        assertEq(refunded, totalPot, "No funder receives 100% of the pot, zero trapped funds");
    }

    /// @notice Requirement 6: Revert-free zero payout and losing side overage drainage
    function testZeroPayoutAndDualOverageWithdraw() public {
        bytes32 vaultId = vault.createVault(marketId, "ZeroPayout Test", "eyJzb2x2ZXIiOiJ0ZXN0In0=", creator);
        marketRegistry.addVault(marketId, vaultId);

        uint256 nonParticipant = 404;
        uint256 funderYes = 111;
        uint256 funderNo = 222;

        // Funder YES streams 5 USDC/sec, Funder NO streams 5 USDC/sec
        vault.onFund(funderYes, vaultId, Side.Yes, 5e6, uint32(block.timestamp + 100));
        vault.onFund(funderNo, vaultId, Side.No, 5e6, uint32(block.timestamp + 100));

        // Advance to a time that aligns with Drips cycle boundary
        // CYCLE_SECS is 10
        uint32 currentTs = uint32(block.timestamp);
        uint32 nextCycle = ((currentTs + 10 - 1) / 10) * 10;
        vm.warp(nextCycle);

        // Resolve at exact cycle boundary
        vault.resolve(vaultId, Vault.Outcome.Yes);

        // Advance 5 seconds past resolution (both funders delivered overage)
        vm.warp(block.timestamp + 5);

        // Advance boards past cycle boundary so settlement is ready
        vm.warp(block.timestamp + 10);

        uint256 totalPot = vault.collect(vaultId);
        // Mint tokens to vault to cover pot and both overages (pot: 90e6, overages: 150e6)
        usdc.mint(address(vault), totalPot + 200e6);

        // 1. Non-participant withdraws: returns 0 cleanly without reverting
        uint256 payoutNonPart = vault.withdraw(nonParticipant, vaultId, creator);
        assertEq(payoutNonPart, 0, "Non-participant receives 0 cleanly");

        // 2. Funder NO (losing side) withdraws: has zero winning shares, but receives losing side overage!
        uint256 payoutNo = vault.withdraw(funderNo, vaultId, funderB);
        assertGt(payoutNo, 0, "Losing funder receives delivered overage cleanly");

        // 3. Funder YES (winning side) withdraws: receives winning pro-rata payout + winning overage
        uint256 payoutYes = vault.withdraw(funderYes, vaultId, creator);
        assertGt(payoutYes, 0, "Winning funder receives payout + overage");

        // 4. Idempotency checks: Repeated withdrawals return 0 cleanly without reverting
        uint256 repeatPayoutNo = vault.withdraw(funderNo, vaultId, funderB);
        assertEq(repeatPayoutNo, 0, "Repeated withdrawal for losing funder must return 0");

        uint256 repeatPayoutYes = vault.withdraw(funderYes, vaultId, creator);
        assertEq(repeatPayoutYes, 0, "Repeated withdrawal for winning funder must return 0");
    }

    /// @notice Requirement 7: pendingShares view parity right before and after _advance
    function testPendingSharesAndReadHelpers() public {
        bytes32 vaultId = vault.createVault(marketId, "PendingShares Test", "eyJzb2x2ZXIiOiJ0ZXN0In0=", creator);
        marketRegistry.addVault(marketId, vaultId);

        uint256 funder = 777;
        uint256 rate = 2e6; // 2 USDC/sec
        uint32 maxEnd = uint32(block.timestamp + 300);

        vault.onFund(funder, vaultId, Side.Yes, rate, maxEnd);

        // Advance 50 seconds into the stream
        vm.warp(block.timestamp + 50);

        // Gasless preview of pending shares before state-advancing
        uint256 pendingBefore = vault.pendingShares(vaultId, Side.Yes, funder);
        assertGt(pendingBefore, 0, "Pending shares must be positive");

        // Advance the board on-chain
        vault.advance(vaultId, Side.Yes);

        // Preview after advance must match pendingBefore exactly
        uint256 pendingAfter = vault.pendingShares(vaultId, Side.Yes, funder);
        assertEq(pendingBefore, pendingAfter, "pendingShares must be identical right before and after _advance");

        // Verify getSharePrice increases monotonically
        uint256 priceYes = vault.getSharePrice(vaultId, Side.Yes);
        assertGt(priceYes, 100_000, "Share price must increase above base price");

        // Verify getVaultPools
        (uint256 yesPool, uint256 noPool, uint256 yesShares, uint256 noShares) = vault.getVaultPools(vaultId);
        assertEq(yesPool, 50 * rate, "Yes pool matches deposited amount");
        assertEq(noPool, 0, "No pool remains 0");
        assertEq(yesShares, pendingAfter, "getVaultPools returns WAD-scaled integer shares");
        assertEq(noShares, 0, "No shares are 0");
    }

    /// @notice Flow 1.5: Declarative solver config storage, retrieval, and non-empty enforcement
    function testSolverConfigStorageAndRetrieval() public {
        string memory manifest = "eyJtb2RlbCI6ICJvYXNlcy1zb2x2ZXItdjEiLCAicGFyYW1zIjogInt9In0=";

        vm.prank(creator);
        bytes32 vaultId = vaultDriver.createVault(
            marketId, "Solver Config Test", manifest, Side.Yes, 1e6, 100e6
        );

        assertEq(vault.solverConfig(vaultId), manifest, "solverConfig getter matches manifest");

        bytes32[] memory mChildren = vault.getMarketVaults(marketId);
        bool found = false;
        for (uint256 i = 0; i < mChildren.length; i++) {
            if (mChildren[i] == vaultId) {
                found = true;
                break;
            }
        }
        assertTrue(found, "Market vault list contains created vault");

        // Mandatory non-empty check on Vault.createVault
        vm.expectRevert("Vault: empty solver config");
        vault.createVault(marketId, "Empty Solver Test", "", creator);

        // Mandatory non-empty check on VaultDriver.createVault
        vm.prank(creator);
        vm.expectRevert("VaultDriver: empty solver config");
        vaultDriver.createVault(marketId, "Empty Solver Driver Test", "", Side.Yes, 1e6, 100e6);
    }

    /// @notice Flow 1.5: Root-to-branch multi-vault tension cast yield distribution & dust solvency
    function testInjectMarketYieldMultiVaultDistribution() public {
        string memory manifestA = "eyJzb2x2ZXIiOiJ2YXVsdEEifQ==";
        string memory manifestB = "eyJzb2x2ZXIiOiJ2YXVsdEIifQ==";

        bytes32 marketDirectId = keccak256("DirectiveMarket");
        marketRegistry.setMarket(marketDirectId, true);

        // Create two child vaults under marketDirectId
        bytes32 vaultA = vault.createVault(marketDirectId, "Directive Vault A", manifestA, creator);
        bytes32 vaultB = vault.createVault(marketDirectId, "Directive Vault B", manifestB, creator);
        marketRegistry.addVault(marketDirectId, vaultA);
        marketRegistry.addVault(marketDirectId, vaultB);

        bytes32[] memory directVaults = vault.getMarketVaults(marketDirectId);
        assertEq(directVaults.length, 2, "Directive market has 2 child vaults");

        // Fund Funder on Vault A Side.Yes
        uint256 funderA = 555;
        vault.onFund(funderA, vaultA, Side.Yes, 2e6, uint32(block.timestamp + 100));

        // Inject 50 USDC across marketDirectId
        vm.prank(yieldPayer);
        vault.injectMarketYield(marketDirectId, 50e6);

        // Both active child vaults receive exactly 25 USDC
        assertEq(vault.yieldPot(vaultA), 25e6, "Vault A receives 25 USDC");
        assertEq(vault.yieldPot(vaultB), 25e6, "Vault B receives 25 USDC");

        // Advance and resolve Vault A as YES
        vm.warp(block.timestamp + 50);
        vault.onStop(funderA, vaultA, Side.Yes);
        vault.resolve(vaultA, Vault.Outcome.Yes);

        // Inject another 30 USDC across marketDirectId: Vault A is resolved, so ONLY Vault B receives it
        vm.prank(yieldPayer);
        vault.injectMarketYield(marketDirectId, 30e6);

        assertEq(vault.yieldPot(vaultA), 25e6, "Resolved Vault A remains at 25 USDC");
        assertEq(vault.yieldPot(vaultB), 55e6, "Active Vault B receives full 30 USDC, total 55 USDC");

        // Test odd amount dust solvency: inject 25_000_001 wei across single active Vault B
        vm.prank(yieldPayer);
        vault.injectMarketYield(marketDirectId, 25_000_001);
        assertEq(vault.yieldPot(vaultB), 55e6 + 25_000_001, "Vault B receives all injected wei");

        // Warp past cycle boundary and collect pot for Vault A
        vm.warp(block.timestamp + 20);
        uint256 totalPotA = vault.collect(vaultA);
        // Delivered funds: 50s * 2e6 = 100e6. Plus 25e6 yield pot = 125e6
        assertEq(totalPotA, 125e6, "Total pot includes 100 USDC stream + 25 USDC injected yield");
        usdc.mint(address(vault), totalPotA);

        // Funder withdraws from Vault A: payout includes yield share!
        uint256 payoutA = vault.withdraw(funderA, vaultA, creator);
        assertEq(payoutA, 125e6, "Payout A captures 100% of winning pot including market yield");
    }

    function testCreateVaultUnauthorizedAgentReverts() public {
        address unauthorized = address(0xDEAD);
        usdc.mint(unauthorized, 100_000e6);

        vm.startPrank(unauthorized);
        usdc.approve(address(vaultDriver), type(uint256).max);
        usdc.approve(address(drips), type(uint256).max);

        vm.expectRevert("VaultDriver: not authorized agent");
        vaultDriver.createVault(
            marketId,
            "Unauthorized question?",
            "{\"solver\":\"unauthorized\"}",
            Side.Yes,
            1e6,
            100e6
        );
        vm.stopPrank();
    }
}


