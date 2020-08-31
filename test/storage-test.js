const Storage = artifacts.require("Storage");
const { expectRevert, constants } = require("@openzeppelin/test-helpers");

contract("Storage Test", function (accounts) {
  describe("Storage setting", function () {
    let governance = accounts[0];
    let controller = accounts[1];
    let storage;
    let controllable;

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });
      await storage.setController(controller, { from: governance });
    });

    it("governance can update governance", async function () {
      assert.equal(governance, await storage.governance());
      await storage.setGovernance(controller, { from: governance });
      assert.equal(controller, await storage.governance());
      await expectRevert(
        storage.setGovernance(controller, { from: governance }),
        "Not governance"
      );
      await expectRevert(
        storage.setGovernance(constants.ZERO_ADDRESS, { from: controller }),
        "new governance shouldn't be empty"
      );
    });
  });
});
