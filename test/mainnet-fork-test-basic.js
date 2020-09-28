// This test is only invoked if MAINNET_FORK is set

if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");
  const Vault = artifacts.require("Vault");
  const RewardToken = artifacts.require("RewardToken");
  const NoMintRewardPool = artifacts.require("NoMintRewardPool");
  const NoopStrategy = artifacts.require("NoopStrategy");
  const Storage = artifacts.require("Storage");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet basic test", function (accounts) {
    describe("Basic settings", function () {

      let rewardCollector = accounts[1];
      let farmer1 = accounts[2];
      let farmer2 = accounts[3];
      let rewardDistribution = accounts[4];
      let governance = accounts[6];

      let burner = accounts[9];

      const dayDuration = 86400;
      // removing the last few digits when comparing, since we have 18
      // so this should be fine
      const removePrecision = 1000000;

      let vault;
      let controller;
      let storage;
      let rewardPool;
      let rewardToken;
      let rewardDuration = 7 * dayDuration;
      let tokenPrecision = (new BigNumber(10)).pow(18);
      let totalReward = (new BigNumber(2500)).times(tokenPrecision);

      const roundBalance = "1000000";
      const roundBalancePostGain = "1100000";
      const roundBalancePostGainFarmer = "1152381";

      let dai;

      let daiWhale = MFC.DAI_WHALE_ADDRESS;

      beforeEach(async function () {

        // Get the Dai Token
        dai = await IERC20.at(MFC.DAI_ADDRESS);

        // deploy storage
        storage = await Storage.new({ from: governance });

        // create the reward token
        rewardToken = await RewardToken.new(storage.address, { from: governance });

        // set up controller
        controller = await Controller.new(storage.address, rewardCollector, {
          from: governance,
        });

        await storage.setController(controller.address, { from: governance });

        // set up the vault with 100% investment
        vault = await makeVault(storage.address, dai.address, 100, 100, {from: governance});

        // set up the strategy
        strategy = await NoopStrategy.new(
          storage.address,
          dai.address,
          vault.address,
          { from: governance }
        );

        // link vault with strategy
        await controller.addVaultAndStrategy(vault.address, strategy.address, {from: governance});

        // create a reward pool
        // using the vault token as underlying stake
        rewardPool = await NoMintRewardPool.new(
          rewardToken.address,    // rewardToken should be FARM
          vault.address,          // lpToken
          rewardDuration,          // duration
          rewardDistribution,
          storage.address,
          {from: governance}
        );

        // authorize the rewardDistribution to mint
        await rewardToken.addMinter(rewardDistribution, {from: governance});

        // mint reward and transfer to pool
        await rewardToken.mint(rewardPool.address, totalReward, {from: rewardDistribution});
        Utils.assertBNEq( await rewardToken.balanceOf(rewardPool.address), totalReward);

        // Give Daiwhale some Ether
        await send.ether(accounts[8], daiWhale, "100000000000000000000");
      });

      it("setting investment ratio", async function () {
        await vault.setVaultFractionToInvest(50, 100, {from: governance});
        // reset token balance
        await dai.transfer(farmer1, roundBalance, {from: daiWhale});
        assert.equal(roundBalance, await dai.balanceOf(farmer1));

        // deposit some tokens for one farmer, will receive 1x shares
        await dai.approve(vault.address, roundBalance, { from: farmer1 });
        await vault.deposit(roundBalance, { from: farmer1 });
        assert.equal(roundBalance, await vault.balanceOf(farmer1));
        assert.equal(roundBalance, await vault.getContributions(farmer1));

        // check pre-investment and post-investment
        assert.equal(roundBalance / 2, await vault.availableToInvestOut());
        assert.equal(roundBalance, await vault.underlyingBalanceInVault());
        await vault.doHardWork({ from: governance });
        assert.equal(0, await vault.availableToInvestOut());
        assert.equal(roundBalance / 2, await vault.underlyingBalanceInVault());
      });
    });
  });
}
