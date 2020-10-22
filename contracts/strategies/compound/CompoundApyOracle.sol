pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../compound/ComptrollerInterface.sol";
import "../../compound/CTokenInterfaces.sol";
import "../../hardworkInterface/IStrategy.sol";
import "./CompoundInteractor.sol";
import "./CompleteCToken.sol";

contract CompoundApyOracle is Ownable {

  using SafeMath for uint256;

  ERC20Detailed public underlying;
  CompleteCToken public ctoken;
  ComptrollerInterface public comptroller;

  uint256 public ratioNumerator = 75;
  uint256 public ratioDenominator = 100;
  uint256 public blocksPerYear = 4 * 60 * 24 * 365;
  uint256 public apyDecimals = 10 ** 8;
  uint256 public profitComp;
  uint256 public compPrice;

  constructor(
    address _underlying,
    address _ctoken,
    address _comptroller
  ) public {
    comptroller = ComptrollerInterface(_comptroller);
    // COMP: 0xc00e94Cb662C3520282E6f5717214004A7f26888
    underlying = ERC20Detailed(_underlying);
    ctoken = CompleteCToken(_ctoken);
    compPrice = 150 * (10 ** uint256(underlying.decimals()));
  }

  /**
  * Converts interest per block into APY. It is assumed that the interest is scaled to 1e18
  * (so that 1e18) is 100%, and that it is bigger than 100.
  */
  function annualize(uint256 interest) internal view returns (uint256) {
    uint256 i = blocksPerYear;
    uint256 result = 10 ** 18 + interest;
    // divide by 100 to make some space for calculating powers
    result = result / 100;
    while (i > 0) {
      if (i % 2 == 0) {
        result = result * result;
        result = result / (10 ** 16);
        i = i / 2;
      } else {
        result = result * ((10 ** 18 + interest) / 100);
        result = result / (10 ** 16);
        i = i - 1;
      }
    }
    return result * 100;
  }

  /**
  * Calculates the interest charge for borrowing a portion of the underlying amount
  * given by the desired collateral ratio. The result is an approximation.
  */
  function getCostOfBorrowing(uint256 underlyingAmount) public view returns (uint256) {
    uint256 borrowRateMantissa = ctoken.borrowRatePerBlock();
    // divide to make space for multiplication
    uint256 interest = annualize(borrowRateMantissa).sub(10 ** 18).div(10 ** 10);
    uint256 borrowAmount = underlyingAmount.mul(ratioNumerator).div(ratioDenominator);
    return interest.mul(borrowAmount).div(10 ** 8);
  }

  /**
  * Calculates the value of the underlyingAmount after accumulating interest
  * over a year, compounded in each block. The result is an approximation.
  */
  function getYearEndAssets(uint256 underlyingAmount) public view returns (uint256) {
    uint256 supplyRateMantissa = ctoken.supplyRatePerBlock();
    // divide to make space for multiplication
    uint256 apy = annualize(supplyRateMantissa).div(10 ** 10);
    return underlyingAmount.mul(apy).div(10 ** 8);
  }

  /**
  * Calculates and stores profit from COMP over one year if the given underlying amount
  * was supplied and borrowed against in the give collateral ratio. This must be called
  * periodically to get the APY roughly accurate as the total borrow amounts in Compound
  * change.
  */
  function updateExpectedCompProfit(uint256 underlyingAmount) public onlyOwner {
    // COMP issued per block to suppliers OR borrowers * (1 * 10 ^ 18)
    uint256 compSpeed = comptroller.compSpeeds(address(ctoken));

    // COMP from borrowing
    // !!! This is not a view function
    uint256 borrows = ctoken.totalBorrowsCurrent();
    uint256 ourBorrow = underlyingAmount.mul(ratioNumerator).div(ratioDenominator);
    uint256 compPerBlockForBorrow = compSpeed.mul(ourBorrow).div(borrows.add(ourBorrow));
    uint256 borrowComp = compPerBlockForBorrow.mul(blocksPerYear);

    // COMP from supplying
    uint256 cash = ctoken.getCash();
    uint256 compPerBlockForSupply = compSpeed
        .mul(underlyingAmount)
        .div(cash.add(underlyingAmount));
    uint256 supplyComp = compPerBlockForSupply.mul(blocksPerYear);

    profitComp = compPrice
        .mul(supplyComp.add(borrowComp).div(10 ** 18))
        .div(10 ** uint256(underlying.decimals()));
  }

  function getExpectedCompProfit(uint256 /* underlyingAmount */) public view returns (uint256) {
    return profitComp;
  }

  /**
  * Returns the APY for the underlying amount. Uses COMP profit stored in this contract.
  */
  function getApy(uint256 underlyingAmount) external view returns (uint256) {
    uint256 totalCost = getCostOfBorrowing(underlyingAmount);
    uint256 totalGain = getYearEndAssets(underlyingAmount)
        .add(getExpectedCompProfit(underlyingAmount))
        .sub(underlyingAmount);

    if (totalGain <= totalCost) {
      return 0;
    }
    return totalGain.sub(totalCost).mul(100 * apyDecimals).div(underlyingAmount);
  }

  /**
  * Returns the price of COMP in the units of underlying.
  */
  function setCompPrice(uint256 price) public onlyOwner {
    compPrice = price;
  }
}
