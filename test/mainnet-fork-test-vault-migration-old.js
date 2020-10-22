const { assertApproxBNEq } = require("./Utils.js");

// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const MockMigrator = artifacts.require("MockMigrator");
  const VaultMigratorStrategy = artifacts.require("VaultMigratorStrategy");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");
  const IVault = artifacts.require("IVault");
  const IMigrator = artifacts.require("IMigrator");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet Vault Migration", function(accounts){
    describe("ETH-USDT Vault", function (){
      let governance;

      // Core protocol contracts
      let oldVault;
      let vault;
      let vaultMigrationStrategy;
      let mockMigrator;
      let underlying;

      async function setupExternalContracts() {
        oldVault = await IVault.at(MFC.VaultUNI_LP_WETH_USDT);
        newVault = await IVault.at(MFC.ProxiedVault_UNI_LP_WETH_USDT);
      }

      async function setupCoreProtocol() {
        governance = await oldVault.governance();
        underlying = await IERC20.at(await oldVault.underlying());
        vaultMigrationStrategy = await VaultMigratorStrategy.new(
          await oldVault.store(),
          underlying.address,
          oldVault.address,
          newVault.address,
          { from: governance }
        );

        mockMigrator = await MockMigrator.new(
          newVault.address,
          vaultMigrationStrategy.address
        );

        vaultMigrationStrategy.setMigrator(
          mockMigrator.address,
          { from: governance }
        )
      }

      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
      });

      it("migration", async function () {
        await oldVault.setStrategy(vaultMigrationStrategy.address, {from: governance});
        const oldUnderlyingBalance = (await underlying.balanceOf(oldVault.address)).toString();

        await oldVault.setVaultFractionToInvest("99999999999999999", "100000000000000000", {from: governance});
        await oldVault.doHardWork({from: governance});

        await vaultMigrationStrategy.migrateToNewVault({from: governance});
        Utils.assertApproxBNEq(await underlying.balanceOf(newVault.address), oldUnderlyingBalance, "1000000", "New vault must have all the underlying");
      });
    });
  });
}
