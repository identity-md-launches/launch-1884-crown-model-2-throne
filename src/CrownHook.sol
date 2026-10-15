// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";

interface IThroneRegistry {
    function token(bytes32 ticker) external view returns (address);
    function beneficiary(bytes32 ticker) external view returns (address);
}

/// @notice Fees are backed by PoolManager ERC-6909 claims, never paid to a beneficiary during swaps.
contract CrownHook is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    uint16 public constant DEFAULT_FEE_BPS = 100;
    uint16 public constant MAX_FEE_BPS = 500;
    uint160 public constant REQUIRED_FLAGS = (1 << 12) | (1 << 6) | (1 << 2);
    uint256 public constant REGISTRY_READ_GAS = 30_000;
    IThroneRegistry public immutable registry;
    address public immutable deployer;
    /// @notice One-time setup; unset manager is explicit, never a guessed chain address.
    IPoolManager public poolManager;

    struct PoolConfig {
        bytes32 ticker;
        uint16 feeBps;
        uint160 initialSqrtPriceX96;
        bool initialized;
    }

    mapping(PoolId => PoolConfig) public poolConfig;
    mapping(PoolId => bytes32) public poolTicker;
    mapping(bytes32 => PoolId) public canonicalPool;
    mapping(bytes32 => bool) public hasCanonicalPool;
    mapping(address => mapping(Currency => uint256)) public crownOwed;
    /// @notice Lifetime accrued, including amounts already claimed. Never decremented.
    mapping(bytes32 => mapping(Currency => uint256)) public crownPaid;
    mapping(bytes32 => mapping(Currency => uint256)) public crownClaimed;
    mapping(bytes32 => mapping(address => mapping(Currency => uint256))) public owedByTicker;
    mapping(address => mapping(Currency => bytes32[])) private _owedTickers;
    mapping(address => mapping(Currency => mapping(bytes32 => uint256))) private _owedIndex;
    bool private _claiming;
    bool private _callbackPending;

    error InvalidAddress();
    error OnlyDeployer();
    error OnlyPoolManager();
    error NotConfigured();
    error AlreadyConfigured();
    error InvalidPool();
    error FeeOutOfRange();
    error PoolAlreadyRegistered();
    error UnexpectedInitialization();
    error NothingToClaim();
    error Reentrancy();
    error UnexpectedCallback();

    event PoolManagerConfigured(address indexed manager);
    event PoolRegistered(PoolId indexed poolId, bytes32 indexed ticker, uint16 feeBps);
    event PoolBound(PoolId indexed poolId, bytes32 indexed ticker);
    event CrownAccrued(
        bytes32 indexed ticker, address indexed beneficiary, Currency indexed currency, uint256 amount
    );
    event CrownClaimed(
        bytes32 indexed ticker, address indexed beneficiary, Currency indexed currency, uint256 amount
    );

    constructor(IThroneRegistry registry_, address deployer_) {
        if (address(registry_) == address(0) || deployer_ == address(0)) revert InvalidAddress();
        registry = registry_;
        deployer = deployer_;
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    modifier onlyDeployer() {
        if (msg.sender != deployer) revert OnlyDeployer();
        _;
    }
    modifier onlyPoolManager() {
        if (address(poolManager) == address(0)) revert NotConfigured();
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        _;
    }
    modifier nonReentrant() {
        if (_claiming) revert Reentrancy();
        _claiming = true;
        _;
        _claiming = false;
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory p) {
        p.afterInitialize = true;
        p.afterSwap = true;
        p.afterSwapReturnDelta = true;
    }

    function configurePoolManager(IPoolManager manager) external onlyDeployer {
        if (address(poolManager) != address(0)) revert AlreadyConfigured();
        if (address(manager).code.length == 0) revert InvalidAddress();
        poolManager = manager;
        emit PoolManagerConfigured(address(manager));
    }

    function registerPool(PoolKey calldata key, bytes32 ticker, uint160 initialSqrtPriceX96)
        external
        onlyDeployer
    {
        _registerPool(key, ticker, DEFAULT_FEE_BPS, initialSqrtPriceX96);
    }

    /// @notice Permanent per-pool settings. The deployer subsequently calls PoolManager.initialize directly.
    function registerPool(PoolKey calldata key, bytes32 ticker, uint16 feeBps, uint160 initialSqrtPriceX96)
        external
        onlyDeployer
    {
        _registerPool(key, ticker, feeBps, initialSqrtPriceX96);
    }

    function _registerPool(PoolKey calldata key, bytes32 ticker, uint16 feeBps, uint160 initialSqrtPriceX96)
        private
    {
        if (address(poolManager) == address(0)) revert NotConfigured();
        if (feeBps > MAX_FEE_BPS) revert FeeOutOfRange();
        address token = registry.token(ticker);
        if (
            ticker == bytes32(0) || token == address(0) || address(key.hooks) != address(this)
                || Currency.unwrap(key.currency0) >= Currency.unwrap(key.currency1)
                || (Currency.unwrap(key.currency0) != token && Currency.unwrap(key.currency1) != token)
                || initialSqrtPriceX96 == 0
        ) revert InvalidPool();
        PoolId id = key.toId();
        if (hasCanonicalPool[ticker] || poolConfig[id].ticker != bytes32(0)) revert PoolAlreadyRegistered();
        hasCanonicalPool[ticker] = true;
        canonicalPool[ticker] = id;
        poolConfig[id] = PoolConfig(ticker, feeBps, initialSqrtPriceX96, false);
        emit PoolRegistered(id, ticker, feeBps);
    }

    function afterInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96, int24)
        external
        onlyPoolManager
        returns (bytes4)
    {
        PoolId id = key.toId();
        PoolConfig storage p = poolConfig[id];
        if (
            sender != deployer || p.ticker == bytes32(0) || p.initialized
                || sqrtPriceX96 != p.initialSqrtPriceX96
        ) revert UnexpectedInitialization();
        p.initialized = true;
        poolTicker[id] = p.ticker;
        emit PoolBound(id, p.ticker);
        return IHooks.afterInitialize.selector;
    }

    /// @dev The afterSwap delta can charge only the unspecified currency:
    /// exact input -> output currency; exact output -> input currency. Use actual filled amounts.
    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, int128) {
        PoolConfig storage p = poolConfig[key.toId()];
        if (!p.initialized) revert InvalidPool();
        if (p.feeBps == 0) return (IHooks.afterSwap.selector, 0);
        bool unspecifiedIs1 = (params.amountSpecified < 0) == params.zeroForOne;
        int256 raw = unspecifiedIs1 ? int256(delta.amount1()) : int256(delta.amount0());
        uint256 cut = uint256(raw < 0 ? -raw : raw) * p.feeBps / 10_000;
        if (cut == 0) return (IHooks.afterSwap.selector, 0);
        address recipient = _beneficiary(p.ticker);
        if (recipient == address(0)) return (IHooks.afterSwap.selector, 0);
        Currency currency = unspecifiedIs1 ? key.currency1 : key.currency0;

        // Mint creates a negative transient delta, exactly offset by the positive returned hook delta.
        // Neither this call nor any bookkeeping below invokes recipient or the currency token.
        poolManager.mint(address(this), currency.toId(), cut);
        if (_owedIndex[recipient][currency][p.ticker] == 0) {
            _owedTickers[recipient][currency].push(p.ticker);
            _owedIndex[recipient][currency][p.ticker] = _owedTickers[recipient][currency].length;
        }
        crownOwed[recipient][currency] += cut;
        owedByTicker[p.ticker][recipient][currency] += cut;
        crownPaid[p.ticker][currency] += cut;
        emit CrownAccrued(p.ticker, recipient, currency, cut);
        return (IHooks.afterSwap.selector, int128(int256(cut)));
    }

    /// @dev Bounded gas and fixed output copy: failed, gas-burning, malformed or oversized reads skip fees.
    function _beneficiary(bytes32 ticker) private view returns (address recipient) {
        address target = address(registry);
        bytes memory input = abi.encodeCall(IThroneRegistry.beneficiary, (ticker));
        bool ok;
        uint256 result;
        uint256 size;
        assembly ("memory-safe") {
            let output := mload(0x40)
            ok := staticcall(REGISTRY_READ_GAS, target, add(input, 32), mload(input), output, 32)
            size := returndatasize()
            result := mload(output)
        }
        if (ok && size == 32 && result <= type(uint160).max) recipient = address(uint160(result));
    }

    /// @notice Claim the caller's entire balance in one currency across all tickers.
    function claim(Currency currency) external nonReentrant returns (uint256 amount) {
        amount = crownOwed[msg.sender][currency];
        if (amount == 0) revert NothingToClaim();
        crownOwed[msg.sender][currency] = 0;
        bytes32[] storage tickers = _owedTickers[msg.sender][currency];
        while (tickers.length != 0) _debit(tickers[tickers.length - 1], msg.sender, currency);
        _pay(currency, amount);
    }

    /// @notice Bounded alternative when a beneficiary has many tickers in the same currency.
    function claim(bytes32 ticker, Currency currency) external nonReentrant returns (uint256 amount) {
        amount = owedByTicker[ticker][msg.sender][currency];
        if (amount == 0) revert NothingToClaim();
        crownOwed[msg.sender][currency] -= amount;
        _debit(ticker, msg.sender, currency);
        _pay(currency, amount);
    }

    function pendingTickers(address recipient, Currency currency) external view returns (bytes32[] memory) {
        return _owedTickers[recipient][currency];
    }

    function _debit(bytes32 ticker, address recipient, Currency currency) private {
        uint256 amount = owedByTicker[ticker][recipient][currency];
        owedByTicker[ticker][recipient][currency] = 0;
        crownClaimed[ticker][currency] += amount;
        bytes32[] storage tickers = _owedTickers[recipient][currency];
        uint256 index = _owedIndex[recipient][currency][ticker] - 1;
        bytes32 last = tickers[tickers.length - 1];
        tickers[index] = last;
        _owedIndex[recipient][currency][last] = index + 1;
        tickers.pop();
        delete _owedIndex[recipient][currency][ticker];
        emit CrownClaimed(ticker, recipient, currency, amount);
    }

    function _pay(Currency currency, uint256 amount) private {
        if (address(poolManager) == address(0)) revert NotConfigured();
        _callbackPending = true;
        poolManager.unlock(abi.encode(currency, amount));
        // Transfer AFTER unlock returns: the manager is locked even if recipient executes hostile code.
        currency.transfer(msg.sender, amount);
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        if (!_claiming || !_callbackPending) revert UnexpectedCallback();
        _callbackPending = false;
        (Currency currency, uint256 amount) = abi.decode(data, (Currency, uint256));
        poolManager.burn(address(this), currency.toId(), amount);
        poolManager.take(currency, address(this), amount);
        return "";
    }

    receive() external payable {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
    }
}
