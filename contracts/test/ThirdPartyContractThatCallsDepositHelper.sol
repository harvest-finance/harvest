pragma solidity 0.5.16;

import "../DepositHelper.sol";
import "../hardworkInterface/IVault.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ThirdPartyContractThatCallsDepositHelper {

  address public depositHelper;

  constructor(address _depositHelper) public {
    depositHelper = _depositHelper;
  }

  function depositAll(uint256[] memory _amounts, address[] memory _vaults) public {
    for (uint i = 0; i < _amounts.length; i++) {
      IERC20(IVault(_vaults[i]).underlying()).approve(depositHelper, _amounts[i]);
    }
    DepositHelper(depositHelper).depositAll(_amounts, _vaults);
  }
}
