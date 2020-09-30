pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../hardworkInterface/IController.sol";
import "../../Controllable.sol";
import "../../strategies/ProfitNotifier.sol";
import "../../Storage.sol";
import "../../hardworkInterface/IVault.sol";


contract ProfitStrategyVariable is IStrategy, ProfitNotifier {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  IERC20 public underlying;
  IVault public vault;
  uint256 accountedBalance;
  uint256 profitRateNumerator;
  uint256 profitRateDenominator;

  // These tokens cannot be claimed by the controller
  mapping (address => bool) public unsalvagableTokens;

  constructor(address _storage, address _underlying, address _vault,
    uint256 _profitRateNumerator, uint256 _profitRateDenominator) public
  ProfitNotifier(_storage, _underlying) {
    require(_underlying != address(0), "_underlying cannot be empty");
    require(_vault != address(0), "_vault cannot be empty");
    // We assume that this contract is a minter on underlying
    underlying = IERC20(_underlying);
    vault = IVault(_vault);
    profitRateNumerator = _profitRateNumerator;
    profitRateDenominator = _profitRateDenominator;
  }

  modifier restricted() {
    require(msg.sender == address(vault) || msg.sender == address(controller()),
      "The sender has to be the controller or vault");
    _;
  }

  function depositArbCheck() public view returns(bool) {
    return true;
  }

  function exitAfterSlippage(uint256 amount) public view returns (uint256) {
    return 10**18;
  }

  function entranceAfterSlippage(uint256 amount) public view returns (uint256) {
    return 10**18;
  }

  /*
  * Returns the total invested amount.
  */
  function investedUnderlyingBalance() view public returns (uint256) {
    // for real strategies, need to calculate the invested balance
    return underlying.balanceOf(address(this));
  }

  /*
  * Invests all tokens that were accumulated so far
  */
  function investAllUnderlying() public {
    uint256 contribution = underlying.balanceOf(address(this)).sub(accountedBalance);
    // add 10% to this strategy
    // We assume that this contract is a minter on underlying
    ERC20Mintable(address(underlying)).mint(address(this),
      contribution.mul(profitRateNumerator).div(profitRateDenominator));
    accountedBalance = underlying.balanceOf(address(this));
  }

  /*
  * Cashes everything out and withdraws to the vault
  */
  function withdrawAllToVault() external restricted {
    underlying.safeTransfer(address(vault), underlying.balanceOf(address(this)));
    accountedBalance = underlying.balanceOf(address(this));
  }

  /*
  * Cashes some amount out and withdraws to the vault
  */
  function withdrawToVault(uint256 amount) external restricted {
    underlying.safeTransfer(address(vault), amount);
    accountedBalance = underlying.balanceOf(address(this));
  }

  /*
  * Honest harvesting. It's not much, but it pays off
  */
  function doHardWork() external restricted {
    investAllUnderlying();
  }

  // should only be called by controller
  function salvage(address destination, address token, uint256 amount) external onlyController {
    IERC20(token).safeTransfer(destination, amount);
  }
}
