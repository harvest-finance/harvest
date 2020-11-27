// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send, time } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Vault = artifacts.require("Vault");
  const CompoundWETHFoldStrategyMainnet = artifacts.require("CompoundWETHFoldStrategyMainnet");
  const LiquidityRecipient = artifacts.require("LiquidityRecipient");
  const RewardToken = artifacts.require("RewardToken");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet Compound WETH Strategy", function(accounts){
    describe("Mainnet Compound WETH earnings", function (){

      // external contracts
      let underlying;

      // external setup
      let underlyingWhale = MFC.WETH_WHALE_ADDRESS;

      // parties in the protocol
      let governance = MFC.GOVERNANCE_ADDRESS;
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];

      let treasury = MFC.OPS_ADDRESS;

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let controller;
      let vault;
      let strategy;
      let feeRewardForwarder;

      let farmerBalance1;
      let farmerBalance2;

      let farm;

      const liquidityLoanTarget = "100" + "000000000000000000";

      async function setupExternalContracts() {
        underlying = await IERC20.at(MFC.WETH_ADDRESS);
        vault = await Vault.at(MFC.WETH_VAULT);
        farm = await RewardToken.at(MFC.FARM_ADDRESS);
      }

      async function resetBalance() {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, underlyingWhale, "1000000000000000000");

        const allBalance = new BigNumber(await underlying.balanceOf(underlyingWhale)).dividedBy(100);
        farmerBalance1 = allBalance.dividedBy(2);
        farmerBalance2 = allBalance.minus(farmerBalance1);

        await underlying.transfer(farmer1, farmerBalance1.toFixed(), {from: underlyingWhale});
        await underlying.transfer(farmer2, farmerBalance2.toFixed(), {from: underlyingWhale});
      }

      async function setupCoreProtocol() {
        // set up the strategy
        strategy = await CompoundWETHFoldStrategyMainnet.new(
          MFC.STORAGE_ADDRESS,
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
      }

      it("A farmer investing underlying", async function () {
        const vaultInitialBalanceWithInvestment = new BigNumber(await vault.underlyingBalanceWithInvestment());
        console.log("Vault initial total balance", vaultInitialBalanceWithInvestment.toFixed());

        await vault.announceStrategyUpdate(strategy.address, {from: governance});
        let blocksPerHour = 240;

        console.log("waiting for strategy update...");
        for (let i = 0; i < 12; i++) {
          await Utils.advanceNBlock(blocksPerHour);
        }

//        await strategy.setCollateralFactorNumerator(100, {from: governance});
//        await strategy.setFolds(1, {from: governance});
        await vault.setVaultFractionToInvest(95, 100, {from: governance});
        await vault.setStrategy(strategy.address, {from: governance});

        // set up the liquidity recipient
        liquidityRecipient = await LiquidityRecipient.new(
          MFC.STORAGE_ADDRESS,
          underlying.address,
          MFC.FARM_ADDRESS,
          treasury,
          MFC.UNISWAP_V2_ROUTER02_ADDRESS,
          MFC.UNISWAP_ETH_FARM_LP_ADDRESS,
          strategy.address
        );
        // ops sending FARM to liquidityRecipient
        let farmLiquidity = "1000"+"000000000000000000"
        await farm.transfer(liquidityRecipient.address, farmLiquidity, {from: treasury});

        console.log("strategy set!");
        console.log("deposits began!");

        let farmerOldBalance1 = new BigNumber(await underlying.balanceOf(farmer1));
        await depositVault(farmer1, underlying, vault, farmerBalance1);
        let farmerOldBalance2 = new BigNumber(await underlying.balanceOf(farmer2));
        await depositVault(farmer2, underlying, vault, farmerBalance2);

        console.log("hard works!");

        await vault.doHardWork({from: governance});
        await Utils.advanceNBlock(10);

        for (let i = 0; i < 24; i++) {
          console.log("Supplied: ", new BigNumber(await strategy.suppliedInUnderlying()).toFixed());
          console.log("Borrowed: ", new BigNumber(await strategy.borrowedInUnderlying()).toFixed());
//          console.log("Total COMP Liquidated: ", new BigNumber(await strategy.totalCompLiquidated()).toFixed());
//          console.log("Total WETH traded for: ", new BigNumber(await strategy.totalWethTradedFor()).toFixed());

          console.log("Price per share: ", new BigNumber(await vault.getPricePerFullShare()).toFixed());
          await Utils.advanceNBlock(blocksPerHour);
          const result = await vault.doHardWork({from: governance});
        }

        console.log("Vault total balance before providing a loan", new BigNumber(await vault.underlyingBalanceWithInvestment()).toFixed());

        await strategy.setLiquidityRecipient(liquidityRecipient.address, {from : governance});
        await strategy.setLiquidityLoanTarget(liquidityLoanTarget, {from : governance});
        await strategy.provideLoan({from: governance});

        Utils.assertBNEq(await strategy.liquidityLoanCurrent(), liquidityLoanTarget);

        console.log("Vault total balance after providing a loan", new BigNumber(await vault.underlyingBalanceWithInvestment()).toFixed());

        await vault.doHardWork({from: governance});

        await Utils.advanceNBlock(10);
        await vault.doHardWork({from: governance});

        console.log("withdrawals started!");
        await vault.withdraw(await vault.balanceOf(farmer1), {from: farmer1});
        let farmerNewBalance1 = new BigNumber(await underlying.balanceOf(farmer1));
        // Farmer gained money
        Utils.assertBNGt(farmerNewBalance1, farmerOldBalance1);
        console.log("Farmer1 balance before:", farmerOldBalance1.toFixed());
        console.log("Farmer1 balance after:", farmerNewBalance1.toFixed());

        await vault.withdraw(await vault.balanceOf(farmer2), {from: farmer2});
        let farmerNewBalance2 = new BigNumber(await underlying.balanceOf(farmer2));
        // Farmer gained money
        Utils.assertBNGt(farmerNewBalance2, farmerOldBalance2);

        console.log("Farmer2 balance before:", farmerOldBalance2.toFixed());
        console.log("Farmer2 balance after:", farmerNewBalance2.toFixed());

        console.log("Vault final total balance", new BigNumber(await vault.underlyingBalanceWithInvestment()).toFixed());

        await vault.doHardWork({from: governance});

        // settle loan for the public must revert
        await expectRevert(
          strategy.settleLoan(liquidityLoanTarget, {from: farmer1}),
          "Buffer exists and the caller is not governance"
        );

        // withdraw of everything should fail because the loan isn't settled
        await expectRevert(
          strategy.withdrawAllToVault({from: governance}),
          "Liquidity loan must be settled first"
        );

        // withdraw with allowLiquidityShortage should be allowed,
        // even though the loan was not settled yet
        await strategy.setAllowLiquidityShortage(true, {from: governance});
        await strategy.withdrawAllToVault({from: governance});

        // at this point, no borrowed funds should be present
        Utils.assertBNEq(await strategy.borrowedInUnderlying(), "0");

        const vaultBalanceBeforeLoanIsSettled = new BigNumber(await vault.underlyingBalanceInVault());

        // setting this back
        await strategy.setAllowLiquidityShortage(false, {from: governance});


        // calling settleLoan on liquidity recipient to make it liquidate the LP token
        // then we need to see how much to backstop
        await liquidityRecipient.settleLoan({from: governance});
        console.log("WETH balance after removing liquidity", new BigNumber(await underlying.balanceOf(liquidityRecipient.address)).toFixed());
        console.log("WETH balance of the original loan", liquidityLoanTarget);

        // sending some WETH to backstop due to the slippage
        await underlying.transfer(liquidityRecipient.address, "1000", {from: underlyingWhale});

        await strategy.settleLoan(liquidityLoanTarget, {from: governance});

        // setting the sell floor (otherwise withdrawAllToVault fails due to insufficient COMP accumulation)
        await strategy.setSellFloor("1000000000000000000", {from: governance});

        // this doHardWork will invest the returned loan
        // if we do not do this, withdrawAllToVault would actually revert
        // because it has too little investment (just the dust)
        // which is not claimable
        await strategy.doHardWork({from: governance});

        // pushing the remaining to the vault
        await strategy.withdrawAllToVault({from: governance});

        // check that the balance is increased by at least liquidityLoanTarget
        Utils.assertBNGt(await vault.underlyingBalanceInVault(), vaultBalanceBeforeLoanIsSettled.plus(liquidityLoanTarget));
        // check that the vault hasn't lost any money since the start of the test
        Utils.assertBNGt(await vault.underlyingBalanceWithInvestment(), vaultInitialBalanceWithInvestment);
      });
    });
  });
}
