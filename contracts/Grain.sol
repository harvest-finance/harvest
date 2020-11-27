pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "./Governable.sol";

contract Grain is ERC20, ERC20Detailed, ERC20Capped, ERC20Burnable, Governable {

  // IOU TOKEN: 30938517.224397506697899427
  //            30939517.000000000000000000 (a buffer of 1000 IOUs)
  uint256 public constant MAX_AMOUNT = 30939517000000000000000000;

  constructor(address _storage) public
  ERC20Detailed("GRAIN Token", "GRAIN", 18)
  ERC20Capped(MAX_AMOUNT)
  Governable(_storage) {
    // msg.sender should not be a minter
    renounceMinter();
    // governance will become the only minter
    _addMinter(governance());
  }

  /**
  * Overrides adding new minters so that only governance can authorized them.
  */
  function addMinter(address _minter) public onlyGovernance {
    super.addMinter(_minter);
  }
}
