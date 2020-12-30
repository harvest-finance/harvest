pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../RewardTokenProfitNotifier.sol";
import "../../Controllable.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../hardworkInterface/IVault.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";

import "./IShortsFi.sol";

//
// A strategy proposed to Harvest Finance by Shorts.Fi
//                  www.shorts.fi
//           https://discord.gg/d8uBdKNvhn
//
contract ShortingStrategy is IStrategy, RewardTokenProfitNotifier {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  event ProfitNotClaimed();
  event TooLowBalance();

  // Shorts.Fi specific
  address public SHRT;
  address public WETH;
  address public shortingContract;
  address public shortingPool;

  // Harvest original
  ERC20Detailed public underlying;
  address public vault;
  address public uniswapRouterV2;
  bool public liquidationAllowed = true;
  uint256 public sellFloor = 0;

  // These tokens cannot be claimed by the controller
  mapping(address => bool) public unsalvagableTokens;

  modifier restricted() {
    require(msg.sender == vault || msg.sender == address(controller()) || msg.sender == address(governance()),
      "The sender has to be the controller or vault");
    _;
  }

  event Liquidated(
    uint256 amount
  );

  constructor(
    address _storage,
    address _underlying,
    address _vault,
    address _uniswap,
    address _shortingContract,
    address _shortingPool,
    address _SHRT,
    address _WETH
  )
  RewardTokenProfitNotifier(_storage, _SHRT) public {
    require(IVault(_vault).underlying() == _underlying, "vault does not support underlying");
    underlying = ERC20Detailed(_underlying);
    vault = _vault;
    uniswapRouterV2 = _uniswap;

    // set these tokens to be not salvagable
    unsalvagableTokens[_underlying] = true;
    unsalvagableTokens[_SHRT] = true;
    // NOTE FOR HARVEST DEVS: No other token is needed,
    // the shorting tokens do not leave the system and will
    // not be received by the shorting strategy. They will be
    // automatically staked upon minting, and burned upon ustaking.

    shortingContract = _shortingContract;
    shortingPool = _shortingPool;
    SHRT = _SHRT;
    WETH = _WETH;
  }

  function depositArbCheck() public view returns (bool) {
    // there's no arb here.
    return true;
  }

  function investAllUnderlying() public restricted {
    uint256 balance = underlying.balanceOf(address(this));
    IShortsFiShorting(shortingContract).enter(balance, 5, 100);
    // NOTE FOR HARVEST DEVS: 5 and 100 represent maximum 5% acceptable
    // slippage incurred during the trade of the leverage for the base
    // token (in your language, base should be the underlying token).
  }

  function withdrawAllToVault() external restricted {
    uint256 expectedOutcome = investedUnderlyingBalance().sub(underlying.balanceOf(address(this)));
    IShortsFiShorting(shortingContract).exitAll(expectedOutcome.mul(99).div(100));
    // NOTE TO HARVEST DEVS: Reducing the minimum outcome to 99% doesn't have to be required.
    // Testing is recommended.
    if (liquidationAllowed) {
      IShortsFiStaking(shortingPool).getReward();
      liquidateShort();
    }
    if (underlying.balanceOf(address(this)) > 0) {
      IERC20(address(underlying)).safeTransfer(vault, underlying.balanceOf(address(this)));
    }
  }

  function emergencyExit() external onlyGovernance {
    // NOTE TO HARVEST DEVS: We don't know about the purpose of this function.
    // You can provide 0 as the minimum possible outcome for the exit if you
    // want to minimize the failure chances.
    IShortsFiShorting(shortingContract).exitAll(0);
  }

  function withdrawToVault(uint256 amountUnderlying) external restricted {
    // NOTE TO HARVEST DEVS: This function appears to be withdrawing
    // a fair share of the balance from the shorting contract indicated
    // by amountUnderlying.
    uint256 balance = IShortsFiStaking(shortingPool).balanceOf(address(this));
    uint256 underlyingInStrategy = underlying.balanceOf(address(this));
    uint256 underlyingInShorts = investedUnderlyingBalance().sub(underlyingInStrategy);
    uint256 fairShareInStrategy = underlyingInStrategy.mul(amountUnderlying).div(investedUnderlyingBalance());
    uint256 fairShareShorted = balance.mul(amountUnderlying).div(investedUnderlyingBalance());
    uint256 fairShareShortedMinOut = underlyingInShorts.mul(amountUnderlying).div(investedUnderlyingBalance());
    IShortsFiShorting(shortingContract).exit(
      fairShareShorted,
      fairShareShortedMinOut.mul(99).div(100),
      false);
    // NOTE TO HARVEST DEVS: Reducing the minimum outcome to 99% doesn't have to be required.
    // Testing is recommended.
    uint256 yield = underlyingInStrategy.sub(underlying.balanceOf(address(this)));
    uint256 toWithdraw = yield.add(fairShareInStrategy);
    if (toWithdraw > 0) {
      IERC20(address(underlying)).safeTransfer(vault, toWithdraw);
    }
  }

  function doHardWork() public restricted {
    if (liquidationAllowed) {
      IShortsFiStaking(shortingPool).getReward();
      liquidateShort();
    } else {
      emit ProfitNotClaimed();
    }
    investAllUnderlying();
  }

  function liquidateShort() internal {
    uint256 balance = IERC20(SHRT).balanceOf(address(this));
    if (balance < sellFloor || balance == 0) {
      emit TooLowBalance();
      return;
    }

    // give a profit share to fee forwarder, which re-distributes this to
    // the profit sharing pools
    notifyProfitInRewardToken(balance);

    balance = IERC20(SHRT).balanceOf(address(this));

    emit Liquidated(balance);
    // we can accept 1 as minimum as this will be called by trusted roles only
    uint256 amountOutMin = 1;
    IERC20(SHRT).safeApprove(address(uniswapRouterV2), 0);
    IERC20(SHRT).safeApprove(address(uniswapRouterV2), balance);

    // NOTE FOR HARVEST DEVS: Shorts.Fi allow you to short against WETH or
    // short WETH against other assets. If you want to trade SHRT for WETH
    // (for when WETH is base), you can use Uniswap path [SHRT, WETH]. Else
    // [SHRT, WETH, UNDERLYING] is required.
    address[] memory path;
    if (address(underlying) == WETH) {
      path = new address[](2);
      path[0] = SHRT;
      path[1] = WETH;
    } else {
      path = new address[](3);
      path[0] = SHRT;
      path[1] = WETH;
      path[2] = address(underlying);
    }

    IUniswapV2Router02(uniswapRouterV2).swapExactTokensForTokens(
      balance,
      amountOutMin,
      path,
      address(this),
      block.timestamp
    );
  }

  function investedUnderlyingBalance() public view returns (uint256) {
    (uint256 supply,, uint256 deposit, uint256 loanAsBase) =
        IShortsFiShorting(shortingContract).estimateProfitDetailed(address(this));

    uint256 investedBalance = 0;
    if (supply.sub(loanAsBase) > deposit) {
      // NOTE FOR HARVEST DEVS: You currently have profitable positions
      // so we'll deduct a celebration fee to share with the other users.
      // The fee is expresses as profitNum/profitDen and applies to profit only.
      uint256 profitNum = IShortsFiShorting(shortingContract).shareNum();
      uint256 profitDen = IShortsFiShorting(shortingContract).shareDen();
      uint256 deduction = supply.sub(loanAsBase).sub(deposit).mul(profitNum).div(profitDen);
      investedBalance = supply.sub(loanAsBase).sub(deduction);
    } else {
      investedBalance = supply.sub(loanAsBase);
    }
    return underlying.balanceOf(address(this)).add(investedBalance);
  }

  function setLiquidationAllowed(
    bool allowed
  ) external restricted {
    liquidationAllowed = allowed;
  }

  function setSellFloor(uint256 value) external restricted {
    sellFloor = value;
  }

  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvagable");
    IERC20(token).safeTransfer(recipient, amount);
  }
}
