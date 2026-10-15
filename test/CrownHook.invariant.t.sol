// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {HookFixture} from "./helpers/HookFixture.sol";
import {HookHandler} from "./helpers/HookHandler.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {TransientStateLibrary} from "v4-core/src/libraries/TransientStateLibrary.sol";

/// @notice The hook holds value only as PoolManager ERC-6909 claims. crownOwed must be backed 1:1 after any sequence
/// of swaps, claims and dethrones, including with a hostile contract beneficiary in rotation.
/// forge-config: default.invariant.runs = 48
/// forge-config: default.invariant.depth = 40
/// forge-config: default.invariant.fail-on-revert = true
contract CrownHookInvariantTest is HookFixture {
    using PoolIdLibrary for PoolKey;
    using TransientStateLibrary for IPoolManager;

    HookHandler handler;
    PoolId permanentPool;
    uint256 supply;

    function setUp() public override {
        super.setUp();
        address[] memory eoas = new address[](2);
        eoas[0] = payer;
        eoas[1] = candidate;
        handler = new HookHandler(TICKER, registry, token, manager, hook, router, key, eoas);
        address handlerTrader = handler.trader();
        vm.prank(payer);
        token.transfer(handlerTrader, 100_000_000 ether);
        permanentPool = hook.canonicalPool(TICKER);
        supply = token.totalSupply();
        targetContract(address(handler));
    }

    function _sumOwed(Currency currency) internal view returns (uint256 sum) {
        uint256 n = handler.actorCount();
        for (uint256 i; i < n; ++i) {
            address actor = handler.actors(i);
            uint256 owed = hook.crownOwed(actor, currency);
            assertEq(owed, hook.owedByTicker(TICKER, actor, currency), "single-ticker owed mismatch");
            assertEq(hook.pendingTickers(actor, currency).length, owed == 0 ? 0 : 1, "pending tickers");
            sum += owed;
        }
    }

    /// @dev crownOwed == hook's ERC-6909 balance == lifetime accrued - lifetime claimed, per currency.
    function invariant_crownOwedBackedByClaims() public view {
        Currency[2] memory currencies = [ETH, throne];
        for (uint256 i; i < 2; ++i) {
            Currency c = currencies[i];
            uint256 claimBalance = manager.balanceOf(address(hook), uint160(Currency.unwrap(c)));
            uint256 owed = _sumOwed(c);
            assertEq(claimBalance, owed, "ERC-6909 balance != sum crownOwed");
            assertEq(hook.crownPaid(TICKER, c) - hook.crownClaimed(TICKER, c), owed, "paid - claimed != owed");
            assertEq(hook.crownPaid(TICKER, c), handler.accruedGhost(c), "accrual ghost");
            uint256 receivedTotal;
            for (uint256 a; a < handler.actorCount(); ++a) {
                receivedTotal += handler.received(handler.actors(a), c);
            }
            assertEq(hook.crownClaimed(TICKER, c), receivedTotal, "claimed != received by beneficiaries");
        }
    }

    /// @dev The manager really holds the assets behind the claims, and nothing is stranded in hook or router.
    function invariant_assetsBackClaimsAndNothingStranded() public view {
        assertGe(address(manager).balance, manager.balanceOf(address(hook), 0), "manager ETH < hook claims");
        assertGe(
            token.balanceOf(address(manager)),
            manager.balanceOf(address(hook), uint160(address(token))),
            "manager tokens < hook claims"
        );
        assertEq(address(hook).balance, 0, "ETH stranded in hook");
        assertEq(token.balanceOf(address(hook)), 0, "tokens stranded in hook");
        assertEq(address(router).balance, 0, "ETH stranded in router");
        assertEq(token.balanceOf(address(router)), 0, "tokens stranded in router");
        assertFalse(manager.isUnlocked(), "manager left unlocked");
        assertEq(manager.getNonzeroDeltaCount(), 0, "unsettled deltas");
    }

    /// @dev A hostile beneficiary can neither leave debt during payment nor re-enter.
    function invariant_hostileBeneficiaryContained() public view {
        assertEq(handler.hostile().mintSucceeded(), 0, "hostile beneficiary left PoolManager debt");
        assertEq(handler.hostile().reentrySucceeded(), 0, "hostile beneficiary re-entered claim");
    }

    /// @dev Dethrones change only the beneficiary: token, pool, fee and supply are permanent.
    function invariant_tokenPoolAndFeePermanent() public view {
        assertEq(abi.encode(registry.token(TICKER)), abi.encode(address(token)), "token changed");
        assertEq(PoolId.unwrap(hook.canonicalPool(TICKER)), PoolId.unwrap(permanentPool), "pool changed");
        assertEq(hook.poolTicker(key.toId()), TICKER, "pool ticker");
        (bytes32 t, uint16 bps, uint160 price, bool initialized) = hook.poolConfig(key.toId());
        assertEq(t, TICKER);
        assertEq(bps, 100, "fee changed");
        assertEq(price, PRICE);
        assertTrue(initialized);
        assertEq(token.totalSupply(), supply, "supply changed");
        assertEq(address(hook.poolManager()), address(manager), "manager changed");
    }
}
