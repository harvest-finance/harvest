pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../hardworkInterface/IController.sol";
import "../../Controllable.sol";
import "../../Storage.sol";
import "../../hardworkInterface/IVault.sol";

contract LossStrategy is IStrategy, Controllable {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  IERC20 public underlying;
  IVault public vault;
  uint256 public balance;

  // These tokens cannot be claimed by the controller
  mapping (address => bool) public unsalvagableTokens;

  constructor(address _storage, address _underlying, address _vault) public
  Controllable(_storage) {
    require(_underlying != address(0), "_underlying cannot be empty");
    require(_vault != address(0), "_vault cannot be empty");
    underlying = IERC20(_underlying);
    vault = IVault(_vault);
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

  modifier onlyVault() {
    require(msg.sender == address(vault), "The caller must be the vault");
    _;
  }

  modifier restricted() {
    require(msg.sender == address(vault) || msg.sender == address(controller()),
      "The sender has to be the controller or vault");
    _;
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
    // get rid of 10% forever
    uint256 contribution = underlying.balanceOf(address(this)).sub(balance);
    underlying.transfer(address(1), contribution.div(10));
    balance = underlying.balanceOf(address(this));
  }

  /*
  * Cashes everything out and withdraws to the vault
  */
  function withdrawAllToVault() external restricted {
    underlying.safeTransfer(address(vault), underlying.balanceOf(address(this)));
    balance = underlying.balanceOf(address(this));
  }

  /*
  * Cashes some amount out and withdraws to the vault
  */
  function withdrawToVault(uint256 amount) external restricted {
    underlying.safeTransfer(address(vault), amount);
    balance = underlying.balanceOf(address(this));
  }

  /*
  * Honest harvesting. It's not much, but it pays off
  */
  function doHardWork() external onlyVault {
    // a no-op
    investAllUnderlying();
  }

  // should only be called by controller
  function salvage(address destination, address token, uint256 amount) external onlyController {
    IERC20(token).safeTransfer(destination, amount);
  }
}
