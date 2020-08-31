const { expectRevert, constants } = require("@openzeppelin/test-helpers");
const Governable = artifacts.require("Governable");
const Storage = artifacts.require("Storage");

contract("Governable Test", function (accounts) {
  describe("Governance setting", function () {
    let governance = accounts[0];
    let notGovernance = accounts[1];
    let newGovernance = accounts[2];
    let storage;
    let governable;

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });
      governable = await Governable.new(storage.address, {
        from: governance,
      });
    });

    it("set and read", async function () {
      assert.equal(governance, await governable.governance());
      await storage.setGovernance(newGovernance, { from: governance });
      assert.equal(newGovernance, await governable.governance());
      await expectRevert(
        storage.setGovernance(notGovernance, { from: notGovernance }),
        "Not governance"
      );
      await expectRevert(
        storage.setGovernance(constants.ZERO_ADDRESS, { from: newGovernance }),
        "new governance shouldn't be empty"
      );
    });

    it("set storage", async function () {
      await expectRevert(
        governable.setStorage(constants.ZERO_ADDRESS, { from: governance }),
        "new storage shouldn't be empty"
      );
      await expectRevert(
        governable.setStorage(notGovernance, { from: notGovernance }),
        "Not governance"
      );
      await governable.setStorage(newGovernance, { from: governance });
      assert.equal(newGovernance, await governable.store());

      await expectRevert(
        Governable.new(constants.ZERO_ADDRESS, {
          from: governance,
        }),
        "new storage shouldn't be empty"
      );
    });
  });
});
