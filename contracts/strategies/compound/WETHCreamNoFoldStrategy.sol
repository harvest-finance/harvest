pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./CompoundInteractor.sol";
import "./CompleteCToken.sol";
import "../../Controllable.sol";
import "../ProfitNotifier.sol";
import "../../compound/ComptrollerInterface.sol";
import "../../compound/CTokenInterfaces.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";

// (1) Cream is a fork of Compound, we will be using the CompoundInteractor as well.
// (2) WETH has its own special strategy because its liquidation path would not
//     use WETH as intermediate asset for obvious reason.

contract WETHCreamNoFoldStrategy is IStrategy, ProfitNotifier, CompoundInteractor {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  ERC20Detailed public underlying;
  CompleteCToken public ctoken;
  ComptrollerInterface public comptroller;

  address public vault;
  ERC20Detailed public comp; // this will be Cream

  address public uniswapRouterV2;
  uint256 public suppliedInWETH;

  // These tokens cannot be claimed by the controller
  mapping (address => bool) public unsalvagableTokens;

  modifier restricted() {
    require(msg.sender == vault || msg.sender == address(controller()),
      "The sender has to be the controller or vault");
    _;
  }

  event D(string);

  constructor(
    address _storage,
    address _underlying,
    address _ctoken,
    address _vault,
    address _comptroller,
    address _comp,
    address _uniswap
  )
  ProfitNotifier(_storage, _underlying)
  CompoundInteractor(_underlying, _ctoken, _comptroller) public {
    require(_underlying == address(_weth), "Weth strategy needs to have WETH as underlying");
    comptroller = ComptrollerInterface(_comptroller);
    // CREAM: 0x2ba592F78dB6436527729929AAf6c908497cB200
    comp = ERC20Detailed(_comp);
    underlying = ERC20Detailed(_underlying);
    ctoken = CompleteCToken(_ctoken);
    vault = _vault;
    uniswapRouterV2 = _uniswap;

    // set these tokens to be not salvagable
    unsalvagableTokens[_underlying] = true;
    unsalvagableTokens[_ctoken] = true;
    unsalvagableTokens[_comp] = true;
  }

  modifier updateSupplyInTheEnd() {
    _;
    suppliedInWETH = ctoken.balanceOfUnderlying(address(this));
  }

  function depositArbCheck() public view returns(bool) {
    // there's no arb here.
    return true;
  }

  /**
  * The strategy invests by supplying the underlying as a collateral and taking
  * a loan in the required ratio. The borrowed money is then re-supplied.
  */
  function investAllUnderlying() public restricted updateSupplyInTheEnd {
    uint256 balance = underlying.balanceOf(address(this));
    _supplyEtherInWETH(balance);
  }

  /**
  * Exits Compound and transfers everything to the vault.
  */
  function withdrawAllToVault() external restricted updateSupplyInTheEnd{
    withdrawAll();
    IERC20(address(underlying)).safeTransfer(vault, underlying.balanceOf(address(this)));
  }

  function withdrawAll() internal {
    claimComp();
    liquidateComp();
    redeemMaximum();
  }

  function withdrawToVault(uint256 amountUnderlying) external restricted updateSupplyInTheEnd {
    if (amountUnderlying <= underlying.balanceOf(address(this))) {
      IERC20(address(underlying)).safeTransfer(vault, amountUnderlying);
      return;
    }

    // get some of the underlying
    redeemPartial(amountUnderlying);

    // Cannot give more than what we have
    uint256 transferBalance = Math.min(
        amountUnderlying,
        underlying.balanceOf(address(this))
    );

    // transfer the amount requested (or the amount we have) back to vault
    IERC20(address(underlying)).safeTransfer(vault, transferBalance);

    // invest back to cream
    investAllUnderlying();
  }

  /**
  * Withdraws all assets, liquidates COMP, and invests again in the required ratio.
  */
  function doHardWork() public restricted {
    claimComp();
    liquidateComp();
    investAllUnderlying();
  }

  /**
  * Redeems maximum that can be redeemed from Compound.
  */
  function redeemMaximum() internal returns (uint256) {
    // for no folding strategy, we have no loan, we can redeem everything we supplied.
    uint256 supply = ctoken.balanceOf(address(this));
    _redeemEtherInCTokens(supply);
  }

  function redeemPartial(uint256 amountUnderlying) internal returns (uint256) {
      require(
          ctoken.getCash() >= amountUnderlying,
          "market cash cannot cover liquidity"
      );
      redeemUnderlyingInWeth(amountUnderlying);
  }

  /**
  * Salvages a token.
  */
  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvagable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  function liquidateComp() internal {
    uint256 oldBalance = underlying.balanceOf(address(this));
    uint256 balance = comp.balanceOf(address(this));
    if (balance > 0) {
      // we can accept 1 as minimum as this will be called by trusted roles only
      uint256 amountOutMin = 1;
      IERC20(address(comp)).safeApprove(address(uniswapRouterV2), 0);
      IERC20(address(comp)).safeApprove(address(uniswapRouterV2), balance);
      address[] memory path = new address[](2);
      path[0] = address(comp);
      path[1] = IUniswapV2Router02(uniswapRouterV2).WETH();
      IUniswapV2Router02(uniswapRouterV2).swapExactTokensForTokens(
        balance,
        amountOutMin,
        path,
        address(this),
        block.timestamp
      );
    }

    // give a profit share to fee forwarder, which re-distributes this to
    // the profit sharing pools
    notifyProfit(
      oldBalance, underlying.balanceOf(address(this))
    );
  }

  /**
  * Returns the current balance. Ignores COMP that was not liquidated and invested.
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    // underlying in this strategy + underlying redeemable from Compound/Cream
    uint256 assets = underlying.balanceOf(address(this)).add(suppliedInWETH);
    return assets;
  }

}
