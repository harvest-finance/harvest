pragma solidity ^0.5.0;

import "../../strategies/curve/CRVStrategySwerve.sol";

contract TestSlippageCalc is CRVStrategySwerve {
    function testSlippageCalc() public {
        require(
            afterSlippage(100, 100, 100, 99) == 10 ** 16,
            "99%"
        );
        require(
            afterSlippage(10000000, 10000000, 10000000, 9900000) == 10 ** 16,
            "99%, big numbers"
        );
        require(
            afterSlippage(10000000, 10000000, 10000000, 5) == 5 * 10 ** 11,
            "5e-7"
        );
    }
}
