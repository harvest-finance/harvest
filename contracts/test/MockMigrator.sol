pragma solidity 0.5.16;

import "../hardworkInterface/IMigrator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract MockMigrator is IMigrator {
  using SafeERC20 for IERC20;
  address public strategy;
  address public newVault;

  constructor(
    address _newVault,
    address _strategy
  ) public {
    newVault = _newVault;
    strategy = _strategy;
  }

  function pullFromStrategy() public {
    IERC20(newVault).safeTransferFrom(strategy, address(this), IERC20(newVault).balanceOf(strategy));
  }
}
