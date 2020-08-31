pragma solidity 0.5.16;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "../hardworkInterface/IStrategy.sol";
import "../hardworkInterface/IController.sol";
import "../hardworkInterface/IVault.sol";
import "../Governable.sol";
import "../Controllable.sol";

contract NoopVault is ERC20, ERC20Detailed, IVault, Controllable {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  event Withdraw(address indexed beneficiary, uint256 amount);
  event Deposit(address indexed beneficiary, uint256 amount);
  event Invest(uint256 amount);

  IStrategy public strategy;
  IERC20 public underlying;

  IStrategy[] public strategies;

  uint256 underlyingUnit;

  mapping(address => uint256) contributions;
  mapping(address => uint256) withdrawals;

  // how much was deposited in total using the deposit() method
  // note this would be different from the actual balance
  uint256 public totalUnderlyingDeposited = 0;

  uint256 vaultFractionToInvestNumerator = 9500; // investing 95% of the vault
  uint256 vaultFractionToInvestDenominator = 10000;

  constructor(address _storage,
      address _underlying,
      uint256 _toInvestNumerator,
      uint256 _toInvestDenominator
  ) ERC20Detailed(
    string(abi.encodePacked("Chad_", ERC20Detailed(_underlying).name())),
    string(abi.encodePacked("chad", ERC20Detailed(_underlying).symbol())),
    ERC20Detailed(_underlying).decimals()
  ) Controllable(_storage) public {
    underlying = IERC20(_underlying);
    require(_toInvestNumerator <= _toInvestDenominator, "cannot invest more than 100%");
    require(_toInvestDenominator != 0, "cannot divide by 0");
    vaultFractionToInvestDenominator = _toInvestDenominator;
    vaultFractionToInvestNumerator = _toInvestNumerator;
    underlyingUnit = 10 ** uint256(ERC20Detailed(address(underlying)).decimals());
  }

  function addStrategy(address _strategy) public {
  }

  function removeStrategy(address _strategy) public {
  }

  function getNumberOfStrategies() public view returns(uint256) {
    return 0;
  }

  function bestStrategy() public view returns(IStrategy) {
    return IStrategy(address(0));
  }

  function doHardWork() external {
  }

  function underlyingBalanceInVault() view public returns (uint256) {
    return underlying.balanceOf(address(this));
  }

  function underlyingBalanceWithInvestment() view public returns (uint256) {
    return underlyingBalanceInVault();
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

  function strategyExists(address _strategy) public view returns(bool) {
    return false;
  }

  function setStrategy(address _strategy) public {
  }

  function setVaultFractionToInvest(uint256 numerator, uint256 denominator) external onlyGovernance {
    require(denominator > 0, "denominator must be greater than 0");
    require(numerator <= denominator, "denominator must be greater than or equal to numerator");
    vaultFractionToInvestNumerator = numerator;
    vaultFractionToInvestDenominator = denominator;
  }

  function availableToInvestOut() public view returns (uint256) {
    return 0;
  }

  function invest() public {
  }

  function deposit(uint256 amount) external {
    _deposit(amount, msg.sender, msg.sender);
  }

  function depositFor(uint256 amount, address holder) public {
    _deposit(amount, msg.sender, holder);
  }

  function withdrawAll() external {
  }

  function withdraw(uint256 numberOfShares) external {
    require(totalSupply() > 0, "Vault has no shares");
    require(numberOfShares > 0, "numberOfShares must be greater than 0");

    uint256 underlyingAmountToWithdraw = underlyingBalanceWithInvestment()
        .mul(numberOfShares)
        .div(totalSupply());

    if (underlyingAmountToWithdraw > underlyingBalanceInVault()) {
      // withdraw everything from the strategy to accurately check the share value
      uint256 missing = underlyingAmountToWithdraw.sub(underlyingBalanceInVault());
      strategy.withdrawToVault(missing);
      // recalculate to improve accuracy
      underlyingAmountToWithdraw = Math.min(underlyingBalanceWithInvestment()
          .mul(numberOfShares)
          .div(totalSupply()), underlying.balanceOf(address(this)));
    }

    _burn(msg.sender, numberOfShares);

    underlying.safeTransfer(msg.sender, underlyingAmountToWithdraw);

    // update the withdrawal amount for the holder
    withdrawals[msg.sender] = withdrawals[msg.sender].add(underlyingAmountToWithdraw);
    emit Withdraw(msg.sender, underlyingAmountToWithdraw);
  }

  function _deposit(uint256 amount, address sender, address beneficiary) internal {
    require(amount > 0, "Cannot deposit 0");
    require(beneficiary != address(0), "holder must be defined");

    uint256 toMint = totalSupply() == 0
        ? amount
        : amount.mul(totalSupply()).div(underlyingBalanceWithInvestment());
    _mint(beneficiary, toMint);

    uint256 oldActualBalance = underlyingBalanceInVault();
    underlying.safeTransferFrom(sender, address(this), amount);

    // confirm a successful transfer
    assert(underlyingBalanceInVault().sub(amount) >= oldActualBalance);
    totalUnderlyingDeposited = totalUnderlyingDeposited.add(amount);

    // update the contribution amount for the beneficiary
    contributions[beneficiary] = contributions[beneficiary].add(amount);
    emit Deposit(beneficiary, amount);
  }
}
