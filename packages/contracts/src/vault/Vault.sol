// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {Side} from "./Side.sol";
import {BondingBoard} from "./BondingBoard.sol";
import {Protocol} from "../Protocol.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {VaultDriver} from "../streaming/drivers/VaultDriver.sol";

contract Vault {
    using SafeERC20 for IERC20;

    enum Status {
        Open,
        Hot,
        Locked,
        Resolved,
        Disputed
    }

    enum Outcome {
        Pending,
        Yes,
        No
    }

    struct VaultData {
        bytes32 id;
        bytes32 marketId;
        string question;
        address creator;
        Status status;
        Outcome outcome;
        uint32 resolvedAt;
        bool exists;
    }

    struct Board {
        uint256 pool;
        uint256 sideRate;
        uint256 g;
        uint32 lastAdvance;
        uint256 sideShares;
    }

    struct Position {
        uint256 rate;
        uint256 gPaid;
        uint256 sharesAccrued;
        uint32 maxEnd;
        bool depleted;
        uint32 fundStart;
        uint256 lostUsdc;
    }

    Protocol public immutable protocol;
    IERC20 public immutable usdc;

    uint256 public vaultCount;
    mapping(bytes32 => VaultData) public vaults;
    mapping(bytes32 => mapping(Side => Board)) public boards;
    mapping(bytes32 => mapping(Side => mapping(uint256 => Position))) internal _positions;
    mapping(bytes32 => uint256) public yieldPot;

    mapping(uint256 => bytes32[]) internal _accountVaultIds;
    mapping(uint256 => mapping(bytes32 => bool)) internal _hasAccountVault;

    event VaultCreated(bytes32 indexed vaultId, bytes32 indexed marketId, address indexed creator, string question);
    event Funded(uint256 indexed account, bytes32 indexed vaultId, Side indexed side, uint256 rate, uint32 maxEnd);
    event Stopped(uint256 indexed account, bytes32 indexed vaultId, Side indexed side, uint256 sharesAccrued);
    event Withdrawn(uint256 indexed account, bytes32 indexed vaultId, address indexed to, uint256 payout);
    event Resolved(bytes32 indexed vaultId, Outcome outcome, uint32 resolvedAt);
    event YieldInjected(bytes32 indexed vaultId, address indexed sender, uint256 amount);

    constructor(Protocol protocol_, IERC20 usdc_) {
        require(address(protocol_) != address(0), "Vault: zero protocol");
        protocol = protocol_;
        usdc = usdc_;
    }

    modifier onlyFundingDriver() {
        require(
            msg.sender == protocol.marketDriver() || msg.sender == protocol.vaultDriver(),
            "Vault: not funding driver"
        );
        _;
    }

    function createVault(bytes32 marketId_, string calldata question, address creator) external returns (bytes32 vaultId) {
        vaultId = keccak256(abi.encodePacked(marketId_, question, creator, block.timestamp, vaultCount++));
        require(!vaults[vaultId].exists, "Vault: collision");

        vaults[vaultId] = VaultData({
            id: vaultId,
            marketId: marketId_,
            question: question,
            creator: creator,
            status: Status.Open,
            outcome: Outcome.Pending,
            resolvedAt: 0,
            exists: true
        });

        boards[vaultId][Side.Yes].lastAdvance = uint32(block.timestamp);
        boards[vaultId][Side.No].lastAdvance = uint32(block.timestamp);

        emit VaultCreated(vaultId, marketId_, creator, question);
    }

    function marketId(bytes32 vaultId) external view returns (bytes32) {
        require(vaults[vaultId].exists, "Vault: unknown vault");
        return vaults[vaultId].marketId;
    }

    function onFund(uint256 account, bytes32 vaultId, Side side, uint256 rate, uint32 maxEnd) external onlyFundingDriver {
        VaultData storage v = vaults[vaultId];
        require(v.exists, "Vault: unknown vault");
        require(v.status != Status.Resolved, "Vault: already resolved");

        _advance(vaultId, side);

        Board storage board = boards[vaultId][side];
        Position storage pos = _positions[vaultId][side][account];

        if (pos.rate > 0) {
            pos.sharesAccrued += pos.rate * (board.g - pos.gPaid);
            board.sideRate = board.sideRate - pos.rate + rate;
            if (block.timestamp > pos.fundStart) {
                pos.lostUsdc += pos.rate * (block.timestamp - pos.fundStart);
            }
        } else {
            board.sideRate += rate;
        }

        pos.rate = rate;
        pos.gPaid = board.g;
        pos.maxEnd = maxEnd;
        pos.depleted = false;
        pos.fundStart = uint32(block.timestamp);

        if (!_hasAccountVault[account][vaultId]) {
            _hasAccountVault[account][vaultId] = true;
            _accountVaultIds[account].push(vaultId);
        }

        emit Funded(account, vaultId, side, rate, maxEnd);
    }

    function onStop(uint256 account, bytes32 vaultId, Side side) external onlyFundingDriver {
        VaultData storage v = vaults[vaultId];
        require(v.exists, "Vault: unknown vault");

        _advance(vaultId, side);

        Board storage board = boards[vaultId][side];
        Position storage pos = _positions[vaultId][side][account];

        if (pos.rate > 0) {
            pos.sharesAccrued += pos.rate * (board.g - pos.gPaid);
            board.sideRate -= pos.rate;
            if (block.timestamp > pos.fundStart) {
                pos.lostUsdc += pos.rate * (block.timestamp - pos.fundStart);
            }
            pos.rate = 0;
        }
        pos.gPaid = board.g;

        emit Stopped(account, vaultId, side, pos.sharesAccrued);
    }

    function refreshMaxEnds(
        uint256 account,
        bytes32[] calldata vaultIds,
        Side[] calldata sides,
        uint32 maxEnd
    ) external onlyFundingDriver {
        uint256 len = vaultIds.length;
        require(len == sides.length, "Vault: length mismatch");
        for (uint256 i = 0; i < len; ++i) {
            Position storage pos = _positions[vaultIds[i]][sides[i]][account];
            if (pos.rate > 0) {
                pos.maxEnd = maxEnd;
            }
        }
    }

    function advance(bytes32 vaultId, Side side) external {
        require(vaults[vaultId].exists, "Vault: unknown vault");
        _advance(vaultId, side);
    }

    function resolve(bytes32 vaultId, Outcome outcome) external {
        VaultData storage v = vaults[vaultId];
        require(v.exists, "Vault: unknown vault");
        require(v.status != Status.Resolved, "Vault: already resolved");
        require(outcome == Outcome.Yes || outcome == Outcome.No, "Vault: invalid outcome");
        require(
            msg.sender == v.creator || msg.sender == protocol.owner() || msg.sender == protocol.vaultDriver(),
            "Vault: unauthorized"
        );

        _advance(vaultId, Side.Yes);
        _advance(vaultId, Side.No);

        v.status = Status.Resolved;
        v.outcome = outcome;
        v.resolvedAt = uint32(block.timestamp);

        emit Resolved(vaultId, outcome, v.resolvedAt);
    }

    function injectYield(bytes32 vaultId, uint256 amount) external {
        require(vaults[vaultId].exists, "Vault: unknown vault");
        require(amount > 0, "Vault: zero amount");
        yieldPot[vaultId] += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit YieldInjected(vaultId, msg.sender, amount);
    }

    function withdraw(uint256 account, bytes32 vaultId, address to) external returns (uint256 payout) {
        require(
            msg.sender == protocol.marketDriver() ||
            msg.sender == protocol.vaultDriver() ||
            msg.sender == protocol.owner(),
            "Vault: unauthorized"
        );
        require(to != address(0), "Vault: zero address");
        VaultData storage v = vaults[vaultId];
        require(v.exists, "Vault: unknown vault");
        require(v.status == Status.Resolved, "Vault: not resolved");

        Side winningSide = (v.outcome == Outcome.Yes) ? Side.Yes : Side.No;
        _advance(vaultId, winningSide);

        Board storage board = boards[vaultId][winningSide];
        Position storage pos = _positions[vaultId][winningSide][account];

        if (pos.rate > 0) {
            pos.sharesAccrued += pos.rate * (board.g - pos.gPaid);
            pos.rate = 0;
            pos.gPaid = board.g;
        }

        uint256 userShares = pos.sharesAccrued;
        require(userShares > 0, "Vault: no winning shares");

        address vd = protocol.vaultDriver();
        if (vd != address(0)) {
            try VaultDriver(vd).harvest(vaultId, Side.Yes) {} catch {}
            try VaultDriver(vd).harvest(vaultId, Side.No) {} catch {}
        }

        uint256 totalPot = boards[vaultId][Side.Yes].pool + boards[vaultId][Side.No].pool + yieldPot[vaultId];
        uint256 winningShares = board.sideShares;
        require(winningShares > 0, "Vault: zero winning shares");

        payout = (totalPot * userShares) / winningShares;

        pos.sharesAccrued = 0;

        uint256 bal = usdc.balanceOf(address(this));
        if (payout > bal) {
            payout = bal;
        }
        require(payout > 0, "Vault: zero payout");

        usdc.safeTransfer(to, payout);
        emit Withdrawn(account, vaultId, to, payout);
    }

    function getPosition(bytes32 vaultId, Side side, uint256 account)
        external
        view
        returns (
            uint256 rate,
            uint256 gPaid,
            uint256 sharesAccrued,
            uint32 maxEnd,
            bool depleted
        )
    {
        Position memory pos = _positions[vaultId][side][account];
        bool isDepleted = pos.depleted || (pos.rate > 0 && pos.maxEnd != 0 && uint256(pos.maxEnd) <= block.timestamp);
        return (pos.rate, pos.gPaid, pos.sharesAccrued, pos.maxEnd, isDepleted);
    }

    function getPositionStruct(bytes32 vaultId, Side side, uint256 account) external view returns (Position memory) {
        Position memory pos = _positions[vaultId][side][account];
        if (pos.rate > 0 && pos.maxEnd != 0 && uint256(pos.maxEnd) <= block.timestamp) {
            pos.depleted = true;
        }
        return pos;
    }

    function getBoard(bytes32 vaultId, Side side) external view returns (Board memory) {
        return boards[vaultId][side];
    }

    function getAccountVaultIds(uint256 account) external view returns (bytes32[] memory) {
        return _accountVaultIds[account];
    }

    function _advance(bytes32 vaultId, Side side) internal {
        Board storage board = boards[vaultId][side];
        VaultData storage v = vaults[vaultId];

        uint32 currentTime = uint32(block.timestamp);
        if (v.status == Status.Resolved && v.resolvedAt < currentTime) {
            currentTime = v.resolvedAt;
        }

        if (board.lastAdvance == 0) {
            board.lastAdvance = currentTime;
            return;
        }
        if (currentTime <= board.lastAdvance) {
            return;
        }

        uint256 dt = currentTime - board.lastAdvance;
        board.lastAdvance = currentTime;

        if (board.sideRate > 0 && dt > 0) {
            (uint256 newPool, uint256 dG) = BondingBoard.segMath(board.pool, board.sideRate, dt);
            board.pool = newPool;
            board.g += dG;
            board.sideShares += board.sideRate * dG;
        }
    }
}
