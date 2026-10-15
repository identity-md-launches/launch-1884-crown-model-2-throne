// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";

interface IERC20Demo {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @dev LOCAL TEST/DEMO ONLY: deliberately no slippage or deadline controls. Do not deploy on a public chain.
contract DemoRouter is IUnlockCallback {
    using CurrencyLibrary for Currency;
    IPoolManager public immutable manager;
    bool private active;

    constructor(IPoolManager manager_) {
        manager = manager_;
    }

    function swap(PoolKey memory key, IPoolManager.SwapParams memory params)
        external
        payable
        returns (BalanceDelta delta)
    {
        require(!active, "busy");
        active = true;
        delta =
            abi.decode(manager.unlock(abi.encode(msg.sender, key, true, abi.encode(params))), (BalanceDelta));
        _refund();
        active = false;
    }

    function liquidity(PoolKey memory key, IPoolManager.ModifyLiquidityParams memory params)
        external
        payable
        returns (BalanceDelta delta)
    {
        require(!active, "busy");
        active = true;
        params.salt = keccak256(abi.encode(msg.sender, params.salt));
        delta = abi.decode(
            manager.unlock(abi.encode(msg.sender, key, false, abi.encode(params))), (BalanceDelta)
        );
        _refund();
        active = false;
    }

    function unlockCallback(bytes calldata input) external returns (bytes memory) {
        require(msg.sender == address(manager) && active, "callback");
        (address payer, PoolKey memory key, bool isSwap, bytes memory data) =
            abi.decode(input, (address, PoolKey, bool, bytes));
        BalanceDelta delta;
        if (isSwap) {
            delta = manager.swap(key, abi.decode(data, (IPoolManager.SwapParams)), "");
        } else {
            (delta,) =
                manager.modifyLiquidity(key, abi.decode(data, (IPoolManager.ModifyLiquidityParams)), "");
        }
        _settle(key.currency0, payer, delta.amount0());
        _settle(key.currency1, payer, delta.amount1());
        return abi.encode(delta);
    }

    function _settle(Currency currency, address payer, int128 delta) private {
        if (delta > 0) {
            manager.take(currency, payer, uint128(delta));
        } else if (delta < 0) {
            uint256 amount = uint256(-int256(delta));
            if (currency.isAddressZero()) {
                manager.settle{value: amount}();
            } else {
                manager.sync(currency);
                require(
                    IERC20Demo(Currency.unwrap(currency)).transferFrom(payer, address(manager), amount),
                    "transfer"
                );
                manager.settle();
            }
        }
    }

    function _refund() private {
        if (address(this).balance != 0) {
            (bool ok,) = msg.sender.call{value: address(this).balance}("");
            require(ok, "refund");
        }
    }

    receive() external payable {}
}
