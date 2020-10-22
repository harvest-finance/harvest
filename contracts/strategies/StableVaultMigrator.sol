pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../hardworkInterface/IStrategy.sol";
import "../Controllable.sol";
import "../hardworkInterface/IMigrator.sol";
import "../hardworkInterface/IVault.sol";
import "../Governable.sol";
import "./VaultMigratorStrategy.sol";

contract StableVaultMigrator is Controllable {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  constructor(
    address _storage
  ) public
  Controllable(_storage) {
  }

  modifier restricted() {
    require(msg.sender == address(controller()) || msg.sender == address(governance()),
      "The sender has to be the controller or governance");
    _;
  }

  function setStorageBack(address vault) internal {
    address oldStorage = 0xc95CbE4ca30055c787CB784BE99D6a8494d0d197;
    Governable(vault).setStorage(oldStorage);
  }

  function migrateInOneTx(
    address _oldVault,
    address _newVault,
    address _migratorStrategy,
    address _newStrategy,
    address _poolAddress
  ) external onlyGovernance {
    require(_oldVault != address(0), "_oldVault cannot be empty");
    require(_newVault != address(0), "_newVault cannot be empty");
    require(_migratorStrategy != address(0), "_migratorStrategy cannot be empty");
    require(_newStrategy != address(0), "_newStrategy cannot be empty");

    IVault oldVault = IVault(_oldVault);
    uint256 balanceInVault = oldVault.underlyingBalanceInVault();

    IVault newVault = IVault(_newVault);
    IStrategy newStrategy = IStrategy(_newStrategy);
    VaultMigratorStrategy migratorStrategy = VaultMigratorStrategy(_migratorStrategy);

    require(oldVault.underlying() == newVault.underlying(), "underlying must match (1)");
    require(address(newVault.underlying()) == address(migratorStrategy.underlying()), "underlying must match (2)");
    require(newVault.underlying() == newStrategy.underlying(), "underlying must match (3)");

    // exit the strategy and enter the new vault with the migrator strategy
    oldVault.setStrategy(address(migratorStrategy));
    uint256 _toInvestDenominator = oldVault.underlyingBalanceWithInvestment();
    oldVault.setVaultFractionToInvest(99999999999999999, 100000000000000000);
    oldVault.doHardWork();
    // settle the asset difference before migrating the assets
    // we assume that the asset is present in this contract, otherwise the tx will fail
    IERC20(oldVault.underlying()).safeTransfer(
      address(migratorStrategy), IVault(oldVault).underlyingBalanceInVault()
    );
    migratorStrategy.setMigrator(_poolAddress);
    migratorStrategy.migrateToNewVault();

    // we need absolute numbers here to make the amount match, calculate before the call
    uint256 _toInvestNumerator = _toInvestDenominator.sub(balanceInVault);
    newVault.setVaultFractionToInvest(_toInvestNumerator, _toInvestDenominator);
    // linking is done during the deployment
    newVault.doHardWork();

    // reset governance in both vaults
    setStorageBack(_oldVault);
    setStorageBack(_newVault);
  }
}
