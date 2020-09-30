pragma solidity ^0.5.0;

import "../../strategies/SlippageAware.sol";

contract TestSlippageCalc is SlippageAware {
    function testSlippageCalc() public pure {
        require(
            percentAfterSlippage(100, 100, 100, 99) == 10 ** 16,
            "99%"
        );
        require(
            percentAfterSlippage(10000000, 10000000, 10000000, 9900000) == 10 ** 16,
            "99%, big numbers"
        );
        require(
            percentAfterSlippage(10000000, 10000000, 10000000, 5) == 5 * 10 ** 11,
            "5e-7"
        );
    }
}
