const Utils = require("./Utils.js");
const { time, constants } = require("@openzeppelin/test-helpers");
const HardRewards = artifacts.require("HardRewards");
const MockToken = artifacts.require("MockToken");
const Storage = artifacts.require("Storage");

contract("Hard Rewards Test", function (accounts) {
  describe("Rewarding", function () {
    let governance = accounts[0];
    let controller = accounts[1];
    let vault = accounts[2];
    let recipient = accounts[3];
    let reward = "1000";
    let token;
    let storage;
    let hardRewards;

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });
      await storage.setController(controller, { from: governance });
      token = await MockToken.new({ from: governance });
      hardRewards = await HardRewards.new(storage.address, token.address, {
        from: governance,
      });
    });

    it("set and reward", async function () {
      await token.mint(governance, 100 * reward);
      await token.approve(hardRewards.address, 100 * reward, {
        from: governance,
      });
      await hardRewards.load(token.address, reward, 100 * reward, {
        from: governance,
      });
      await hardRewards.addVault(vault, { from: governance });

      // rewards for the first time
      let currentBlock = await time.latestBlock();
      await Utils.advanceNBlock(5);
      await hardRewards.rewardMe(recipient, vault, { from: controller });
      let rewardBlock = await time.latestBlock();
      let expectedAward = (rewardBlock - currentBlock) * reward;
      assert.equal(expectedAward, await token.balanceOf(recipient));
      currentBlock = rewardBlock;

      // go again to test the counter setting
      await Utils.advanceNBlock(3);
      await hardRewards.rewardMe(recipient, vault, { from: controller });
      rewardBlock = await time.latestBlock();
      assert.equal(
        expectedAward + (rewardBlock - currentBlock) * reward,
        await token.balanceOf(recipient)
      );

      // test no fails
      await hardRewards.load(constants.ZERO_ADDRESS, reward, 100 * reward);
      // no fail
      await hardRewards.rewardMe(recipient, vault, { from: controller });
      await hardRewards.removeVault(vault, { from: governance });
      assert.equal(0, await hardRewards.lastReward(vault));

      // no fail
      await token.mint(governance, 100 * reward);
      await token.approve(hardRewards.address, 100 * reward, {
        from: governance,
      });
      await hardRewards.load(token.address, reward, 100 * reward, {
        from: governance,
      });
      await hardRewards.rewardMe(recipient, vault, { from: controller });
    });
  });
});
