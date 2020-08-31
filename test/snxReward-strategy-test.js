const { time, expectRevert } = require("@openzeppelin/test-helpers");
const MockUSDC = artifacts.require("MockUSDC");
const MockToken = artifacts.require("MockToken");
const YAMCOMPPool = artifacts.require("YAMCOMPPool");
const SNXRewardStrategy = artifacts.require("SNXRewardStrategy");
const Storage = artifacts.require("Storage");
const Controller = artifacts.require("Controller");

contract("SNXReward Strategy Test", function (accounts) {
  describe("SNXReward Interactions", function () {
    let owner = accounts[0];
    let vault = accounts[2];
    let governance = accounts[3];
    let controller;
    let rewardCollector = accounts[4];

    let storage;
    let underlying;
    let strategy;
    let cropToken;
    let rewardPool;

    let million = "1000000" + "000000";

    beforeEach(async function () {
      underlying = await MockUSDC.new({ from: owner });
      cropToken = await MockToken.new({ from: owner });

      storage = await Storage.new({ from: governance });
      // set up controller
      controller = await Controller.new(storage.address, rewardCollector, {
        from: governance,
      });
      await storage.setController(controller.address, { from: governance });

      rewardPool = await YAMCOMPPool.new({from: governance});
      await rewardPool.setStartTime(await time.latest());
      await rewardPool.setLP(underlying.address);

      let route = [cropToken.address, underlying.address];
      strategy = await SNXRewardStrategy.new(
        storage.address,
        underlying.address,
        vault,
        { from: owner }
      );

      await strategy.setRewardSource(
        rewardPool.address,
        cropToken.address,
        route,
        { from: governance }
      );

      await strategy.switchRewardSource(
        rewardPool.address,
        { from: governance }
      );
    });

    it("investing all underlying", async function () {
      await underlying.mint(strategy.address, million, { from: owner });
      await strategy.doHardWork({from: vault});

      assert.equal(
        million,
        await strategy.investedUnderlyingBalance()
      );
    });

    it("withdraw all to vault", async function () {
      await underlying.mint(strategy.address, million, { from: owner });
      await strategy.doHardWork({from: vault});

      assert.equal(
        million,
        await strategy.investedUnderlyingBalance()
      );

      // because there is no rewards earned, so withdraw will not invoke uniswap
      await strategy.withdrawAllToVault({ from: vault });

      assert.equal(0, await strategy.investedUnderlyingBalance());
      assert.equal(million, await underlying.balanceOf(vault));
    });

    it("withdraw specific amount to vault", async function () {
      await underlying.mint(strategy.address, million, { from: owner });
      await strategy.doHardWork({from: vault});

      assert.equal(
        million,
        await strategy.investedUnderlyingBalance()
      );

      let amount = Math.trunc(million) * 0.8;
      await strategy.withdrawToVault(amount, { from: vault });

      assert.equal(amount, await underlying.balanceOf(vault));
    });

    it("do hard work", async function () {
      await underlying.mint(strategy.address, million, { from: owner });
      await strategy.doHardWork({from: vault});

      assert.equal(
        million,
        await strategy.investedUnderlyingBalance()
      );

      // there's no reward, nothing should be invoked, everything stays the same
      await strategy.doHardWork({from: vault});

      assert.equal(million, await strategy.investedUnderlyingBalance());
    });
  });
});
