const Utils = require("./Utils.js");
const BigNumber = require("bignumber.js");
const Controller = artifacts.require("Controller");
const RewardToken = artifacts.require("RewardToken");
const NoMintRewardPool = artifacts.require("NoMintRewardPool");
const NotifyHelper = artifacts.require("NotifyHelper");
const Storage = artifacts.require("Storage");
const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
const { expectRevert, time } = require("@openzeppelin/test-helpers");

BigNumber.config({ DECIMAL_PLACES: 0 });

contract("NotifyHelper Test", function (accounts) {
  describe("Pool notifications", function () {
    let governance = accounts[0];
    let rewardCollector = accounts[1];
    let rewardDistribution = accounts[4];

    const dayDuration = 86400;
    // removing the last few digits when comparing, since we have 18
    // so this should be fine

    let storage;
    let controller;
    let rewardPool1;
    let rewardPool2;
    let profitsharePool;
    let rewardToken;
    let feeRewardForwarder;
    let rewardDuration = 7 * dayDuration;
    let tokenPrecision = new BigNumber(10).pow(18);
    let totalReward = new BigNumber(2500).times(tokenPrecision);
    let notifyHelper;

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });

      // create the reward token
      rewardToken = await RewardToken.new(storage.address, {
        from: governance,
      });

      // create another token
      let someToken = await RewardToken.new(storage.address, {
        from: governance,
      });

      // set up controller
      controller = await Controller.new(storage.address, rewardCollector, {
        from: governance,
      });
      await storage.setController(controller.address, { from: governance });

      // create a reward pool
      // using the vault token as underlying stake
      rewardPool1 = await NoMintRewardPool.new(
        rewardToken.address, // rewardToken should be FARM
        someToken.address, // lpToken, does not matter
        rewardDuration, // duration
        rewardDistribution, // reward distribution
        storage.address,
        accounts[8], accounts[8],
        { from: governance }
      );

      rewardPool2 = await NoMintRewardPool.new(
          rewardToken.address, // rewardToken should be FARM
          someToken.address, // lpToken, does not matter
          rewardDuration, // duration
          rewardDistribution, // reward distribution
          storage.address,
          accounts[8], accounts[8],
          { from: governance }
      );

      profitsharePool = await NoMintRewardPool.new(
          rewardToken.address, // rewardToken should be FARM
          someToken.address, // lpToken, does not matter
          rewardDuration, // duration
          rewardDistribution, // reward distribution
          storage.address,
          accounts[8], accounts[8],
          { from: governance }
      );

      feeRewardForwarder = await FeeRewardForwarder.new(storage.address, rewardToken.address, accounts[5], {from : governance});
      await feeRewardForwarder.setTokenPool(profitsharePool.address, {from : governance});

      // mint reward and transfer to pool
      await rewardToken.mint(governance, totalReward, {
        from: governance,
      });
      Utils.assertBNEq(
        await rewardToken.balanceOf(governance),
        totalReward
      );

      notifyHelper = await NotifyHelper.new(storage.address, feeRewardForwarder.address, rewardToken.address);
      await rewardPool1.setRewardDistribution(notifyHelper.address, {
        from: governance,
      });
      await rewardPool2.setRewardDistribution(notifyHelper.address, {
        from: governance,
      });
      await profitsharePool.setRewardDistribution(feeRewardForwarder.address, {
        from: governance,
      });
    });

    it("Checksum tests", async function () {
      await rewardToken.approve(notifyHelper.address, totalReward, {from: governance});
      await expectRevert(
        notifyHelper.notifyPools([0], [rewardPool1.address], 0, {
          from: governance,
        }),
        "Notify zero"
      );
      await expectRevert(
        notifyHelper.notifyPools([totalReward], [rewardPool1.address], 5, {
          from: governance,
        }),
        "Wrong check sum"
      );
      await rewardToken.mint(accounts[4], totalReward, {
        from: governance,
      });
      await rewardToken.approve(notifyHelper.address, totalReward, {from: accounts[4]});
      await expectRevert(
        notifyHelper.notifyPools([totalReward], [rewardPool1.address], totalReward, {
          from: accounts[4],
        }),
        "Not governance"
      );
      await notifyHelper.notifyPools([totalReward], [rewardPool1.address], totalReward, {
        from: governance,
      });
      Utils.assertBNEq(await rewardToken.balanceOf(rewardPool1.address), totalReward);
      assert.isTrue(await notifyHelper.alreadyNotified(rewardPool1.address));
      assert.isFalse(await notifyHelper.alreadyNotified(rewardPool2.address));
    });

    it("Multiple pools test", async function () {
      await rewardToken.approve(notifyHelper.address, totalReward, {from: governance});
      await notifyHelper.notifyPools([totalReward.minus(1), 1], [rewardPool1.address, rewardPool2.address], totalReward, {
        from: governance,
      });
      Utils.assertBNEq((await rewardToken.balanceOf(rewardPool1.address)), totalReward.minus(1));
      assert.equal(await rewardToken.balanceOf(rewardPool2.address), 1);
      assert.isTrue(await notifyHelper.alreadyNotified(rewardPool1.address));
      assert.isTrue(await notifyHelper.alreadyNotified(rewardPool2.address));
    });

    it("Multiple pools and profit share", async function () {
      await rewardToken.approve(notifyHelper.address, totalReward, {from: governance});
      let timestamp = await time.latest();
      await notifyHelper.notifyPoolsIncludingProfitShare(
          [totalReward.minus(80), 3],
          [rewardPool1.address, rewardPool2.address],
          77,
          timestamp, // first profit share notification
          totalReward, {
        from: governance,
      });
      Utils.assertBNEq(await rewardToken.balanceOf(rewardPool1.address), totalReward.minus(80));
      assert.equal(await rewardToken.balanceOf(rewardPool2.address), 3);
      assert.equal(await rewardToken.balanceOf(notifyHelper.address), 66);
      assert.isTrue(await notifyHelper.alreadyNotified(rewardPool1.address));
      assert.isTrue(await notifyHelper.alreadyNotified(rewardPool2.address));
      assert.equal(await notifyHelper.profitShareIncentiveDaily(), 11);
      Utils.assertBNEq(await notifyHelper.lastProfitShareTimestamp(), timestamp);
      for (let i = 0; i < 6; i++) {
        await time.increase(24 * 60 * 60);
        await notifyHelper.notifyProfitSharing({from: accounts[9]});
        assert.equal(await rewardToken.balanceOf(notifyHelper.address), (5 - i) * 11);
        assert.equal(await rewardToken.balanceOf(profitsharePool.address), 11 + (i+1) * 11);
        await time.increase(100);
        if (i != 5) {
          await expectRevert(
              notifyHelper.notifyProfitSharing(),
              "Called too early"
          );
        } else {
          // last one runs out of balance for the next call
          await expectRevert(
              notifyHelper.notifyProfitSharing(),
              "Balance too low"
          );
        }
      }
    });

    it("Setting forwarder", async function () {
      await notifyHelper.setFeeRewardForwarder(accounts[1], {from : governance});
      assert.equal(await notifyHelper.feeRewardForwarder(), accounts[1]);
      await expectRevert(
        notifyHelper.setFeeRewardForwarder(accounts[9], {from : accounts[9]}),
        "Not governance"
      );
      assert.equal(await notifyHelper.feeRewardForwarder(), accounts[1]);
    });
  });
});
