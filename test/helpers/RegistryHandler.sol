// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";
import {ThroneRegistry} from "../../src/ThroneRegistry.sol";

/// @dev An actor whose receive() tries to re-enter claimStake while being paid.
contract ReentrantStaker {
    ThroneRegistry immutable registry;
    uint256 public reentered;

    constructor(ThroneRegistry r) {
        registry = r;
    }

    receive() external payable {
        uint256 count = registry.challengeCount();
        for (uint256 id = 1; id <= count; ++id) {
            try registry.claimStake(id) {
                reentered += 1;
            } catch {}
        }
    }
}

/// @dev Random bounded sequences of every state-changing registry entry point, with ghost accounting.
contract RegistryHandler is CommonBase, StdCheats, StdUtils, StdAssertions {
    ThroneRegistry public immutable registry;
    bytes32 public immutable ticker;
    address[] public actors;
    ReentrantStaker public reentrant;

    uint256 public deposited;
    uint256 public withdrawn;
    uint256 public treasuryPaid;
    uint256 public opened;
    uint256 public staked;
    uint256 public finalized;
    uint256 public claimed;
    uint256 public dethrones;
    uint256[] public finalizedIds;
    mapping(uint256 => bytes32) public snapshot;
    mapping(uint256 => mapping(address => uint256)) public paidTo;
    mapping(uint256 => mapping(address => uint256)) public depositedBy;

    constructor(ThroneRegistry registry_, bytes32 ticker_, address[] memory eoas) {
        registry = registry_;
        ticker = ticker_;
        reentrant = new ReentrantStaker(registry_);
        for (uint256 i; i < eoas.length; ++i) {
            actors.push(eoas[i]);
        }
        actors.push(address(reentrant));
        for (uint256 i; i < actors.length; ++i) {
            vm.deal(actors[i], 1_000_000 ether);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function finalizedCount() external view returns (uint256) {
        return finalizedIds.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function open(uint256 actorSeed, uint256 candidateSeed, uint256 valueSeed) external {
        address actor = _actor(actorSeed);
        address candidate = _actor(candidateSeed);
        // Mostly the exact bond; occasionally a wrong amount that must be refused.
        uint256 value = valueSeed % 8 == 0 ? bound(valueSeed, 0, 1 ether) : registry.BOND();
        ThroneRegistry.Ticker memory before = registry.tickerState(ticker);
        vm.prank(actor);
        try registry.openChallenge{value: value}(ticker, candidate) returns (uint256 id) {
            assertEq(value, registry.BOND(), "opened with wrong bond");
            assertEq(before.liveChallenge, 0, "opened while another challenge was live");
            assertTrue(candidate != before.beneficiary, "opened with reigning beneficiary as candidate");
            assertGe(block.timestamp, before.cooldownUntil, "opened during cooldown");
            assertEq(id, registry.challengeCount(), "id is not the latest");
            deposited += value;
            depositedBy[id][actor] += value;
            opened += 1;
        } catch {
            assertTrue(
                value != registry.BOND() || before.liveChallenge != 0 || candidate == before.beneficiary
                    || block.timestamp < before.cooldownUntil,
                "valid open reverted"
            );
        }
    }

    function stakeOn(uint256 actorSeed, uint8 sideSeed, uint256 amount) external {
        uint256 id = registry.challengeCount();
        if (id == 0) return;
        address actor = _actor(actorSeed);
        ThroneRegistry.Side side =
            sideSeed % 2 == 0 ? ThroneRegistry.Side.Reigning : ThroneRegistry.Side.Challenger;
        amount = bound(amount, 0, 3 ether);
        ThroneRegistry.Challenge memory before = registry.challenges(id);
        vm.prank(actor);
        try registry.stake{value: amount}(id, side) {
            assertTrue(amount != 0, "zero stake accepted");
            assertLt(block.timestamp, before.votingEnds, "stake accepted after voting closed");
            assertFalse(before.finalized, "stake accepted after finalization");
            deposited += amount;
            depositedBy[id][actor] += amount;
            staked += 1;
        } catch {
            assertTrue(
                amount == 0 || block.timestamp >= before.votingEnds || before.finalized,
                "valid stake reverted"
            );
        }
    }

    function warp(uint256 secondsSeed) external {
        vm.warp(block.timestamp + bound(secondsSeed, 1, 4 days));
    }

    function finalizeLatest() external {
        uint256 id = registry.challengeCount();
        if (id == 0) return;
        ThroneRegistry.Challenge memory before = registry.challenges(id);
        address previous = registry.beneficiary(ticker);
        try registry.finalize(id) {
            assertFalse(before.finalized, "finalized twice");
            assertGe(block.timestamp, before.finalizableAt, "finalized before timelock");
            ThroneRegistry.Challenge memory after_ = registry.challenges(id);
            bool expectedWin = before.challengerStake > before.reigningStake
                && before.challengerStake + before.reigningStake >= registry.QUORUM();
            assertEq(after_.challengerWon, expectedWin, "win rule mismatch");
            if (expectedWin) {
                assertEq(registry.beneficiary(ticker), before.candidate, "candidate not seated");
                dethrones += 1;
            } else {
                assertEq(registry.beneficiary(ticker), previous, "beneficiary changed on failed challenge");
                assertEq(
                    registry.tickerState(ticker).cooldownUntil,
                    block.timestamp + registry.FAILED_COOLDOWN(),
                    "cooldown mismatch"
                );
            }
            finalizedIds.push(id);
            snapshot[id] = _snapshot(after_);
            finalized += 1;
        } catch {
            assertTrue(before.finalized || block.timestamp < before.finalizableAt, "valid finalize reverted");
        }
    }

    function claimStake(uint256 actorSeed, uint256 idSeed) external {
        if (finalizedIds.length == 0) return;
        uint256 id = finalizedIds[idSeed % finalizedIds.length];
        address actor = _actor(actorSeed);
        uint256 expected = registry.claimable(id, actor);
        uint256 principal = registry.stakes(id, actor, ThroneRegistry.Side.Reigning)
            + registry.stakes(id, actor, ThroneRegistry.Side.Challenger);
        bool alreadyClaimed = registry.stakeClaimed(id, actor);
        uint256 balanceBefore = actor.balance;
        vm.prank(actor);
        try registry.claimStake(id) returns (uint256 amount) {
            assertTrue(principal != 0 && !alreadyClaimed, "claim without principal or twice");
            assertEq(amount, expected, "claim differs from claimable()");
            assertEq(actor.balance - balanceBefore, amount, "paid amount differs");
            assertTrue(registry.stakeClaimed(id, actor), "claim not recorded");
            assertEq(registry.claimable(id, actor), 0, "claimable not zeroed");
            withdrawn += amount;
            paidTo[id][actor] += amount;
            claimed += 1;
        } catch {
            assertTrue(principal == 0 || alreadyClaimed, "valid claim reverted");
        }
    }

    function claimTreasury() external {
        uint256 owed = registry.treasuryOwed();
        uint256 before = registry.TREASURY().balance;
        try registry.claimTreasury() returns (uint256 amount) {
            assertEq(amount, owed, "treasury amount mismatch");
            assertTrue(owed != 0, "zero treasury claim accepted");
            assertEq(registry.TREASURY().balance - before, amount, "treasury not paid");
            assertEq(registry.treasuryOwed(), 0, "treasuryOwed not zeroed");
            treasuryPaid += amount;
        } catch {
            assertEq(owed, 0, "valid treasury claim reverted");
        }
    }

    function _snapshot(ThroneRegistry.Challenge memory c) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                c.ticker,
                c.candidate,
                c.openedAt,
                c.votingEnds,
                c.finalizableAt,
                c.reigningStake,
                c.challengerStake,
                c.finalized,
                c.challengerWon,
                c.loserRefundPool,
                c.winnerBonusPool,
                c.initialTreasury
            )
        );
    }

    function snapshotOf(uint256 id) external view returns (bytes32) {
        return _snapshot(registry.challenges(id));
    }
}
