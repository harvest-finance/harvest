// This test is only invoked if MAINNET_FORK is set
if (process.env.MAINNET_FORK) {
  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send } = require("@openzeppelin/test-helpers");
  const BigNumber = require("bignumber.js");
  const Controller = artifacts.require("Controller");
  const Vault = artifacts.require("Vault");
  const Storage = artifacts.require("Storage");
  const CRVStrategyWBTC = artifacts.require("CRVStrategyWBTCMainnet");
  const PriceConvertor = artifacts.require("PriceConvertor");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  // UniswapV2 Router (can we ignore this or not?)
  const UniswapV2Router02 = artifacts.require("UniswapV2Router02");

  BigNumber.config({ DECIMAL_PLACES: 0 });

  contract("Mainnet Curve WBTC", function (accounts) {
    describe("Curve savings", function () {
      // external contracts
      let wbtc;
      let ycrv;

      // external setup
      let wbtcWhale = MFC.WBTC_WHALE_ADDRESS;

      // parties in the protocol
      let governance = accounts[1];
      let rewardCollector = accounts[2];
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];

      // numbers used in tests
      const farmerBalance = "10" + "00000000";

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let controller;
      let wbtcVault;
      let daiStrategy;
      let ycrvStrategy;

      // secondary protocol contracts

      async function setupExternalContracts() {
        ycrv = await IERC20.at(MFC.YCRV_ADDRESS);
        wbtc = await IERC20.at(MFC.WBTC_ADDRESS);
        let crv = MFC.CRV_ADDRESS;
      }

      async function resetDaiBalance() {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, wbtcWhale, "1" + "000000000000000000");
        // reset token balance
        await wbtc.transfer(wbtcWhale, await wbtc.balanceOf(farmer1), {
          from: farmer1,
        });
        await wbtc.transfer(wbtcWhale, await wbtc.balanceOf(farmer2), {
          from: farmer2,
        });
        await wbtc.transfer(farmer1, farmerBalance, { from: wbtcWhale });
        await wbtc.transfer(farmer2, farmerBalance, { from: wbtcWhale });
        assert.equal(farmerBalance, await wbtc.balanceOf(farmer1));
      }

      async function setupCoreProtocol() {
        // deploy storage
        storage = await Storage.new({ from: governance });

        feeRewardForwarder = await FeeRewardForwarder.new(storage.address, MFC.UNISWAP_V2_ROUTER02_ADDRESS, { from: governance });

        // set up controller
        controller = await Controller.new(storage.address, feeRewardForwarder.address, {
          from: governance,
        });
        assert.equal(await controller.governance(), governance);

        await storage.setController(controller.address, { from: governance });

        // set up the wbtcVault with 90% investment
        wbtcVault = await makeVault(storage.address, wbtc.address, 90, 100, {
          from: governance,
        });

        // set up the strategies
        wbtcStrategy = await CRVStrategyWBTC.new(
          storage.address,
          wbtcVault.address,
          { from: governance }
        );

        // link vaults with strategies
        await controller.addVaultAndStrategy(
          wbtcVault.address,
          wbtcStrategy.address,
          { from: governance }
        );
      }

      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
        await resetDaiBalance();
      });

      async function depositVault(_farmer, _underlying, _vault, _amount) {
        await _underlying.approve(_vault.address, _amount, { from: _farmer });
        await _vault.deposit(_amount, { from: _farmer });
        assert.equal(_amount, await _vault.balanceOf(_farmer));
        assert.equal(_amount, await _vault.getContributions(_farmer));
      }

      it("A farmer investing wbtc", async function () {
        let farmerOldBalance = new BigNumber(await wbtc.balanceOf(farmer1));
        await depositVault(farmer1, wbtc, wbtcVault, farmerBalance);
        let hours = 24;
        for (let i = 0; i < hours; i++) {
          let blocksPerHour = 240;
          await Utils.advanceNBlock(blocksPerHour);
          await controller.doHardWork(wbtcVault.address, { from: governance });
          await controller.doHardWork(wbtcVault.address, { from: governance });
        }
        await wbtcVault.withdraw(farmerBalance, { from: farmer1 });
        let farmerNewBalance = new BigNumber(await wbtc.balanceOf(farmer1));
        Utils.assertBNGt(farmerNewBalance, farmerOldBalance);
      });
    });
  });
}
