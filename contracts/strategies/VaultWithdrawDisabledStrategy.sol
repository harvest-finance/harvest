pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../hardworkInterface/IStrategy.sol";
import "../Controllable.sol";
import "../hardworkInterface/IMigrator.sol";
import "../hardworkInterface/IVault.sol";


contract VaultWithdrawDisabledStrategy is IStrategy, Controllable {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  IERC20 public underlying;
  IVault public vault;
  mapping(address => bool) public unsalvagableTokens;
  bool public allowWithdraw;

  constructor(
    address _storage,
    address _underlying,
    address _vault
  ) public
  Controllable(_storage) {
    require(_underlying != address(0), "_underlying cannot be empty");
    require(_vault != address(0), "_vault cannot be empty");

    require(IVault(_vault).underlying() == _underlying, "underlying must match");

    unsalvagableTokens[_underlying] = true;
    underlying = IERC20(_underlying);
    vault = IVault(_vault);
    allowWithdraw = false;
  }

  modifier restricted() {
    require(msg.sender == address(vault) || msg.sender == address(controller()) || msg.sender == address(governance()),
      "The sender has to be the controller or vault or governance");
    _;
  }

  function depositArbCheck() public view returns(bool) {
    return false; // disable deposits
  }

  modifier onlyVault() {
    require(msg.sender == address(vault), "The caller must be the vault");
    _;
  }

  /*
  * Returns the total amount.
  */
  function investedUnderlyingBalance() view public returns (uint256) {
    revert("Disabled in this strategy. Migrate your assets using the website.");
  }

  /*
  * Invests all tokens that were accumulated so far
  */
  function investAllUnderlying() public {
    // a no-op
  }

  function setAllowWithdraw(bool value) external onlyGovernance {
    allowWithdraw = value;
  }

  function rebalance() public {
    // a no-op
  }

  /*
  * withdraws to the vault (in case migration is aborted)
  */
  function withdrawAllToVault() external restricted {
    if (!allowWithdraw) {
      revert("Withdraws through this strategy are disabled. Migrate your assets using the website.");
    }
  }

  /*
  * Cashes some amount out and withdraws to the vault
  */
  function withdrawToVault(uint256 amountWei) external restricted {
    revert("Withdraws through this strategy are disabled. Migrate your assets using the website.");
  }

  function doHardWork() external onlyVault {
    // a no-op
  }

  // should only be called by controller
  function salvage(address destination, address token, uint256 amount) external restricted {
    require(!unsalvagableTokens[token], "token is defined as not salvageable");
    IERC20(token).safeTransfer(destination, amount);
  }
}
