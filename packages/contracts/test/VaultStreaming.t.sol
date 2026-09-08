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
        usdc.mint(creator, 10_000e6);
        usdc.mint(yieldPayer, 10_000e6);

        vm.startPrank(creator);
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

        // Creator claims payout
        uint256 preWithdraw = usdc.balanceOf(creator);
        vm.prank(creator);
        uint256 payout = vaultDriver.withdraw(vaultId);
        assertGt(payout, 0, "Payout must be positive");
        assertEq(usdc.balanceOf(creator), preWithdraw + payout, "Payout transferred to creator");

        // Subsequent withdrawal should fail (already claimed)
        vm.prank(creator);
        vm.expectRevert("Vault: no winning shares");
        vaultDriver.withdraw(vaultId);
    }
}
