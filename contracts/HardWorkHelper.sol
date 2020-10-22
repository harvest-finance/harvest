pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Controllable.sol";
import "./hardworkInterface/IController.sol";

contract HardWorkHelper is Controllable {

  address[] public vaults;
  IERC20 public farmToken;

  constructor(address _storage, address _farmToken)
  Controllable(_storage) public {
    farmToken = IERC20(_farmToken);
  }

  /**
  * Initializes the vaults and order of calls
  */
  function setVaults(address[] memory newVaults) public onlyGovernance {
    if (getNumberOfVaults() > 0) {
      for (uint256 i = vaults.length - 1; i > 0 ; i--) {
        delete vaults[i];
      }
      // delete the last one without underflowing on i
      delete vaults[0];
    }
    vaults.length = 0;
    for (uint256 i = 0; i < newVaults.length; i++) {
      vaults.push(newVaults[i]);
    }
  }

  function getNumberOfVaults() public view returns(uint256) {
    return vaults.length;
  }

  /**
  * Does the hard work for all the pools. Cannot be called by smart contracts in order to avoid
  * a possible flash loan liquidation attack.
  */
  function doHardWork() public {
    require(msg.sender == tx.origin, "Smart contracts cannot work hard");
    for (uint256 i = 0; i < vaults.length; i++) {
      IController(controller()).doHardWork(vaults[i]);
    }
    // transfer the reward to the caller
    uint256 balance = farmToken.balanceOf(address(this));
    farmToken.transfer(msg.sender, balance);
  }
}
