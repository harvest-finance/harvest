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
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const CToken = artifacts.require("CompleteCToken");
  const LiquidityRecipient = artifacts.require("LiquidityRecipient");
  const RewardToken = artifacts.require("RewardToken");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract.only("WETH Borrow", function(accounts){
    describe("WETH Borrow Strategy", function (){

      // external contracts
      let comptroller;
      let uniswapV2Router02 = { address : MFC.UNISWAP_V2_ROUTER02_ADDRESS };
      let cream;
      let weth;
      let crEth;

      // external setup
      let wethWhale = MFC.WETH_WHALE_ADDRESS;

      // parties in the protocol
      let governance = MFC.GOVERNANCE_ADDRESS;
      let rewardCollector = accounts[2];
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];
      let treasury = MFC.OPS_ADDRESS;

      // numbers used in tests
      const farmerBalance = "100" + "000000000000000000";
      const liquidityLoanTarget = "100" + "000000000000000000";
      const higherLoanTarget = "200" + "000000000000000000"

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let farm;
      let storage;
      let lpToken;
      let controller;
      let vault;
      let strategy;
      let liquidityRecipient;

      async function setupExternalContracts() {
        comptroller = await Comptroller.at(MFC.CREAM_COMPTROLLER_ADDRESS);
        // uniswapV2Router02 = await UniswapV2Router02.at(MFC.UNISWAP_V2_ROUTER02_ADDRESS);
        crEth = await IERC20.at(MFC.crETH_ADDRESS);
        crEthCtoken = await CToken.at(MFC.crETH_ADDRESS);
        weth = await IERC20.at(MFC.WETH_ADDRESS);
        cream = await IERC20.at(MFC.CREAM_ADDRESS);
        lpToken = await IERC20.at(MFC.UNISWAP_ETH_FARM_LP_ADDRESS);

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
        // Reward Token
        farm = await RewardToken.at(MFC.FARM_ADDRESS);

        // deploy storage
        storage = await Storage.at("0xc95CbE4ca30055c787CB784BE99D6a8494d0d197");

        // set up controller
        controller = await Controller.at("0x222412af183BCeAdEFd72e4Cb1b71f1889953b1C");

        // set up the vault with 100% investment
        vault = await Vault.at("0x8e298734681adbfC41ee5d17FF8B0d6d803e7098");

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

        await controller.doHardWork(vault.address, {from: governance});

        // link vault with strategy
        await vault.setStrategy(strategy.address, {from: governance});

        // set up the liquidity recipient
        liquidityRecipient = await LiquidityRecipient.new(
          storage.address, 
          weth.address, 
          MFC.FARM_ADDRESS, 
          treasury, 
          MFC.UNISWAP_V2_ROUTER02_ADDRESS, 
          MFC.UNISWAP_ETH_FARM_LP_ADDRESS, 
          strategy.address
        );
        await strategy.setLiquidityRecipient(liquidityRecipient.address, {from : governance});
        await strategy.setLiquidityLoanTarget(liquidityLoanTarget, {from : governance});
        // ops sending FARM to liquidityRecipient
        let farmLiquidity = "1000"+"000000000000000000"
        await farm.transfer(liquidityRecipient.address, farmLiquidity, {from: treasury});

        
        await vault.setVaultFractionToInvest(9300, 10000, {from : governance});

        // invest into the new cream strategy
        await controller.doHardWork(vault.address, {from: governance});
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
      
      it("A farmer investing weth and liquidity is borrowed", async function () {
        let loan = new BigNumber(liquidityLoanTarget);
        // Provide loan
        await strategy.withdrawAll({from: governance});
        let strategyWethBalanceBefore = new BigNumber(await weth.balanceOf(strategy.address));
        let recipientWethBalanceBefore = new BigNumber(await weth.balanceOf(liquidityRecipient.address));
        let recipientFarmBalanceBefore = new BigNumber(await farm.balanceOf(liquidityRecipient.address));
        console.log("Strategy Weth before:", (strategyWethBalanceBefore).toString());
        console.log("Recipient Weth before:", (recipientWethBalanceBefore).toString());
        console.log("Recipient Farm before:", (recipientFarmBalanceBefore).toString());
        console.log("Recipient lpToken before: ", (await lpToken.balanceOf(liquidityRecipient.address)).toString());
        Utils.assertBNEq(await strategy.liquidityLoanCurrent(), "0");

        await strategy.provideLoan({from: governance});
        let strategyWethBalanceAfter = new BigNumber(await weth.balanceOf(strategy.address));
        let recipientWethBalanceAfter = new BigNumber(await weth.balanceOf(liquidityRecipient.address));
        let recipientFarmBalanceAfter = new BigNumber(await farm.balanceOf(liquidityRecipient.address));
        console.log("Strategy Weth before:", (strategyWethBalanceAfter).toString());
        console.log("Recipient Weth before:", (recipientWethBalanceAfter).toString());
        console.log("Recipient Farm before:", (recipientFarmBalanceAfter).toString());
        console.log("Recipient lpToken after: ", (await lpToken.balanceOf(liquidityRecipient.address)).toString());

        Utils.assertBNEq(strategyWethBalanceBefore.minus(loan), strategyWethBalanceAfter);
        Utils.assertBNEq(await strategy.liquidityLoanCurrent(), loan);
        Utils.assertBNEq(await strategy.liquidityLoanTarget(), loan);

        
        // raise the target loan, then provide loan again
        // the diff should be invested
        let higherloan = new BigNumber(higherLoanTarget);
        await strategy.setLiquidityLoanTarget(higherLoanTarget, {from : governance});
        await strategy.provideLoan({from: governance});
        strategyWethBalanceAfter = new BigNumber(await weth.balanceOf(strategy.address));

        Utils.assertBNEq(await strategy.liquidityLoanCurrent(), higherLoanTarget);
        Utils.assertBNEq(await strategy.liquidityLoanTarget(), higherLoanTarget);
        Utils.assertBNEq(strategyWethBalanceBefore.minus(higherloan), strategyWethBalanceAfter);
        
        // decrease the target loan, then call provide loan
        // nothing should be provided
        await strategy.setLiquidityLoanTarget(liquidityLoanTarget, {from : governance});
        await strategy.provideLoan({from: governance});
        Utils.assertBNEq(strategyWethBalanceBefore.minus(higherloan), strategyWethBalanceAfter);
        await strategy.investAllUnderlying({from: governance});

        // Settle partial loan
        strategyWethBalanceBefore = new BigNumber(await weth.balanceOf(strategy.address));
        await strategy.settleLoan(liquidityLoanTarget, {from: governance});
        
        strategyWethBalanceAfter = new BigNumber(await weth.balanceOf(strategy.address));
        
        Utils.assertBNEq(strategyWethBalanceBefore, "0");
        Utils.assertBNEq(strategyWethBalanceAfter, loan);

        // Settle remaining loan
        strategyWethBalanceBefore = new BigNumber(await weth.balanceOf(strategy.address));
        

        // Off by one because of rounding error, so sending additional weth
        await weth.transfer(liquidityRecipient.address, "1000", {from: wethWhale});

        //
        await strategy.settleLoan(liquidityLoanTarget, {from: governance});
        
        strategyWethBalanceAfter = new BigNumber(await weth.balanceOf(strategy.address));
        
        Utils.assertBNEq(strategyWethBalanceBefore, loan);
        Utils.assertBNEq(strategyWethBalanceAfter, higherloan);
        Utils.assertBNEq(await strategy.liquidityLoanCurrent(), "0")

        // if there is no loan, it shouldn't revert
        await strategy.settleLoan(liquidityLoanTarget, {from: governance});
      });

    });
  });
}
