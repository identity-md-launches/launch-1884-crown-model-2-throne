// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";
import {Vm} from "forge-std/Vm.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {ThroneRegistry} from "../../src/ThroneRegistry.sol";
import {ThroneToken} from "../../src/ThroneToken.sol";
import {CrownHook} from "../../src/CrownHook.sol";
import {DemoRouter} from "./DemoRouter.sol";

/// @dev A beneficiary that, whenever it is paid, tries to leave PoolManager debt and to re-enter claim().
contract HostileBeneficiary {
    IPoolManager immutable manager;
    CrownHook immutable hook;
    uint256 public mintSucceeded;
    uint256 public reentrySucceeded;
    uint256 public payments;

    constructor(IPoolManager m, CrownHook h) {
        manager = m;
        hook = h;
    }

    receive() external payable {
        payments += 1;
        try manager.mint(address(this), 0, 1) {
            mintSucceeded += 1;
        } catch {}
        try manager.take(Currency.wrap(address(0)), address(this), 1) {
            mintSucceeded += 1;
        } catch {}
        try hook.claim(Currency.wrap(address(0))) {
            reentrySucceeded += 1;
        } catch {}
        try hook.claim(keccak256("THRONE"), Currency.wrap(address(0))) {
            reentrySucceeded += 1;
        } catch {}
    }
}

/// @dev Random swaps in both directions and modes, claims by every beneficiary, and dethrones in between.
contract HookHandler is CommonBase, StdCheats, StdUtils, StdAssertions {
    bytes32 constant SWAP_EVENT =
        keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
    bytes32 public immutable ticker;
    ThroneRegistry public immutable registry;
    ThroneToken public immutable token;
    IPoolManager public immutable manager;
    CrownHook public immutable hook;
    DemoRouter public immutable router;
    HostileBeneficiary public immutable hostile;
    PoolKey key;
    address public immutable trader;
    address public immutable voter;
    address[] public actors;

    uint256 public swaps;
    uint256 public claims;
    uint256 public flips;
    uint256 public feesAccrued;
    mapping(address => mapping(Currency => uint256)) public received;
    mapping(Currency => uint256) public accruedGhost;

    constructor(
        bytes32 ticker_,
        ThroneRegistry registry_,
        ThroneToken token_,
        IPoolManager manager_,
        CrownHook hook_,
        DemoRouter router_,
        PoolKey memory key_,
        address[] memory eoas
    ) {
        ticker = ticker_;
        registry = registry_;
        token = token_;
        manager = manager_;
        hook = hook_;
        router = router_;
        key = key_;
        hostile = new HostileBeneficiary(manager_, hook_);
        for (uint256 i; i < eoas.length; ++i) {
            actors.push(eoas[i]);
        }
        actors.push(address(hostile));
        trader = makeAddr("handler trader");
        voter = makeAddr("handler voter");
        vm.deal(trader, 1_000_000_000 ether);
        vm.deal(voter, 1_000_000 ether);
        vm.prank(trader);
        token_.approve(address(router_), type(uint256).max);
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _currency(bool eth) internal view returns (Currency) {
        return eth ? key.currency0 : key.currency1;
    }

    function _rawSwap(Vm.Log[] memory logs) internal view returns (int128 a0, int128 a1) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(manager) && logs[i].topics[0] == SWAP_EVENT) {
                (a0, a1,,,,) = abi.decode(logs[i].data, (int128, int128, uint160, uint128, int24, uint24));
                return (a0, a1);
            }
        }
        revert("missing PoolManager Swap event");
    }

    /// @dev Swaps never revert for any bounded input: a CurrencyNotSettled here fails the run.
    function swap(bool zeroForOne, bool exactInput, uint256 amountSeed) external {
        uint256 amount = bound(amountSeed, 1, exactInput ? 1 ether : 0.2 ether);
        bool feeOnCurrency1 = exactInput == zeroForOne;
        Currency feeCurrency = feeOnCurrency1 ? key.currency1 : key.currency0;
        address beneficiary = registry.beneficiary(ticker);
        uint256 owedBefore = hook.crownOwed(beneficiary, feeCurrency);
        uint256 paidBefore = hook.crownPaid(ticker, feeCurrency);
        uint256 claimBefore = manager.balanceOf(address(hook), uint160(Currency.unwrap(feeCurrency)));
        vm.recordLogs();
        vm.prank(trader);
        BalanceDelta returned = router.swap{value: zeroForOne ? 1000 ether : 0}(
            key,
            IPoolManager.SwapParams(
                zeroForOne,
                exactInput ? -int256(amount) : int256(amount),
                zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            )
        );
        (int128 raw0, int128 raw1) = _rawSwap(vm.getRecordedLogs());
        int256 rawFee = feeOnCurrency1 ? int256(raw1) : int256(raw0);
        uint256 fee = uint256(rawFee < 0 ? -rawFee : rawFee) / 100;
        assertEq(
            hook.crownOwed(beneficiary, feeCurrency) - owedBefore, fee, "fee not credited to beneficiary"
        );
        assertEq(hook.crownPaid(ticker, feeCurrency) - paidBefore, fee, "crownPaid not increased by fee");
        assertEq(
            manager.balanceOf(address(hook), uint160(Currency.unwrap(feeCurrency))) - claimBefore,
            fee,
            "ERC-6909 claim not minted for fee"
        );
        assertEq(
            int256(returned.amount0()), int256(raw0) - (feeOnCurrency1 ? int256(0) : int256(fee)), "amount0"
        );
        assertEq(
            int256(returned.amount1()), int256(raw1) - (feeOnCurrency1 ? int256(fee) : int256(0)), "amount1"
        );
        accruedGhost[feeCurrency] += fee;
        feesAccrued += fee;
        swaps += 1;
    }

    function claimAll(uint256 actorSeed, bool eth) external {
        _claim(_actor(actorSeed), _currency(eth), false);
    }

    function claimTicker(uint256 actorSeed, bool eth) external {
        _claim(_actor(actorSeed), _currency(eth), true);
    }

    function _claim(address actor, Currency currency, bool byTicker) internal {
        uint256 owed = hook.crownOwed(actor, currency);
        uint256 balanceBefore = _balance(actor, currency);
        uint256 claimBefore = manager.balanceOf(address(hook), uint160(Currency.unwrap(currency)));
        vm.prank(actor);
        bool ok;
        uint256 amount;
        if (byTicker) {
            try hook.claim(ticker, currency) returns (uint256 paid) {
                ok = true;
                amount = paid;
            } catch {}
        } else {
            try hook.claim(currency) returns (uint256 paid) {
                ok = true;
                amount = paid;
            } catch {}
        }
        if (ok) {
            assertTrue(owed != 0, "claim succeeded with nothing owed");
            assertEq(amount, owed, "claim amount != crownOwed");
            assertEq(_balance(actor, currency) - balanceBefore, owed, "beneficiary not paid in full");
            assertEq(hook.crownOwed(actor, currency), 0, "crownOwed not zeroed");
            assertEq(hook.owedByTicker(ticker, actor, currency), 0, "owedByTicker not zeroed");
            assertEq(hook.pendingTickers(actor, currency).length, 0, "pending tickers not cleared");
            assertEq(
                claimBefore - manager.balanceOf(address(hook), uint160(Currency.unwrap(currency))),
                owed,
                "ERC-6909 claim not burned"
            );
            received[actor][currency] += owed;
            claims += 1;
        } else {
            assertEq(owed, 0, "claim with balance owed reverted");
        }
    }

    function _balance(address who, Currency currency) internal view returns (uint256) {
        return Currency.unwrap(currency) == address(0) ? who.balance : token.balanceOf(who);
    }

    /// @dev A full dethrone through the registry: open, out-stake, pass the window and timelock, finalize.
    function flip(uint256 candidateSeed) external {
        address current = registry.beneficiary(ticker);
        address candidate = _actor(candidateSeed);
        if (candidate == current) candidate = _actor((candidateSeed % actors.length) + 1);
        if (registry.tickerState(ticker).liveChallenge != 0) return;
        uint256 bond = registry.BOND();
        vm.prank(voter);
        uint256 id = registry.openChallenge{value: bond}(ticker, candidate);
        vm.prank(voter);
        registry.stake{value: 0.05 ether}(id, ThroneRegistry.Side.Challenger);
        uint256 finalizableAt = registry.challenges(id).finalizableAt;
        vm.warp(finalizableAt);
        registry.finalize(id);
        assertEq(registry.beneficiary(ticker), candidate, "flip did not seat candidate");
        flips += 1;
    }
}
