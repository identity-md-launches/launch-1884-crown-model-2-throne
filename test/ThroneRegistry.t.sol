// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ThroneRegistry, ProductionThroneRegistry} from "../src/ThroneRegistry.sol";
import {ThroneToken} from "../src/ThroneToken.sol";

contract RegistryReceiver {
    ThroneRegistry public immutable registry;
    uint256 public id;
    bool public reject;
    bool public reentered;

    constructor(ThroneRegistry r) {
        registry = r;
    }

    function configure(uint256 id_, bool reject_) external {
        id = id_;
        reject = reject_;
    }

    function claim() external {
        registry.claimStake(id);
    }

    receive() external payable {
        require(!reject, "reject");
        try registry.claimStake(id) {
            reentered = true;
        } catch {}
    }
}

contract ThroneRegistryTest is Test {
    bytes32 constant TICKER = keccak256("THRONE");
    ThroneRegistry registry;
    ThroneToken token;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave = makeAddr("dave");

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new ThroneRegistry(0);
        token = new ThroneToken(alice, 1_000_000_000 ether);
        registry.registerTicker(TICKER, address(token), alice);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave, 100 ether);
    }

    function _open() internal returns (uint256 id) {
        vm.prank(bob);
        return registry.openChallenge{value: 0.01 ether}(TICKER, bob);
    }

    function _stake(uint256 id, address who, ThroneRegistry.Side side, uint256 value) internal {
        vm.prank(who);
        registry.stake{value: value}(id, side);
    }

    function _finalize(uint256 id) internal {
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
    }

    function _claim(uint256 id, address who) internal returns (uint256 amount) {
        uint256 before = who.balance;
        uint256 expected = registry.claimable(id, who);
        vm.prank(who);
        amount = registry.claimStake(id);
        assertEq(amount, expected);
        assertEq(who.balance - before, expected);
    }

    function testRegistrationIsPermanentAndNormalized() public {
        assertEq(registry.tickerId("Throne"), TICKER);
        assertEq(registry.token(TICKER), address(token));
        assertEq(registry.controller(TICKER), alice);
        assertEq(registry.beneficiary(TICKER), alice);
        assertEq(registry.reignCount(TICKER), 1);
        vm.expectRevert(ThroneRegistry.AlreadyRegistered.selector);
        registry.registerTicker(TICKER, address(token), bob);
        vm.expectRevert(ThroneRegistry.AlreadyRegistered.selector);
        registry.registerTicker(keccak256("OTHER"), address(token), bob);
        vm.expectRevert(ThroneRegistry.InvalidRegistration.selector);
        registry.registerTicker(bytes32(0), address(token), bob);
        vm.expectRevert(ThroneRegistry.InvalidRegistration.selector);
        registry.registerTicker(keccak256("OTHER"), bob, alice);
        vm.expectRevert(ThroneRegistry.InvalidRegistration.selector);
        registry.registerTicker(keccak256("OTHER"), address(token), address(0));
        // No token setter or arbitrary-beneficiary setter is exposed.
        (bool ok,) = address(registry).call(abi.encodeWithSignature("setToken(bytes32,address)", TICKER, bob));
        assertFalse(ok);
    }

    function testBondIsExactAndCountsAsOpenerStake() public {
        vm.expectRevert(ThroneRegistry.WrongBond.selector);
        registry.openChallenge{value: 0.01 ether - 1}(TICKER, bob);
        vm.expectRevert(ThroneRegistry.WrongBond.selector);
        registry.openChallenge{value: 0.01 ether + 1}(TICKER, bob);
        uint256 id = _open();
        assertEq(registry.stakes(id, bob, ThroneRegistry.Side.Challenger), 0.01 ether);
        assertEq(registry.challenges(id).challengerStake, 0.01 ether);
        assertEq(registry.tickerStakeTotals(TICKER, ThroneRegistry.Side.Challenger), 0.01 ether);
        assertEq(registry.challenges(id).votingEnds, block.timestamp + 72 hours);
        assertEq(registry.challenges(id).finalizableAt, block.timestamp + 96 hours);
    }

    function testInvalidCandidatesUnknownIdsAndConcurrentChallenge() public {
        vm.expectRevert(ThroneRegistry.InvalidCandidate.selector);
        registry.openChallenge{value: 0.01 ether}(TICKER, alice);
        vm.expectRevert(ThroneRegistry.InvalidCandidate.selector);
        registry.openChallenge{value: 0.01 ether}(TICKER, address(0));
        vm.expectRevert(ThroneRegistry.UnknownTicker.selector);
        registry.openChallenge{value: 0.01 ether}(keccak256("MISSING"), bob);
        _open();
        vm.expectRevert(ThroneRegistry.ChallengeLive.selector);
        registry.openChallenge{value: 0.01 ether}(TICKER, carol);
        vm.expectRevert(ThroneRegistry.UnknownChallenge.selector);
        registry.stake{value: 1}(0, ThroneRegistry.Side.Reigning);
        vm.expectRevert(ThroneRegistry.UnknownChallenge.selector);
        registry.finalize(2);
    }

    function testProductionDefaultAndMinReignBoundary() public {
        registry = new ProductionThroneRegistry();
        registry.registerTicker(TICKER, address(token), alice);
        assertEq(registry.MIN_REIGN(), 7 days);
        uint256 start = block.timestamp;
        vm.warp(start + 7 days - 1);
        vm.expectRevert(ThroneRegistry.ReignTooYoung.selector);
        registry.openChallenge{value: 0.01 ether}(TICKER, bob);
        vm.warp(start + 7 days);
        uint256 id = _open();
        _stake(id, bob, ThroneRegistry.Side.Challenger, 0.04 ether);
        _finalize(id);
        vm.expectRevert(ThroneRegistry.ReignTooYoung.selector);
        registry.openChallenge{value: 0.01 ether}(TICKER, carol);
    }

    function testWindowAndTimelockExactBoundaries() public {
        uint256 id = _open();
        vm.expectRevert(ThroneRegistry.ZeroStake.selector);
        registry.stake(id, ThroneRegistry.Side.Challenger);
        uint256 end = registry.challenges(id).votingEnds;
        vm.warp(end - 1);
        _stake(id, bob, ThroneRegistry.Side.Challenger, 0.04 ether);
        vm.warp(end);
        vm.expectRevert(ThroneRegistry.VotingClosed.selector);
        registry.stake{value: 1}(id, ThroneRegistry.Side.Reigning);
        vm.expectRevert(ThroneRegistry.TooEarly.selector);
        registry.finalize(id);
        vm.warp(end + 24 hours - 1);
        vm.expectRevert(ThroneRegistry.TooEarly.selector);
        registry.finalize(id);
        vm.warp(end + 24 hours);
        registry.finalize(id);
        vm.expectRevert(ThroneRegistry.AlreadyFinalized.selector);
        registry.finalize(id);
    }

    function testQuorumExactlyWinsAndTokenNeverChanges() public {
        address original = registry.token(TICKER);
        uint256 id = _open();
        _stake(id, bob, ThroneRegistry.Side.Challenger, 0.04 ether);
        _finalize(id);
        assertTrue(registry.challenges(id).challengerWon);
        assertEq(registry.beneficiary(TICKER), bob);
        assertEq(registry.controller(TICKER), bob);
        assertEq(abi.encode(registry.token(TICKER)), abi.encode(original));
        assertEq(registry.reignCount(TICKER), 2);
        (address who, uint256 from, uint256 to, ThroneRegistry.EndReason ended) = registry.reigns(TICKER, 0);
        assertEq(who, alice);
        assertLt(from, to);
        assertEq(to, block.timestamp);
        assertEq(uint256(ended), uint256(ThroneRegistry.EndReason.Dethroned));
        (who, from, to, ended) = registry.reigns(TICKER, 1);
        assertEq(who, bob);
        assertEq(from, block.timestamp);
        assertEq(to, 0);
        assertEq(uint256(ended), 0);
        assertEq(_claim(id, bob), 0.05 ether);
    }

    function testBelowQuorumFailsEvenWithMajorityAndNoDefenders() public {
        uint256 id = _open();
        _stake(id, bob, ThroneRegistry.Side.Challenger, 0.04 ether - 1);
        _finalize(id);
        assertFalse(registry.challenges(id).challengerWon);
        assertEq(registry.beneficiary(TICKER), alice);
        uint256 total = 0.05 ether - 1;
        assertEq(registry.treasuryOwed(), total / 5);
        assertEq(registry.claimable(id, bob), total - total / 5);
        _claim(id, bob);
        registry.claimTreasury();
        assertEq(address(registry).balance, 0);
    }

    function testTieFailsAndCooldownStartsAtFinalization() public {
        uint256 id = _open();
        _stake(id, bob, ThroneRegistry.Side.Challenger, 0.02 ether);
        _stake(id, alice, ThroneRegistry.Side.Reigning, 0.03 ether);
        _finalize(id);
        assertFalse(registry.challenges(id).challengerWon);
        assertEq(registry.reignCount(TICKER), 1);
        assertEq(registry.claimable(id, alice), 0.033 ether);
        assertEq(registry.claimable(id, bob), 0.024 ether);
        assertEq(registry.treasuryOwed(), 0.003 ether);
        uint256 cooldown = registry.tickerState(TICKER).cooldownUntil;
        assertEq(cooldown, block.timestamp + 3 days);
        vm.warp(cooldown - 1);
        vm.expectRevert(ThroneRegistry.CooldownActive.selector);
        registry.openChallenge{value: 0.01 ether}(TICKER, bob);
        vm.warp(cooldown);
        _open();
    }

    function testExactSlashSplitAndWinnerRewards() public {
        uint256 id = _open();
        _stake(id, bob, ThroneRegistry.Side.Challenger, 0.01 ether);
        _stake(id, carol, ThroneRegistry.Side.Challenger, 0.04 ether);
        _stake(id, alice, ThroneRegistry.Side.Reigning, 0.03 ether);
        _finalize(id);
        assertEq(registry.claimable(id, alice), 0.024 ether);
        assertEq(registry.claimable(id, bob), 0.021 ether);
        assertEq(registry.claimable(id, carol), 0.042 ether);
        assertEq(registry.treasuryOwed(), 0.003 ether);
        assertEq(_claim(id, alice) + _claim(id, bob) + _claim(id, carol), 0.087 ether);
        uint256 before = registry.TREASURY().balance;
        registry.claimTreasury();
        assertEq(registry.TREASURY().balance - before, 0.003 ether);
        assertEq(address(registry).balance, 0);
        vm.expectRevert(ThroneRegistry.NothingToClaim.selector);
        vm.prank(bob);
        registry.claimStake(id);
    }

    function testBothSidesSingleWalletAndClaimsDuringLaterChallenge() public {
        uint256 id = _open();
        _stake(id, bob, ThroneRegistry.Side.Challenger, 0.05 ether);
        _stake(id, bob, ThroneRegistry.Side.Reigning, 0.02 ether);
        _finalize(id);
        registry.openChallenge{value: 0.01 ether}(TICKER, carol);
        assertEq(_claim(id, bob), 0.078 ether);
        assertEq(registry.treasuryOwed(), 0.002 ether);
        assertEq(registry.tickerStakeTotals(TICKER, ThroneRegistry.Side.Challenger), 0.07 ether);
    }

    function testClaimsCannotPrecedeFinalizationAndUnknownWalletCannotClaim() public {
        uint256 id = _open();
        vm.expectRevert(ThroneRegistry.NotFinalized.selector);
        registry.claimStake(id);
        _finalize(id);
        vm.expectRevert(ThroneRegistry.NothingToClaim.selector);
        registry.claimStake(id);
        assertEq(registry.claimable(id, dave), 0);
    }

    function testRejectingAndReentrantStakerCannotBlockResolutionOrOthers() public {
        RegistryReceiver receiver = new RegistryReceiver(registry);
        vm.deal(address(receiver), 1 ether);
        uint256 id = _open();
        _stake(id, address(receiver), ThroneRegistry.Side.Reigning, 0.06 ether);
        receiver.configure(id, true);
        _finalize(id);
        uint256 owed = registry.claimable(id, address(receiver));
        vm.expectRevert(ThroneRegistry.TransferFailed.selector);
        receiver.claim();
        assertEq(registry.claimable(id, address(receiver)), owed);
        _claim(id, bob);
        receiver.configure(id, false);
        receiver.claim();
        assertFalse(receiver.reentered());
        assertEq(registry.claimable(id, address(receiver)), 0);
    }

    function testTreasuryCanClaimBeforeStakersAndCannotRedirectFunds() public {
        uint256 id = _open();
        _stake(id, alice, ThroneRegistry.Side.Reigning, 0.06 ether);
        _finalize(id);
        uint256 amount = registry.treasuryOwed();
        uint256 before = registry.TREASURY().balance;
        uint256 outsider = dave.balance;
        vm.prank(dave);
        registry.claimTreasury();
        assertEq(dave.balance, outsider);
        assertEq(registry.TREASURY().balance - before, amount);
        _claim(id, alice);
        _claim(id, bob);
        assertEq(address(registry).balance, 0);
    }

    function testRejectingTreasuryCannotBlockFinalizationOrStakerClaims() public {
        // Reverting receive bytecode is installed only in this isolated test.
        vm.etch(registry.TREASURY(), hex"60006000fd");
        uint256 id = _open();
        _stake(id, alice, ThroneRegistry.Side.Reigning, 0.06 ether);
        _finalize(id);
        uint256 amount = registry.treasuryOwed();
        vm.expectRevert(ThroneRegistry.TransferFailed.selector);
        registry.claimTreasury();
        assertEq(registry.treasuryOwed(), amount);
        _claim(id, bob);
        _claim(id, alice);
        assertEq(address(registry).balance, amount);
    }

    function testFuzzConservationRoundingAndClaimOrder(uint96 l1, uint96 l2, bool reverse) public {
        uint256 a = bound(uint256(l1), 1, 1 ether);
        uint256 b = bound(uint256(l2), 1, 1 ether);
        uint256 id = _open();
        _stake(id, carol, ThroneRegistry.Side.Challenger, a + b + 0.05 ether);
        _stake(id, alice, ThroneRegistry.Side.Reigning, a);
        _stake(id, dave, ThroneRegistry.Side.Reigning, b);
        _finalize(id);
        uint256 losers = a + b;
        uint256 slash = losers / 5;
        uint256 winners = losers + 0.06 ether;
        assertEq(registry.claimable(id, alice), a * (losers - slash) / losers);
        assertEq(registry.claimable(id, dave), b * (losers - slash) / losers);
        assertEq(registry.claimable(id, bob), 0.01 ether + 0.01 ether * (slash / 2) / winners);
        uint256 paid;
        if (reverse) {
            paid = _claim(id, dave) + _claim(id, carol) + _claim(id, bob) + _claim(id, alice);
        } else {
            paid = _claim(id, alice) + _claim(id, bob) + _claim(id, carol) + _claim(id, dave);
        }
        uint256 treasury = registry.treasuryOwed();
        if (treasury != 0) registry.claimTreasury();
        assertEq(paid + treasury, losers + winners);
        assertEq(address(registry).balance, 0);
    }
}
