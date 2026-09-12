// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {Side} from "./Side.sol";
import {BondingBoard} from "./BondingBoard.sol";
import {Protocol} from "../Protocol.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {VaultDriver} from "../streaming/drivers/VaultDriver.sol";

interface IDripsCycle {
    function CYCLE_SECS() external view returns (uint32);
}

contract Vault {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant MAX_SCHEDULE_SHIFTS = 32;

    error SettlementPending(uint256 readyAt);

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
        string solverConfig;
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

    struct Boundary {
        uint32 maxEnd;
        uint256 account;
    }

    Protocol public immutable protocol;
    IERC20 public immutable usdc;

    uint256 public vaultCount;
    mapping(bytes32 => VaultData) public vaults;
    mapping(bytes32 => mapping(Side => Board)) public boards;
    mapping(bytes32 => mapping(Side => mapping(uint256 => Position))) internal _positions;
    mapping(bytes32 => uint256) public yieldPot;
    mapping(bytes32 => bytes32[]) internal _marketVaults;

    // Depletion boundary queue per (vaultId, side)
    mapping(bytes32 => mapping(Side => Boundary[])) internal _boundaries;
    mapping(bytes32 => mapping(Side => uint256)) internal _boundaryHead;

    // Settlement and Immutable Pot Freezing
    mapping(bytes32 => uint256) public pot;
    mapping(bytes32 => bool) public collected;
    mapping(bytes32 => mapping(Side => mapping(uint256 => bool))) public claimed;

    // Post-resolution overage owed
    mapping(bytes32 => mapping(Side => mapping(uint256 => uint256))) public overageOwed;

    mapping(uint256 => bytes32[]) internal _accountVaultIds;
    mapping(uint256 => mapping(bytes32 => bool)) internal _hasAccountVault;

    event VaultCreated(
        bytes32 indexed vaultId,
        bytes32 indexed marketId,
        address indexed creator,
        string question,
        string solverConfig
    );
    event Funded(uint256 indexed account, bytes32 indexed vaultId, Side indexed side, uint256 rate, uint32 maxEnd);
    event Stopped(uint256 indexed account, bytes32 indexed vaultId, Side indexed side, uint256 sharesAccrued);
    event Withdrawn(uint256 indexed account, bytes32 indexed vaultId, address indexed to, uint256 payout);
    event Resolved(bytes32 indexed vaultId, Outcome outcome, uint32 resolvedAt);
    event YieldInjected(bytes32 indexed vaultId, address indexed sender, uint256 amount);
    event MarketYieldInjected(
        bytes32 indexed marketId,
        address indexed sender,
        uint256 totalAmount,
        uint256 activeVaultCount,
        uint256 perVaultAmount
    );
    event Depleted(uint256 indexed account, bytes32 indexed vaultId, Side indexed side, uint32 maxEnd);
    event UncontestedFallback(bytes32 indexed vaultId, Side indexed winningSide, Side indexed fallbackSide);

    constructor(Protocol protocol_, IERC20 usdc_) {
        require(address(protocol_) != address(0), "Vault: zero protocol");
        protocol = protocol_;
        usdc = usdc_;
    }

    modifier onlyFundingDriver() {
        _onlyFundingDriver();
        _;
    }

    function _onlyFundingDriver() internal view {
        require(
            msg.sender == protocol.marketDriver() || msg.sender == protocol.vaultDriver(),
            "Vault: not funding driver"
        );
    }

    function createVault(
        bytes32 marketId_,
        string calldata question,
        string calldata solverConfig_,
        address creator
    ) external returns (bytes32 vaultId) {
        require(msg.sender == protocol.vaultDriver(), "Vault: not vault driver");
        require(creator != address(0), "Vault: zero creator");
        require(bytes(question).length > 0, "Vault: empty question");
        require(bytes(solverConfig_).length > 0, "Vault: empty solver config");

        vaultId = keccak256(
            abi.encodePacked(marketId_, question, solverConfig_, creator, block.timestamp, vaultCount++)
        );
        require(!vaults[vaultId].exists, "Vault: collision");

        vaults[vaultId] = VaultData({
            id: vaultId,
            marketId: marketId_,
            question: question,
            solverConfig: solverConfig_,
            creator: creator,
            status: Status.Open,
            outcome: Outcome.Pending,
            resolvedAt: 0,
            exists: true
        });

        boards[vaultId][Side.Yes].lastAdvance = uint32(block.timestamp);
        boards[vaultId][Side.No].lastAdvance = uint32(block.timestamp);

        _marketVaults[marketId_].push(vaultId);

        emit VaultCreated(vaultId, marketId_, creator, question, solverConfig_);
    }

    function marketId(bytes32 vaultId) external view returns (bytes32) {
        require(vaults[vaultId].exists, "Vault: unknown vault");
        return vaults[vaultId].marketId;
    }

    function solverConfig(bytes32 vaultId) external view returns (string memory) {
        require(vaults[vaultId].exists, "Vault: unknown vault");
        return vaults[vaultId].solverConfig;
    }

    function getMarketVaults(bytes32 marketId_) external view returns (bytes32[] memory) {
        return _marketVaults[marketId_];
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

        _scheduleBoundary(vaultId, side, maxEnd, account);

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

            // Record overage if stopped post-resolution
            if (v.resolvedAt != 0 && block.timestamp > v.resolvedAt) {
                uint256 overEnd = (pos.maxEnd != 0 && pos.maxEnd < block.timestamp) ? uint256(pos.maxEnd) : block.timestamp;
                if (overEnd > v.resolvedAt) {
                    uint256 over = pos.rate * (overEnd - uint256(v.resolvedAt));
                    overageOwed[vaultId][side][account] += over;
                }
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
                _scheduleBoundary(vaultIds[i], sides[i], maxEnd, account);
            }
        }
    }

    function advance(bytes32 vaultId, Side side) external {
        require(vaults[vaultId].exists, "Vault: unknown vault");
        _advance(vaultId, side, 64);
    }

    function advance(bytes32 vaultId, Side side, uint256 maxSteps) external {
        require(vaults[vaultId].exists, "Vault: unknown vault");
        _advance(vaultId, side, maxSteps);
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

    function injectMarketYield(bytes32 marketId_, uint256 amount) external {
        require(amount > 0, "Vault: zero amount");
        bytes32[] storage childVaults = _marketVaults[marketId_];
        uint256 totalChildren = childVaults.length;
        require(totalChildren > 0, "Vault: no child vaults");

        // Count active, unresolved child vaults
        uint256 activeCount = 0;
        for (uint256 i = 0; i < totalChildren; i++) {
            if (vaults[childVaults[i]].status != Status.Resolved) {
                activeCount++;
            }
        }
        require(activeCount > 0, "Vault: no active vaults in market");

        uint256 perVaultAmount = amount / activeCount;
        require(perVaultAmount > 0, "Vault: amount too small for active vaults");
        uint256 remainder = amount % activeCount;
        bool isFirst = true;

        for (uint256 i = 0; i < totalChildren; i++) {
            bytes32 vId = childVaults[i];
            if (vaults[vId].status != Status.Resolved) {
                uint256 vaultShare = perVaultAmount;
                if (isFirst && remainder > 0) {
                    vaultShare += remainder;
                    isFirst = false;
                }
                yieldPot[vId] += vaultShare;
                emit YieldInjected(vId, msg.sender, vaultShare);
            }
        }

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit MarketYieldInjected(marketId_, msg.sender, amount, activeCount, perVaultAmount);
    }

    function harvestVault(bytes32 vaultId) external {
        address vd = protocol.vaultDriver();
        if (vd != address(0)) {
            VaultDriver(vd).harvest(vaultId, Side.Yes);
            VaultDriver(vd).harvest(vaultId, Side.No);
        }
    }

    function collect(bytes32 vaultId) public returns (uint256) {
        VaultData storage v = vaults[vaultId];
        require(v.exists, "Vault: unknown vault");
        require(v.status == Status.Resolved, "Vault: not resolved");

        if (collected[vaultId]) {
            return pot[vaultId];
        }

        address vd = protocol.vaultDriver();
        if (vd != address(0)) {
            try VaultDriver(vd).harvest(vaultId, Side.Yes) {} catch {}
            try VaultDriver(vd).harvest(vaultId, Side.No) {} catch {}
        }

        _advance(vaultId, Side.Yes, type(uint256).max);
        _advance(vaultId, Side.No, type(uint256).max);

        uint256 frozenPot = boards[vaultId][Side.Yes].pool + boards[vaultId][Side.No].pool + yieldPot[vaultId];
        pot[vaultId] = frozenPot;
        collected[vaultId] = true;
        return frozenPot;
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
        if (!v.exists || v.status != Status.Resolved) return 0;

        // Flaw 2 Fix: Check settlement cycle finalization
        address dripsAddr = protocol.dripsStreaming();
        if (dripsAddr != address(0)) {
            try IDripsCycle(dripsAddr).CYCLE_SECS() returns (uint32 cycleSecs) {
                if (cycleSecs > 0) {
                    uint256 readyAt = ((uint256(v.resolvedAt) + cycleSecs - 1) / cycleSecs) * cycleSecs;
                    if (block.timestamp < readyAt) {
                        revert SettlementPending(readyAt);
                    }
                }
            } catch {}
        }

        _advance(vaultId, Side.Yes, type(uint256).max);
        _advance(vaultId, Side.No, type(uint256).max);

        Side claimSide = (v.outcome == Outcome.Yes) ? Side.Yes : Side.No;

        // Uncontested Market Trap Defense:
        // If claimSide has 0 shares, fall back to refunding the non-empty side's depositors pro-rata
        if (boards[vaultId][claimSide].sideShares == 0) {
            Side fallbackSide = (claimSide == Side.Yes) ? Side.No : Side.Yes;
            if (boards[vaultId][fallbackSide].sideShares > 0) {
                claimSide = fallbackSide;
                emit UncontestedFallback(vaultId, (v.outcome == Outcome.Yes) ? Side.Yes : Side.No, fallbackSide);
            }
        }

        Board storage board = boards[vaultId][claimSide];
        Position storage pos = _positions[vaultId][claimSide][account];

        if (pos.rate > 0) {
            pos.sharesAccrued += pos.rate * (board.g - pos.gPaid);
            if (block.timestamp > v.resolvedAt) {
                uint256 overEnd = (pos.maxEnd != 0 && pos.maxEnd < block.timestamp) ? uint256(pos.maxEnd) : block.timestamp;
                if (overEnd > v.resolvedAt) {
                    uint256 over = pos.rate * (overEnd - uint256(v.resolvedAt));
                    overageOwed[vaultId][claimSide][account] += over;
                }
            }
            pos.rate = 0;
            pos.gPaid = board.g;
        }

        // Account for any active overage on the opposite side as well
        Side otherSide = (claimSide == Side.Yes) ? Side.No : Side.Yes;
        Position storage posOther = _positions[vaultId][otherSide][account];
        if (posOther.rate > 0) {
            if (block.timestamp > v.resolvedAt) {
                uint256 overEnd = (posOther.maxEnd != 0 && posOther.maxEnd < block.timestamp) ? uint256(posOther.maxEnd) : block.timestamp;
                if (overEnd > v.resolvedAt) {
                    uint256 over = posOther.rate * (overEnd - uint256(v.resolvedAt));
                    overageOwed[vaultId][otherSide][account] += over;
                }
            }
            posOther.rate = 0;
        }

        uint256 userShares = pos.sharesAccrued;
        uint256 frozenPot = collect(vaultId);
        uint256 winningShares = board.sideShares;

        if (!claimed[vaultId][claimSide][account]) {
            if (userShares > 0 && winningShares > 0) {
                payout = FixedPointMathLib.fullMulDiv(frozenPot, userShares, winningShares);
                claimed[vaultId][claimSide][account] = true;
                pos.sharesAccrued = 0;
            }
        }

        // Drain overage on both sides
        uint256 overYes = overageOwed[vaultId][Side.Yes][account];
        if (overYes > 0) {
            overageOwed[vaultId][Side.Yes][account] = 0;
            payout += overYes;
        }
        uint256 overNo = overageOwed[vaultId][Side.No][account];
        if (overNo > 0) {
            overageOwed[vaultId][Side.No][account] = 0;
            payout += overNo;
        }

        if (payout == 0) {
            return 0;
        }

        usdc.safeTransfer(to, payout);
        emit Withdrawn(account, vaultId, to, payout);
        return payout;
    }

    function refundOverage(uint256 account, bytes32 vaultId, Side side, address to) external returns (uint256 refunded) {
        require(to != address(0), "Vault: zero address");
        require(
            msg.sender == protocol.marketDriver() ||
            msg.sender == protocol.vaultDriver() ||
            msg.sender == protocol.owner(),
            "Vault: unauthorized"
        );
        VaultData storage v = vaults[vaultId];
        require(v.exists, "Vault: unknown vault");
        require(v.status == Status.Resolved, "Vault: not resolved");

        _advance(vaultId, side);

        Position storage pos = _positions[vaultId][side][account];
        if (pos.rate > 0) {
            if (block.timestamp > v.resolvedAt) {
                uint256 overEnd = (pos.maxEnd != 0 && pos.maxEnd < block.timestamp) ? uint256(pos.maxEnd) : block.timestamp;
                if (overEnd > v.resolvedAt) {
                    uint256 over = pos.rate * (overEnd - uint256(v.resolvedAt));
                    overageOwed[vaultId][side][account] += over;
                }
            }
            pos.rate = 0;
        }

        address vd = protocol.vaultDriver();
        if (vd != address(0)) {
            try VaultDriver(vd).harvest(vaultId, side) {} catch {}
        }

        refunded = overageOwed[vaultId][side][account];
        require(refunded > 0, "Vault: no overage");
        overageOwed[vaultId][side][account] = 0;

        usdc.safeTransfer(to, refunded);
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

    function getBoundaryQueue(bytes32 vaultId, Side side) external view returns (uint256 total, uint256 head) {
        return (_boundaries[vaultId][side].length, _boundaryHead[vaultId][side]);
    }

    function _previewG(bytes32 vaultId, Side side, uint256 capTs) internal view returns (uint256) {
        Board storage b = boards[vaultId][side];
        if (b.lastAdvance == 0 || capTs <= b.lastAdvance || b.sideRate == 0) {
            return b.g;
        }
        (, uint256 dG) = BondingBoard.segMath(b.pool, b.sideRate, capTs - b.lastAdvance);
        return b.g + dG;
    }

    /// @notice Gasless view-parity preview of shares earned if settled right now
    function pendingShares(bytes32 vaultId, Side side, uint256 account) external view returns (uint256) {
        Position storage p = _positions[vaultId][side][account];
        uint256 capTs = block.timestamp;
        uint32 resolvedAt = vaults[vaultId].resolvedAt;
        if (resolvedAt != 0 && uint256(resolvedAt) < capTs) {
            capTs = resolvedAt;
        }
        if (!p.depleted && p.maxEnd != 0 && uint256(p.maxEnd) < capTs) {
            capTs = p.maxEnd;
        }
        uint256 gNow = _previewG(vaultId, side, capTs);
        uint256 accrued = p.sharesAccrued + (p.rate * (gNow - p.gPaid));
        return accrued / WAD;
    }

    function getSharePrice(bytes32 vaultId, Side side) external view returns (uint256) {
        return BondingBoard.price(boards[vaultId][side].pool);
    }

    function getVaultPools(bytes32 vaultId)
        external
        view
        returns (uint256 yesPool, uint256 noPool, uint256 yesShares, uint256 noShares)
    {
        require(vaults[vaultId].exists, "Vault: unknown vault");
        Board storage y = boards[vaultId][Side.Yes];
        Board storage n = boards[vaultId][Side.No];
        return (y.pool, n.pool, y.sideShares / WAD, n.sideShares / WAD);
    }

    function _scheduleBoundary(bytes32 vaultId, Side side, uint32 maxEnd, uint256 account) internal {
        if (maxEnd == 0) return;
        Boundary[] storage queue = _boundaries[vaultId][side];
        uint256 head = _boundaryHead[vaultId][side];

        if (queue.length == head || queue[queue.length - 1].maxEnd <= maxEnd) {
            queue.push(Boundary({maxEnd: maxEnd, account: account}));
            return;
        }

        // Bounded insertion sort: cap shifts at MAX_SCHEDULE_SHIFTS (32) to prevent gas griefing
        queue.push(Boundary({maxEnd: maxEnd, account: account}));
        uint256 i = queue.length - 1;
        uint256 shifts = 0;
        while (i > head && queue[i - 1].maxEnd > maxEnd && shifts < MAX_SCHEDULE_SHIFTS) {
            queue[i] = queue[i - 1];
            i--;
            shifts++;
        }
        queue[i] = Boundary({maxEnd: maxEnd, account: account});
    }

    function _advance(bytes32 vaultId, Side side) internal {
        _advance(vaultId, side, 64);
    }

    function _advance(bytes32 vaultId, Side side, uint256 maxSteps) internal {
        Board storage board = boards[vaultId][side];
        VaultData storage v = vaults[vaultId];

        uint32 targetTs = uint32(block.timestamp);
        if (v.status == Status.Resolved && v.resolvedAt < targetTs) {
            targetTs = v.resolvedAt;
        }

        if (board.lastAdvance == 0) {
            board.lastAdvance = targetTs;
            return;
        }
        if (targetTs <= board.lastAdvance) {
            return;
        }

        uint32 t = board.lastAdvance;
        Boundary[] storage queue = _boundaries[vaultId][side];
        uint256 head = _boundaryHead[vaultId][side];
        uint256 steps = 0;

        while (head < queue.length && steps < maxSteps) {
            Boundary storage b = queue[head];
            if (b.maxEnd > targetTs) {
                break;
            }

            uint32 bMaxEnd = b.maxEnd;
            if (bMaxEnd > t) {
                uint256 dt = bMaxEnd - t;
                if (board.sideRate > 0) {
                    (uint256 newPool, uint256 dG) = BondingBoard.segMath(board.pool, board.sideRate, dt);
                    board.pool = newPool;
                    board.g += dG;
                    board.sideShares += board.sideRate * dG;
                }
                t = bMaxEnd;
                board.lastAdvance = t;
            }

            // Process depletion for b.account
            Position storage pos = _positions[vaultId][side][b.account];
            if (pos.rate > 0 && pos.maxEnd <= bMaxEnd) {
                uint256 accrued = pos.rate * (board.g - pos.gPaid);
                pos.sharesAccrued += accrued;
                pos.gPaid = board.g;
                if (t > pos.fundStart) {
                    pos.lostUsdc += pos.rate * (t - pos.fundStart);
                    pos.fundStart = t;
                }
                board.sideRate -= pos.rate;
                pos.rate = 0;
                pos.depleted = true;
                emit Depleted(b.account, vaultId, side, bMaxEnd);
            }

            head++;
            steps++;
        }
        _boundaryHead[vaultId][side] = head;

        // Trailing delta step-cap fix:
        // Only step to targetTs if all mature boundaries up to targetTs were drained.
        // If the loop broke because steps == maxSteps, leave board.lastAdvance = t
        // so subsequent advance calls continue draining from t without skipping boundaries.
        bool queueFullyDrained = (head == queue.length || queue[head].maxEnd > targetTs);
        if (targetTs > t && queueFullyDrained) {
            uint256 dt = targetTs - t;
            if (board.sideRate > 0) {
                (uint256 newPool, uint256 dG) = BondingBoard.segMath(board.pool, board.sideRate, dt);
                board.pool = newPool;
                board.g += dG;
                board.sideShares += board.sideRate * dG;
            }
            board.lastAdvance = targetTs;
        }
    }
}
