pragma solidity 0.5.16;

import "../../proxies/TimeLockedProxy.sol";

contract TestProxyTarget0 {
    function getStr() external returns (string memory) {
        return "target0";
    }
}

contract TestProxyTarget1 {
    function getStr() external returns (string memory) {
        return "target1";
    }
}


contract TestProxy is TimeLockedProxy {

    constructor(address _logic, bytes memory _data, address _storage, uint256 _timer)
    TimeLockedProxy(_logic, _data, _storage, _timer)
    public
    {}

    function getStr() external ifAdmin returns (string memory) {
        return "proxy";
    }
}
