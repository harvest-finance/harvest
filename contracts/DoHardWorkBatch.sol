pragma solidity 0.5.16;

import "./Controllable.sol";
import "./hardworkInterface/IController.sol";

contract DoHardWorkBatch is Controllable {

  constructor(address _storage)
  Controllable(_storage) public {}
    
    function doHardWorks(address[] memory vaultAddresses) public onlyGovernance {
        for (uint i = 0; i < vaultAddresses.length; i++) {
            IController(controller()).doHardWork(vaultAddresses[i]);
        }
    }
}