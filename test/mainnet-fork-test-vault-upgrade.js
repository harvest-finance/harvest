// This test is only invoked if MAINNET_FORK is set
if (process.env.MAINNET_FORK) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const {send, time} = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Vault = artifacts.require("Vault");
  const VaultProxy = artifacts.require("VaultProxy");
  const IERC20 = artifacts.require("IERC20");
  const CRVStrategyWBTCMainnetV2 = artifacts.require("CRVStrategyWBTCMainnetV2");
  const addresses = require("../migrations/config/mainnet/addresses.json");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Vault upgrade", function (accounts) {
    function test(vaultId, StrategyContract, whale, tokenAddress) {
      describe(`Vault ${vaultId} upgrade`, function () {

        let vault;
        let vaultAsProxy;
        let newVaultImplementation;
        let farmer = accounts[1];
        let etherGiver = accounts[9];
        let strategyV2;
        let underlying;
        const governance = MFC.GOVERNANCE_ADDRESS;

        async function resetTokenBalance() {
          // Give whale some ether to make sure the following actions are good
          await send.ether(etherGiver, whale, "1" + "000000000000000000");
          // reset token balance
          await underlying.transfer(whale, await underlying.balanceOf(farmer), {
            from: farmer,
          });
          await underlying.transfer(farmer, await underlying.balanceOf(whale), {
            from: whale
          });
        }

        beforeEach(async function () {
          underlying = await IERC20.at(tokenAddress);
          let vaultAddress = addresses.V2[vaultId].NewVault;
          vault = await Vault.at(vaultAddress);
          vaultAsProxy = await VaultProxy.at(vaultAddress);
          newVaultImplementation = await Vault.new();
          console.log(await vault.underlying());
          strategyV2 = await StrategyContract.new(MFC.STORAGE_ADDRESS, vaultAddress)
          console.log("Strategy that we will upgrade to");
          console.log(strategyV2.address);
          await resetTokenBalance();
        });

        it("Parameters are kept after the upgrade", async function () {
          await vault.scheduleUpgrade(newVaultImplementation.address, {from: governance});
          await vault.announceStrategyUpdate(strategyV2.address, {from: governance});
          await time.increase(12 * 60 * 60);

          await vaultAsProxy.upgrade({from: governance});
          const underlyingBalanceWithInvestmentBefore = await vault.underlyingBalanceWithInvestment();
          const sharePriceBefore = await vault.getPricePerFullShare();
          console.log("underlyingBalanceWithInvestmentBefore");
          console.log(underlyingBalanceWithInvestmentBefore.toString());
          console.log("sharePriceBefore");
          console.log(sharePriceBefore.toString());
          assert.equal(await vaultAsProxy.implementation(), newVaultImplementation.address);
          Utils.assertBNEq(await vault.getPricePerFullShareCheckpoint(), sharePriceBefore);
          Utils.assertBNEq(await vault.getPricePerFullShare(), sharePriceBefore);
          Utils.assertBNEq(await vault.underlyingBalanceWithInvestment(), underlyingBalanceWithInvestmentBefore);
          console.log("underlyingBalanceWithInvestment: after upgrade");
          console.log((await vault.underlyingBalanceWithInvestment()).toString());
          console.log("sharePrice: after upgrade");
          console.log((await vault.getPricePerFullShare()).toString());
          await vault.setVaultFractionToInvest(80, 100, {from: governance});
          await vault.setAllowSharePriceDecrease(true, {from: governance});
          await vault.setStrategy(strategyV2.address, {from: governance});

          // one farmer deposit before doHardWork
          let balance = await underlying.balanceOf(farmer);
          await underlying.approve(vault.address, balance, {from : farmer});
          await vault.deposit(balance, {from: farmer});

          // do har work to push funds in the new strategy
          await vault.doHardWork({from: governance});
          console.log("strategy after doHardWork on upgraded vault");
          console.log(await vault.strategy());
          console.log("underlyingBalanceWithInvestment: after doHardWork on upgraded vault");
          console.log((await vault.underlyingBalanceWithInvestment()).toString());
          console.log("underlyingBalanceInVault: after doHardWork on upgraded vault");
          console.log((await vault.underlyingBalanceInVault()).toString());
          console.log("sharePrice: after upgrade: after doHardWork on upgraded vault");
          console.log((await vault.getPricePerFullShare()).toString());

          await Utils.advanceNBlock(48 * 60 * 4);
          await vault.doHardWork({from: governance});
          console.log("48 hours later underlyingBalanceWithInvestment: after doHardWork on upgraded vault");
          console.log((await vault.underlyingBalanceWithInvestment()).toString());
          console.log("48 hours later sharePrice: after upgrade: after doHardWork on upgraded vault");
          console.log((await vault.getPricePerFullShare()).toString());
          Utils.assertBNGte(await vault.getPricePerFullShare(), sharePriceBefore);
          Utils.assertBNGte(await vault.underlyingBalanceWithInvestment(), underlyingBalanceWithInvestmentBefore);

          let halfBalance = balance / 2;
          console.log("Estimated withdraw:");
          console.log((await vault.getEstimatedWithdrawalAmount(halfBalance))[0].toString());
          console.log((await vault.getEstimatedWithdrawalAmount(halfBalance))[1].toString());
          await vault.withdraw(halfBalance, {from: farmer});
          console.log("Balance after withdraw:");
          let afterWithdraw = await underlying.balanceOf(farmer);
          console.log(afterWithdraw.toString());
          console.log("Balance with halfbalance withdraw:");
          console.log((balance - halfBalance).toString());
          console.log("Balance before withdraw:");
          console.log(balance.toString());
          Utils.assertBNGte(afterWithdraw, (balance - halfBalance));
          // todo: have one farmer withdraw and check that the withdrawal matches the estimate (minus fees and slippage)
        });
      });
    }

    // test("USDC");
    // test("USDT");
    // test("TUSD");
    // test("DAI");
    test("WBTC", CRVStrategyWBTCMainnetV2, MFC.WBTC_WHALE_ADDRESS, MFC.WBTC_ADDRESS);
  });
}
