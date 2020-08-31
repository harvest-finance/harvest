pragma solidity 0.5.16;

import "../hardworkInterface/IVault.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockGreyListed {

  address public vault;

  constructor(address _vault) public {
    vault = _vault;
  }

  function deposit(uint256 _token, uint256 _amount) public {
    IERC20(_token).approve(vault, _amount);
    IVault(vault).deposit(_amount);
  }
}
