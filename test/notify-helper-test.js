const Utils = require("./Utils.js");
const BigNumber = require("bignumber.js");
const Controller = artifacts.require("Controller");
const RewardToken = artifacts.require("RewardToken");
const NoMintRewardPool = artifacts.require("NoMintRewardPool");
const NotifyHelper = artifacts.require("NotifyHelper");
const Storage = artifacts.require("Storage");
const { expectRevert, time } = require("@openzeppelin/test-helpers");

BigNumber.config({ DECIMAL_PLACES: 0 });

contract("NotifyHelper Test", function (accounts) {
  describe("Pool notifications", function () {
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
    let notifyHelper;

    const farmerBalance = "95848503450";

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });

      // create the reward token
      rewardToken = await RewardToken.new(storage.address, {
        from: governance,
      });

      // create another token
      someToken = await RewardToken.new(storage.address, {
        from: governance,
      });

      // set up controller
      controller = await Controller.new(storage.address, rewardCollector, {
        from: governance,
      });
      await storage.setController(controller.address, { from: governance });

      // create a reward pool
      // using the vault token as underlying stake
      rewardPool = await NoMintRewardPool.new(
        rewardToken.address, // rewardToken should be FARM
        someToken.address, // lpToken, does not matter
        rewardDuration, // duration
        rewardDistribution, // reward distribution
        storage.address,
        { from: governance }
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

      notifyHelper = await NotifyHelper.new(storage.address);
      await rewardPool.setRewardDistribution(notifyHelper.address, {
        from: governance,
      });
    });

    it("Should not be able to notify over the limit", async function () {
      await expectRevert(
        notifyHelper.notifyPools([0], [rewardPool.address], {
          from: governance,
        }),
        "Notify zero"
      );
      await expectRevert(
        notifyHelper.notifyPools([totalReward.plus(1)], [rewardPool.address], {
          from: governance,
        }),
        "Notify limit hit"
      );
      await expectRevert(
        notifyHelper.notifyPools([totalReward], [rewardPool.address], {
          from: accounts[4],
        }),
        "Not governance"
      );
      await notifyHelper.notifyPools([totalReward], [rewardPool.address], {
        from: governance,
      });
    });
  });
});
