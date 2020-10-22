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
const makeVault = require("./make-vault.js");

BigNumber.config({ DECIMAL_PLACES: 0 });

contract("NoMint reward pool Test", function (accounts) {
  describe("Basic settings", function () {
    let governance = accounts[0];
    let rewardCollector = accounts[1];
    let farmer1 = accounts[2];
    let strategy = accounts[3];
    let rewardDistribution = accounts[4];
    let farmer2 = accounts[5];
    let migrationStrategy = accounts[6];

    const dayDuration = 86400;
    // removing the last few digits when comparing, since we have 18
    // so this should be fine
    const removePrecision = 1000000;

    let storage;
    let oldVault;
    let vault;
    let controller;
    let underlying;
    let rewardPool;
    let rewardToken;
    let rewardDuration = 7 * dayDuration;
    let tokenPrecision = new BigNumber(10).pow(18);
    let totalReward = new BigNumber(2500).times(tokenPrecision);

    const farmerBalance = "1000000000000000000";
    const twofarmerBalance = "2000000000000000000";

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
      vault = await makeVault(storage.address, underlying.address, 100, 100, {
        from: governance,
      });

      // set up the vault with 100% investment
      oldVault = await makeVault(storage.address, underlying.address, 100, 100, {
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
        storage.address,
        oldVault.address,
        migrationStrategy
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
    });

    it("Basic Migration", async function () {

      // farmer deposit into old vault
      await underlying.approve(oldVault.address, farmerBalance, { from: farmer1 });
      await oldVault.deposit(farmerBalance, { from: farmer1 });
      await underlying.approve(oldVault.address, farmerBalance, { from: farmer2 });
      await oldVault.deposit(farmerBalance, { from: farmer2 });
      assert.equal(farmerBalance, await oldVault.balanceOf(farmer1));

      // Mint money to the migration strategy
      // this is to mimic the migration strategy where it has all users' balance
      // the migration strategy deposits into the new vault, and transfers the shares of the
      // new vault to the reward pool later
      await underlying.mint(migrationStrategy, twofarmerBalance, { from: governance });    
      await underlying.approve(vault.address, twofarmerBalance, { from: migrationStrategy });
      await vault.deposit(twofarmerBalance, { from: migrationStrategy });

      // now we enable the migration by having the rewardPool to pullFrom Strategy
      await vault.approve(rewardPool.address, twofarmerBalance, {from:migrationStrategy});
      await rewardPool.pullFromStrategy({from:migrationStrategy});

      assert.equal(0, await vault.balanceOf(farmer1));
      assert.equal(0, await rewardPool.balanceOf(farmer1));

      await oldVault.approve(rewardPool.address, farmerBalance, { from: farmer1 });
      await rewardPool.migrate({ from: farmer1 });

      assert.equal(0, await vault.balanceOf(farmer1));
      assert.equal(farmerBalance, await rewardPool.balanceOf(farmer1));
      await rewardPool.exit({ from: farmer1 });
      assert.equal(0, await rewardToken.balanceOf(farmer1));
      assert.equal(farmerBalance, await vault.balanceOf(farmer1));

      await vault.withdraw(await vault.balanceOf(farmer1) ,{from: farmer1});
      assert.equal(farmerBalance, await underlying.balanceOf(farmer1));
    });
  });
});
