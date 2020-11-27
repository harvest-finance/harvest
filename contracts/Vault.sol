pragma solidity 0.5.16;

import "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Detailed.sol";
import "./hardworkInterface/IStrategy.sol";
import "./hardworkInterface/IStrategyV2.sol";
import "./hardworkInterface/IVault.sol";
import "./hardworkInterface/IController.sol";
import "./hardworkInterface/IUpgradeSource.sol";
import "./ControllableInit.sol";
import "./VaultStorage.sol";

contract Vault is ERC20, ERC20Detailed, IVault, IUpgradeSource, ControllableInit, VaultStorage {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  event Withdraw(address indexed beneficiary, uint256 amount);
  event Deposit(address indexed beneficiary, uint256 amount);
  event Invest(uint256 amount);
  event StrategyAnnounced(address newStrategy, uint256 time);
  event StrategyChanged(address newStrategy, address oldStrategy);

  modifier whenStrategyDefined() {
    require(address(strategy()) != address(0), "Strategy must be defined");
    _;
  }

  // Only smart contracts will be affected by this modifier
  modifier defense() {
    require(
      (msg.sender == tx.origin) ||                // If it is a normal user and not smart contract,
      // then the requirement will pass
      !IController(controller()).greyList(msg.sender), // If it is a smart contract, then
      "This smart contract has been grey listed"  // make sure that it is not on our greyList.
    );
    _;
  }

  constructor() public {
  }

  // the function is name differently to not cause inheritance clash in truffle and allows tests
  function initializeVault(address _storage,
    address _underlying,
    uint256 _toInvestNumerator,
    uint256 _toInvestDenominator
  ) public initializer {
    require(_toInvestNumerator <= _toInvestDenominator, "cannot invest more than 100%");
    require(_toInvestDenominator != 0, "cannot divide by 0");

    ERC20Detailed.initialize(
      string(abi.encodePacked("FARM_", ERC20Detailed(_underlying).symbol())),
      string(abi.encodePacked("f", ERC20Detailed(_underlying).symbol())),
      ERC20Detailed(_underlying).decimals()
    );
    ControllableInit.initialize(
      _storage
    );

    uint256 underlyingUnit = 10 ** uint256(ERC20Detailed(address(_underlying)).decimals());
    uint256 implementationDelay = 12 hours;
    uint256 strategyChangeDelay = 12 hours;
    VaultStorage.initialize(
      _underlying,
      _toInvestNumerator,
      _toInvestDenominator,
      underlyingUnit,
      implementationDelay,
      strategyChangeDelay
    );
  }

  function strategy() public view returns(address) {
    return _strategy();
  }

  function underlying() public view returns(address) {
    return _underlying();
  }

  function underlyingUnit() public view returns(uint256) {
    return _underlyingUnit();
  }

  function vaultFractionToInvestNumerator() public view returns(uint256) {
    return _vaultFractionToInvestNumerator();
  }

  function vaultFractionToInvestDenominator() public view returns(uint256) {
    return _vaultFractionToInvestDenominator();
  }

  function nextImplementation() public view returns(address) {
    return _nextImplementation();
  }

  function nextImplementationTimestamp() public view returns(uint256) {
    return _nextImplementationTimestamp();
  }

  function nextImplementationDelay() public view returns(uint256) {
    return _nextImplementationDelay();
  }

  /**
  * Chooses the best strategy and re-invests. If the strategy did not change, it just calls
  * doHardWork on the current strategy. Call this through controller to claim hard rewards.
  */
  function doHardWork() external whenStrategyDefined onlyControllerOrGovernance {
    if (_withdrawBeforeReinvesting()) {
      IStrategy(strategy()).withdrawAllToVault();
    }

    // ensure that new funds are invested too
    invest();
    IStrategy(strategy()).doHardWork();
    uint256 sharePriceAfterHardWork = getPricePerFullShare();

    if (!allowSharePriceDecrease()) {
      require(_sharePriceCheckpoint() <= sharePriceAfterHardWork, "Share price should not decrease");
    }

    _setSharePriceCheckpoint(sharePriceAfterHardWork);
  }

  /*
  * Returns the cash balance across all users in this contract.
  */
  function underlyingBalanceInVault() view public returns (uint256) {
    return IERC20(underlying()).balanceOf(address(this));
  }

  /* Returns the current underlying (e.g., DAI's) balance together with
   * the invested amount (if DAI is invested elsewhere by the strategy).
  */
  function underlyingBalanceWithInvestment() view public returns (uint256) {
    if (address(strategy()) == address(0)) {
      // initial state, when not set
      return underlyingBalanceInVault();
    }
    return underlyingBalanceInVault().add(IStrategy(strategy()).investedUnderlyingBalance());
  }

  function getPricePerFullShare() public view returns (uint256) {
    return totalSupply() == 0
        ? underlyingUnit()
        : underlyingUnit().mul(underlyingBalanceWithInvestment()).div(totalSupply());
  }

  function getPricePerFullShareCheckpoint() public view returns (uint256) {
    return _sharePriceCheckpoint();
  }

  function getEstimatedWithdrawalAmount(uint256 numberOfShares) public view returns (uint256 estimatedWithdrawal, uint256 realTimeCalculatedValue) {
    uint256 storedSharePrice = _sharePriceCheckpoint();
    uint256 calculatedSharePrice = getPricePerFullShare();
    return (
      numberOfShares.mul(Math.min(storedSharePrice, calculatedSharePrice))
        .div(underlyingUnit()),

      numberOfShares.mul(calculatedSharePrice)
        .div(underlyingUnit())
    );
  }

  function underlyingBalanceWithInvestmentForHolder(address holder) view external returns (uint256) {
    // for compatibility
    (uint256 estimatedWithdrawal, ) = getEstimatedWithdrawalAmount(balanceOf(holder));
    return estimatedWithdrawal;
  }

  function futureStrategy() public view returns (address) {
    return _futureStrategy();
  }

  function strategyUpdateTime() public view returns (uint256) {
    return _strategyUpdateTime();
  }

  function strategyTimeLock() public view returns (uint256) {
    return _strategyTimeLock();
  }

  function canUpdateStrategy(address _strategy) public view returns(bool) {
    return strategy() == address(0) // no strategy was set yet
      || (_strategy == futureStrategy()
          && block.timestamp > strategyUpdateTime()
          && strategyUpdateTime() > 0); // or the timelock has passed
  }

  /**
  * Indicates that the strategy update will happen in the future
  */
  function announceStrategyUpdate(address _strategy) public onlyControllerOrGovernance {
    // records a new timestamp
    uint256 when = block.timestamp.add(strategyTimeLock());
    _setStrategyUpdateTime(when);
    _setFutureStrategy(_strategy);
    emit StrategyAnnounced(_strategy, when);
  }

  /**
  * Finalizes (or cancels) the strategy update by resetting the data
  */
  function finalizeStrategyUpdate() public onlyControllerOrGovernance {
    _setStrategyUpdateTime(0);
    _setFutureStrategy(address(0));
  }

  function setStrategy(address _strategy) public onlyControllerOrGovernance {
    require(canUpdateStrategy(_strategy),
      "The strategy exists and switch timelock did not elapse yet");
    require(_strategy != address(0), "new _strategy cannot be empty");
    require(IStrategy(_strategy).underlying() == address(underlying()), "Vault underlying must match Strategy underlying");
    require(IStrategy(_strategy).vault() == address(this), "the strategy does not belong to this vault");

    emit StrategyChanged(_strategy, strategy());
    if (address(_strategy) != address(strategy())) {
      if (address(strategy()) != address(0)) { // if the original strategy (no underscore) is defined
        IERC20(underlying()).safeApprove(address(strategy()), 0);
        IStrategy(strategy()).withdrawAllToVault();
      }
      _setStrategy(_strategy);
      IERC20(underlying()).safeApprove(address(strategy()), 0);
      IERC20(underlying()).safeApprove(address(strategy()), uint256(~0));
    }
    finalizeStrategyUpdate();
  }

  function setVaultFractionToInvest(uint256 numerator, uint256 denominator) external onlyGovernance {
    require(denominator > 0, "denominator must be greater than 0");
    require(numerator <= denominator, "denominator must be greater than or equal to the numerator");
    _setVaultFractionToInvestNumerator(numerator);
    _setVaultFractionToInvestDenominator(denominator);
  }

  function setWithdrawBeforeReinvesting(bool value) external onlyGovernance {
    _setWithdrawBeforeReinvesting(value);
  }

  function withdrawBeforeReinvesting() public view returns (bool) {
    return _withdrawBeforeReinvesting();
  }

  function setAllowSharePriceDecrease(bool value) external onlyGovernance {
    _setAllowSharePriceDecrease(value);
  }

  function allowSharePriceDecrease() public view returns (bool) {
    return _allowSharePriceDecrease();
  }

  function availableToInvestOut() public view returns (uint256) {
    uint256 wantInvestInTotal = underlyingBalanceWithInvestment()
        .mul(vaultFractionToInvestNumerator())
        .div(vaultFractionToInvestDenominator());
    uint256 alreadyInvested = IStrategy(strategy()).investedUnderlyingBalance();
    if (alreadyInvested >= wantInvestInTotal) {
      return 0;
    } else {
      uint256 remainingToInvest = wantInvestInTotal.sub(alreadyInvested);
      return remainingToInvest <= underlyingBalanceInVault()
        // TODO: we think that the "else" branch of the ternary operation is not
        // going to get hit
        ? remainingToInvest : underlyingBalanceInVault();
    }
  }

  function invest() internal whenStrategyDefined {
    uint256 availableAmount = availableToInvestOut();
    if (availableAmount > 0) {
      IERC20(underlying()).safeTransfer(address(strategy()), availableAmount);
      emit Invest(availableAmount);
    }
  }

  /*
  * Allows for depositing the underlying asset in exchange for shares.
  * Approval is assumed.
  */
  function deposit(uint256 amount) external defense {
    _deposit(amount, msg.sender, msg.sender);
  }

  /*
  * Allows for depositing the underlying asset in exchange for shares
  * assigned to the holder.
  * This facilitates depositing for someone else (using DepositHelper)
  */
  function depositFor(uint256 amount, address holder) public defense {
    _deposit(amount, msg.sender, holder);
  }

  function withdrawAll() public onlyControllerOrGovernance whenStrategyDefined {
    IStrategy(strategy()).withdrawAllToVault();
  }

  function withdraw(uint256 numberOfShares) external {
    require(totalSupply() > 0, "Vault has no shares");
    require(numberOfShares > 0, "numberOfShares must be greater than 0");
    uint256 totalShareSupply = totalSupply();
    _burn(msg.sender, numberOfShares);

    uint256 storedSharePrice = _sharePriceCheckpoint();
    uint256 calculatedSharePrice = getPricePerFullShare();

    uint256 underlyingAmountToWithdraw = numberOfShares
      .mul(Math.min(storedSharePrice, calculatedSharePrice))
      .div(underlyingUnit());

    if (underlyingAmountToWithdraw > underlyingBalanceInVault()) {
      // withdraw everything from the strategy to accurately check the share value
      if (numberOfShares == totalShareSupply) {
        IStrategy(strategy()).withdrawAllToVault();
        underlyingAmountToWithdraw = underlyingBalanceInVault();
      } else {
        uint256 missingUnderlying = underlyingAmountToWithdraw.sub(underlyingBalanceInVault());
        uint256 missingShares = numberOfShares.mul(missingUnderlying).div(underlyingAmountToWithdraw);
        // When withdrawing to vault here, the vault does not have any assets. Therefore,
        // all the assets that are in the strategy match the total supply of shares, increased
        // by the share proportion that was already burned at the beginning of this withdraw transaction.
        IStrategyV2(strategy()).withdrawToVault(missingShares, (totalSupply()).add(missingShares));
        // recalculate to improve accuracy
        calculatedSharePrice = getPricePerFullShare();

        uint256 updatedUnderlyingAmountToWithdraw = numberOfShares
          .mul(Math.min(storedSharePrice, calculatedSharePrice))
          .div(underlyingUnit());

        underlyingAmountToWithdraw = Math.min(
          updatedUnderlyingAmountToWithdraw,
          underlyingBalanceInVault()
        );
      }
    }

    IERC20(underlying()).safeTransfer(msg.sender, underlyingAmountToWithdraw);

    // update the withdrawal amount for the holder
    emit Withdraw(msg.sender, underlyingAmountToWithdraw);
  }

  function _deposit(uint256 amount, address sender, address beneficiary) internal {
    require(amount > 0, "Cannot deposit 0");
    require(beneficiary != address(0), "holder must be defined");

    if (address(strategy()) != address(0)) {
      require(IStrategy(strategy()).depositArbCheck(), "Too much arb");
    }

    uint256 storedSharePrice = _sharePriceCheckpoint();
    uint256 calculatedSharePrice = getPricePerFullShare();

    uint256 toMint = amount.mul(underlyingUnit()).div(
      Math.max(storedSharePrice, calculatedSharePrice)
    );

    _mint(beneficiary, toMint);

    IERC20(underlying()).safeTransferFrom(sender, address(this), amount);

    // update the contribution amount for the beneficiary
    emit Deposit(beneficiary, amount);
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
    // for vaults V3
    _setSharePriceCheckpoint(getPricePerFullShare());
    _setAllowSharePriceDecrease(false);
    _setWithdrawBeforeReinvesting(false);
    require(getPricePerFullShareCheckpoint() == getPricePerFullShare(), "share price corrupted");
    require(!withdrawBeforeReinvesting(), "withdrawBeforeReinvesting is incorrect");
    require(!allowSharePriceDecrease(), "allowSharePriceDecrease is incorrect");
  }
}
