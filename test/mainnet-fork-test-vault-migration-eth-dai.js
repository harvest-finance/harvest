const { assertApproxBNEq } = require("./Utils.js");

// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const VaultMigratorStrategy = artifacts.require("VaultMigratorStrategy");
  const RewardPool = artifacts.require("NoMintRewardPool");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");
  const Vault = artifacts.require("Vault");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract.only("Mainnet Vault Migration", function(accounts){
    describe("ETH-DAI Vault", function (){
      let governance;

      // Core protocol contracts
      let oldVault;
      let newVault;
      let migrator;
      let vaultMigrationStrategy;
      let underlying;

      let underlyingWhale = MFC.UNISWAP_ETH_DAI_LP_WHALE_ADDRESS;

      let farmer1 = accounts[3];
      let farmer2 = accounts[4];
      let farmer3 = accounts[5];

      const farmerBalance =  "6000000000000";
      let farmer1OldVaultBalance;
      let farmer3OldVaultBalance;

      // only used for ether distribution
      let etherGiver = accounts[9];

      async function setupExternalContracts() {
        oldVault = await Vault.at(MFC.VaultUNI_LP_WETH_DAI);
        newVault = await Vault.at(MFC.ProxiedVault_UNI_LP_WETH_DAI);
        migrator = await RewardPool.at(MFC.Proxied_UNI_LP_WETH_DAIPool);
        vaultMigrationStrategy = await VaultMigratorStrategy.at(MFC.MigrationStrategy_UNI_LP_WETH_DAI);
      }

      async function setupCoreProtocol() {
        governance = await oldVault.governance();
        underlying = await IERC20.at(await oldVault.underlying());
        await vaultMigrationStrategy.setMigrator(migrator.address, {from: governance});
      }

      async function resetBalance() {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, underlyingWhale, "30000000000000000000");

        // reset token balance
        await underlying.transfer(underlyingWhale, await underlying.balanceOf(farmer1), {from: farmer1});
        await underlying.transfer(underlyingWhale, await underlying.balanceOf(farmer2), {from: farmer2});
        await underlying.transfer(underlyingWhale, await underlying.balanceOf(farmer3), {from: farmer3});
        await underlying.transfer(farmer1, farmerBalance, {from: underlyingWhale});
        await underlying.transfer(farmer2, farmerBalance, {from: underlyingWhale});
        await underlying.transfer(farmer3, farmerBalance, {from: underlyingWhale});
        assert.equal(farmerBalance, await underlying.balanceOf(farmer1));
      }

      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
        await resetBalance();
      });

      async function setupOldDeposits() {
        // farmer deposit into old vault
        await underlying.approve(oldVault.address, farmerBalance, { from: farmer1 });
        await oldVault.deposit(farmerBalance, { from: farmer1 });
        await underlying.approve(oldVault.address, farmerBalance, { from: farmer3 });
        await oldVault.deposit(farmerBalance, { from: farmer3 });

        farmer1OldVaultBalance = await oldVault.balanceOf(farmer1);
        farmer3OldVaultBalance = await oldVault.balanceOf(farmer3);
        console.log("Farmer's original underlying:", farmerBalance);
        console.log("Farmer's old vault balance:", farmer1OldVaultBalance.toString());
        console.log("Farmer 3's old vault balance:", farmer3OldVaultBalance.toString());
        Utils.assertBNGt(farmer1OldVaultBalance, 0);
        Utils.assertBNGt(farmer3OldVaultBalance, 0);
      }

      it("migration", async function () {
        await oldVault.doHardWork({from: governance});
        await setupOldDeposits();

        //***** Vault migration starts *******/
        await oldVault.setStrategy(vaultMigrationStrategy.address, {from: governance});
        const oldUnderlyingBalance = (await underlying.balanceOf(oldVault.address)).toString();

        await oldVault.setVaultFractionToInvest("99999999999999999", "100000000000000000", {from: governance});
        await oldVault.doHardWork({from: governance});

        let originalDepositsInNewVault = new BigNumber(await underlying.balanceOf(newVault.address));

        await vaultMigrationStrategy.migrateToNewVault({from: governance});

        let newDepositsInNewVault = new BigNumber(await underlying.balanceOf(newVault.address));
        Utils.assertApproxBNEq(newDepositsInNewVault.minus(originalDepositsInNewVault), oldUnderlyingBalance, "10000000", "New vault must have all the underlying");

        Utils.assertBNEq(0, await newVault.balanceOf(farmer1));
        Utils.assertBNEq(0, await migrator.balanceOf(farmer1));
        //***** Vault migration ends *******/

        //***** User migration starts *******/
        // step 1 (unstaking): no need to test, it's just exiting the old pool
        // step 2 (approval):
        await oldVault.approve(migrator.address, farmer1OldVaultBalance, { from: farmer1 });

        // step 3 (migrate):
        await migrator.migrate({ from: farmer1 });

        Utils.assertBNEq(0, await oldVault.balanceOf(farmer1));

        Utils.assertApproxBNEq(farmerBalance, await migrator.balanceOf(farmer1), "1000000");

        // Optional step 4 (exiting the migrator pool)
        await migrator.exit({ from: farmer1 });
        const newVaultBalance = await newVault.balanceOf(farmer1);
        Utils.assertApproxBNEq(farmerBalance, newVaultBalance, "1000000");

        console.log("Farmer's new vault balance:", newVaultBalance.toString());

        // Optional step 5 (withdraw from new vault)
        await newVault.withdraw(await newVault.balanceOf(farmer1) ,{from: farmer1});
        const newFarmerBalance = await underlying.balanceOf(farmer1);
        Utils.assertApproxBNEq(farmerBalance, newFarmerBalance, "1000000");
        console.log("Farmer's final underlying:", newFarmerBalance.toString());

        //***** User migration ends *******/

        //***** Second user deposits into new vault while migration is happening *******/
        await underlying.approve(newVault.address, farmerBalance, { from: farmer2 });
        await newVault.deposit(farmerBalance, { from: farmer2 });

        const farmer2NewVaultBalance = await newVault.balanceOf(farmer2);
        console.log("Farmer 2's new vault balance:", farmer2NewVaultBalance.toString());

        await newVault.approve(migrator.address, farmer2NewVaultBalance, { from: farmer2 });

        await migrator.stake(farmer2NewVaultBalance, { from: farmer2 });
        //***** Second user interactions end *******/
        //***** Third user attempts to migrate *******/

        await oldVault.approve(migrator.address, farmer3OldVaultBalance, { from: farmer3 });
        // step 3 (migrate):
        await migrator.migrate({ from: farmer3 });

        Utils.assertBNEq(0, await oldVault.balanceOf(farmer1));
        Utils.assertApproxBNEq(farmerBalance, await migrator.balanceOf(farmer3), "1000000");
        console.log("Farmer 3's new vault balance in reward Pool:", (await migrator.balanceOf(farmer3)).toString());

        //***** Third user interaction ends *******/
      });
    });
  });
}
