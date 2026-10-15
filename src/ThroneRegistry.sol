// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FullMath} from "v4-core/src/libraries/FullMath.sol";

/// @notice One permanent token per ticker. Only bonded, timed votes can change its beneficiary.
contract ThroneRegistry {
    uint256 public constant DEFAULT_MIN_REIGN = 7 days;
    uint256 public constant BOND = 0.01 ether;
    uint256 public constant QUORUM = 0.05 ether;
    uint256 public constant VOTING_WINDOW = 72 hours;
    uint256 public constant TIMELOCK = 24 hours;
    uint256 public constant FAILED_COOLDOWN = 3 days;
    address public constant TREASURY = 0xf19F11Dee16a341671E6Ed3e209b704C1Bbc3E57;
    uint256 public immutable MIN_REIGN;

    enum Side {
        Reigning,
        Challenger
    }
    enum EndReason {
        Ongoing,
        Dethroned
    }

    struct Ticker {
        address token;
        address beneficiary;
        uint256 reignStarted;
        uint256 cooldownUntil;
        uint256 liveChallenge;
    }

    struct Reign {
        address controller;
        uint256 from;
        uint256 to;
        EndReason ended;
    }

    struct Challenge {
        bytes32 ticker;
        address candidate;
        uint256 openedAt;
        uint256 votingEnds;
        uint256 finalizableAt;
        uint256 reigningStake;
        uint256 challengerStake;
        bool finalized;
        bool challengerWon;
        uint256 loserRefundPool;
        uint256 winnerBonusPool;
        uint256 initialTreasury;
        uint256 principalClaimed;
        uint256 payoutsClaimed;
    }

    mapping(bytes32 => Ticker) private _tickers;
    mapping(address => bytes32) public tickerOfToken;
    mapping(bytes32 => Reign[]) public reigns;
    mapping(uint256 => Challenge) private _challenges;
    mapping(uint256 => mapping(address => mapping(Side => uint256))) public stakes;
    mapping(uint256 => mapping(address => bool)) public stakeClaimed;
    /// @notice Lifetime deposits, including opening bonds, classified by side at deposit time.
    mapping(bytes32 => mapping(Side => uint256)) public tickerStakeTotals;
    uint256 public challengeCount;
    uint256 public treasuryOwed;
    uint256 public treasuryPaid;
    bool private _paying;

    error InvalidRegistration();
    error AlreadyRegistered();
    error UnknownTicker();
    error InvalidCandidate();
    error WrongBond();
    error ReignTooYoung();
    error CooldownActive();
    error ChallengeLive();
    error UnknownChallenge();
    error VotingClosed();
    error ZeroStake();
    error TooEarly();
    error AlreadyFinalized();
    error NotFinalized();
    error NothingToClaim();
    error TransferFailed();
    error Reentrancy();

    event TickerRegistered(bytes32 indexed ticker, address indexed token, address indexed beneficiary);
    event ChallengeOpened(
        uint256 indexed challengeId,
        bytes32 indexed ticker,
        address indexed candidate,
        address opener,
        uint256 votingEnds,
        uint256 finalizableAt
    );
    event Staked(uint256 indexed challengeId, address indexed staker, Side side, uint256 amount);
    event Dethroned(bytes32 indexed ticker, uint256 indexed challengeId, address previous, address current);
    event ChallengeFailed(bytes32 indexed ticker, uint256 indexed challengeId, uint256 cooldownUntil);
    event StakeClaimed(uint256 indexed challengeId, address indexed staker, uint256 amount);
    event TreasuryClaimed(uint256 amount);

    constructor(uint256 minReign_) {
        MIN_REIGN = minReign_;
    }

    modifier nonReentrant() {
        if (_paying) revert Reentrancy();
        _paying = true;
        _;
        _paying = false;
    }

    /// @dev Permissionless, first registration wins. Registration is permanent, not a trademark oracle.
    function registerTicker(bytes32 ticker, address token_, address beneficiary_) external {
        if (ticker == bytes32(0) || token_.code.length == 0 || beneficiary_ == address(0)) {
            revert InvalidRegistration();
        }
        if (_tickers[ticker].token != address(0) || tickerOfToken[token_] != bytes32(0)) {
            revert AlreadyRegistered();
        }
        _tickers[ticker] = Ticker(token_, beneficiary_, block.timestamp, 0, 0);
        tickerOfToken[token_] = ticker;
        reigns[ticker].push(Reign(beneficiary_, block.timestamp, 0, EndReason.Ongoing));
        emit TickerRegistered(ticker, token_, beneficiary_);
    }

    function tickerId(string memory symbol) public pure returns (bytes32) {
        bytes memory upper = bytes(symbol);
        for (uint256 i; i < upper.length; ++i) {
            uint8 c = uint8(upper[i]);
            if (c >= 97 && c <= 122) upper[i] = bytes1(c - 32);
        }
        return keccak256(upper);
    }

    function token(bytes32 ticker) external view returns (address) {
        return _tickers[ticker].token;
    }

    function beneficiary(bytes32 ticker) external view returns (address) {
        return _tickers[ticker].beneficiary;
    }

    function controller(bytes32 ticker) external view returns (address) {
        return _tickers[ticker].beneficiary;
    }

    function tickerState(bytes32 ticker) external view returns (Ticker memory) {
        return _tickers[ticker];
    }

    function reignCount(bytes32 ticker) external view returns (uint256) {
        return reigns[ticker].length;
    }

    function challenges(uint256 id) external view returns (Challenge memory) {
        return _challenges[id];
    }

    /// @notice The exact bond is the opener's initial challenger stake and counts toward quorum.
    function openChallenge(bytes32 ticker, address candidate) external payable returns (uint256 id) {
        Ticker storage t = _tickers[ticker];
        if (t.token == address(0)) revert UnknownTicker();
        if (candidate == address(0) || candidate == t.beneficiary) revert InvalidCandidate();
        if (msg.value != BOND) revert WrongBond();
        if (t.liveChallenge != 0) revert ChallengeLive();
        if (block.timestamp - t.reignStarted < MIN_REIGN) revert ReignTooYoung();
        if (block.timestamp < t.cooldownUntil) revert CooldownActive();
        id = ++challengeCount;
        Challenge storage c = _challenges[id];
        c.ticker = ticker;
        c.candidate = candidate;
        c.openedAt = block.timestamp;
        c.votingEnds = block.timestamp + VOTING_WINDOW;
        c.finalizableAt = c.votingEnds + TIMELOCK;
        t.liveChallenge = id;
        _stake(id, c, Side.Challenger, msg.sender, msg.value);
        emit ChallengeOpened(id, ticker, candidate, msg.sender, c.votingEnds, c.finalizableAt);
    }

    function stake(uint256 id, Side side) external payable {
        Challenge storage c = _getChallenge(id);
        if (block.timestamp >= c.votingEnds || c.finalized) revert VotingClosed();
        if (msg.value == 0) revert ZeroStake();
        _stake(id, c, side, msg.sender, msg.value);
    }

    function _stake(uint256 id, Challenge storage c, Side side, address staker, uint256 amount) private {
        stakes[id][staker][side] += amount;
        tickerStakeTotals[c.ticker][side] += amount;
        if (side == Side.Reigning) c.reigningStake += amount;
        else c.challengerStake += amount;
        emit Staked(id, staker, side, amount);
    }

    /// @notice Permissionless, constant-work resolution. No transfers or external calls.
    function finalize(uint256 id) external {
        Challenge storage c = _getChallenge(id);
        if (c.finalized) revert AlreadyFinalized();
        if (block.timestamp < c.finalizableAt) revert TooEarly();
        c.finalized = true;
        c.challengerWon = c.challengerStake > c.reigningStake && c.challengerStake + c.reigningStake >= QUORUM;
        uint256 loser = c.challengerWon ? c.reigningStake : c.challengerStake;
        uint256 winner = c.challengerWon ? c.challengerStake : c.reigningStake;
        uint256 slash = loser / 5;
        c.loserRefundPool = loser - slash;
        c.winnerBonusPool = winner == 0 ? 0 : slash / 2;
        c.initialTreasury = slash - c.winnerBonusPool;
        treasuryOwed += c.initialTreasury;

        Ticker storage t = _tickers[c.ticker];
        t.liveChallenge = 0;
        if (c.challengerWon) {
            address previous = t.beneficiary;
            Reign storage last = reigns[c.ticker][reigns[c.ticker].length - 1];
            last.to = block.timestamp;
            last.ended = EndReason.Dethroned;
            t.beneficiary = c.candidate;
            t.reignStarted = block.timestamp;
            reigns[c.ticker].push(Reign(c.candidate, block.timestamp, 0, EndReason.Ongoing));
            emit Dethroned(c.ticker, id, previous, c.candidate);
        } else {
            t.cooldownUntil = block.timestamp + FAILED_COOLDOWN;
            emit ChallengeFailed(c.ticker, id, t.cooldownUntil);
        }
    }

    function claimable(uint256 id, address staker) public view returns (uint256 amount) {
        Challenge storage c = _challenges[id];
        if (!c.finalized || stakeClaimed[id][staker]) return 0;
        Side winSide = c.challengerWon ? Side.Challenger : Side.Reigning;
        Side loseSide = c.challengerWon ? Side.Reigning : Side.Challenger;
        uint256 win = stakes[id][staker][winSide];
        uint256 lose = stakes[id][staker][loseSide];
        uint256 winners = c.challengerWon ? c.challengerStake : c.reigningStake;
        uint256 losers = c.challengerWon ? c.reigningStake : c.challengerStake;
        amount = win;
        if (win != 0) amount += FullMath.mulDiv(win, c.winnerBonusPool, winners);
        if (lose != 0) amount += FullMath.mulDiv(lose, c.loserRefundPool, losers);
    }

    function claimStake(uint256 id) external nonReentrant returns (uint256 amount) {
        Challenge storage c = _getChallenge(id);
        if (!c.finalized) revert NotFinalized();
        uint256 principal = stakes[id][msg.sender][Side.Reigning] + stakes[id][msg.sender][Side.Challenger];
        if (principal == 0 || stakeClaimed[id][msg.sender]) revert NothingToClaim();
        amount = claimable(id, msg.sender);
        stakeClaimed[id][msg.sender] = true;
        c.principalClaimed += principal;
        c.payoutsClaimed += amount;
        uint256 total = c.reigningStake + c.challengerStake;
        // Independent per-wallet floors leave dust. Only after every depositor claims is it treasury's.
        if (c.principalClaimed == total) treasuryOwed += total - c.initialTreasury - c.payoutsClaimed;
        emit StakeClaimed(id, msg.sender, amount);
        if (amount != 0) _send(msg.sender, amount);
    }

    /// @notice Anyone can trigger payment, but only the fixed treasury can receive it.
    function claimTreasury() external nonReentrant returns (uint256 amount) {
        amount = treasuryOwed;
        if (amount == 0) revert NothingToClaim();
        treasuryOwed = 0;
        treasuryPaid += amount;
        emit TreasuryClaimed(amount);
        _send(TREASURY, amount);
    }

    function _getChallenge(uint256 id) private view returns (Challenge storage c) {
        c = _challenges[id];
        if (id == 0 || id > challengeCount) revert UnknownChallenge();
    }

    function _send(address recipient, uint256 amount) private {
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}

/// @notice Production deployment with the specified seven-day default.
contract ProductionThroneRegistry is ThroneRegistry {
    constructor() ThroneRegistry(DEFAULT_MIN_REIGN) {}
}
