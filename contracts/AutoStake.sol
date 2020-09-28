pragma solidity 0.5.16;

import "./RewardPool.sol";
import "./Controllable.sol";

contract AutoStake is Controllable {

  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  NoMintRewardPool public rewardPool;
  IERC20 public lpToken;
  uint256 public unit = 1e18;
  uint256 public valuePerShare = unit;
  uint256 public totalShares = 0;
  uint256 public totalValue = 0;
  mapping(address => uint256) public share;

  uint256 public slopeNumerator;
  uint256 public slopeDenominator;
  uint256 public weightStartTime;
  uint256 public weightCap;

  address public greylistEscrow;
  mapping (address => bool) smartContractStakers;

  event Staked(address indexed user, uint256 amount, uint256 sharesIssued, uint256 oldShareVaule, uint256 newShareValue, uint256 balanceOf);
  event StakingDenied(address indexed user, uint256 amount);
  event Withdrawn(address indexed user, uint256 total);
  event SmartContractDenied(address indexed greylistedAddress);
  event ForceGreylistExited(address indexed grelisted , uint256 amount);

  event SmartContractRecorded(address indexed smartContractAddress, address indexed smartContractInitiator);

  constructor(address _storage, address pool, address token, address _greylistEscrow, uint256 _slopeNumerator, uint256 _slopeDenominator, uint256 _weightStartTime, uint256 _weightCap) public 
  Controllable(_storage)
  {
    rewardPool = NoMintRewardPool(pool);
    lpToken = IERC20(token);

    slopeNumerator = _slopeNumerator;
    slopeDenominator = _slopeDenominator;
    weightStartTime = _weightStartTime;
    weightCap = _weightCap;
    greylistEscrow = _greylistEscrow;
  }

  function setGreylistEscrow(address _greylistEscrow) external onlyGovernance {
    require(_greylistEscrow == address(0), "escrow cannot be empty address");
    greylistEscrow = _greylistEscrow;
  }

  function setWeightStartTime(uint256 _weightStartTime) external onlyGovernance {
    require(weightStartTime != 0, "Weighted Start time has already been set");
    weightStartTime = weightStartTime;
  }

  function setWeightCap(uint256 _weightCap) external onlyGovernance {
    require(_weightCap > weightCap, "New weight cap needs to be larger");
    weightCap = _weightCap;
  }

  function timeWeight(uint256 calTime) public view returns (uint256) {
    if(weightStartTime == 0 || calTime < weightStartTime) {
      return unit;
    }

    // simple linear model
    // 1 + (timeElapsed * slope)
    uint256 calWeight = unit.add(unit.mul(calTime - weightStartTime).mul(slopeNumerator).div(slopeDenominator));
    
    // if weightCap is 0, it means that there is no cap. So we should always return calculated weight.
    // Otherwise, we check if the calculated weight has exceeded the cap
    if(calWeight > weightCap && weightCap != 0) {
      return weightCap;
    } else {
      return calWeight;
    }
  }

  function refreshAutoStake() external {
    exitRewardPool();
    updateValuePerShare();
    restakeIntoRewardPool();
  }

  function stake(uint256 amount) public {
    exitRewardPool();
    updateValuePerShare();

    if(tx.origin != msg.sender) {
      smartContractStakers[msg.sender] = true;
      emit SmartContractRecorded(msg.sender, tx.origin);
    }

    if(isGreylisted(msg.sender)){
      emit StakingDenied(msg.sender, amount);
    } else {
      // now we can issue shares
      lpToken.safeTransferFrom(msg.sender, address(this), amount);
      uint256 sharesToIssue = amount.mul(unit).div(valuePerShare).mul(unit).div(timeWeight(block.timestamp));
      totalShares = totalShares.add(sharesToIssue);
      share[msg.sender] = share[msg.sender].add(sharesToIssue);

      uint256 oldValuePerShare = valuePerShare;

      // Rate needs to be updated here, otherwise the valuePerShare would be incorrect.
      updateValuePerShare();

      emit Staked(msg.sender, amount, sharesToIssue, oldValuePerShare, valuePerShare, balanceOf(msg.sender));
    }

    restakeIntoRewardPool();
  }

  function exit() public {
    exitRewardPool();
    updateValuePerShare();

    // If it is a normal user and not smart contract,
    // then the requirement will always pass
    // If it is a smart contract, then
    // make sure that it is not on our greyList.
    if (isGreylisted(msg.sender)) {
      // only Smart contracts can be denied 
      emit SmartContractDenied(msg.sender);
    } else {
      // now we can transfer funds and burn shares
      uint256 toTransfer = balanceOf(msg.sender);
      lpToken.safeTransfer(msg.sender, toTransfer);
      totalShares = totalShares.sub(share[msg.sender]);
      share[msg.sender] = 0;
      emit Withdrawn(msg.sender, toTransfer);
      // Rate needs to be updated here, otherwise the valuePerShare would be incorrect.
      updateValuePerShare();
    }

    restakeIntoRewardPool();
  }

  function forceGreyListedExit(address greyListed) external onlyGovernance {
    require(isGreylisted(greyListed), "can only force exit a greylisted.");
    exitRewardPool();
    updateValuePerShare();

    uint256 toTransfer = balanceOf(greyListed);
    lpToken.safeTransfer(greylistEscrow, toTransfer);
    totalShares = totalShares.sub(share[greyListed]);
    share[greyListed] = 0;
    emit ForceGreylistExited(greyListed, toTransfer);

    updateValuePerShare(); 
    restakeIntoRewardPool();
  }

  function balanceOf(address who) public view returns(uint256) {
    return valuePerShare.mul(share[who]).div(unit);
  }

  function updateValuePerShare() internal {
    if (totalShares == 0) {
      totalValue = 0;
      valuePerShare = unit;
    } else {
      totalValue = lpToken.balanceOf(address(this));
      valuePerShare = totalValue.mul(unit).div(totalShares);
    }
  }

  function exitRewardPool() internal {
    if(rewardPool.balanceOf(address(this)) != 0){
      // exit and do accounting first
      rewardPool.exit();
    }
  }

  function restakeIntoRewardPool() internal {
    if(lpToken.balanceOf(address(this)) != 0){
      // stake back to the pool
      lpToken.safeApprove(address(rewardPool), 0);
      lpToken.safeApprove(address(rewardPool), totalValue);
      rewardPool.stake(lpToken.balanceOf(address(this)));
    }
  }

  function isGreylisted(address _target) internal view returns (bool) {
    return (smartContractStakers[_target] && IController(controller()).greyList(_target));
  }
}
