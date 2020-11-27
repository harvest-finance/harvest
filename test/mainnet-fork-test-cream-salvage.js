const { assertApproxBNEq } = require("./Utils.js");

// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");
  const Comptroller = artifacts.require("ComptrollerInterface");
  const Vault = artifacts.require("Vault");
  const Storage = artifacts.require("Storage");
  const WETHCreamNoFoldStrategy = artifacts.require("WETHCreamNoFoldStrategy");
  const NoopRevert = artifacts.require("NoopRevert");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const CToken = artifacts.require("CompleteCToken");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  // Compound Comptroller
  // const Comptroller = artifacts.require("Comptroller");
  // UniswapV2 Router
  const UniswapV2Router02 = artifacts.require("UniswapV2Router02");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet Cream", function(accounts){
    describe("Compound savings", function (){

      // external contracts
      let comptroller;
      let uniswapV2Router02;
      let cream;
      let weth;
      let crEth;

      // external setup
      let wethWhale = MFC.WETH_WHALE_ADDRESS;

      // parties in the protocol
      let governance = accounts[1];
      let rewardCollector = accounts[2];
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
      let noopRevertStrategy;

      async function setupExternalContracts() {
        comptroller = await Comptroller.at(MFC.CREAM_COMPTROLLER_ADDRESS);
        uniswapV2Router02 = await UniswapV2Router02.at(MFC.UNISWAP_V2_ROUTER02_ADDRESS);
        crEth = await IERC20.at(MFC.crETH_ADDRESS);
        crEthCtoken = await CToken.at(MFC.crETH_ADDRESS);
        weth = await IERC20.at(MFC.WETH_ADDRESS);
        cream = await IERC20.at(MFC.CREAM_ADDRESS);
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

        feeRewardForwarder = await FeeRewardForwarder.new(storage.address, weth.address, MFC.UNISWAP_V2_ROUTER02_ADDRESS, { from: governance });

        // set up controller
        controller = await Controller.new(storage.address, feeRewardForwarder.address, {
          from: governance,
        });

        await storage.setController(controller.address, { from: governance });

        // set up the vault with 100% investment
        vault = await makeVault(storage.address, weth.address, 99, 100, {from: governance});

        // set up the strategy
        strategy = await WETHCreamNoFoldStrategy.new(
          storage.address,
          weth.address,
          crEth.address,
          vault.address,
          comptroller.address,
          cream.address,
          uniswapV2Router02.address,
          { from: governance }
        );

        noopRevertStrategy = await NoopRevert.new(
          storage.address,
          weth.address,
          vault.address,
          {from: governance }
        );

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


      it("two farmers", async function () {
        let farmer1OldBalance = new BigNumber(await weth.balanceOf(farmer1));
        let farmer2OldBalance = new BigNumber(await weth.balanceOf(farmer2));
        await depositVault(farmer1, weth, vault, farmerBalance);
        await vault.doHardWork({from: governance});
        await Utils.advanceNBlock(10);
        await depositVault(farmer1, weth, vault, farmerBalance);
        await depositVault(farmer2, weth, vault, farmerBalance);
        await vault.doHardWork({from: governance});
        await Utils.advanceNBlock(10);
        await vault.doHardWork({from: governance});
        await Utils.advanceNBlock(10);
        await vault.doHardWork({from: governance});

        let smallAmount = "100000000000000000"; // 0.1

        let underlyingBalanceInVaultWithInvestment = await vault.underlyingBalanceWithInvestment();
        await vault.setStrategy(noopRevertStrategy.address, {from: governance});
        console.log("eth.balanceOf(vault.address): ", new BigNumber(await weth.balanceOf(vault.address)).toFixed());
        console.log("underlyingBalanceInVaultWithInvestment: ", new BigNumber(underlyingBalanceInVaultWithInvestment).toFixed());
        //assert.equal(await weth.balanceOf(vault.address), underlyingBalanceInVaultWithInvestment);
        await vault.doHardWork({from: governance});
        await vault.setStrategy(strategy.address, {from: governance});
        await vault.doHardWork({from: governance});

        console.log((new BigNumber(await weth.balanceOf(vault.address))).toFixed());
        await vault.withdraw(smallAmount, {from: farmer1});
        console.log((new BigNumber(await weth.balanceOf(vault.address))).toFixed());
        await Utils.advanceNBlock(10);
        await vault.doHardWork({from: governance});
        console.log((new BigNumber(await weth.balanceOf(vault.address))).toFixed());
        await vault.withdraw( await vault.balanceOf(farmer2), {from: farmer2} );
        console.log((new BigNumber(await weth.balanceOf(vault.address))).toFixed());
        await vault.withdraw( await vault.balanceOf(farmer1), {from: farmer1} );
        console.log((new BigNumber(await weth.balanceOf(vault.address))).toFixed());


        let farmer1NewBalance = new BigNumber(await weth.balanceOf(farmer1));
        let farmer2NewBalance = new BigNumber(await weth.balanceOf(farmer2));
        console.log(farmer1NewBalance.toFixed());
        console.log(farmer1OldBalance.toFixed());
        console.log(farmer2NewBalance.toFixed());
        console.log(farmer2OldBalance.toFixed());
        Utils.assertBNGt(farmer1NewBalance, farmer1OldBalance);
        Utils.assertBNGt(farmer2NewBalance, farmer2OldBalance);
      });

    });
  });
}
