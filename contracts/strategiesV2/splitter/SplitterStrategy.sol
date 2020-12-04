pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../hardworkInterface/IStrategyV2.sol";
import "../../ControllableInit.sol";
import "../../hardworkInterface/IMigrator.sol";
import "../../hardworkInterface/IVault.sol";
import "./SplitterStorage.sol";
import "./SplitterStrategyWhitelist.sol";
import "./SplitterConfig.sol";


contract SplitterStrategy is IStrategyV2, Initializable, ControllableInit, SplitterStorage {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  uint256 public constant investmentRatioDenominator = 10000;
  uint256 public constant whitelistStrategyTimeLock = 12 hours;
  uint256 public constant splitterUpgradeTimelock = 12 hours;

  /* These arrays are preserved in the config contract but cached
  in this contract for reduced gas costs.
  The methods pushState() and pullState() are used for moving the state
  */
  address[] public activeStrategies;
  uint256[] public investmentRatioNumerators;

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
    require(msg.sender == vault() || msg.sender == address(controller()) || msg.sender == address(governance()),
      "The sender has to be the controller or vault or governance");
    _;
  }

  constructor() public { }

  function unsalvagableTokens(address token) public view returns (bool) {
    return token == underlying();
  }

  function whitelistedStrategies(uint256 index) public view returns (address) {
    return SplitterStrategyWhitelist(strategyWhitelist()).whitelistedStrategies(index);
  }

  // Initialization is split into two steps: initSplitter(...) and initStrategies(...)
  // because some strategies' constructors require a "vault" with pre-set underlying
  // Therefore, first, we call initSplitter(...) first that sets splitter's underlying
  // Next, we depoloy the strategies
  // And finally, we call initStrategies(...)

  function initSplitter(
    address _storage,
    address _vault,
    address _strategyWhitelist, // a contract where all whitelisted strategies are persisted (across upgrades)
    address _splitterConfig     // a data contract where the strategy configuration is persisted (across upgrades)
  ) public initializer {
    ControllableInit.initialize(
      _storage
    );

    require(_vault != address(0), "_vault cannot be 0x0");
    address _underlying = IVault(_vault).underlying();
    require(_underlying != address(0), "_underlying cannot be 0x0");

    // initializing the eternal storage
    SplitterStorage.initialize(
      _underlying,
      _vault,
      _strategyWhitelist,
      _splitterConfig,
      splitterUpgradeTimelock
    );
  }

  function initStrategies(
    address[] memory _strategies,               // active strategies (they are also auto-whitelisted)
    uint256[] memory _investmentRatioNumerators // investment ratios for each active strategy
  ) public onlyGovernance {
    require(whitelistedStrategyCount() == 0, "strategies already initialized");

    // all strategies go into the whitelist upon initialization
    for (uint i = 0; i < _strategies.length; i++) {
      SplitterStrategyWhitelist(strategyWhitelist()).whitelist(_strategies[i]);
    }

    // initializing the configuration
    reconfigureStrategies(
      _strategies,
      _investmentRatioNumerators
    );
  }

  function _pullState() internal {
    // making sure all are reset
    activeStrategies.length = 0;
    investmentRatioNumerators.length = 0;

    SplitterConfig config = SplitterConfig(splitterConfig());

    for (uint256 i = 0; i < config.activeStrategiesLength(); i++) {
      activeStrategies.push(config.activeStrategies(i));
      investmentRatioNumerators.push(config.investmentRatioNumerators(i));
    }
  }

  /**
  * Schedules an upgrade for this vault's proxy.
  */
  function scheduleUpgrade(address impl) public onlyGovernance {
    _setNextImplementation(impl);
    _setNextImplementationTimestamp(block.timestamp.add(nextImplementationDelay()));
  }

  function shouldUpgrade() external view returns (bool, address) {
    return (
      nextImplementationTimestamp() != 0
        && block.timestamp > nextImplementationTimestamp()
        && nextImplementation() != address(0),
      nextImplementation()
    );
  }

  function finalizeUpgrade() external onlyGovernance {
    _setNextImplementation(address(0));
    _setNextImplementationTimestamp(0);
    // immediately pull the configuration from the state contract
    _pullState();
  }

  /*
  * Instant re-configuration of the active strategies and investment ratios.
  * Only whitelisted strategies are allowed
  */
  function reconfigureStrategies(
    address[] memory _activeStrategies,
    uint256[] memory _investmentRatioNumerators
  ) public onlyGovernance {
    require(_activeStrategies.length > 0, "at least one strategy must be provided");
    require(_activeStrategies.length == _investmentRatioNumerators.length, "investment ratios length invalid");

    for (uint256 i = 0; i < _activeStrategies.length; i++) {
      require(SplitterStrategyWhitelist(strategyWhitelist()).isStrategyWhitelisted(_activeStrategies[i]), "active strategy not whitelisted");
    }

    // pushing into the remote config contract
    SplitterConfig(splitterConfig()).pushState(
      _activeStrategies,
      _investmentRatioNumerators
    );
    // and immediately pulling it, for keeping the values locally
    // (for gas efficiency)
    _pullState();
  }

  function depositArbCheck() public view returns (bool) {
    for (uint256 i = 0; i < activeStrategies.length; i++) {
      if (!IStrategyV2(activeStrategies[i]).depositArbCheck()) {
        return false;
      }
    }
    return true;
  }

  /*
  * Returns the total invested amount. Includes its own balance (in case it isn't invested yet)
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    uint256 result = 0;
    for (uint256 i = 0; i < activeStrategies.length; i++) {
      result = result.add(IStrategyV2(activeStrategies[i]).investedUnderlyingBalance());
    }
    return result.add(IERC20(underlying()).balanceOf(address(this)));
  }

  /*
  * Invests all tokens that were accumulated so far
  */
  function investAllUnderlying() internal {
    uint256 splitterInitialBalance = IERC20(underlying()).balanceOf(address(this));
    for (uint256 i = 0; i < activeStrategies.length; i++) {
      uint256 computedRatio = splitterInitialBalance.mul(investmentRatioNumerators[i]).div(investmentRatioDenominator);
      uint256 toInvest = Math.min(computedRatio, IERC20(underlying()).balanceOf(address(this)));
      if (toInvest > 0) {
        IERC20(underlying()).safeTransfer(activeStrategies[i], toInvest);
      }
    }
    // the slack would remain in the splitter
  }

  /**
  * Withdraws an amount from a specific whitelisted strategy into the splitter
  * These could be then re-invested using investAllUnderlying()
  * Should be used for recovery operations only
  */
  function withdrawFromStrategy(address strategy, uint256 correspondingShares, uint256 totalShares) public onlyGovernance {
    require(SplitterStrategyWhitelist(strategyWhitelist()).isStrategyWhitelisted(strategy), "strategy not whitelisted");
    IStrategyV2(strategy).withdrawToVault(correspondingShares, totalShares);
  }

  /**
  * Pushes funds from the splitter into a specific whitelisted strategy
  * Could be needed for some recovery or manual management
  */
  function investIntoStrategy(address strategy, uint256 amount) public onlyGovernance {
    require(SplitterStrategyWhitelist(strategyWhitelist()).isStrategyWhitelisted(strategy), "strategy not whitelisted");
    IERC20(underlying()).safeTransfer(strategy, amount);
  }

  /**
  * Makes a partial withdraw from one strategy into another strategy
  * Could be needed for some recovery or manual management
  * Fails when the resulting withdrawal underlying amount is zero, an extra protection against
  * accidental burn of shares
  * This method could be useful when gradually moving funds from one strategy to another
  * in case of a full migration or manual re-balancing
  */
  function moveAcrossStrategies(address sourceStrategy, uint256 sourceCorrespondingShares, uint256 sourceTotalShares, address destinationStrategy) external onlyGovernance {
    uint256 balanceBefore = IERC20(underlying()).balanceOf(address(this));
    withdrawFromStrategy(sourceStrategy, sourceCorrespondingShares, sourceTotalShares);
    uint256 amount = IERC20(underlying()).balanceOf(address(this)).sub(balanceBefore);
    require(amount > 0, "resulting amount must be greater than 0");
    investIntoStrategy(destinationStrategy, amount);
  }

  /**
  * Makes a complete withdraw from one strategy into another strategy
  * Could be needed for some recovery or manual management
  * Fails when the resulting withdrawal underlying amount is zero, an extra protection against
  * accidental burn of shares
  */
  function moveAllAcrossStrategies(address sourceStrategy, address destinationStrategy) external onlyGovernance {
    require(SplitterStrategyWhitelist(strategyWhitelist()).isStrategyWhitelisted(sourceStrategy), "sourceStrategy not whitelisted");
    uint256 balanceBefore = IERC20(underlying()).balanceOf(address(this));
    IStrategyV2(sourceStrategy).withdrawAllToVault();
    uint256 amount = IERC20(underlying()).balanceOf(address(this)).sub(balanceBefore);
    require(amount > 0, "resulting amount must be greater than 0");
    investIntoStrategy(destinationStrategy, amount);
  }

  /**
  * Withdraws all funds from all the active strategies
  * and sends them into the vault
  */
  function withdrawAllToVault() external restricted {
    for (uint256 i = 0; i < activeStrategies.length; i++) {
      if (IStrategyV2(activeStrategies[i]).investedUnderlyingBalance() > 0) {
        IStrategyV2(activeStrategies[i]).withdrawAllToVault();
      }
    }
    uint256 actualBalance = IERC20(underlying()).balanceOf(address(this));
    if (actualBalance > 0) {
      IERC20(underlying()).safeTransfer(vault(), actualBalance);
    }
  }

  /*
  * Cashes out some amount (defined by the fraction of correspondingShares / totalShares by each strategy)
  * and sends the underlying into the vault.
  * Note that it would be totally okay to have an empty strategy (e.g., if it is new and
  * no funds were migrated into it yet) because all zero balances would be skipped.
  * If the splitter has uninvested balance, it would be proportionally withdrawn also
  */
  function withdrawToVault(uint256 correspondingShares, uint256 totalShares) external restricted {
    require(correspondingShares > 0, "correspondingShares must be greater than 0");
    uint256 initialSplitterBalance = IERC20(underlying()).balanceOf(address(this));

    for (uint256 i = 0; i < activeStrategies.length; i++) {
      uint256 strategyBalance = IStrategyV2(activeStrategies[i]).investedUnderlyingBalance();
      if (strategyBalance > 0) {
        IStrategyV2(activeStrategies[i]).withdrawToVault(
          correspondingShares, totalShares
        );
      }
    }

    uint256 totalWithdraw = IERC20(underlying()).balanceOf(address(this))
      .sub(initialSplitterBalance)
      .add(initialSplitterBalance.mul(correspondingShares).div(totalShares));

    if (totalWithdraw > 0) {
      IERC20(underlying()).safeTransfer(vault(), totalWithdraw);
    }
  }

  /**
  * Calls doHardWork on all the strategies
  */
  function doHardWork() public restricted {
    investAllUnderlying();
    for (uint256 i = 0; i < activeStrategies.length; i++) {
      IStrategyV2(activeStrategies[i]).doHardWork();
    }
  }

  /**
  * Calls doHardWork on a specific strategy
  * Could be useful for manual recovery or correctional operations
  */
  function doHardWork(address _strategy) public restricted {
    IStrategyV2(_strategy).doHardWork();
  }

  /**
  * Returns the total number of whitelisted strategies
  */
  function whitelistedStrategyCount() public view returns (uint256) {
    return SplitterStrategyWhitelist(strategyWhitelist()).whitelistedStrategyCount();
  }

  /**
  * Returns true if the timelock has expired and it is allowed to whitelist
  * a new strategy
  */
  function canWhitelistStrategy(address _strategy) public view returns (bool) {
    return (_strategy == futureStrategy()
      && block.timestamp > strategyWhitelistTime()
      && strategyWhitelistTime() > 0); // or the timelock has passed
  }

  /**
  * Indicates that a strategy would be added to the splitter
  * The timelock is allowing the public to review the new strategy
  */
  function announceStrategyWhitelist(address _strategy) public onlyGovernance {
    require(_strategy != address(0), "_strategy cannot be 0x0");
    require(IStrategyV2(_strategy).underlying() == address(underlying()), "Underlying of splitter must match Strategy underlying");
    require(IStrategyV2(_strategy).vault() == address(this), "The strategy does not belong to this splitter");

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
  * It is only allowed in case its underlying balance is 0 (to prevent from an accidental unwhitelisting of a working strategy)
  */
  function unwhitelistStrategy(address _strategy) public onlyGovernance {
    require(_strategy != address(0), "_strategy cannot be 0x0");
    require(whitelistedStrategyCount() >= 2, "must leave at least one whitelisted strategy");

    require(SplitterStrategyWhitelist(strategyWhitelist()).isStrategyWhitelisted(_strategy), "_strategy is not whitelisted");

    IStrategyV2 strategy = IStrategyV2(_strategy);
    require(strategy.investedUnderlyingBalance() == 0, "can only unwhitelist an empty strategy");

    emit StrategyUnwhitelisted(_strategy);
    SplitterStrategyWhitelist(strategyWhitelist()).unwhitelist(_strategy);
  }

  /**
  * Adds a given strategy into the whitelist
  * Possible only after the timelock expired
  */
  function whitelistStrategy(address _strategy) public onlyGovernance {
    require(canWhitelistStrategy(_strategy),
      "The strategy exists and switch timelock did not elapse yet");

    require(_strategy != address(0), "_strategy cannot be 0x0");
    require(IStrategyV2(_strategy).underlying() == address(underlying()), "Underlying of splitter must match Strategy underlying");
    require(IStrategyV2(_strategy).vault() == address(this), "The strategy does not belong to this splitter");

    SplitterStrategyWhitelist(strategyWhitelist()).whitelist(_strategy);

    emit StrategyWhitelisted(_strategy);
    IERC20(underlying()).safeApprove(_strategy, 0);
    IERC20(underlying()).safeApprove(_strategy, uint256(~0));
    finalizeStrategyWhitelist();
  }

  // should only be called by controller
  function salvage(address destination, address token, uint256 amount) external restricted {
    require(!unsalvagableTokens(token), "token is defined as not salvageable");
    IERC20(token).safeTransfer(destination, amount);
  }
}
