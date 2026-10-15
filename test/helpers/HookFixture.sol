// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {TransientStateLibrary} from "v4-core/src/libraries/TransientStateLibrary.sol";
import {ThroneRegistry} from "../../src/ThroneRegistry.sol";
import {ThroneToken} from "../../src/ThroneToken.sol";
import {CrownHook, IThroneRegistry} from "../../src/CrownHook.sol";
import {CrownHookFactory} from "../../src/CrownHookFactory.sol";
import {DemoRouter} from "./DemoRouter.sol";

abstract contract HookFixture is Test {
    using PoolIdLibrary for PoolKey;
    using TransientStateLibrary for IPoolManager;
    bytes32 internal constant TICKER = keccak256("THRONE");
    Currency internal constant ETH = Currency.wrap(address(0));
    uint160 internal constant PRICE = 1 << 96;
    address internal payer = makeAddr("launch payer");
    address internal candidate = makeAddr("second beneficiary");
    address internal trader = makeAddr("trader");
    ThroneRegistry internal registry;
    ThroneToken internal token;
    IPoolManager internal manager;
    CrownHook internal hook;
    CrownHookFactory internal factory;
    DemoRouter internal router;
    PoolKey internal key;
    Currency internal throne;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        vm.deal(payer, 1000 ether);
        vm.deal(candidate, 100 ether);
        vm.deal(trader, 100 ether);
        registry = new ThroneRegistry(0);
        token = new ThroneToken(payer, 1_000_000_000 ether);
        throne = Currency.wrap(address(token));
        registry.registerTicker(TICKER, address(token), payer);
        manager = IPoolManager(address(new PoolManager(payer)));
        factory = new CrownHookFactory();
        hook = _deployHook(IThroneRegistry(address(registry)));
        router = new DemoRouter(manager);
        key = PoolKey(ETH, throne, 3000, 60, IHooks(address(hook)));
        vm.startPrank(payer);
        hook.configurePoolManager(manager);
        hook.registerPool(key, TICKER, PRICE);
        manager.initialize(key, PRICE);
        token.approve(address(router), 1000 ether);
        router.liquidity{value: 101 ether}(
            key, IPoolManager.ModifyLiquidityParams(-887220, 887220, 100 ether, 0)
        );
        token.transfer(trader, 1000 ether);
        vm.stopPrank();
        vm.prank(trader);
        token.approve(address(router), 1000 ether);
    }

    function _deployHook(IThroneRegistry targetRegistry) internal returns (CrownHook result) {
        bytes32 hash = factory.initCodeHash(targetRegistry, payer);
        uint256 i;
        while (true) {
            address predicted = address(
                uint160(
                    uint256(keccak256(abi.encodePacked(bytes1(0xff), address(factory), bytes32(i), hash)))
                )
            );
            if (uint160(predicted) & 0x3fff == 0x1044 && predicted.code.length == 0) break;
            ++i;
        }
        result = factory.deploy(targetRegistry, payer, bytes32(i));
    }

    function _swap(bool zeroForOne, int256 specified) internal returns (BalanceDelta) {
        vm.prank(trader);
        return router.swap{value: zeroForOne ? 10 ether : 0}(
            key,
            IPoolManager.SwapParams(
                zeroForOne, specified, zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            )
        );
    }

    function _flip(address newBeneficiary) internal returns (uint256 id) {
        vm.prank(candidate);
        id = registry.openChallenge{value: 0.01 ether}(TICKER, newBeneficiary);
        vm.prank(candidate);
        registry.stake{value: 0.05 ether}(id, ThroneRegistry.Side.Challenger);
        vm.prank(payer);
        registry.stake{value: 0.02 ether}(id, ThroneRegistry.Side.Reigning);
        vm.warp(registry.challenges(id).finalizableAt);
        registry.finalize(id);
    }

    function _assertSettled() internal view {
        assertFalse(manager.isUnlocked());
        assertEq(manager.getNonzeroDeltaCount(), 0);
        assertEq(manager.currencyDelta(address(hook), ETH), 0);
        assertEq(manager.currencyDelta(address(hook), throne), 0);
        assertEq(manager.currencyDelta(address(router), ETH), 0);
        assertEq(manager.currencyDelta(address(router), throne), 0);
    }
}
