const { constants } = require("@openzeppelin/test-helpers");
const Controller = artifacts.require("Controller");
const Vault = artifacts.require("Vault");
const MockToken = artifacts.require("MockToken");
const NoopStrategy = artifacts.require("NoopStrategy");
const Storage = artifacts.require("Storage");
const HardRewards = artifacts.require("HardRewards");
const HardWorkHelper = artifacts.require("HardWorkHelper");
const makeVault = require("./make-vault.js");
const { waitHours } = require("./Utils.js");

contract("Hard Work Helper Test", function (accounts) {
  describe("Public hard work calls", function () {
    let governance = accounts[0];
    let rewardCollector = accounts[1];
    let farmer = accounts[2];
    let strategy = accounts[3];
    let hardWorker = accounts[4];

    let storage;
    let vault;
    let controller;
    let underlying;
    let helper;
    let rewardToken;

    const farmerBalance = "95848503450";

    beforeEach(async function () {
      // create the underlying token
      underlying = await MockToken.new({ from: governance });
      await underlying.mint(farmer, farmerBalance, { from: governance });
      assert.equal(
        farmerBalance,
        (await underlying.balanceOf(farmer)).toString()
      );

      // set up controller
      storage = await Storage.new({ from: governance });
      controller = await Controller.new(storage.address, rewardCollector, {
        from: governance,
      });
      await storage.setController(controller.address, { from: governance });

      // set up the vault with 100% investment
      vault = await makeVault(storage.address, underlying.address, 100, 100, {
        from: governance,
      });

      // set up the strategy
      strategy = await NoopStrategy.new(
        storage.address,
        underlying.address,
        vault.address,
        { from: governance }
      );
    });

    it("can call hard work via helper", async function () {
      let anotherNoopStrategy = await NoopStrategy.new(
        controller.address,
        underlying.address,
        vault.address,
        { from: governance }
      );

      // adding the vault and strategy pair
      await controller.addVaultAndStrategy(vault.address, strategy.address);
      assert.equal(strategy.address, await vault.strategy());

      // add strategy for the vault
      await vault.announceStrategyUpdate(anotherNoopStrategy.address, {
        from: governance,
      });
      await waitHours(12);
      await vault.setStrategy(anotherNoopStrategy.address, {
        from: governance,
      });

      // deposit some tokens
      await underlying.approve(vault.address, farmerBalance, { from: farmer });
      await vault.deposit(farmerBalance, { from: farmer });

      // add hard rewards
      let token = await MockToken.new({ from: governance });
      let hardRewards = await HardRewards.new(storage.address, token.address, {
        from: governance,
      });
      await controller.setHardRewards(hardRewards.address, {
        from: governance,
      });
      assert.equal(hardRewards.address, await controller.hardRewards());

      // set up the hard worker
      helper = await HardWorkHelper.new(storage.address, token.address);
      await helper.setVaults([vault.address], { from: governance });
      await controller.addHardWorker(helper.address, { from: governance });

      assert.equal(await helper.getNumberOfVaults(), 1);

      // trigger hard work
      await helper.doHardWork({ from: farmer });

      // the investment should be in the strategy
      assert.equal(
        farmerBalance,
        await anotherNoopStrategy.investedUnderlyingBalance()
      );
      assert.equal(farmerBalance, await vault.balanceOf(farmer));
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(
        farmerBalance,
        await vault.underlyingBalanceWithInvestment()
      );
    });
  });
});
