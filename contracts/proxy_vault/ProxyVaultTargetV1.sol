pragma solidity 0.5.16;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";

import "../hardworkInterface/IVault.sol";
import "../hardworkInterface/IStrategy.sol";
import "../hardworkInterface/IController.sol";

import "../proxies/GovernableProxy.sol";
import "./ProxyVaultStore.sol";

// IMPORTANT:
// STORAGE CHANGES MUST BE ADDITIVE ONLY
// DO NOT CHANGE INHERITANCE ORDERS

contract ProxyVaultTarget is ERC20, IVault, ProxyStorageAccess, ProxyVaultStore {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  event Withdraw(address indexed beneficiary, uint256 amount);
  event Deposit(address indexed beneficiary, uint256 amount);
  event Invest(uint256 amount);

  IStrategy public strategy;

  mapping(address => uint256) public contributions;
  mapping(address => uint256) public withdrawals;

  modifier whenStrategyDefined() {
    require(address(strategy) != address(0), "Strategy must be defined");
    _;
  }

  // Only smart contracts will be affected by this modifier
  modifier defense() {
    require(
      // If it is a normal user and not smart contract, then the requirement will pass.
      // If it is a smart contract, then make sure that it is not on our greyList.
      (msg.sender == tx.origin) || !IController(_controller()).greyList(msg.sender),
      "This smart contract has been grey listed"
    );
    _;
  }

  /**
  * Chooses the best strategy and re-invests. If the strategy did not change, it just calls
  * doHardWork on the current strategy. Call this through controller to claim hard rewards.
  */
  function doHardWork() whenStrategyDefined onlyControllerOrGovernance external {
    // ensure that new funds are invested too
    invest();
    strategy.doHardWork();
  }

  /*
  * Returns the cash balance across all users in this contract.
  */
  function underlyingBalanceInVault() view public returns (uint256) {
    return _underlying().balanceOf(address(this));
  }

  /* Returns the current underlying (e.g., DAI's) balance together with
   * the invested amount (if DAI is invested elsewhere by the strategy).
  */
  function underlyingBalanceWithInvestment() view public returns (uint256) {
    if (address(strategy) == address(0)) {
    // initial state, when not set
    return underlyingBalanceInVault();
    }
    return underlyingBalanceInVault().add(strategy.investedUnderlyingBalance());
  }

  /*
  * Allows for getting the total contributions ever made.
  */
  function getContributions(address holder) view public returns (uint256) {
    return contributions[holder];
  }

  /*
  * Allows for getting the total withdrawals ever made.
  */
  function getWithdrawals(address holder) view public returns (uint256) {
    return withdrawals[holder];
  }

  function getPricePerFullShare() public view returns (uint256) {
    uint256 underlyingUnit = _underlyingUnit();
    return totalSupply() == 0
      ? underlyingUnit
      : underlyingUnit.mul(underlyingBalanceWithInvestment()).div(totalSupply());
  }

  /* get the user's share (in underlying)
  */
  function underlyingBalanceWithInvestmentForHolder(address holder) view external returns (uint256) {
    if (totalSupply() == 0) {
    return 0;
    }
    return underlyingBalanceWithInvestment()
      .mul(balanceOf(holder))
      .div(totalSupply());
  }

  function setStrategy(address _strategy) public onlyControllerOrGovernance {
    require(_strategy != address(0), "new _strategy cannot be empty");
    require(IStrategy(_strategy).underlying() == address(_underlying()), "Vault underlying must match Strategy underlying");
    require(IStrategy(_strategy).vault() == address(this), "the strategy does not belong to this vault");

    if (address(_strategy) != address(strategy)) {
    if (address(strategy) != address(0)) { // if the original strategy (no underscore) is defined
      _underlying().safeApprove(address(strategy), 0);
      strategy.withdrawAllToVault();
    }
    strategy = IStrategy(_strategy);
    _underlying().safeApprove(address(strategy), 0);
    _underlying().safeApprove(address(strategy), uint256(~0));
    }
  }

  function setVaultFractionToInvest(uint256 numerator, uint256 denominator) external onlyGovernance {
    require(denominator > 0, "denominator must be greater than 0");
    require(numerator < denominator, "denominator must be greater than numerator");
    _setVaultFractionToInvestNumerator(numerator);
    _setVaultFractionToInvestDenominator(denominator);
  }

  function rebalance() external onlyControllerOrGovernance {
    withdrawAll();
    invest();
  }

  function availableToInvestOut() public view returns (uint256) {
    uint256 wantInvestInTotal = underlyingBalanceWithInvestment()
      .mul(_vaultFractionToInvestNumerator())
      .div(_vaultFractionToInvestDenominator());
    uint256 alreadyInvested = strategy.investedUnderlyingBalance();
    if (alreadyInvested >= wantInvestInTotal) {
    return 0;
    } else {
    uint256 remainingToInvest = wantInvestInTotal.sub(alreadyInvested);
    return remainingToInvest <= underlyingBalanceInVault()
      ? remainingToInvest : underlyingBalanceInVault();
    }
  }

  function invest() internal whenStrategyDefined {
    uint256 availableAmount = availableToInvestOut();
    if (availableAmount > 0) {
    _underlying().safeTransfer(address(strategy), availableAmount);
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
    strategy.withdrawAllToVault();
  }

  function withdraw(uint256 numberOfShares) external {
    require(totalSupply() > 0, "Vault has no shares");
    require(numberOfShares > 0, "numberOfShares must be greater than 0");
    uint256 totalSupply = totalSupply();
    _burn(msg.sender, numberOfShares);

    uint256 underlyingAmountToWithdraw = underlyingBalanceWithInvestment()
      .mul(numberOfShares)
      .div(totalSupply);
    if (underlyingAmountToWithdraw > underlyingBalanceInVault()) {
    // withdraw everything from the strategy to accurately check the share value
    if (numberOfShares == totalSupply) {
      strategy.withdrawAllToVault();
    } else {
      uint256 missing = underlyingAmountToWithdraw.sub(underlyingBalanceInVault());
      strategy.withdrawToVault(missing);
    }
    // recalculate to improve accuracy
    underlyingAmountToWithdraw = Math.min(underlyingBalanceWithInvestment()
      .mul(numberOfShares)
      .div(totalSupply), underlyingBalanceInVault());
    }

    _underlying().safeTransfer(msg.sender, underlyingAmountToWithdraw);

    // update the withdrawal amount for the holder
    withdrawals[msg.sender] = withdrawals[msg.sender].add(underlyingAmountToWithdraw);
    emit Withdraw(msg.sender, underlyingAmountToWithdraw);
  }

  function _deposit(uint256 amount, address sender, address beneficiary) internal {
    require(amount > 0, "Cannot deposit 0");
    require(beneficiary != address(0), "holder must be defined");

    if (address(strategy) != address(0)) {
    require(strategy.depositArbCheck(), "Too much arb");
    }

    uint256 toMint = totalSupply() == 0
      ? amount
      : amount.mul(totalSupply()).div(underlyingBalanceWithInvestment());
    _mint(beneficiary, toMint);

    _underlying().safeTransferFrom(sender, address(this), amount);

    // update the contribution amount for the beneficiary
    contributions[beneficiary] = contributions[beneficiary].add(amount);
    emit Deposit(beneficiary, amount);
  }

  function name() external view returns (string memory) {
      return _name();
  }

  function symbol() external view returns (string memory) {
      return _symbol();
  }

  function decimals() external view returns (uint8) {
      return _decimals();
  }
}
