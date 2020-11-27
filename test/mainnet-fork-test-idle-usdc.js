// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send, time } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");
  const Storage = artifacts.require("Storage");
  const IdleStrategyUSDCMainnet = artifacts.require("IdleStrategyUSDCMainnet");
  const Vault = artifacts.require("Vault");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet IDLE USDC Strategy", function(accounts){
    describe("Mainnet IDLE USDC earnings", function (){

      // external contracts
      let underlying;

      // external setup
      let underlyingWhale = MFC.USDC_WHALE_ADDRESS;

      // parties in the protocol
      let governance = MFC.GOVERNANCE_ADDRESS;
      let farmer1 = accounts[3];

      // numbers used in tests
      let farmerBalance;

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let controller;
      let vault;
      let strategy;
      let feeRewardForwarder;

      async function setupExternalContracts() {
        underlying = await IERC20.at(MFC.USDC_ADDRESS);
      }

      async function resetBalance() {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, underlyingWhale, "1000000000000000000");

        await underlying.transfer(farmer1, await underlying.balanceOf(underlyingWhale), {from: underlyingWhale});
        farmerBalance = await underlying.balanceOf(farmer1);
      }

      async function setupCoreProtocol() {
        // deploy storage
        storage = await Storage.new({ from: governance });

        feeRewardForwarder = await FeeRewardForwarder.new(storage.address, MFC.UNISWAP_V2_ROUTER02_ADDRESS, { from: governance });
        // set up controller
        controller = await Controller.new(storage.address, feeRewardForwarder.address, {
          from: governance,
        });

        await storage.setController(controller.address, { from: governance });

        // DAI vault
        vault = await Vault.at("0xf0358e8c3CD5Fa238a29301d0bEa3D63A17bEdBE");

        // set up the strategy
        strategy = await IdleStrategyUSDCMainnet.new(
          storage.address,
          vault.address,
          { from: governance }
        );
      }

      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
        await resetBalance();
      });

      async function depositVault(_farmer, _underlying, _vault, _amount) {
        await _underlying.approve(_vault.address, _amount, { from: _farmer });
        await _vault.deposit(_amount, { from: _farmer });
        console.log("Farmer vault shares");
        console.log((await _vault.balanceOf(_farmer)).toString());
      }

      it("A farmer investing underlying", async function () {
        console.log("Farmer balance");
        console.log((await underlying.balanceOf(farmer1)).toString());
        console.log("Farmer vault shares");
        console.log((await vault.balanceOf(farmer1)).toString());
        await vault.doHardWork({from: governance});
        console.log("sharePrice: before strategy upgrade");
        console.log((await vault.getPricePerFullShare()).toString());
        await vault.announceStrategyUpdate(strategy.address, {from: governance});
        await time.increase(12 * 60 * 60);
        await vault.setStrategy(strategy.address, {from: governance});
        console.log("sharePrice: after strategy upgrade");
        console.log((await vault.getPricePerFullShare()).toString());

        let duration = 500000;
        let farmerOldBalance = new BigNumber(await underlying.balanceOf(farmer1));
        await depositVault(farmer1, underlying, vault, farmerBalance);
        console.log("Farmer balance inside vault");
        console.log((await vault.underlyingBalanceWithInvestmentForHolder(farmer1)).toString());
        await strategy.setLiquidation(true, true, true, {from: governance});
        console.log((await vault.getPricePerFullShare()).toString());
        await vault.doHardWork({from: governance});
        console.log((await vault.getPricePerFullShare()).toString());
        await Utils.advanceNBlock(10);
        console.log("Farmer balance inside vault");
        console.log((await vault.underlyingBalanceWithInvestmentForHolder(farmer1)).toString());

        await vault.doHardWork({from: governance});
        console.log((await vault.getPricePerFullShare()).toString());

        await time.increase(duration);
        await Utils.advanceNBlock(100);


        // this is bad code
        for (let i = 0; i < 24; i++) {
          await time.increase(duration);
          await Utils.advanceNBlock(100);
        }

        await vault.doHardWork({from: governance});
        console.log((await vault.getPricePerFullShare()).toString());

        await time.increase(duration);
        await Utils.advanceNBlock(10);
        await vault.doHardWork({from: governance});
        console.log((await vault.getPricePerFullShare()).toString());
        let shares = await vault.balanceOf(farmer1);
        await vault.withdraw(shares, {from: farmer1});
        let farmerNewBalance = new BigNumber(await underlying.balanceOf(farmer1));
        // Farmer gained money
        Utils.assertBNGt(farmerNewBalance, farmerOldBalance);
        console.log(farmerNewBalance.toString());
        console.log(farmerOldBalance.toString());
      });
    });
  });
}
