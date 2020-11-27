const Utils = require("./Utils.js");
const Vault = artifacts.require("Vault");
const MockToken = artifacts.require("MockToken");
const CompoundStrategy = artifacts.require("CompoundStrategy");
const MockCUSDC = artifacts.require("MockCUSDC");
const MockUSDC = artifacts.require("MockUSDC");
const MockComptroller = artifacts.require("MockComptroller");
const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
const Controller = artifacts.require("Controller");
const Storage = artifacts.require("Storage");
const MockUniswap = artifacts.require("MockUniswap");

contract.skip("Compound Strategy Test", function (accounts) {
  describe("Compound Interactions", function () {
    let owner = accounts[0];
    let vault = accounts[2];
    let governance = accounts[3];
    let controller;
    let uniswap;
    let oracle = accounts[7];
    let treasury = accounts[8];

    // targeting 50% collateral ratio
    let numerator = 50;
    let denominator = 100;
    let tolerance = 2;

    let storage;
    let comp;
    let underlying;
    let strategy;
    let ctoken;
    let comptroller;
    let million = "1000000" + "000000";

    beforeEach(async function () {
      comptroller = await MockComptroller.new();
      underlying = await MockUSDC.new({ from: owner });
      comp = await MockToken.new({ from: owner });
      ctoken = await MockCUSDC.new(underlying.address, { from: owner });
      // fund to be able to borrow and give interest
      await underlying.mint(ctoken.address, million, { from: owner });
      storage = await Storage.new({ from: governance });
      let feeRewardForwarder = await FeeRewardForwarder.new(storage.address, underlying.address, underlying.address, { from: governance });
      controller = await Controller.new(storage.address, feeRewardForwarder.address, { from: governance });

      await storage.setController(controller.address, { from: governance });
      uniswap = await MockUniswap.new();
      strategy = await CompoundStrategy.new(
        storage.address,
        underlying.address,
        ctoken.address,
        vault,
        comptroller.address,
        comp.address,
        uniswap.address,
        oracle,
        { from: owner }
      );
      await strategy.setRatio(numerator, denominator, tolerance, {
        from: governance,
      });
      await underlying.mint(vault, million / 10, { from: owner });
      await underlying.approve(strategy.address, million + "" + million, {
        from: vault,
      });
    });

    it("investing all underlying", async function () {
      await underlying.mint(strategy.address, million, { from: owner });
      await strategy.investAllUnderlying();

      // we transferred 1 million tokens, so we should be invested with
      // 2 million supply, 1 million loan, and 5% interest is extra 100k

      // Round to deal with floating point javascript numbers
      let expectedBalance = Math.round(Math.trunc(million) * 2.1);
      assert.equal(expectedBalance, await ctoken.balanceOf(strategy.address));
      assert.equal(0, await underlying.balanceOf(strategy.address));

      assert.equal(
        expectedBalance - Math.trunc(million) * 1.1,
        await strategy.investedUnderlyingBalance()
      );

      // do this again
      await underlying.mint(strategy.address, million, { from: owner });
      await strategy.investAllUnderlying();
      assert.equal(
        expectedBalance * 2,
        await ctoken.balanceOf(strategy.address)
      );
      assert.equal(0, await underlying.balanceOf(strategy.address));
    });

    it("withdraw all to vault", async function () {
      await underlying.mint(strategy.address, million, { from: owner });
      await strategy.investAllUnderlying();

      // we transferred 1 million tokens, so we should be invested with
      // 2 million supply, 1 million loan, and 5% interest is extra 100k

      // Round to deal with floating point javascript numbers
      let expectedBalance = Math.round(Math.trunc(million) * 2.1);
      assert.equal(expectedBalance, await ctoken.balanceOf(strategy.address));
      assert.equal(0, await underlying.balanceOf(strategy.address));
      assert.equal(million / 10, await underlying.balanceOf(vault));

      await strategy.withdrawAllToVault({ from: vault });

      assert.equal(0, await strategy.investedUnderlyingBalance());

      // we get 2.1 million (1.05x), 1.1 million of the loan (1.1x) must be repaid
      // and we had 100k extra in the vault
      expectedBalance = Math.trunc(million) * 1.1;
      assert.equal(expectedBalance, await underlying.balanceOf(vault));
    });

    it("withdraw specific amount to vault", async function () {
      await underlying.mint(strategy.address, million, { from: owner });
      await strategy.investAllUnderlying();

      // we transferred 1 million tokens, so we should be invested with
      // 2 million supply, 1 million loan, and 5% interest is extra 100k

      // Round to deal with floating point javascript numbers
      let expectedBalance = Math.round(Math.trunc(million) * 2.1);
      assert.equal(expectedBalance, await ctoken.balanceOf(strategy.address));
      assert.equal(0, await underlying.balanceOf(strategy.address));

      // withdrawing enough to trigger multiple redeems
      let amount = Math.trunc(million) * 0.8;
      await strategy.withdrawToVault(amount, { from: vault });

      // we have an extra 100k in the vault
      assert.equal(
        amount + Math.trunc(million) / 10,
        await underlying.balanceOf(vault)
      );
    });

    it("do hard work", async function () {
      await underlying.mint(strategy.address, million, { from: owner });
      await strategy.investAllUnderlying();

      // we transferred 1 million tokens, so we should be invested with
      // 2 million supply, 1 million loan, and 5% interest is extra 100k

      // Round to deal with floating point javascript numbers
      let expectedBalance = Math.round(Math.trunc(million) * 2.1);
      assert.equal(expectedBalance, await ctoken.balanceOf(strategy.address));
      assert.equal(0, await underlying.balanceOf(strategy.address));
      // 2.1 million in positive, 1.1 million in debt
      expectedBalance = million;
      assert.equal(expectedBalance, await strategy.investedUnderlyingBalance());

      await strategy.doHardWork();
      // No comp was given on hard work, we have a ratio within tolerance, so nothing changed
      expectedBalance = million;
      assert.equal(expectedBalance, await strategy.investedUnderlyingBalance());
    });
  });
});
