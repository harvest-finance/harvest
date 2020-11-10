pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../hardworkInterface/IStrategy.sol";
import "../Controllable.sol";
import "../hardworkInterface/IMigrator.sol";
import "../hardworkInterface/IVault.sol";


contract SplitterStrategy is IStrategy, Controllable {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  IERC20 public underlying;
  address public vault;

  mapping(address => bool) public unsalvagableTokens;

  mapping(address => bool) public isStrategyWhitelisted;
  address[] public whitelistedStrategies;

  address[] public activeStrategies;
  uint256[] public caps;
  uint256[] public investmentRatioNumerators;
  address[] public withdrawalOrder;

  address public futureStrategy;
  uint256 public strategyWhitelistTime;

  uint256 public investmentRatioDenominator = 10000;
  uint256 public whitelistStrategyTimeLock = 12 hours;
  bool public isInitialized = false;

  event StrategyWhitelisted(
    address strategy
  );

  event StrategyWhitelistAnnounced(
    address strategy,
    uint256 when
  );

  event StrategyUnwhitelisted(
    address strategy
  );

  modifier restricted() {
    require(msg.sender == vault || msg.sender == address(controller()) || msg.sender == address(governance()),
      "The sender has to be the controller or vault or governance");
    _;
  }

  constructor(address _storage) public Controllable(_storage) { }

  function initSplitter(
    address _underlying,
    address _vault,
    address[] memory _strategies,
    uint256[] memory _investmentRatioNumerators,
    uint256[] memory _caps,
    address[] memory _withdrawalOrder
  ) public onlyGovernance {
    require(!isInitialized, "splitter is already initialized");
    isInitialized = true;
    require(_underlying != address(0), "_underlying cannot be empty");
    require(_vault != address(0), "_vault cannot be empty");

    require(IVault(_vault).underlying() == _underlying, "underlying must match");

    unsalvagableTokens[_underlying] = true;
    underlying = IERC20(_underlying);
    vault = _vault;

    for (uint256 i = 0; i < _strategies.length; i++) {
      whitelistedStrategies.push(_strategies[i]);
      isStrategyWhitelisted[_strategies[i]] = true;
    }

    _configureStrategies(_strategies, _investmentRatioNumerators, _caps, _withdrawalOrder);
  }

  /*
  * Instant configuration of the active strategies, caps, investment ratios,
  * and withdrawal orders
  */
  function configureStrategies(
    address[] memory _activeStrategies,
    uint256[] memory _investmentRatioNumerators,
    uint256[] memory _caps,
    address[] memory _withdrawalOrder
  ) public onlyGovernance {
    _configureStrategies(
      _activeStrategies,
      _investmentRatioNumerators,
      _caps,
      _withdrawalOrder
    );
  }

  function _configureStrategies(
    address[] memory _activeStrategies,
    uint256[] memory _investmentRatioNumerators,
    uint256[] memory _caps,
    address[] memory _withdrawalOrder
  ) internal {
    require(_activeStrategies.length == _investmentRatioNumerators.length, "investment ratios length invalid");
    require(_activeStrategies.length == _caps.length, "caps length invalid");
    require(whitelistedStrategies.length == _withdrawalOrder.length, "withdrawalOrder length invalid");
    activeStrategies.length = 0;
    investmentRatioNumerators.length = 0;
    caps.length = 0;
    for (uint256 i = 0; i < _activeStrategies.length; i++) {
      require(isStrategyWhitelisted[_activeStrategies[i]], "strategy not whitelisted");
      activeStrategies.push(_activeStrategies[i]);
      investmentRatioNumerators.push(_investmentRatioNumerators[i]);
      caps.push(_caps[i]);
    }

    withdrawalOrder.length = 0;
    for (uint256 i = 0; i < _withdrawalOrder.length; i++) {
      require(isStrategyWhitelisted[_withdrawalOrder[i]], "withdrawal strategy not whitelisted");
      withdrawalOrder.push(_withdrawalOrder[i]);
    }
  }

  function depositArbCheck() public view returns(bool) {
    for (uint256 i = 0; i < activeStrategies.length; i++) {
      if (!IStrategy(activeStrategies[i]).depositArbCheck()) {
        return false;
      }
    }
    return true;
  }

  /*
  * Returns the total amount.
  * Iterates over all whitelisted strateges, not just active
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    uint256 result = 0;
    for (uint256 i = 0; i < whitelistedStrategies.length; i++) {
      result = result.add(IStrategy(whitelistedStrategies[i]).investedUnderlyingBalance());
    }
    return result.add(IERC20(underlying).balanceOf(address(this)));
  }

  /*
  * Invests all tokens that were accumulated so far
  */
  function investAllUnderlying() internal {
    uint256 splitterInitialBalance = IERC20(underlying).balanceOf(address(this));
    for (uint256 i = 0; i < activeStrategies.length; i++) {
      uint256 computedRatio = splitterInitialBalance.mul(investmentRatioNumerators[i]).div(investmentRatioDenominator);
      uint256 toInvest = Math.min(computedRatio, IERC20(underlying).balanceOf(address(this)));

      if (toInvest > 0) {
        if (caps[i] > 0) { // there is a cap
          uint256 strategyBalance = IStrategy(activeStrategies[i]).investedUnderlyingBalance();
          if (strategyBalance < caps[i]) {
            uint256 maxRemaining = caps[i] - strategyBalance;
            IERC20(underlying).safeTransfer(activeStrategies[i], Math.min(maxRemaining, toInvest));
          }
        } else {  // no cap
          IERC20(underlying).safeTransfer(activeStrategies[i], toInvest);
        }
      }
    }
    // the rest of the funds would stay in the strategy
  }

  /**
  * Withdraws everything from a specific strategy
  */
  function withdrawFromStrategy(address strategy, uint256 amount) external restricted {
    require(isStrategyWhitelisted[strategy], "strategy not whitelisted");
    IStrategy(strategy).withdrawToVault(amount);
  }

  /**
  * Invests into a specific strategy
  */
  function investIntoStrategy(address strategy, uint256 amount) external restricted {
    require(isStrategyWhitelisted[strategy], "strategy not whitelisted");
    IERC20(underlying).safeTransfer(strategy, amount);
  }

  /**
  * Withdraws everything from all the vaults
  */
  function withdrawAllToVault() external restricted {
    for (uint256 i = 0; i < withdrawalOrder.length; i++) {
      if (IStrategy(withdrawalOrder[i]).investedUnderlyingBalance() > 0) {
        IStrategy(withdrawalOrder[i]).withdrawAllToVault();
      }
    }
    uint256 actualBalance = IERC20(underlying).balanceOf(address(this));
    if (actualBalance > 0) {
      IERC20(underlying).safeTransfer(vault, actualBalance);
    }
  }

  /*
  * Cashes some amount out and withdraws to the vault
  */
  function withdrawToVault(uint256 amount) external restricted {
    require(amount > 0, "amount must be greater than 0");
    for (uint256 i = 0; i < withdrawalOrder.length; i++) {
      uint256 splitterBalance = IERC20(underlying).balanceOf(address(this));
      if (splitterBalance >= amount) {
        break;
      }
      uint256 strategyBalance = IStrategy(withdrawalOrder[i]).investedUnderlyingBalance();
      if (strategyBalance > 0) {
        IStrategy(withdrawalOrder[i]).withdrawToVault(
          Math.min(amount.sub(splitterBalance), strategyBalance)
        );
      }
    }
    // we intend to fail if we don't have enough balance
    require(IERC20(underlying).balanceOf(address(this)) >= amount, "splitter does not have sufficient balance");
    IERC20(underlying).safeTransfer(vault, amount);
    // investing back the rest if anything left
    investAllUnderlying();
  }

  /**
  * Calls doHardWork on all strategies
  */
  function doHardWork() public restricted {
    investAllUnderlying();
    for (uint256 i = 0; i < activeStrategies.length; i++) {
      IStrategy(activeStrategies[i]).doHardWork();
    }
  }

  /**
  * Calls doHardWork on a specific strategy
  */
  function doHardWork(address _strategy) public restricted {
    IStrategy(_strategy).doHardWork();
  }

  function _setStrategyWhitelistTime(uint256 _strategyWhitelistTime) internal {
    strategyWhitelistTime = _strategyWhitelistTime;
  }

  function _setFutureStrategy(address _futureStrategy) internal {
    futureStrategy = _futureStrategy;
  }

  function whitelistedStrategyCount() public view returns (uint256) {
    return whitelistedStrategies.length;
  }

  function canWhitelistStrategy(address _strategy) public view returns (bool) {
    return (_strategy == futureStrategy
      && block.timestamp > strategyWhitelistTime
      && strategyWhitelistTime > 0); // or the timelock has passed
  }

  /**
  * Indicates that a strategy would be added to the splitter
  */
  function announceStrategyWhitelist(address _strategy) public onlyGovernance {
    require(_strategy != address(0), "_strategy cannot be 0x0");
    require(IStrategy(_strategy).underlying() == address(underlying), "Underlying of splitter must match Strategy underlying");
    require(IStrategy(_strategy).vault() == address(this), "The strategy does not belong to this splitter");

    // records a new timestamp
    uint256 when = block.timestamp.add(whitelistStrategyTimeLock);
    _setStrategyWhitelistTime(when);
    _setFutureStrategy(_strategy);
    emit StrategyWhitelistAnnounced(_strategy, when);
  }

  /**
  * Finalizes (or cancels) the strategy update by resetting the data
  */
  function finalizeStrategyWhitelist() public onlyGovernance {
    _setStrategyWhitelistTime(0);
    _setFutureStrategy(address(0));
  }

  /**
  * Removes a given strategy from the whitelist
  * It is only allowed in case its underlying balance is 0
  */
  function unwhitelistStrategy(address _strategy) public onlyGovernance {
    require(_strategy != address(0), "_strategy cannot be 0x0");
    require(isStrategyWhitelisted[_strategy], "_strategy is not whitelisted");

    IStrategy strategy = IStrategy(_strategy);
    require(strategy.investedUnderlyingBalance() == 0, "can only unwhitelist an empty strategy");

    emit StrategyUnwhitelisted(_strategy);

    isStrategyWhitelisted[_strategy] = false;
    for (uint256 i = 0; i < whitelistedStrategies.length; i++) {
      if (whitelistedStrategies[i] == _strategy) {
        if (i < whitelistedStrategies.length - 1) {
          whitelistedStrategies[i] = whitelistedStrategies[whitelistedStrategies.length - 1];
        }
        whitelistedStrategies.length--;
        return;
      }
    }
  }

  /**
  * Adds a given strategy into the whitelist
  * Possible only after the timelock expired
  */
  function whitelistStrategy(address _strategy) public onlyGovernance {
    require(canWhitelistStrategy(_strategy),
      "The strategy exists and switch timelock did not elapse yet");

    require(_strategy != address(0), "_strategy cannot be 0x0");
    require(IStrategy(_strategy).underlying() == address(underlying), "Underlying of splitter must match Strategy underlying");
    require(IStrategy(_strategy).vault() == address(this), "The strategy does not belong to this splitter");

    whitelistedStrategies.push(_strategy);
    isStrategyWhitelisted[_strategy] = true;
    emit StrategyWhitelisted(_strategy);
    IERC20(underlying).safeApprove(_strategy, 0);
    IERC20(underlying).safeApprove(_strategy, uint256(~0));
    finalizeStrategyWhitelist();
  }

  // should only be called by controller
  function salvage(address destination, address token, uint256 amount) external restricted {
    require(!unsalvagableTokens[token], "token is defined as not salvageable");
    IERC20(token).safeTransfer(destination, amount);
  }
}
