const Utils = require("./Utils.js");
const BigNumber = require("bignumber.js");
const Controller = artifacts.require("Controller");
const Vault = artifacts.require("Vault");
const RewardToken = artifacts.require("RewardToken");
const NoMintRewardPool = artifacts.require("NoMintRewardPool");
const MockToken = artifacts.require("MockToken");
const NoopStrategy = artifacts.require("NoopStrategy");
const Storage = artifacts.require("Storage");
const { time } = require("@openzeppelin/test-helpers");

BigNumber.config({ DECIMAL_PLACES: 0 });

contract("NoMint reward pool Test", function (accounts) {
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

    let storage;
    let vault;
    let controller;
    let underlying;
    let rewardPool;
    let rewardToken;
    let rewardDuration = 7 * dayDuration;
    let tokenPrecision = new BigNumber(10).pow(18);
    let totalReward = new BigNumber(2500).times(tokenPrecision);

    const farmerBalance = "95848503450";

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });

      // create the reward token
      rewardToken = await RewardToken.new(storage.address, {
        from: governance,
      });

      // create the underlying token
      underlying = await MockToken.new({ from: governance });
      await underlying.mint(farmer1, farmerBalance, { from: governance });
      await underlying.mint(farmer2, farmerBalance, { from: governance });
      assert.equal(
        farmerBalance,
        (await underlying.balanceOf(farmer1)).toString()
      );

      // set up controller
      controller = await Controller.new(storage.address, rewardCollector, {
        from: governance,
      });
      await storage.setController(controller.address, { from: governance });

      // set up the vault with 100% investment
      vault = await Vault.new(storage.address, underlying.address, 100, 100, {
        from: governance,
      });

      // set up the strategy
      strategy = await NoopStrategy.new(
        storage.address,
        underlying.address,
        vault.address,
        { from: governance }
      );

      // link vault with strategy
      await controller.addVaultAndStrategy(vault.address, strategy.address);

      // create a reward pool
      // using the vault token as underlying stake
      rewardPool = await NoMintRewardPool.new(
        rewardToken.address, // rewardToken should be FARM
        vault.address, // lpToken
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

      // farmer deposit into pool
      await underlying.approve(vault.address, farmerBalance, { from: farmer1 });
      await vault.deposit(farmerBalance, { from: farmer1 });
      await underlying.approve(vault.address, farmerBalance, { from: farmer2 });
      await vault.deposit(farmerBalance, { from: farmer2 });
      assert.equal(farmerBalance, await vault.balanceOf(farmer1));
    });

    it("Should not be able to get reward if pool not notified", async function () {
      await vault.approve(rewardPool.address, farmerBalance, { from: farmer1 });
      await rewardPool.stake(farmerBalance, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await rewardPool.balanceOf(farmer1));

      // time passes
      await time.increase(3000);
      const startingBlock = await time.latestBlock();
      const endBlock = startingBlock.addn(100);
      await time.advanceBlockTo(endBlock);

      // but there's no reward after exit.
      await rewardPool.exit({ from: farmer1 });
      assert.equal(0, await rewardToken.balanceOf(farmer1));
    });

    it("One single stake. The farmer takes every reward after the duration is over", async function () {
      await vault.approve(rewardPool.address, farmerBalance, { from: farmer1 });
      await rewardPool.stake(farmerBalance, { from: farmer1 });
      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await rewardPool.balanceOf(farmer1));

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
      await rewardPool.exit({ from: farmer1 });
      let farmerReward = new BigNumber(await rewardToken.balanceOf(farmer1));
      // there is a off-by-one here, so using ApproxEq
      Utils.assertApproxBNEq(
        rewardRate.times(period),
        farmerReward,
        removePrecision
      );
    });

    it("One single farmer, added reward and extended period", async function () {
      await vault.approve(rewardPool.address, farmerBalance, { from: farmer1 });
      await rewardPool.stake(farmerBalance, { from: farmer1 });
      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await rewardPool.balanceOf(farmer1));

      // notifyReward
      let result = await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });
      let poolStartTime = await time.latest();

      // time passes
      await time.advanceBlock();
      await time.increase(rewardDuration / 2);
      await time.advanceBlock();


      // get the reward Rate
      let oldRewardRate = new BigNumber(await rewardPool.rewardRate());

      // mint reward and transfer to pool
      await rewardToken.mint(rewardPool.address, totalReward, {
        from: rewardDistribution,
      });

      // notifyReward
      result = await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });

      let poolResetTime = new BigNumber(await time.latest());

      Utils.assertBNEq(
        poolResetTime.plus(rewardDuration),
        await rewardPool.periodFinish()
      );

      // time passes
      await time.advanceBlock();
      await time.increase(rewardDuration * 2);
      await time.advanceBlock();

      // get the reward Rate
      let newRewardRate = new BigNumber(await rewardPool.rewardRate());

      // make sure the time has passed
      Utils.assertBNGt(
        await time.latest(),
        await rewardPool.periodFinish()
      );

      let poolFinishTime = await rewardPool.periodFinish();

      // the only user should get most rewards
      // there will be some dust in the contract
      await rewardPool.exit({ from: farmer1 });
      let farmerReward = new BigNumber(await rewardToken.balanceOf(farmer1));

      // using ApproxEq to get rid of small dust errors
      Utils.assertApproxBNEq(
        newRewardRate
          .times(poolFinishTime - poolResetTime)
          .plus(oldRewardRate.times(poolResetTime - poolStartTime)),
        farmerReward,
        removePrecision
      );
    });

    it("Two farmers who staked the same amount right from the beginning", async function () {
      await vault.approve(rewardPool.address, farmerBalance, { from: farmer1 });
      await rewardPool.stake(farmerBalance, { from: farmer1 });
      await vault.approve(rewardPool.address, farmerBalance, { from: farmer2 });
      await rewardPool.stake(farmerBalance, { from: farmer2 });
      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await rewardPool.balanceOf(farmer1));
      assert.equal(farmerBalance, await rewardPool.balanceOf(farmer2));

      // notifyReward
      await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });

      // time passes
      await time.advanceBlock();
      await time.increase(rewardDuration * 2);
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
      await rewardPool.exit({ from: farmer1 });
      await rewardPool.exit({ from: farmer2 });
      let farmer1Reward = new BigNumber(await rewardToken.balanceOf(farmer1));
      let farmer2Reward = new BigNumber(await rewardToken.balanceOf(farmer2));

      // using ApproxEq
      Utils.assertApproxBNEq(
        rewardRate.times(period).div(2),
        farmer1Reward,
        removePrecision
      );
      Utils.assertApproxBNEq(
        rewardRate.times(period).div(2),
        farmer2Reward,
        removePrecision
      );
    });

    it("Two farmers who staked the same amount, but one later.", async function () {
      await vault.approve(rewardPool.address, farmerBalance, { from: farmer1 });
      await rewardPool.stake(farmerBalance, { from: farmer1 });
      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await rewardPool.balanceOf(farmer1));

      // notifyReward
      await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });
      let poolStartTime = await time.latest();

      // time passes
      await time.advanceBlock();
      await time.increase(rewardDuration / 2);
      await time.advanceBlock();

      await vault.approve(rewardPool.address, farmerBalance, { from: farmer2 });
      await rewardPool.stake(farmerBalance, { from: farmer2 });
      let farmer2StakeTime = await time.latest();
      assert.equal(farmerBalance, await rewardPool.balanceOf(farmer2));

      await time.advanceBlock();
      await time.increase(rewardDuration);
      await time.advanceBlock();

      // get the reward Rate and period
      let rewardRate = new BigNumber(await rewardPool.rewardRate());
      let period = new BigNumber(rewardDuration);
      let periodFinish = await rewardPool.periodFinish();

      let phase1 = new BigNumber(farmer2StakeTime - poolStartTime);
      let phase2 = new BigNumber(periodFinish - farmer2StakeTime);

      // make sure the time has passed
      Utils.assertBNGt(
        await time.latest(),
        await rewardPool.periodFinish()
      );

      // the only user should get most rewards
      // there will be some dust in the contract
      await rewardPool.exit({ from: farmer1 });
      await rewardPool.exit({ from: farmer2 });
      let farmer1Reward = new BigNumber(await rewardToken.balanceOf(farmer1));
      let farmer2Reward = new BigNumber(await rewardToken.balanceOf(farmer2));

      // using ApproxEq
      Utils.assertApproxBNEq(
        rewardRate.times(phase1).plus(rewardRate.div(2).times(phase2)),
        farmer1Reward,
        removePrecision
      );
      Utils.assertApproxBNEq(
        rewardRate.times(phase2).div(2),
        farmer2Reward,
        removePrecision
      );
    });
  });
});
