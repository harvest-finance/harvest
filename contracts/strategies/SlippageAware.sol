pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract SlippageAware {
    using SafeMath for uint256;

    uint256 private constant smallInput = 10 ** 4;

    function preflightEntrance(uint256 amount) internal view returns (uint256);

    function preflightExit(uint256 amount) internal view returns (uint256);

    // Output the percentage NOT lost to slippage, scaled by 10**18.
    // I.e. if 40% is lost, this will output 0.6 * 10 ** 18
    function percentAfterSlippage(
        uint256 inputOne,
        uint256 outputOne,
        uint256 inputTwo,
        uint256 outputTwo
    ) internal pure returns (uint256 e18PercentAfterSlippage) {
        uint256 noSlippageOutput = outputOne.mul(inputTwo).div(inputOne);  // price of little slippage

        // socializes bonuses
        if (outputTwo >= noSlippageOutput) return 10 ** 18;

        // % lost = 1 - (smaller/larger)
        return outputTwo.mul(10**18).div(noSlippageOutput);
    }

    // returns the proportion left after slippage, times 10**18
    function exitAfterSlippage(uint256 amount) public view returns (uint256) {
        require(amount > smallInput);
        uint256 smallOutput = preflightExit(smallInput);
        uint256 projectedOutput = preflightExit(amount);
        return percentAfterSlippage(smallInput, smallOutput, amount, projectedOutput);
    }

    // returns the proportion left after slippage, times 10**18
    function entranceAfterSlippage(uint256 amount) public view returns (uint256) {
        require(amount > smallInput);
        uint256 smallOutput = preflightEntrance(smallInput);
        uint256 projectedOutput = preflightEntrance(amount);
        return percentAfterSlippage(smallInput, smallOutput, amount, projectedOutput);
    }
}
