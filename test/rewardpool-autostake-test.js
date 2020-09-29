const Utils = require("./Utils.js");
const BigNumber = require("bignumber.js");
const Controller = artifacts.require("Controller");
const Vault = artifacts.require("Vault");
const RewardToken = artifacts.require("RewardToken");
const ExclusiveRewardPool = artifacts.require("ExclusiveRewardPool");
const MockToken = artifacts.require("MockToken");
const NoopStrategy = artifacts.require("NoopStrategy");
const Storage = artifacts.require("Storage");
const AutoStake = artifacts.require("AutoStake");
const ThirdPartyContractThatCallsAutoStake = artifacts.require("ThirdPartyContractThatCallsAutoStake");
const { time } = require("@openzeppelin/test-helpers");

BigNumber.config({ DECIMAL_PLACES: 0 });

contract("Autostaking for reward pool Test", function (accounts) {
  describe("Basic settings", function () {
    let governance = accounts[0];
    let rewardCollector = accounts[1];
    let farmer1 = accounts[2];
    let strategy = accounts[3];
    let rewardDistribution = accounts[4];
    let farmer2 = accounts[5];
    let greylistEscrow = accounts[6];

    const dayDuration = 86400;
    // removing the last few digits when comparing, since we have 18
    // so this should be fine
    const removePrecision = 1000000;

    let autostake;
    let storage;
    let vault;
    let controller;
    let rewardPool;
    let rewardToken;
    let rewardDuration = 7 * dayDuration;
    let tokenPrecision = new BigNumber(10).pow(18);
    let totalReward = new BigNumber(2500).times(tokenPrecision);

    const farmerBalance = "958" + "555555555555555555";

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });
      controller = await Controller.new(storage.address, rewardCollector, {
        from: governance,
      });
      await storage.setController(controller.address, { from: governance });

      // create the reward token
      rewardToken = await RewardToken.new(storage.address, {
        from: governance,
      });

      // create the underlying token
      await rewardToken.mint(farmer1, farmerBalance, { from: governance });
      await rewardToken.mint(farmer2, farmerBalance, { from: governance });
      assert.equal(
        farmerBalance,
        (await rewardToken.balanceOf(farmer1)).toString()
      );

      // create a reward pool
      // using the vault token as underlying stake
      rewardPool = await ExclusiveRewardPool.new(
        rewardToken.address, // rewardToken should be FARM
        rewardToken.address, // lpToken
        rewardDuration, // duration
        rewardDistribution, // reward distribution
        storage.address
      );

      // authorize the rewardDistribution to mint
      await rewardToken.addMinter(rewardDistribution, {
        from: governance,
      });

      // mint reward and transfer to pool
      await rewardToken.mint(rewardPool.address, totalReward, {
        from: rewardDistribution,
      });
      Utils.assertBNEq(
        await rewardToken.balanceOf(rewardPool.address),
        totalReward
      );

      autostake = await AutoStake.new(storage.address, rewardPool.address, rewardToken.address, greylistEscrow);
      await rewardPool.initExclusive(autostake.address);
    });

    it("Two farmers staking, no rewards emitted.", async function () {
      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer1 });
      await autostake.stake(farmerBalance, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));
      assert.equal(farmerBalance, await rewardPool.balanceOf(autostake.address));

      // time passes
      await time.advanceBlock();
      await time.increase(0.1 * rewardDuration);
      await time.advanceBlock();


      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));
      // farmer2 stakes
      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer2 });
      await autostake.stake(farmerBalance, { from: farmer2 });

      await time.advanceBlock();
      await time.increase(0.2 * rewardDuration);
      await time.advanceBlock();

      // When farmer2 exits, it helps the farmer1 autostakes
      await autostake.exit({ from: farmer2 });
      await time.advanceBlock();
      await time.increase(0.2 * rewardDuration);
      await time.advanceBlock();
      await autostake.exit({ from: farmer1 });

      let farmer1RealBalance = await rewardToken.balanceOf(farmer1);
      let farmer2RealBalance = await rewardToken.balanceOf(farmer2);
      assert.equal(farmerBalance, farmer1RealBalance);
      assert.equal(farmerBalance, farmer2RealBalance);
    });

    it("One single stake. No reward. Unit test for precision", async function () {

      let oneThousand = "1000" + "000000000000000000";
      let unit = "1" + "000000000000000000";
      await rewardToken.mint(farmer1, oneThousand, { from: governance });

      await rewardToken.approve(autostake.address, oneThousand, { from: farmer1 });
      await autostake.stake(oneThousand, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      console.log("as_balanceOf: ", await Utils.inBNfixed(await autostake.balanceOf(farmer1)));
      console.log("valuePerShare: ", await Utils.inBNfixed(await autostake.valuePerShare()));
      console.log("totalValue: ", await Utils.inBNfixed(await autostake.totalValue()));
      console.log("totalShares: ", await Utils.inBNfixed(await autostake.totalShares()));
      console.log("rp_balanceOf: ", await Utils.inBNfixed(await rewardPool.balanceOf(autostake.address)));

      assert.equal(oneThousand, await autostake.balanceOf(farmer1));
      assert.equal(unit, await autostake.valuePerShare());
      assert.equal(oneThousand, await autostake.totalValue());
      assert.equal(oneThousand, await autostake.totalShares());
      assert.equal(oneThousand, await rewardPool.balanceOf(autostake.address));
    });

    it("One single stake. With reward. Unit test for precision", async function () {

      let oneThousand = "1000" + "000000000000000000";
      let twoThousand = "1000" + "000000000000000000";
      let unit = "1" + "000000000000000000";
      let twoUnit = "2" + "000000000000000000";
      await rewardToken.mint(farmer1, oneThousand, { from: governance });
      await rewardToken.mint(rewardPool.address, oneThousand, { from: governance });

      await rewardToken.approve(autostake.address, oneThousand, { from: farmer1 });
      await autostake.stake(oneThousand, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      console.log("as_balanceOf: ", await Utils.inBNfixed(await autostake.balanceOf(farmer1)));
      console.log("valuePerShare: ", await Utils.inBNfixed(await autostake.valuePerShare()));
      console.log("totalValue: ", await Utils.inBNfixed(await autostake.totalValue()));
      console.log("totalShares: ", await Utils.inBNfixed(await autostake.totalShares()));
      console.log("rp_balanceOf: ", await Utils.inBNfixed(await rewardPool.balanceOf(autostake.address)));
      assert.equal(oneThousand, await autostake.balanceOf(farmer1));
      assert.equal(oneThousand, await autostake.totalShares());
      assert.equal(unit, await autostake.valuePerShare());
      assert.equal(oneThousand, await autostake.totalValue());
      assert.equal(oneThousand, await rewardPool.balanceOf(autostake.address));

      // notifyReward
      await rewardPool.notifyRewardAmount(oneThousand, {
        from: rewardDistribution,
      });

      // time passes
      await time.advanceBlock();
      await time.increase(20 * rewardDuration);
      await time.advanceBlock();

      await autostake.refreshAutoStake();

      let finalTotalReward = "1999999999999999734000"; // experimental value
      let newValuePerShare = "1999999999999999734"; // ~1.99 with 1e18 precision

      // The farmer should still be able to stake and see his stake
      console.log("as_balanceOf: ", await Utils.inBNfixed(await autostake.balanceOf(farmer1)));
      console.log("valuePerShare: ", await Utils.inBNfixed(await autostake.valuePerShare()));
      console.log("totalValue: ", await Utils.inBNfixed(await autostake.totalValue()));
      console.log("totalShares: ", await Utils.inBNfixed(await autostake.totalShares()));
      console.log("rp_balanceOf: ", await Utils.inBNfixed(await rewardPool.balanceOf(autostake.address)));
      assert.equal(finalTotalReward, await autostake.balanceOf(farmer1));
      assert.equal(oneThousand, await autostake.totalShares());
      assert.equal(newValuePerShare, await autostake.valuePerShare());
      assert.equal(finalTotalReward, await autostake.totalValue());
      assert.equal(finalTotalReward, await rewardPool.balanceOf(autostake.address));
    });

    it("Two stakes. Unit test for precision.", async function () {

      let oneThousand = "1000" + "000000000000000000";
      let twoThousand = "2000" + "000000000000000000";
      let unit = "1" + "000000000000000000";
      await rewardToken.mint(farmer1, oneThousand, { from: governance });
      await rewardToken.mint(farmer2, oneThousand, { from: governance });

      await rewardToken.approve(autostake.address, oneThousand, { from: farmer1 });
      await autostake.stake(oneThousand, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      console.log("as_balanceOf: ", await Utils.inBNfixed(await autostake.balanceOf(farmer1)));
      console.log("valuePerShare: ", await Utils.inBNfixed(await autostake.valuePerShare()));
      console.log("totalValue: ", await Utils.inBNfixed(await autostake.totalValue()));
      console.log("totalShares: ", await Utils.inBNfixed(await autostake.totalShares()));
      console.log("rp_balanceOf: ", await Utils.inBNfixed(await rewardPool.balanceOf(autostake.address)));

      assert.equal(oneThousand, await autostake.balanceOf(farmer1));
      assert.equal(unit, await autostake.valuePerShare());
      assert.equal(oneThousand, await autostake.totalValue());
      assert.equal(oneThousand, await autostake.totalShares());
      assert.equal(oneThousand, await rewardPool.balanceOf(autostake.address));

      await rewardToken.approve(autostake.address, oneThousand, { from: farmer2 });
      await autostake.stake(oneThousand, { from: farmer2 });

      assert.equal(oneThousand, await autostake.balanceOf(farmer2));
      assert.equal(unit, await autostake.valuePerShare());
      assert.equal(twoThousand, await autostake.totalValue());
      assert.equal(twoThousand, await autostake.totalShares());
      assert.equal(twoThousand, await rewardPool.balanceOf(autostake.address));
    });

    it("One single stake. The farmer takes every reward after the duration is over", async function () {
      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer1 });
      await autostake.stake(farmerBalance, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));
      assert.equal(farmerBalance, await rewardPool.balanceOf(autostake.address));

      // notifyReward
      await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });

      // time passes
      await time.advanceBlock();
      await time.increase(2 * rewardDuration);
      await time.advanceBlock();

      // get the reward Rate and period
      let rewardRate = new BigNumber(await rewardPool.rewardRate());
      let period = new BigNumber(rewardDuration);

      // make sure the time has passed
      Utils.assertBNGt(
        await time.latest(),
        await rewardPool.periodFinish()
      );

      // the only user should get most rewards
      // there will be some dust in the contract
      await autostake.exit({ from: farmer1 });
      let farmerReward = new BigNumber(await rewardToken.balanceOf(farmer1)).minus(new BigNumber(farmerBalance));
      // there is a off-by-one here, so using ApproxEq
      Utils.assertApproxBNEq(
        rewardRate.times(period),
        farmerReward,
        removePrecision
      );
    });

    it("Two farmers staking", async function () {
      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer1 });
      await autostake.stake(farmerBalance, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));
      assert.equal(farmerBalance, await rewardPool.balanceOf(autostake.address));

      // notifyReward
      await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });

      // time passes
      await time.advanceBlock();
      await time.increase(0.1 * rewardDuration);
      await time.advanceBlock();


      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));
      // farmer2 stakes
      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer2 });
      await autostake.stake(farmerBalance, { from: farmer2 });

      // When farmer2 stakes, it helps the farmer1 autostakes
      let farmer1Balance_afterFarmer2Stake = await autostake.balanceOf(farmer1);
      Utils.assertBNGt(farmer1Balance_afterFarmer2Stake, farmerBalance);

      await time.advanceBlock();
      await time.increase(0.2 * rewardDuration);
      await time.advanceBlock();

      // When farmer2 exits, it helps the farmer1 autostakes
      await autostake.exit({ from: farmer2 });
      let farmer1Balance_afterFarmer2Exit = await autostake.balanceOf(farmer1);
      Utils.assertBNGt(farmer1Balance_afterFarmer2Exit, farmer1Balance_afterFarmer2Stake);
      await autostake.exit({ from: farmer1 });
      let farmer1RealBalance = await rewardToken.balanceOf(farmer1);
      Utils.assertBNEq(farmer1Balance_afterFarmer2Exit, farmer1RealBalance);
    });

    it("refreshAutoStake helps stacking up the stake", async function () {
      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer1 });
      await autostake.stake(farmerBalance, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));
      assert.equal(farmerBalance, await rewardPool.balanceOf(autostake.address));

      // notifyReward
      await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });

      // time passes
      await time.advanceBlock();
      await time.increase(0.1 * rewardDuration);
      await time.advanceBlock();


      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));

      // When autostake is refreshed, farmer1's stake should increase
      await autostake.refreshAutoStake({from: farmer2});

      await time.advanceBlock();
      await time.increase(0.2 * rewardDuration);
      await time.advanceBlock();

      let newFarmerBalance = await autostake.balanceOf(farmer1);
      Utils.assertBNGt(newFarmerBalance, farmerBalance);
      await autostake.exit({ from: farmer1 });
    });


    it("Two farmers staking. One EOA gets greylisted but can still withdraw.", async function () {
      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer1 });
      await autostake.stake(farmerBalance, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));
      assert.equal(farmerBalance, await rewardPool.balanceOf(autostake.address));

      // notifyReward
      await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });

      // time passes
      await time.advanceBlock();
      await time.increase(0.1 * rewardDuration);
      await time.advanceBlock();


      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));

      // Governance tries to greylist farmer2
      await controller.addToGreyList(farmer2, {from: governance});

      // farmer2 stakes
      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer2 });
      await autostake.stake(farmerBalance, { from: farmer2 });

      // When farmer2 stakes, it helps the farmer1 autostakes
      let farmer1Balance_afterFarmer2Stake = await autostake.balanceOf(farmer1);
      Utils.assertBNGt(farmer1Balance_afterFarmer2Stake, farmerBalance);

      await time.advanceBlock();
      await time.increase(0.2 * rewardDuration);
      await time.advanceBlock();

      // When farmer2 exits, it helps the farmer1 autostakes
      await autostake.exit({ from: farmer2 });
      let farmer1Balance_afterFarmer2Exit = await autostake.balanceOf(farmer1);
      Utils.assertBNGt(farmer1Balance_afterFarmer2Exit, farmer1Balance_afterFarmer2Stake);

    });

    it("Two farmers staking. One is a smart contract and gets greylisted.", async function () {
      await rewardToken.approve(autostake.address, farmerBalance, { from: farmer1 });
      await autostake.stake(farmerBalance, { from: farmer1 });

      // The farmer should still be able to stake and see his stake
      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));
      assert.equal(farmerBalance, await rewardPool.balanceOf(autostake.address));

      // notifyReward
      await rewardPool.notifyRewardAmount(totalReward, {
        from: rewardDistribution,
      });

      // time passes
      await time.advanceBlock();
      await time.increase(0.2 * rewardDuration);
      await time.advanceBlock();


      assert.equal(farmerBalance, await autostake.balanceOf(farmer1));

      // deploying the industrial farming tool for farmer2
      greylistTarget = await ThirdPartyContractThatCallsAutoStake.new(autostake.address);
      await rewardToken.transfer(greylistTarget.address, farmerBalance, {from: farmer2});

      // Governance greylists farmer2's tool
      await controller.addToGreyList(greylistTarget.address, {from: governance});

      // farmer2 stakes using his tool, the staking would be denied. (but wouldn't revert)
      await greylistTarget.stake(rewardToken.address, farmerBalance, { from: farmer2 });
      assert.equal(await rewardToken.balanceOf(greylistTarget.address), farmerBalance);

      // Governance removes greylists
      await controller.removeFromGreyList(greylistTarget.address, {from: governance});

      // farmer2's tool staked again. Governance greylist
      console.log("farmer balance: ", farmerBalance);
      console.log("(total value, value per share): ", await Utils.inBNfixed(await autostake.totalValue()), ", ", await Utils.inBNfixed(await autostake.valuePerShare()));
      console.log("autostake.balanceOf(greylist): ", await Utils.inBNfixed(await autostake.balanceOf(greylistTarget.address))); // should be 0.
      await greylistTarget.stake(rewardToken.address, farmerBalance, { from: farmer2 });
      await controller.addToGreyList(greylistTarget.address, {from: governance});
      console.log("(total value, value per share): ", await Utils.inBNfixed(await autostake.totalValue()), ", ", await Utils.inBNfixed(await autostake.valuePerShare()));
      console.log("autostake.balanceOf(greylist): ", await Utils.inBNfixed(await autostake.balanceOf(greylistTarget.address))); // should be farmerBalance

      // greylistTarget exits, but since it is greylisted, the token withdraw gets denied
      await greylistTarget.exit({from: farmer2});
      console.log("(total value, value per share): ", await Utils.inBNfixed(await autostake.totalValue()), ", ", await Utils.inBNfixed(await autostake.valuePerShare()));
      console.log("autostake.balanceOf(greylist): ", await Utils.inBNfixed(await autostake.balanceOf(greylistTarget.address)));

      await autostake.forceGreyListedExit(greylistTarget.address, {from: governance});

      greylistEscrowBalance = await rewardToken.balanceOf(greylistEscrow);
      console.log("greylistEscrow address in AutoStake: ", await autostake.greylistEscrow());
      console.log("greylistEscrowBalance: ", await Utils.inBNfixed(greylistEscrowBalance));
      console.log("(total value, value per share): ", await Utils.inBNfixed(await autostake.totalValue()), ", ", await Utils.inBNfixed(await autostake.valuePerShare()));
      console.log("autostake.balanceOf(greylist): ", await Utils.inBNfixed(await autostake.balanceOf(greylistTarget.address)));

      // There will be some precision loss when the second farmer stakes.
      // The amount he stakes needs to be divided by the valuePerShare, and some value would be lost.
      // The value there should be negligible. Thus here we are using assertApproxBNEq to check that they are roughly the same.
      // "10000000000000000" is 0.1
      Utils.assertApproxBNEq(greylistEscrowBalance, farmerBalance, "10000000000000000");
      assert.equal(await autostake.balanceOf(greylistTarget.address), 0);
    });

  });
});
