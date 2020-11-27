// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { send } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");
  const Storage = artifacts.require("Storage");
  const DEGOSimpleStrategy = artifacts.require("DEGOSimpleStrategy");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract.only("Mainnet DEGO", function(accounts){
    describe("DEGO mining", function (){

      // external contracts
      let dego;
      let weth;

      // external setup
      let wethWhale = MFC.WETH_WHALE_ADDRESS;

      // parties in the protocol
      let governance = accounts[1];
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];

      // numbers used in tests
      const farmerBalance = "100" + "000000000000000000";

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let controller;
      let vault;
      let strategy;

      async function setupExternalContracts() {
        weth = await IERC20.at(MFC.WETH_ADDRESS);
        dego = await IERC20.at(MFC.DEGO_ADDRESS);
      }

      async function resetWETHBalance() {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, wethWhale, "10" + "000000000000000000");
        // reset token balance
        await weth.transfer(wethWhale, await weth.balanceOf(farmer1), {from: farmer1});
        await weth.transfer(wethWhale, await weth.balanceOf(farmer2), {from: farmer2});
        await weth.transfer(farmer1, farmerBalance, {from: wethWhale});
        await weth.transfer(farmer1, farmerBalance, {from: wethWhale});
        await weth.transfer(farmer2, farmerBalance, {from: wethWhale});
      }

      async function setupCoreProtocol() {
        // deploy storage
        storage = await Storage.new({ from: governance });

        const feeRewardForwarder = await FeeRewardForwarder.new(storage.address, weth.address, MFC.UNISWAP_V2_ROUTER02_ADDRESS, { from: governance });

        // set up controller
        controller = await Controller.new(storage.address, feeRewardForwarder.address, {
          from: governance,
        });

        await storage.setController(controller.address, { from: governance });

        // set up the vault with 100% investment
        vault = await makeVault(storage.address, weth.address, 95, 100, {from: governance});

        // set up the strategy
        strategy = await DEGOSimpleStrategy.new(
          storage.address,
          weth.address,
          vault.address,
          MFC.DEGO_WETH_RewardPool_ADDRESS,
          dego.address,
          { from: governance }
        );

        await strategy.setLiquidationRoute([MFC.DEGO_ADDRESS, MFC.WETH_ADDRESS], {from: governance});

        // link vault with strategy
        await controller.addVaultAndStrategy(vault.address, strategy.address, {from: governance});
      }

      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
        await resetWETHBalance();
      });

      async function depositVault(_farmer, _underlying, _vault, _amount) {
        await _underlying.approve(_vault.address, _amount, { from: _farmer });
        await _vault.deposit(_amount, { from: _farmer });
      }

      it.only("A farmer investing weth", async function () {
        let farmerOldBalance = new BigNumber(await weth.balanceOf(farmer1));
        await depositVault(farmer1, weth, vault, farmerBalance);
        await vault.doHardWork({from: governance});
        console.log((await vault.getPricePerFullShare()).toString());
        await Utils.advanceNBlock(240);
        await vault.doHardWork({from: governance});
        console.log((await vault.getPricePerFullShare()).toString());
        await Utils.advanceNBlock(240);
        await vault.doHardWork({from: governance});
        console.log((await vault.getPricePerFullShare()).toString());
        await Utils.advanceNBlock(240);
        await vault.doHardWork({from: governance});
        console.log((await vault.getPricePerFullShare()).toString());
        // todo: run the test with multiple parameters
        await vault.withdraw(farmerBalance, {from: farmer1});
        let farmerNewBalance = new BigNumber(await weth.balanceOf(farmer1));
        console.log(farmerNewBalance.toFixed());
        console.log(farmerOldBalance.toFixed());
        Utils.assertBNGt(farmerNewBalance, farmerOldBalance);
      });
    });
  });
}
