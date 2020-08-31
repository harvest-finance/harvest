const { expectRevert, time } = require("@openzeppelin/test-helpers");
const BigNumber = require("bignumber.js");
const { assertApproxBNEq } = require("./Utils.js");
const RewardToken = artifacts.require("RewardToken");
const DelayMinter = artifacts.require("DelayMinter");
const Storage = artifacts.require("Storage");

contract("NoMint reward pool Test", function (accounts) {
  describe("Basic settings", function () {
    let governance = accounts[0];
    let rewardCollector = accounts[1];
    let team = accounts[2];
    let operator = accounts[3];
    let storage;
    let delayMinter;

    let duration = 1000000;
    let mintAmount = 10000;

    beforeEach(async function () {
      // create the reward token and the delay minter
      storage = await Storage.new({ from: governance });
      rewardToken = await RewardToken.new(storage.address, {
        from: governance,
      });
      delayMinter = await DelayMinter.new(
        storage.address,
        rewardToken.address,
        duration,
        team,
        operator,
        { from: governance }
      );
      // authorize the delayMinter to mint
      await rewardToken.addMinter(delayMinter.address, {
        from: governance,
      });
    });

    it("minter cannot authorize more minters, unless it is the governance", async function () {
      let minter = accounts[7];
      let notMinter = accounts[8];
      await rewardToken.addMinter(minter, {
        from: governance,
      });
      assert.isTrue(await rewardToken.isMinter(minter));
      await expectRevert(
        rewardToken.addMinter(notMinter, { from: minter }),
        "Not governance"
      );
      await rewardToken.renounceMinter({ from: minter });
      assert.isFalse(await rewardToken.isMinter(minter));
      await expectRevert(
        delayMinter.renounceMinting({ from: minter }),
        "Not governance"
      );
      assert.isTrue(await rewardToken.isMinter(delayMinter.address));
      await delayMinter.renounceMinting({ from: governance });
      assert.isFalse(await rewardToken.isMinter(delayMinter.address));
    });

    it("delayMinter can only mint after delay is passed", async function () {
      let firstMintId = 0;

      // cannot mint un-announced
      await expectRevert(
        delayMinter.executeMint(firstMintId, { from: governance }),
        "Minting needs to be first announced"
      );

      // governance announce that he/she wants to mint mintAmount
      await delayMinter.announceMint(rewardCollector, mintAmount, {
        from: governance,
      });

      // should fail when the duration has not passed
      await expectRevert(
        delayMinter.executeMint(firstMintId, { from: governance }),
        "Cannot mint yet"
      );

      // time passes
      await time.advanceBlock();
      await time.increase(2 * duration);
      await time.advanceBlock();

      // now it can be minted
      await delayMinter.executeMint(firstMintId, { from: governance });
      // check if the balance is correct
      assert.equal(
        (mintAmount / 10) * 7,
        await rewardToken.balanceOf(rewardCollector)
      );
      assert.equal(
        (mintAmount / 10) * 1,
        await rewardToken.balanceOf(operator)
      );
      assert.equal((mintAmount / 10) * 2, await rewardToken.balanceOf(team));
    });
  });
});
