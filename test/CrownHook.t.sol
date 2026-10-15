// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Vm} from "forge-std/Vm.sol";
import {HookFixture} from "./helpers/HookFixture.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta, toBalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {TransientStateLibrary} from "v4-core/src/libraries/TransientStateLibrary.sol";
import {ThroneRegistry} from "../src/ThroneRegistry.sol";
import {ThroneToken} from "../src/ThroneToken.sol";
import {CrownHook, IThroneRegistry} from "../src/CrownHook.sol";

contract DebtBeneficiary is IUnlockCallback {
    IPoolManager immutable manager;
    CrownHook immutable hook;
    uint256 public received;
    bool public blocked;
    bool public reentered;
    bool public reject;

    constructor(IPoolManager m, CrownHook h) {
        manager = m;
        hook = h;
    }

    function setReject(bool value) external {
        reject = value;
    }

    function claim() external {
        hook.claim(Currency.wrap(address(0)));
    }

    function demonstrateUnsafePush() external {
        manager.unlock("");
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        require(msg.sender == address(manager), "manager");
        manager.take(Currency.wrap(address(0)), address(this), 1);
        manager.settle{value: 1}();
        return "";
    }

    receive() external payable {
        require(!reject, "reject");
        received += msg.value;
        // When called inside an unlock this leaves debt and causes CurrencyNotSettled at unlock end.
        try manager.mint(address(this), 0, 1) {}
        catch {
            blocked = true;
        }
        try hook.claim(Currency.wrap(address(0))) {
            reentered = true;
        } catch {}
    }
}

contract ClaimWhileUnlocked is IUnlockCallback {
    IPoolManager immutable manager;
    CrownHook immutable hook;
    bool public refused;

    constructor(IPoolManager m, CrownHook h) {
        manager = m;
        hook = h;
    }

    function attempt() external {
        manager.unlock("");
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        require(msg.sender == address(manager), "manager");
        try hook.claim(Currency.wrap(address(0))) {}
        catch {
            refused = true;
        }
        return "";
    }
}

contract CrownHookTest is HookFixture {
    using PoolIdLibrary for PoolKey;
    using TransientStateLibrary for IPoolManager;
    bytes32 constant SWAP_EVENT =
        keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

    function _rawSwap(Vm.Log[] memory logs) internal view returns (int128 a0, int128 a1) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(manager) && logs[i].topics[0] == SWAP_EVENT) {
                (a0, a1,,,,) = abi.decode(logs[i].data, (int128, int128, uint160, uint128, int24, uint24));
                return (a0, a1);
            }
        }
        revert("missing PoolManager Swap event");
    }

    function _extraPool(bytes32 ticker, uint16 bps) internal returns (PoolKey memory extraKey) {
        ThroneToken extraToken = new ThroneToken(payer, 1_000_000_000 ether);
        registry.registerTicker(ticker, address(extraToken), payer);
        extraKey = PoolKey(ETH, Currency.wrap(address(extraToken)), 3000, 60, IHooks(address(hook)));
        vm.startPrank(payer);
        hook.registerPool(extraKey, ticker, bps, PRICE);
        manager.initialize(extraKey, PRICE);
        extraToken.approve(address(router), 100 ether);
        router.liquidity{value: 101 ether}(
            extraKey, IPoolManager.ModifyLiquidityParams(-887220, 887220, 100 ether, 0)
        );
        extraToken.transfer(trader, 10 ether);
        vm.stopPrank();
        vm.prank(trader);
        extraToken.approve(address(router), 10 ether);
    }

    function testPermissionsCanonicalPoolAndImmutableSettings() public {
        assertEq(uint160(address(hook)) & 0x3fff, 0x1044);
        assertTrue(hook.getHookPermissions().afterInitialize);
        assertTrue(hook.getHookPermissions().afterSwap);
        assertTrue(hook.getHookPermissions().afterSwapReturnDelta);
        assertFalse(hook.getHookPermissions().beforeSwap);
        assertEq(hook.poolTicker(key.toId()), TICKER);
        assertEq(PoolId.unwrap(hook.canonicalPool(TICKER)), PoolId.unwrap(key.toId()));
        (, uint16 bps,, bool initialized) = hook.poolConfig(key.toId());
        assertEq(bps, 100);
        assertTrue(initialized);
        vm.prank(payer);
        vm.expectRevert(CrownHook.PoolAlreadyRegistered.selector);
        hook.registerPool(key, TICKER, 500, PRICE);
        vm.prank(payer);
        vm.expectRevert(CrownHook.AlreadyConfigured.selector);
        hook.configurePoolManager(manager);
    }

    function testCallbacksAndConfigurationRejectUnauthorizedCalls() public {
        vm.expectRevert(CrownHook.OnlyPoolManager.selector);
        hook.afterSwap(trader, key, IPoolManager.SwapParams(true, -1, PRICE), toBalanceDelta(-1, 1), "");
        vm.expectRevert(CrownHook.OnlyPoolManager.selector);
        hook.afterInitialize(payer, key, PRICE, 0);
        vm.expectRevert(CrownHook.OnlyPoolManager.selector);
        hook.unlockCallback(abi.encode(ETH, 1));
        vm.prank(address(manager));
        vm.expectRevert(CrownHook.UnexpectedCallback.selector);
        hook.unlockCallback(abi.encode(ETH, 1));
        vm.expectRevert(CrownHook.OnlyDeployer.selector);
        hook.registerPool(key, TICKER, PRICE);
        vm.expectRevert(CrownHook.OnlyDeployer.selector);
        hook.configurePoolManager(manager);
    }

    function testUnconfiguredManagerAndInvalidPoolSettings() public {
        CrownHook fresh = _deployHook(IThroneRegistry(address(registry)));
        vm.startPrank(payer);
        vm.expectRevert(CrownHook.NotConfigured.selector);
        fresh.registerPool(key, TICKER, PRICE);
        vm.expectRevert(CrownHook.InvalidAddress.selector);
        fresh.configurePoolManager(IPoolManager(trader));
        fresh.configurePoolManager(manager);
        vm.expectRevert(CrownHook.FeeOutOfRange.selector);
        fresh.registerPool(key, TICKER, 501, PRICE);
        vm.expectRevert(CrownHook.InvalidPool.selector);
        fresh.registerPool(key, TICKER, PRICE);
        PoolKey memory freshKey = key;
        freshKey.hooks = IHooks(address(fresh));
        vm.expectRevert(CrownHook.InvalidPool.selector);
        fresh.registerPool(freshKey, keccak256("MISSING"), PRICE);
        fresh.registerPool(freshKey, TICKER, 0, PRICE);
        vm.stopPrank();
        vm.expectRevert();
        manager.initialize(freshKey, PRICE);
        vm.prank(payer);
        vm.expectRevert();
        manager.initialize(freshKey, PRICE + 1);
        vm.prank(payer);
        manager.initialize(freshKey, PRICE);
        assertEq(fresh.poolTicker(freshKey.toId()), TICKER);
    }

    function testMaliciousBeneficiaryCannotBreakSwapAndCanClaimWhenLocked() public {
        DebtBeneficiary malicious = new DebtBeneficiary(manager, hook);
        _flip(address(malicious));
        // Prove this attacker really can make an otherwise balanced unlock fail if paid mid-unlock.
        vm.expectRevert(IPoolManager.CurrencyNotSettled.selector);
        malicious.demonstrateUnsafePush();
        _swap(false, -1 ether); // token -> native ETH, fee in native currency
        uint256 amount = hook.crownOwed(address(malicious), ETH);
        assertGt(amount, 0);
        assertEq(malicious.received(), 0);
        assertEq(manager.balanceOf(address(hook), 0), amount);
        _assertSettled();
        uint256 before = address(malicious).balance;
        malicious.claim();
        assertEq(address(malicious).balance - before, amount);
        assertEq(malicious.received(), amount);
        assertTrue(malicious.blocked());
        assertFalse(malicious.reentered());
        assertEq(hook.crownOwed(address(malicious), ETH), 0);
        assertEq(manager.balanceOf(address(hook), 0), 0);
        assertEq(hook.crownClaimed(TICKER, ETH), amount);
        _assertSettled();
    }

    function testRejectedClaimRollsBackOnlyClaimAndSwapsContinue() public {
        DebtBeneficiary malicious = new DebtBeneficiary(manager, hook);
        _flip(address(malicious));
        malicious.setReject(true);
        _swap(false, -1 ether);
        uint256 owed = hook.crownOwed(address(malicious), ETH);
        vm.expectRevert();
        malicious.claim();
        assertEq(hook.crownOwed(address(malicious), ETH), owed);
        assertEq(hook.crownClaimed(TICKER, ETH), 0);
        assertEq(manager.balanceOf(address(hook), 0), owed);
        _swap(false, -1 ether);
        assertGt(hook.crownOwed(address(malicious), ETH), owed);
        malicious.setReject(false);
        malicious.claim();
        _assertSettled();
    }

    function testRegistryReadFailuresSkipFeesAndNeverBreakSwaps() public {
        bytes memory callData = abi.encodeCall(IThroneRegistry.beneficiary, (TICKER));
        vm.mockCallRevert(address(registry), callData, "broken registry");
        _swap(true, -1 ether);
        vm.clearMockedCalls();
        vm.mockCall(address(registry), callData, abi.encode(uint256(1) << 200));
        _swap(true, -1 ether);
        vm.clearMockedCalls();
        vm.mockCall(address(registry), callData, hex"01");
        _swap(true, -1 ether);
        vm.clearMockedCalls();
        vm.mockCall(address(registry), callData, abi.encode(address(0)));
        _swap(true, -1 ether);
        vm.clearMockedCalls();
        vm.mockCall(address(registry), callData, new bytes(4096));
        _swap(true, -1 ether);
        vm.clearMockedCalls();
        assertEq(hook.crownPaid(TICKER, throne), 0);
        assertEq(manager.balanceOf(address(hook), uint160(address(token))), 0);
        _swap(true, -1 ether);
        assertGt(hook.crownPaid(TICKER, throne), 0);
        _assertSettled();
    }

    function testRegistryGasExhaustionSkipsFee() public {
        // JUMPDEST PUSH1(0) JUMP: the bounded STATICCALL exhausts its own allowance only.
        vm.etch(address(registry), hex"5b600056");
        _swap(true, -1 ether);
        assertEq(hook.crownPaid(TICKER, throne), 0);
        _assertSettled();
    }

    function testNativeAndTokenClaimsAreExactAndIndependentDuringLiveChallenge() public {
        _swap(true, -1 ether);
        _swap(false, -1 ether);
        vm.prank(candidate);
        registry.openChallenge{value: 0.01 ether}(TICKER, candidate);
        uint256 tokenOwed = hook.crownOwed(payer, throne);
        uint256 ethOwed = hook.crownOwed(payer, ETH);
        uint256 before = token.balanceOf(payer);
        vm.prank(payer);
        hook.claim(throne);
        assertEq(token.balanceOf(payer) - before, tokenOwed);
        assertEq(hook.crownOwed(payer, ETH), ethOwed);
        before = payer.balance;
        vm.prank(payer);
        hook.claim(TICKER, ETH);
        assertEq(payer.balance - before, ethOwed);
        assertEq(hook.crownPaid(TICKER, ETH), hook.crownClaimed(TICKER, ETH));
        assertEq(hook.crownPaid(TICKER, throne), hook.crownClaimed(TICKER, throne));
        assertEq(hook.pendingTickers(payer, ETH).length, 0);
        assertEq(hook.pendingTickers(payer, throne).length, 0);
        vm.prank(payer);
        vm.expectRevert(CrownHook.NothingToClaim.selector);
        hook.claim(throne);
        vm.prank(trader);
        vm.expectRevert(CrownHook.NothingToClaim.selector);
        hook.claim(ETH);
        _swap(false, -1 ether);
        assertEq(hook.pendingTickers(payer, ETH).length, 1);
        _assertSettled();
    }

    function testClaimsAcrossMultipleTickersAndBoundedClaimRemoval() public {
        bytes32 second = keccak256("SECOND");
        PoolKey memory extra = _extraPool(second, 100);
        _swap(false, -1 ether);
        uint256 firstFee = hook.crownOwed(payer, ETH);
        vm.prank(trader);
        router.swap(extra, IPoolManager.SwapParams(false, -1 ether, TickMath.MAX_SQRT_PRICE - 1));
        uint256 secondFee = hook.owedByTicker(second, payer, ETH);
        assertEq(hook.crownOwed(payer, ETH), firstFee + secondFee);
        assertEq(hook.pendingTickers(payer, ETH).length, 2);
        vm.prank(payer);
        hook.claim(TICKER, ETH);
        assertEq(hook.crownClaimed(TICKER, ETH), firstFee);
        assertEq(hook.crownOwed(payer, ETH), secondFee);
        assertEq(hook.pendingTickers(payer, ETH)[0], second);
        _swap(false, -1 ether);
        uint256 thirdFee = hook.owedByTicker(TICKER, payer, ETH);
        uint256 before = payer.balance;
        vm.prank(payer);
        hook.claim(ETH);
        assertEq(payer.balance - before, secondFee + thirdFee);
        assertEq(hook.crownClaimed(TICKER, ETH), firstFee + thirdFee);
        assertEq(hook.crownClaimed(second, ETH), secondFee);
        assertEq(hook.pendingTickers(payer, ETH).length, 0);
        assertEq(hook.crownOwed(payer, ETH), 0);
        assertEq(manager.balanceOf(address(hook), 0), 0);
        _assertSettled();
    }

    function testZeroFeeAndMaximumFeePools() public {
        bytes32 freeTicker = keccak256("FREE");
        PoolKey memory freeKey = _extraPool(freeTicker, 0);
        vm.mockCallRevert(
            address(registry), abi.encodeCall(IThroneRegistry.beneficiary, (freeTicker)), "failure"
        );
        vm.prank(trader);
        router.swap{value: 1 ether}(
            freeKey, IPoolManager.SwapParams(true, -1 ether, TickMath.MIN_SQRT_PRICE + 1)
        );
        assertEq(hook.crownPaid(freeTicker, freeKey.currency1), 0);
        vm.clearMockedCalls();
        bytes32 maximum = keccak256("MAX");
        PoolKey memory maxKey = _extraPool(maximum, 500);
        vm.recordLogs();
        vm.prank(trader);
        router.swap{value: 1 ether}(
            maxKey, IPoolManager.SwapParams(true, -1 ether, TickMath.MIN_SQRT_PRICE + 1)
        );
        (, int128 raw1) = _rawSwap(vm.getRecordedLogs());
        assertEq(hook.crownPaid(maximum, maxKey.currency1), uint256(int256(raw1)) / 20);
        _assertSettled();
    }

    function testSubWeiCutRoundsToZeroAndSwapStillSettles() public {
        BalanceDelta delta = _swap(true, -100);
        assertGt(delta.amount1(), 0);
        assertLt(delta.amount1(), 100);
        assertEq(hook.crownPaid(TICKER, throne), 0);
        _assertSettled();
    }

    function testClaimWithinAnotherUnlockIsRefusedWithoutLosingAccrual() public {
        ClaimWhileUnlocked recipient = new ClaimWhileUnlocked(manager, hook);
        _flip(address(recipient));
        _swap(false, -1 ether);
        uint256 owed = hook.crownOwed(address(recipient), ETH);
        recipient.attempt();
        assertTrue(recipient.refused());
        assertEq(hook.crownOwed(address(recipient), ETH), owed);
        assertEq(manager.balanceOf(address(hook), 0), owed);
        assertEq(hook.crownClaimed(TICKER, ETH), 0);
        _assertSettled();
    }

    function testBuyChallengeStakeFinalizeBuyPreservesTokenPoolAndAccruals() public {
        bytes memory permanentToken = abi.encode(registry.token(TICKER));
        PoolId permanentPool = hook.canonicalPool(TICKER);
        uint256 supply = token.totalSupply();
        _swap(true, -1 ether);
        uint256 oldFees = hook.crownOwed(payer, throne);
        assertGt(oldFees, 0);
        uint256 id = _flip(candidate);
        assertTrue(registry.challenges(id).challengerWon);
        _swap(true, -1 ether);
        uint256 newFees = hook.crownOwed(candidate, throne);
        assertGt(newFees, 0);
        assertEq(hook.crownOwed(payer, throne), oldFees);
        assertEq(hook.crownPaid(TICKER, throne), oldFees + newFees);
        assertEq(manager.balanceOf(address(hook), uint160(address(token))), oldFees + newFees);
        vm.prank(payer);
        hook.claim(throne);
        assertEq(hook.crownPaid(TICKER, throne), hook.crownClaimed(TICKER, throne) + newFees);
        vm.prank(candidate);
        hook.claim(throne);
        assertEq(hook.crownClaimed(TICKER, throne), oldFees + newFees);
        assertEq(manager.balanceOf(address(hook), uint160(address(token))), 0);
        assertEq(abi.encode(registry.token(TICKER)), permanentToken);
        assertEq(PoolId.unwrap(hook.canonicalPool(TICKER)), PoolId.unwrap(permanentPool));
        assertEq(token.totalSupply(), supply);
        _assertSettled();
    }

    function testPartialFillChargesActualAmountNotRequestedAmount() public {
        vm.recordLogs();
        vm.prank(trader);
        BalanceDelta returned = router.swap{value: 10 ether}(
            key, IPoolManager.SwapParams(true, -10 ether, TickMath.getSqrtPriceAtTick(-60))
        );
        (int128 raw0, int128 raw1) = _rawSwap(vm.getRecordedLogs());
        assertGt(raw0, -10 ether);
        uint256 fee = uint256(int256(raw1)) / 100;
        assertEq(hook.crownOwed(payer, throne), fee);
        assertEq(int256(returned.amount1()), int256(raw1) - int256(fee));
        _assertSettled();
    }

    function testFuzzBothDirectionsExactInputAndOutput(uint96 amountSeed, bool direction, bool exactInput)
        public
    {
        uint256 amount = bound(uint256(amountSeed), 1000, 1 ether);
        vm.recordLogs();
        BalanceDelta returned = _swap(direction, exactInput ? -int256(amount) : int256(amount));
        (int128 raw0, int128 raw1) = _rawSwap(vm.getRecordedLogs());
        bool currency1 = exactInput == direction;
        int256 rawFeeSide = currency1 ? int256(raw1) : int256(raw0);
        uint256 fee = uint256(rawFeeSide < 0 ? -rawFeeSide : rawFeeSide) / 100;
        Currency currency = currency1 ? throne : ETH;
        assertEq(hook.crownOwed(payer, currency), fee);
        assertEq(hook.crownPaid(TICKER, currency), fee);
        assertEq(manager.balanceOf(address(hook), uint160(Currency.unwrap(currency))), fee);
        assertEq(int256(returned.amount0()), int256(raw0) - (currency1 ? int256(0) : int256(fee)));
        assertEq(int256(returned.amount1()), int256(raw1) - (currency1 ? int256(fee) : int256(0)));
        _assertSettled();
    }
}
