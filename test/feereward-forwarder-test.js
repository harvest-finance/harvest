const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
const MockToken = artifacts.require("MockToken");
const Storage = artifacts.require("Storage");
const NoMintRewardPool = artifacts.require("NoMintRewardPool");
const MockUniswap = artifacts.require("MockUniswap");
const Utils = require("./Utils.js");

const { expectRevert, constants } = require("@openzeppelin/test-helpers");

contract("FeeRewardForwarder Test", function (accounts) {
  describe("FeeRewardForwarder setting", function () {
    let governance = accounts[0];
    let farmer = accounts[1];
    let strategy = accounts[2];

    let storage;
    let feeRewardForwarder;
    let dai;
    let usdc;
    let farm;

    const dayDuration = 86400;
    let rewardAmountDai = "100" + "000000000000000000";
    let rewardAmountUSDC = "102" + "000000000000000000";
    let rewardDuration = 7 * dayDuration;

    beforeEach(async function () {

      storage = await Storage.new({ from: governance });
      const uniswap = await MockUniswap.new({ from: governance });
      feeRewardForwarder = await FeeRewardForwarder.new(
        storage.address,
        uniswap.address,
        { from: governance }
      );
      dai = await MockToken.new({ from: governance });
      usdc = await MockToken.new({ from: governance });
      farm = await MockToken.new({ from: governance });

      await farm.mint(feeRewardForwarder.address, rewardAmountDai, { from: governance });
      await farm.mint(farmer, rewardAmountDai, { from: governance });

      profitPoolDai = await NoMintRewardPool.new(
        dai.address,    // rewardToken
        farm.address,   // lpToken would be FARM
        rewardDuration,  // duration
        feeRewardForwarder.address,
        storage.address,
        { from: governance }
      );

      profitPoolUSDC = await NoMintRewardPool.new(
        usdc.address,   // rewardToken
        farm.address,   // lpToken would be FARM
        rewardDuration,  // duration
        feeRewardForwarder.address,
        storage.address,
        { from: governance }
      );
    });

    it("should set targetToken and pool", async function () {
      // assert all zeros at the beginning
      assert.equal(constants.ZERO_ADDRESS, await feeRewardForwarder.profitSharingPool());
      assert.equal(constants.ZERO_ADDRESS, await feeRewardForwarder.targetToken());

      // set to USDC pool
      await feeRewardForwarder.setTokenPool(profitPoolUSDC.address, { from: governance });
      assert.equal(profitPoolUSDC.address, await feeRewardForwarder.profitSharingPool());

      // assert that the targetToken is USDC also (retrieved from the pool)
      assert.equal(usdc.address, await feeRewardForwarder.targetToken());

      // update the pool to DAI now
      await feeRewardForwarder.setTokenPool(profitPoolDai.address, { from: governance });

      // check that pool was updated
      assert.equal(profitPoolDai.address, await feeRewardForwarder.profitSharingPool());
      // check that targetToken was updated to Dai
      assert.equal(dai.address, await feeRewardForwarder.targetToken());
    });

    it("should distribute without conversion if targetToken and token are the same", async function () {
      await feeRewardForwarder.setTokenPool(profitPoolDai.address, { from: governance });
      await profitPoolDai.setRewardDistribution(feeRewardForwarder.address, { from: governance });

      // feeRewardForwarder can start funding the pool (also starts the reward distribution)
      await dai.mint(strategy, rewardAmountDai, { from: governance });
      await dai.approve(feeRewardForwarder.address, rewardAmountDai, {from: strategy});
      await feeRewardForwarder.poolNotifyFixedTarget(dai.address, rewardAmountDai, { from: strategy });
      assert.equal(rewardAmountDai, await dai.balanceOf(profitPoolDai.address));

      // farmer stakes FARM, gets dai
      await farm.approve(profitPoolDai.address, rewardAmountDai, {from:farmer});
      await profitPoolDai.stake(rewardAmountDai, {from: farmer});
      await Utils.advanceNBlock(100);
      await profitPoolDai.exit({from: farmer});
      Utils.assertBNGt(await dai.balanceOf(farmer), 0);
    });

    it("should not distribute if tokens are different and conversion path is unset", async function () {
      await feeRewardForwarder.setTokenPool(profitPoolDai.address, { from: governance });
      await profitPoolDai.setRewardDistribution(feeRewardForwarder.address, { from: governance });

      // feeRewardForwarder can start funding the pool (also starts the reward distribution)
      await usdc.mint(strategy, rewardAmountUSDC, { from: governance });
      await usdc.approve(feeRewardForwarder.address, rewardAmountUSDC, {from: strategy});
      await feeRewardForwarder.poolNotifyFixedTarget(usdc.address, rewardAmountUSDC, { from: strategy });

      // all USDC should stay with the strategy, nothing gets to the reward pool, nor fee forwarder
      assert.equal(rewardAmountUSDC, await usdc.balanceOf(strategy));
      assert.equal(0, await usdc.balanceOf(feeRewardForwarder.address));
      assert.equal(0, await usdc.balanceOf(profitPoolDai.address));
      // the minted DAI stays in the fee forwarder
      assert.equal(0, await dai.balanceOf(profitPoolDai.address));
    });

    it("should distribute if tokens are different but conversion path is set", async function () {
      await feeRewardForwarder.setTokenPool(profitPoolDai.address, { from: governance });
      await profitPoolDai.setRewardDistribution(feeRewardForwarder.address, { from: governance });

      // feeRewardForwarder can start funding the pool (also starts the reward distribution)
      await usdc.mint(strategy, rewardAmountUSDC, { from: governance });
      await usdc.approve(feeRewardForwarder.address, rewardAmountUSDC, {from: strategy});

      // now, set the conversion path
      await feeRewardForwarder.setConversionPath(
        usdc.address,
        dai.address,
        [usdc.address, dai.address],
        { from: governance }
      );

      // add some DAI to the fee forwarder
      // this way, we are mimicing the success of the uniswap trade,
      // where USDC is swapped to DAI
      await dai.mint(feeRewardForwarder.address, rewardAmountDai, { from: governance });

      // notify again (with the USDC amount)
      // this time, the fee forwarder would transfer its DAI balance into the pool
      await feeRewardForwarder.poolNotifyFixedTarget(usdc.address, rewardAmountUSDC, { from: strategy });

      // USDC is still not transferred into the reward pool
      assert.equal(0, await usdc.balanceOf(profitPoolDai.address));
      // but it's gone from the strategy
      assert.equal(0, await usdc.balanceOf(strategy));
      // and all the minted DAI gets transferred into the reward pool
      assert.equal(0, await dai.balanceOf(feeRewardForwarder.address));
      assert.equal(rewardAmountDai, await dai.balanceOf(profitPoolDai.address));
    });
  });
});
