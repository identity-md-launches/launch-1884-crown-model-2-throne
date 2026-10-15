// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ThroneRegistry} from "../src/ThroneRegistry.sol";
import {ThroneToken} from "../src/ThroneToken.sol";

/// @notice Property tests for the challenge arithmetic at its edges, exact to the wei.
contract ThroneRegistryMathTest is Test {
    bytes32 constant TICKER = keccak256("THRONE");
    ThroneRegistry registry;
    ThroneToken token;
    address alice = makeAddr("alice");
    address[6] stakers;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new ThroneRegistry(0);
        token = new ThroneToken(alice, 1_000_000_000 ether);
        registry.registerTicker(TICKER, address(token), alice);
        vm.deal(alice, type(uint128).max);
        for (uint256 i; i < stakers.length; ++i) {
            stakers[i] = makeAddr(string(abi.encodePacked("staker", i)));
            vm.deal(stakers[i], type(uint128).max);
        }
    }

    function _open(address opener, address candidate) internal returns (uint256 id) {
        vm.prank(opener);
        return registry.openChallenge{value: 0.01 ether}(TICKER, candidate);
    }

    function _stake(uint256 id, address who, ThroneRegistry.Side side, uint256 value) internal {
        if (value == 0) return;
        vm.prank(who);
        registry.stake{value: value}(id, side);
    }

    function _claim(uint256 id, address who) internal returns (uint256 amount) {
        uint256 before = who.balance;
        uint256 expected = registry.claimable(id, who);
        vm.prank(who);
        amount = registry.claimStake(id);
        assertEq(amount, expected, "claimStake != claimable");
        assertEq(who.balance - before, expected, "paid != claimable");
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzzBondMustBeExact(uint256 value) public {
        value = bound(value, 0, 1000 ether);
        vm.assume(value != 0.01 ether);
        vm.prank(stakers[0]);
        vm.expectRevert(ThroneRegistry.WrongBond.selector);
        registry.openChallenge{value: value}(TICKER, stakers[0]);
        assertEq(registry.challengeCount(), 0);
        assertEq(address(registry).balance, 0);
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzzWinRuleIsStrictMajorityAndQuorum(uint96 extraChallenger, uint96 reigning) public {
        uint256 challenger = 0.01 ether + bound(uint256(extraChallenger), 0, 0.1 ether);
        uint256 defend = bound(uint256(reigning), 0, 0.1 ether);
        uint256 id = _open(stakers[0], stakers[0]);
        _stake(id, stakers[0], ThroneRegistry.Side.Challenger, challenger - 0.01 ether);
        _stake(id, alice, ThroneRegistry.Side.Reigning, defend);
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
        bool expected = challenger > defend && challenger + defend >= 0.05 ether;
        assertEq(registry.challenges(id).challengerWon, expected, "win rule");
        assertEq(registry.beneficiary(TICKER), expected ? stakers[0] : alice);
        assertEq(registry.token(TICKER), address(token));
    }

    /// @dev Three winners, three losers, arbitrary amounts up to 2^96: every payout is the floor of its pro-rata
    /// share, the sum never exceeds the pool, dust goes to treasury only after the last claim, and the
    /// contract ends empty.
    /// forge-config: default.fuzz.runs = 1000
    function testFuzzSlashSplitExactForManyStakers(
        uint96[3] memory w,
        uint96[3] memory l,
        bool challengerWins
    ) public {
        uint256 id = _open(stakers[0], stakers[0]);
        ThroneRegistry.Side winSide =
            challengerWins ? ThroneRegistry.Side.Challenger : ThroneRegistry.Side.Reigning;
        ThroneRegistry.Side loseSide =
            challengerWins ? ThroneRegistry.Side.Reigning : ThroneRegistry.Side.Challenger;
        uint256 winners;
        uint256 losers;
        for (uint256 i; i < 3; ++i) {
            uint256 wi = bound(uint256(w[i]), 1, type(uint96).max);
            uint256 li = bound(uint256(l[i]), 1, type(uint96).max);
            _stake(id, stakers[i], winSide, wi);
            _stake(id, stakers[3 + i], loseSide, li);
            winners += wi;
            losers += li;
        }
        // Ensure the intended side wins regardless of the random amounts: the opener's bond sits on the
        // challenger side, so top the winning side up past the losing side and past quorum.
        if (challengerWins) winners += 0.01 ether;
        else losers += 0.01 ether;
        uint256 topUp;
        if (winners <= losers) topUp = losers - winners + 1;
        if (winners + topUp + losers < registry.QUORUM()) {
            topUp += registry.QUORUM() - (winners + topUp + losers);
        }
        if (topUp != 0) {
            _stake(id, stakers[0], winSide, topUp);
            winners += topUp;
        }
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
        ThroneRegistry.Challenge memory c = registry.challenges(id);
        assertEq(c.challengerWon, challengerWins, "intended side did not win");
        uint256 total = winners + losers;
        assertEq(c.reigningStake + c.challengerStake, total);
        uint256 slash = losers / 5;
        assertEq(c.loserRefundPool, losers - slash, "refund pool");
        assertEq(c.winnerBonusPool, slash / 2, "winner bonus pool");
        assertEq(c.initialTreasury, slash - slash / 2, "treasury share");
        assertEq(registry.treasuryOwed(), c.initialTreasury);

        uint256 paid;
        for (uint256 i; i < 6; ++i) {
            address who = stakers[i];
            uint256 win = registry.stakes(id, who, winSide);
            uint256 lose = registry.stakes(id, who, loseSide);
            uint256 expected = win + win * c.winnerBonusPool / winners + lose * c.loserRefundPool / losers;
            assertEq(registry.claimable(id, who), expected, "per-wallet floor");
            // Dust must still be inside the contract before the final claim.
            assertEq(address(registry).balance, total - paid, "balance drifts between claims");
            paid += _claim(id, who);
            if (i < 5) assertEq(registry.treasuryOwed(), c.initialTreasury, "dust swept early");
        }
        uint256 dust = total - c.initialTreasury - paid;
        assertLe(dust, 6, "more than one wei of rounding per claimant");
        assertEq(registry.treasuryOwed(), c.initialTreasury + dust, "dust not swept to treasury");
        uint256 before = registry.TREASURY().balance;
        registry.claimTreasury();
        assertEq(registry.TREASURY().balance - before, c.initialTreasury + dust);
        assertEq(address(registry).balance, 0, "registry not empty after all claims");
        assertEq(paid + c.initialTreasury + dust, total, "ETH not conserved");
    }

    function testOneWeiStakesAndEmptyWinningSide() public {
        // Challenger loses below quorum with no defender: the whole 20% slash goes to treasury.
        uint256 id = _open(stakers[0], stakers[0]);
        _stake(id, stakers[1], ThroneRegistry.Side.Challenger, 1);
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
        ThroneRegistry.Challenge memory c = registry.challenges(id);
        assertFalse(c.challengerWon);
        uint256 losers = 0.01 ether + 1;
        assertEq(c.loserRefundPool, losers - losers / 5);
        assertEq(c.winnerBonusPool, 0, "bonus pool with no winners");
        assertEq(c.initialTreasury, losers / 5);
        // One wei staked: floor(1 * refund / losers) == 0, so the 1 wei is dust for the treasury.
        assertEq(registry.claimable(id, stakers[1]), 0);
        assertEq(_claim(id, stakers[0]), 0.01 ether * (losers - losers / 5) / losers);
        assertEq(_claim(id, stakers[1]), 0);
        assertEq(
            registry.treasuryOwed() + registry.claimable(id, stakers[0]),
            losers - 0.01 ether * (losers - losers / 5) / losers
        );
        registry.claimTreasury();
        assertEq(address(registry).balance, 0);
    }

    function testExactQuorumBoundaryOneWeiBelow() public {
        uint256 id = _open(stakers[0], stakers[0]);
        _stake(id, stakers[0], ThroneRegistry.Side.Challenger, 0.04 ether - 1);
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
        assertFalse(registry.challenges(id).challengerWon, "quorum met one wei short");
        vm.warp(registry.tickerState(TICKER).cooldownUntil);
        id = _open(stakers[0], stakers[0]);
        _stake(id, stakers[0], ThroneRegistry.Side.Challenger, 0.04 ether);
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
        assertTrue(registry.challenges(id).challengerWon, "exact quorum rejected");
    }

    function testMajorityByOneWeiWins() public {
        uint256 id = _open(stakers[0], stakers[0]);
        _stake(id, stakers[0], ThroneRegistry.Side.Challenger, 0.04 ether + 1);
        _stake(id, alice, ThroneRegistry.Side.Reigning, 0.05 ether);
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
        assertTrue(registry.challenges(id).challengerWon);
        assertEq(registry.claimable(id, alice), 0.04 ether);
        // Winner bonus is half of 0.01 ether = 0.005 ether, all to the only winner.
        assertEq(registry.claimable(id, stakers[0]), 0.05 ether + 1 + 0.005 ether);
        assertEq(registry.treasuryOwed(), 0.005 ether);
    }

    function testOutOfRangeSideIsRejectedWithoutTakingFunds() public {
        uint256 id = _open(stakers[0], stakers[0]);
        uint256 before = address(registry).balance;
        vm.prank(stakers[1]);
        (bool ok,) = address(registry).call{value: 1 ether}(
            abi.encodeWithSelector(ThroneRegistry.stake.selector, id, uint8(2))
        );
        assertFalse(ok, "invalid side accepted");
        assertEq(address(registry).balance, before);
        assertEq(registry.challenges(id).challengerStake, 0.01 ether);
        assertEq(registry.challenges(id).reigningStake, 0);
    }

    function testStakeRejectedInTimelockAndAfterFinalization() public {
        uint256 id = _open(stakers[0], stakers[0]);
        vm.warp(registry.challenges(id).votingEnds + 1 hours);
        vm.prank(stakers[1]);
        vm.expectRevert(ThroneRegistry.VotingClosed.selector);
        registry.stake{value: 1}(id, ThroneRegistry.Side.Reigning);
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
        vm.prank(stakers[1]);
        vm.expectRevert(ThroneRegistry.VotingClosed.selector);
        registry.stake{value: 1}(id, ThroneRegistry.Side.Reigning);
    }

    function testLateFinalizationStillResolvesAndStartsCooldownFromThen() public {
        uint256 id = _open(stakers[0], stakers[0]);
        uint256 finalizable = registry.challenges(id).finalizableAt;
        vm.warp(finalizable + 365 days);
        registry.finalize(id);
        assertEq(registry.tickerState(TICKER).cooldownUntil, finalizable + 365 days + 3 days);
        assertEq(registry.tickerState(TICKER).liveChallenge, 0);
    }

    function testTreasuryIsTheFixedAddressAndNeverPaidTwice() public {
        assertEq(registry.TREASURY(), 0xf19F11Dee16a341671E6Ed3e209b704C1Bbc3E57);
        uint256 id = _open(stakers[0], stakers[0]);
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
        uint256 owed = registry.treasuryOwed();
        assertEq(owed, 0.002 ether);
        registry.claimTreasury();
        assertEq(registry.treasuryPaid(), owed);
        vm.expectRevert(ThroneRegistry.NothingToClaim.selector);
        registry.claimTreasury();
        assertEq(registry.TREASURY().balance, owed);
    }

    function testSecondTickerSameTokenAndSameTickerDifferentTokenAreRejected() public {
        ThroneToken other = new ThroneToken(alice, 1 ether);
        vm.expectRevert(ThroneRegistry.AlreadyRegistered.selector);
        registry.registerTicker(TICKER, address(other), alice);
        vm.expectRevert(ThroneRegistry.AlreadyRegistered.selector);
        registry.registerTicker(keccak256("OTHER"), address(token), alice);
        registry.registerTicker(keccak256("OTHER"), address(other), stakers[0]);
        assertEq(registry.token(keccak256("OTHER")), address(other));
        assertEq(registry.token(TICKER), address(token));
        // Challenges are per ticker: one live challenge on OTHER does not block THRONE.
        _open(stakers[1], stakers[1]);
        vm.prank(stakers[1]);
        registry.openChallenge{value: 0.01 ether}(keccak256("OTHER"), stakers[1]);
        assertEq(registry.challengeCount(), 2);
    }

    function testProductionRegistryKeepsSevenDayDefaultAndDemoIsZero() public {
        assertEq(registry.MIN_REIGN(), 0);
        assertEq(registry.DEFAULT_MIN_REIGN(), 7 days);
        ThroneRegistry custom = new ThroneRegistry(1 days);
        assertEq(custom.MIN_REIGN(), 1 days);
        assertEq(custom.DEFAULT_MIN_REIGN(), 7 days);
    }
}
