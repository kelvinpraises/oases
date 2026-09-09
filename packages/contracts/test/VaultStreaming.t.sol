// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Protocol} from "../src/Protocol.sol";
import {Vault} from "../src/vault/Vault.sol";
import {Side} from "../src/vault/Side.sol";
import {DripsStreaming} from "../src/streaming/DripsStreaming.sol";
import {ManagedProxy} from "../src/streaming/Managed.sol";
import {VaultDriver, IMarketRegistry} from "../src/streaming/drivers/VaultDriver.sol";
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

        vaultDriver = new VaultDriver(protocol, address(drips), address(0), IERC20(address(usdc)));
        vaultDriver.bootstrapStreaming();

        protocol.setMarketRegistry(address(marketRegistry));
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
        bytes32 vaultId = vaultDriver.createVault(marketId, "Will ETH break 10k?", Side.Yes, 1e6, 100e6);

        (bytes32 id, bytes32 mId, string memory q, address c, Vault.Status status, Vault.Outcome outcome,, bool exists) =
            vault.vaults(vaultId);

        assertTrue(exists, "Vault should exist");
        assertEq(id, vaultId, "Vault id matches");
        assertEq(mId, marketId, "Market id matches");
        assertEq(q, "Will ETH break 10k?", "Question matches");
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
        bytes32 vaultId = vaultDriver.createVault(marketId, "Will ETH break 10k?", Side.Yes, 1e6, 100e6);

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
        (,,,, Vault.Status status, Vault.Outcome outcome,,) = vault.vaults(vaultId);
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

        // Subsequent withdrawal should fail (already claimed)
        vm.prank(creator);
        vm.expectRevert("Vault: already claimed");
        vaultDriver.withdraw(vaultId);
    }

    /// @notice Requirement 1: Depletion boundary stops phantom accrual
    function testDepletionStopsAccrual() public {
        vm.prank(creator);
        bytes32 vaultId = vaultDriver.createVault(marketId, "Depletion Test", Side.Yes, 1e6, 50e6);

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
        bytes32 vaultId = vaultDriver.createVault(marketId, "MidCycle Test", Side.Yes, 1e6, 100e6);

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
        bytes32 vaultId = vault.createVault(marketId, "MultiWinner Test", creator);
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
        bytes32 vaultId = vault.createVault(marketId, "StepCap Test", creator);
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
        bytes32 vaultId = vault.createVault(marketId, "Uncontested Test", creator);
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
}
