const Utils = require("./Utils.js");
const BigNumber = require("bignumber.js");
const Controller = artifacts.require("Controller");
const Vault = artifacts.require("Vault");
const RewardToken = artifacts.require("RewardToken");
const ExclusiveRewardPool = artifacts.require("ExclusiveRewardPool");
const MockToken = artifacts.require("MockToken");
const NoopStrategy = artifacts.require("NoopStrategy");
const Storage = artifacts.require("Storage");
const AutoStake = artifacts.require("AutoStake");
const { time } = require("@openzeppelin/test-helpers");

BigNumber.config({ DECIMAL_PLACES: 0 });

contract("Autostaking and Time Weighted for reward pool Test", function (accounts) {
  describe("Basic settings", function () {
    let governance = accounts[0];
    let rewardCollector = accounts[1];
    let farmer1 = accounts[2];
    let strategy = accounts[3];
    let rewardDistribution = accounts[4];
    let farmer2 = accounts[5];

    const dayDuration = 86400;
    // removing the last few digits when comparing, since we have 18
    // so this should be fine
    const removePrecision = 1000000;

    let autostake;
    let storage;
    let vault;
    let controller;
    let rewardPool;
    let rewardToken;
    let rewardDuration = 7 * dayDuration;
    let tokenPrecision = new BigNumber(10).pow(18);
    let totalReward = new BigNumber(500000).times(tokenPrecision);

    const farmerBalance = new BigNumber(500000).times(tokenPrecision);

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });
      controller = await Controller.new(storage.address, rewardCollector, {
        from: governance,
      });
      await storage.setController(controller.address, { from: governance });

      // create the reward token
      rewardToken = await RewardToken.new(storage.address, {
        from: governance,
      });

      // create the underlying token
      await rewardToken.mint(farmer1, farmerBalance, { from: governance });
      await rewardToken.mint(farmer2, farmerBalance, { from: governance });
      assert.equal(
        farmerBalance.toFixed(),
        new BigNumber(await rewardToken.balanceOf(farmer1)).toFixed()
      );

      // create a reward pool
      // using the vault token as underlying stake
      rewardPool = await ExclusiveRewardPool.new(
        rewardToken.address, // rewardToken should be FARM
        rewardToken.address, // lpToken
        rewardDuration, // duration
        rewardDistribution, // reward distribution
        storage.address
      );

      // authorize the rewardDistribution to mint
      await rewardToken.addMinter(rewardDistribution, {
        from: governance,
      });

      // mint reward and transfer to pool
      await rewardToken.mint(rewardPool.address, totalReward, {
        from: rewardDistribution,
      });
      Utils.assertBNEq(
        await rewardToken.balanceOf(rewardPool.address),
        totalReward
      );

      // (uint256 _slopeNumerator, uint256 _slopeDenominator, uint256 _weightStartTime, uint256 _weightCap)
      // 1 + (timeElapsed * slope)
      // uint256 calWeight = unit + unit.mul(block.timestamp - weightStartTime).mul(slopeNumerator).div(slopeDenominator);
      // 1/86400 => double for one day
      // 1/(86400 * 7 * 52) => double after one year
      // 31449600 = 86400 * 7 * 52
    });

    it("timeWeight calculation works as expected", async function (){
      let weightStartTime = new BigNumber((await time.latest())).plus(1000);
      let unit = new BigNumber("1" + "000000000000000000");
      let cap = new BigNumber("2" + "000000000000000000");
      autostake = await AutoStake.new(storage.address, rewardPool.address, rewardToken.address, 
        1, // slopeNumerator
        31449600, // slopeDenominator
        weightStartTime, // weightStartTime
        cap  // weightCap
      );
      await rewardPool.initExclusive(autostake.address);

      console.log("weightStartTime :", weightStartTime.toFixed());

      Utils.assertBNEq(await autostake.timeWeight(weightStartTime.minus(100)), unit);
      Utils.assertBNEq(await autostake.timeWeight(weightStartTime.plus(15724800)), new BigNumber("1" + "500000000000000000"));
      Utils.assertBNEq(await autostake.timeWeight(weightStartTime.plus(31449600)), cap);
      Utils.assertBNEq(await autostake.timeWeight(weightStartTime.plus(51449600)), cap);
    });


    it("One single stake. The farmer takes every reward after the duration is over", async function (){
      let weightStartTime = new BigNumber((await time.latest())).plus(1000);
      let unit = new BigNumber("1" + "000000000000000000");
      let cap = new BigNumber("2" + "000000000000000000");
      autostake = await AutoStake.new(storage.address, rewardPool.address, rewardToken.address, 
        1, // slopeNumerator
        31449600, // slopeDenominator
        weightStartTime, // weightStartTime
        cap  // weightCap
      );
      await rewardPool.initExclusive(autostake.address);

      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer1 });
      await autostake.stake(farmerBalance, { from: farmer1 });

      // notifyReward
      await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });

      // time passes
      await time.advanceBlock();
      await time.increase(2 * rewardDuration);
      await time.advanceBlock();

      // get the reward Rate and period
      let rewardRate = new BigNumber(await rewardPool.rewardRate());
      let period = new BigNumber(rewardDuration);

      // make sure the time has passed
      Utils.assertBNGt(
        await time.latest(),
        await rewardPool.periodFinish()
      );

      // the only user should get most rewards
      // there will be some dust in the contract
      await autostake.exit({ from: farmer1 });
      let farmerReward = new BigNumber(await rewardToken.balanceOf(farmer1)).minus(new BigNumber(farmerBalance));
      // there is a off-by-one here, so using ApproxEq
      Utils.assertApproxBNEq(
        rewardRate.times(period),
        farmerReward,
        removePrecision
      );
    });

    it("Two farmers staking", async function () {
      let weightStartTime = new BigNumber((await time.latest())).plus(1000);
      let unit = new BigNumber("1" + "000000000000000000");
      let cap = new BigNumber("2" + "000000000000000000");

      // weight would reach the cap after the half of reward duration
      let weightCapTime = rewardDuration/2;

      autostake = await AutoStake.new(storage.address, rewardPool.address, rewardToken.address, 
        1, // slopeNumerator
        weightCapTime, // slopeDenominator
        weightStartTime, // weightStartTime
        cap  // weightCap
      );
      await rewardPool.initExclusive(autostake.address);

      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer1 });
      await autostake.stake(farmerBalance, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      Utils.assertBNEq(farmerBalance, await autostake.balanceOf(farmer1));
      Utils.assertBNEq(farmerBalance, await rewardPool.balanceOf(autostake.address));

      // notifyReward
      await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });

      // time passes
      await time.advanceBlock();
      await time.increase(weightCapTime);
      await time.advanceBlock();

      Utils.assertBNEq(farmerBalance, await autostake.balanceOf(farmer1));
      // farmer2 stakes
      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer2 });
      await autostake.stake(farmerBalance, { from: farmer2 });

      // When farmer2 stakes, it helps the farmer1 autostakes
      let farmer1Balance_afterFarmer2Stake = await autostake.balanceOf(farmer1);
      Utils.assertBNGt(farmer1Balance_afterFarmer2Stake, farmerBalance);

      // farmer2 has roughly 1/3 of farmer1's share
      let farmer1Balance_onethird = new BigNumber(await autostake.balanceOf(farmer1)).dividedBy(3);
      let farmer2Balance = new BigNumber(await autostake.balanceOf(farmer2));

      console.log(farmer1Balance_onethird.toFixed());
      console.log(farmer2Balance.toFixed());
      // farmer2Balance here is around "313000" + "000000000000000000"
      // using approximation is around "31"
      Utils.assertApproxBNEq( farmer1Balance_onethird, farmer2Balance, "10000" + "000000000000000000");
    });
  });
});
