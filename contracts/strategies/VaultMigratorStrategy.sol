pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../hardworkInterface/IStrategy.sol";
import "../Controllable.sol";
import "../hardworkInterface/IMigrator.sol";
import "../hardworkInterface/IVault.sol";


contract VaultMigratorStrategy is IStrategy, Controllable {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  IERC20 public underlying;
  IVault public vault;
  address public newVault;
  address public migrator;
  mapping(address => bool) public unsalvagableTokens;

  constructor(
    address _storage,
    address _underlying,
    address _vault,
    address _newVault
  ) public
  Controllable(_storage) {
    require(_underlying != address(0), "_underlying cannot be empty");
    require(_vault != address(0), "_vault cannot be empty");
    require(_newVault != address(0), "_newVault cannot be empty");

    require(IVault(_newVault).underlying() == _underlying, "underlying must match");

    unsalvagableTokens[_underlying] = true;
    underlying = IERC20(_underlying);
    vault = IVault(_vault);
    newVault = _newVault;
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
    return underlying.balanceOf(address(this));
  }

  /*
  * Invests all tokens that were accumulated so far
  */
  function investAllUnderlying() public {
    // a no-op
  }

  function setMigrator(address _migrator) external onlyGovernance {
    migrator = _migrator;
  }

  function rebalance() public {
    // a no-op
  }

  /*
  * withdraws to the vault (in case migration is aborted)
  */
  function withdrawAllToVault() external restricted {
    uint256 balance = IERC20(underlying).balanceOf(address(this));
    IERC20(underlying).safeTransfer(address(vault), balance);
  }

  /*
  * Cashes some amount out and withdraws to the vault
  */
  function withdrawToVault(uint256 amountWei) external restricted {
    revert("Withdraws through this strategy are disabled");
  }

  // initiates the migration. Assumes all underling balance is already
  // in the strategy (transferred from the vault by doHardWork)
  function migrateToNewVault() external onlyGovernance {
    uint256 entireUnderlyingBalance = underlying.balanceOf(address(this));

    uint256 newVaultBalanceBefore = underlying.balanceOf(newVault);
    underlying.safeApprove(newVault, 0);
    underlying.safeApprove(newVault, entireUnderlyingBalance);
    IVault(newVault).deposit(entireUnderlyingBalance);
    require(underlying.balanceOf(newVault).sub(newVaultBalanceBefore) == entireUnderlyingBalance, "underlying balance mismatch");

    uint256 entireShareBalance = IERC20(newVault).balanceOf(address(this));

    require(migrator != address(0), "Migrator not set!");
    uint256 migratorBalanceBefore = IERC20(newVault).balanceOf(migrator);
    IERC20(newVault).safeApprove(migrator, 0);
    IERC20(newVault).safeApprove(migrator, entireShareBalance);
    IMigrator(migrator).pullFromStrategy();
    require(IERC20(newVault).balanceOf(migrator).sub(migratorBalanceBefore) == entireShareBalance, "share balance mismatch");
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
