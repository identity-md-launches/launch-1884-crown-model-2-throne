// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {HookFixture} from "./helpers/HookFixture.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {ThroneRegistry} from "../src/ThroneRegistry.sol";
import {CrownHook, IThroneRegistry} from "../src/CrownHook.sol";

/// @dev A beneficiary that cannot receive ETH at all.
contract NoReceive {
    function claim(CrownHook hook, Currency currency) external {
        hook.claim(currency);
    }
}

/// @dev Tries to drive the hook's unlockCallback with forged data from inside its own unlock.
contract CallbackForger is IUnlockCallback {
    IPoolManager immutable manager;
    CrownHook immutable hook;
    bytes public lastError;

    constructor(IPoolManager m, CrownHook h) {
        manager = m;
        hook = h;
    }

    function attempt(Currency currency, uint256 amount) external {
        manager.unlock(abi.encode(currency, amount));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory err) =
            address(hook).call(abi.encodeCall(IUnlockCallback.unlockCallback, (data)));
        require(!ok, "forged callback accepted");
        lastError = err;
        return "";
    }
}

/// @notice claim() correctness, double-claim safety and the failure paths around payment.
contract CrownHookClaimsTest is HookFixture {
    function testDoubleClaimIsRefusedOnEveryPath() public {
        _swap(true, -1 ether); // fee in token
        _swap(false, -1 ether); // fee in ETH
        uint256 tokenOwed = hook.crownOwed(payer, throne);
        uint256 ethOwed = hook.crownOwed(payer, ETH);
        assertGt(tokenOwed, 0);
        assertGt(ethOwed, 0);

        vm.startPrank(payer);
        assertEq(hook.claim(throne), tokenOwed);
        vm.expectRevert(CrownHook.NothingToClaim.selector);
        hook.claim(throne);
        vm.expectRevert(CrownHook.NothingToClaim.selector);
        hook.claim(TICKER, throne);
        // The other currency is untouched by the first claim and can be claimed through the bounded path.
        assertEq(hook.crownOwed(payer, ETH), ethOwed);
        assertEq(hook.claim(TICKER, ETH), ethOwed);
        vm.expectRevert(CrownHook.NothingToClaim.selector);
        hook.claim(TICKER, ETH);
        vm.expectRevert(CrownHook.NothingToClaim.selector);
        hook.claim(ETH);
        vm.stopPrank();

        assertEq(manager.balanceOf(address(hook), 0), 0);
        assertEq(manager.balanceOf(address(hook), uint160(address(token))), 0);
        assertEq(hook.crownOwed(payer, ETH), 0);
        assertEq(hook.crownOwed(payer, throne), 0);
        assertEq(hook.pendingTickers(payer, ETH).length, 0);
        assertEq(hook.pendingTickers(payer, throne).length, 0);
        _assertSettled();
    }

    function testClaimByWrongTickerOrStrangerTakesNothing() public {
        _swap(false, -1 ether);
        uint256 owed = hook.crownOwed(payer, ETH);
        vm.prank(payer);
        vm.expectRevert(CrownHook.NothingToClaim.selector);
        hook.claim(keccak256("OTHER"), ETH);
        vm.prank(candidate);
        vm.expectRevert(CrownHook.NothingToClaim.selector);
        hook.claim(TICKER, ETH);
        vm.prank(candidate);
        vm.expectRevert(CrownHook.NothingToClaim.selector);
        hook.claim(ETH);
        assertEq(hook.crownOwed(payer, ETH), owed);
        assertEq(manager.balanceOf(address(hook), 0), owed);
    }

    function testFormerBeneficiaryKeepsAccruedFeesAfterDethrone() public {
        _swap(false, -1 ether);
        uint256 oldOwed = hook.crownOwed(payer, ETH);
        _flip(candidate);
        _swap(false, -1 ether);
        assertEq(hook.crownOwed(payer, ETH), oldOwed, "old beneficiary's accrual changed by dethrone");
        assertGt(hook.crownOwed(candidate, ETH), 0, "no accrual to new beneficiary");
        uint256 before = payer.balance;
        vm.prank(payer);
        hook.claim(ETH);
        assertEq(payer.balance - before, oldOwed);
        assertEq(manager.balanceOf(address(hook), 0), hook.crownOwed(candidate, ETH));
        _assertSettled();
    }

    function testBeneficiaryWithoutReceiveCannotClaimEthButTokenAndOthersUnaffected() public {
        NoReceive stuck = new NoReceive();
        _flip(address(stuck));
        _swap(false, -1 ether); // ETH fee
        _swap(true, -1 ether); // token fee
        uint256 ethOwed = hook.crownOwed(address(stuck), ETH);
        uint256 tokenOwed = hook.crownOwed(address(stuck), throne);
        assertGt(ethOwed, 0);
        vm.expectRevert();
        stuck.claim(hook, ETH);
        // The failed payment rolled back completely: nothing burned, nothing zeroed.
        assertEq(hook.crownOwed(address(stuck), ETH), ethOwed);
        assertEq(manager.balanceOf(address(hook), 0), ethOwed);
        assertEq(hook.crownClaimed(TICKER, ETH), 0);
        stuck.claim(hook, throne);
        assertEq(token.balanceOf(address(stuck)), tokenOwed);
        assertEq(hook.crownOwed(address(stuck), throne), 0);
        _swap(false, -1 ether);
        assertGt(hook.crownOwed(address(stuck), ETH), ethOwed, "swaps stopped accruing");
        _assertSettled();
    }

    function testHookRefusesDirectEthAndForgedCallbacks() public {
        vm.deal(trader, 1 ether);
        vm.prank(trader);
        (bool ok,) = address(hook).call{value: 1}("");
        assertFalse(ok, "hook accepted ETH from a non-manager");
        assertEq(address(hook).balance, 0);

        _swap(false, -1 ether);
        uint256 owed = hook.crownOwed(payer, ETH);
        CallbackForger forger = new CallbackForger(manager, hook);
        forger.attempt(ETH, owed);
        assertEq(bytes4(forger.lastError()), CrownHook.OnlyPoolManager.selector);
        assertEq(manager.balanceOf(address(hook), 0), owed, "forged callback moved claims");
        assertEq(hook.crownOwed(payer, ETH), owed);
        _assertSettled();
    }

    function testSwapWhileChallengeLiveAccruesToReigningBeneficiaryUntilFinalized() public {
        vm.prank(candidate);
        uint256 id = registry.openChallenge{value: 0.01 ether}(TICKER, candidate);
        vm.prank(candidate);
        registry.stake{value: 0.05 ether}(id, ThroneRegistry.Side.Challenger);
        _swap(true, -1 ether);
        uint256 duringVote = hook.crownOwed(payer, throne);
        assertGt(duringVote, 0);
        assertEq(hook.crownOwed(candidate, throne), 0, "candidate accrued before winning");
        vm.warp(registry.challenges(id).votingEnds + 1);
        _swap(true, -1 ether);
        assertGt(hook.crownOwed(payer, throne), duringVote, "reigning stopped accruing during timelock");
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
        uint256 afterFinalize = hook.crownOwed(payer, throne);
        _swap(true, -1 ether);
        assertEq(hook.crownOwed(payer, throne), afterFinalize, "old beneficiary accrued after dethrone");
        assertGt(hook.crownOwed(candidate, throne), 0);
        _assertSettled();
    }

    function testExactOutputChargesInputSideAndSettles() public {
        uint256 traderEthBefore = trader.balance;
        uint256 traderTokenBefore = token.balanceOf(trader);
        _swap(true, 1 ether); // exact output of 1 token, paid in ETH: fee on ETH input
        assertEq(token.balanceOf(trader) - traderTokenBefore, 1 ether, "exact output not honoured");
        uint256 ethFee = hook.crownOwed(payer, ETH);
        assertGt(ethFee, 0, "no fee on exact-output input side");
        assertEq(hook.crownOwed(payer, throne), 0, "fee charged on the specified side");
        // Trader paid the raw input plus the hook's cut; the cut equals 1% of the raw input.
        uint256 paidEth = traderEthBefore - trader.balance;
        assertEq(ethFee, (paidEth - ethFee) / 100);
        assertEq(manager.balanceOf(address(hook), 0), ethFee);
        _assertSettled();
    }

    function testRegistrationRejectsForeignPoolShapes() public {
        vm.startPrank(payer);
        PoolKey memory wrongOrder = key;
        wrongOrder.currency0 = throne;
        wrongOrder.currency1 = ETH;
        vm.expectRevert(CrownHook.InvalidPool.selector);
        hook.registerPool(wrongOrder, keccak256("NEW"), PRICE);
        PoolKey memory noToken = key;
        noToken.currency1 = Currency.wrap(address(0x1234));
        vm.expectRevert(CrownHook.InvalidPool.selector);
        hook.registerPool(noToken, keccak256("NEW"), PRICE);
        vm.expectRevert(CrownHook.InvalidPool.selector);
        hook.registerPool(key, TICKER, 0);
        vm.expectRevert(CrownHook.InvalidPool.selector);
        hook.registerPool(key, bytes32(0), PRICE);
        // Same ticker, different fee tier: the canonical pool is already bound.
        PoolKey memory otherTier = key;
        otherTier.fee = 500;
        otherTier.tickSpacing = 10;
        vm.expectRevert(CrownHook.PoolAlreadyRegistered.selector);
        hook.registerPool(otherTier, TICKER, PRICE);
        vm.stopPrank();
        // An unregistered key with this hook cannot be initialized by anyone, including the deployer.
        vm.prank(payer);
        vm.expectRevert();
        manager.initialize(otherTier, PRICE);
    }

    function testConstructorRejectsZeroAddresses() public {
        vm.expectRevert(CrownHook.InvalidAddress.selector);
        new CrownHook(IThroneRegistry(address(0)), payer);
        vm.expectRevert(CrownHook.InvalidAddress.selector);
        new CrownHook(IThroneRegistry(address(registry)), address(0));
    }
}
