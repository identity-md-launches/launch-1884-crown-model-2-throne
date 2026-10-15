// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ThroneRegistry} from "../src/ThroneRegistry.sol";
import {ThroneToken} from "../src/ThroneToken.sol";
import {RegistryHandler} from "./helpers/RegistryHandler.sol";

/// @notice The registry holds every bond and stake in ETH. These properties must hold after any call sequence.
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 60
/// forge-config: default.invariant.fail-on-revert = false
contract ThroneRegistryInvariantTest is Test {
    bytes32 constant TICKER = keccak256("THRONE");
    ThroneRegistry registry;
    ThroneToken token;
    RegistryHandler handler;
    address initialBeneficiary = makeAddr("initial beneficiary");

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new ThroneRegistry(0);
        token = new ThroneToken(initialBeneficiary, 1_000_000_000 ether);
        registry.registerTicker(TICKER, address(token), initialBeneficiary);
        address[] memory eoas = new address[](4);
        eoas[0] = initialBeneficiary;
        eoas[1] = makeAddr("challenger");
        eoas[2] = makeAddr("defender");
        eoas[3] = makeAddr("opportunist");
        handler = new RegistryHandler(registry, TICKER, eoas);
        targetContract(address(handler));
    }

    /// @dev The contract holds exactly what it still owes: treasury, open challenges, unclaimed payouts.
    function invariant_balanceEqualsOutstandingObligations() public view {
        uint256 obligations = registry.treasuryOwed();
        uint256 count = registry.challengeCount();
        for (uint256 id = 1; id <= count; ++id) {
            ThroneRegistry.Challenge memory c = registry.challenges(id);
            uint256 total = c.reigningStake + c.challengerStake;
            if (!c.finalized) {
                obligations += total;
            } else if (c.principalClaimed < total) {
                obligations += total - c.initialTreasury - c.payoutsClaimed;
            }
        }
        assertEq(address(registry).balance, obligations, "balance != obligations");
    }

    /// @dev ETH is conserved: what came in equals what is held plus what went out, and only to the fixed treasury.
    function invariant_conservation() public view {
        assertEq(
            address(registry).balance,
            handler.deposited() - handler.withdrawn() - handler.treasuryPaid(),
            "conservation"
        );
        assertEq(registry.TREASURY().balance, registry.treasuryPaid(), "treasury received != treasuryPaid");
        assertEq(registry.treasuryPaid(), handler.treasuryPaid(), "treasuryPaid ghost");
    }

    /// @dev Remaining claims can always be paid, and the slash math is exact for every finalized challenge.
    function invariant_finalizedMathExactAndSolvent() public view {
        uint256 count = handler.finalizedCount();
        uint256 actors = handler.actorCount();
        for (uint256 i; i < count; ++i) {
            uint256 id = handler.finalizedIds(i);
            ThroneRegistry.Challenge memory c = registry.challenges(id);
            assertTrue(c.finalized, "finalized challenge reopened");
            assertEq(handler.snapshotOf(id), handler.snapshot(id), "finalized challenge mutated");
            uint256 total = c.reigningStake + c.challengerStake;
            bool win = c.challengerStake > c.reigningStake && total >= registry.QUORUM();
            assertEq(c.challengerWon, win, "win rule");
            uint256 loser = win ? c.reigningStake : c.challengerStake;
            uint256 winner = win ? c.challengerStake : c.reigningStake;
            uint256 slash = loser / 5;
            assertEq(c.loserRefundPool, loser - slash, "80% refund");
            assertEq(c.winnerBonusPool, winner == 0 ? 0 : slash / 2, "half of slash to winners");
            assertEq(c.initialTreasury, slash - c.winnerBonusPool, "other half to treasury");
            uint256 pending;
            uint256 principalSeen;
            for (uint256 a; a < actors; ++a) {
                address actor = handler.actors(a);
                pending += registry.claimable(id, actor);
                uint256 principal = registry.stakes(id, actor, ThroneRegistry.Side.Reigning)
                    + registry.stakes(id, actor, ThroneRegistry.Side.Challenger);
                principalSeen += principal;
                assertEq(principal, handler.depositedBy(id, actor), "principal ghost");
                // Nobody is paid more than principal plus the whole winner bonus pool.
                assertLe(handler.paidTo(id, actor), principal + c.winnerBonusPool, "overpaid");
                if (registry.stakeClaimed(id, actor)) {
                    assertEq(registry.claimable(id, actor), 0, "claimable after claim");
                }
            }
            assertEq(principalSeen, total, "stakes != totals");
            if (c.principalClaimed < total) {
                assertLe(pending + c.payoutsClaimed, total - c.initialTreasury, "claims exceed pool");
            } else {
                assertEq(pending, 0, "pending after everyone claimed");
            }
        }
    }

    /// @dev Only the latest challenge may be live; everything before it is finalized.
    function invariant_singleLiveChallenge() public view {
        uint256 count = registry.challengeCount();
        uint256 live = registry.tickerState(TICKER).liveChallenge;
        for (uint256 id = 1; id <= count; ++id) {
            ThroneRegistry.Challenge memory c = registry.challenges(id);
            if (id < count) assertTrue(c.finalized, "older challenge not finalized");
            assertEq(c.ticker, TICKER, "ticker");
            assertEq(c.votingEnds, c.openedAt + registry.VOTING_WINDOW(), "window");
            assertEq(c.finalizableAt, c.votingEnds + registry.TIMELOCK(), "timelock");
            assertGe(c.challengerStake, registry.BOND(), "bond missing from challenger stake");
        }
        if (live != 0) {
            assertEq(live, count, "live is not latest");
            assertFalse(registry.challenges(live).finalized, "live challenge finalized");
        } else if (count != 0) {
            assertTrue(registry.challenges(count).finalized, "no live challenge but latest unfinalized");
        }
    }

    /// @dev The token binding is permanent and the reign history matches the beneficiary.
    function invariant_tokenImmutableAndReignsConsistent() public view {
        assertEq(registry.token(TICKER), address(token), "token changed");
        assertEq(registry.tickerOfToken(address(token)), TICKER, "reverse binding changed");
        uint256 reigns = registry.reignCount(TICKER);
        assertEq(reigns, 1 + handler.dethrones(), "reign count");
        (address controller,, uint256 to, ThroneRegistry.EndReason ended) =
            registry.reigns(TICKER, reigns - 1);
        assertEq(controller, registry.beneficiary(TICKER), "current reign controller");
        assertEq(controller, registry.controller(TICKER), "controller alias");
        assertEq(to, 0, "current reign ended");
        assertEq(uint256(ended), uint256(ThroneRegistry.EndReason.Ongoing), "current reign reason");
        for (uint256 i; i + 1 < reigns; ++i) {
            (, uint256 from, uint256 end, ThroneRegistry.EndReason reason) = registry.reigns(TICKER, i);
            assertGe(end, from, "reign ends before it starts");
            assertEq(uint256(reason), uint256(ThroneRegistry.EndReason.Dethroned), "past reign reason");
        }
    }

    function invariant_reentrancyNeverSucceeds() public view {
        assertEq(handler.reentrant().reentered(), 0, "reentrant claim succeeded");
    }
}
