const Vault = artifacts.require("Vault");
const VaultProxy = artifacts.require("VaultProxy");

module.exports = async function(...args) {
  const fromParameter = args[args.length - 1]; // corresponds to {from: governance}
  const vaultImplementation = await Vault.new(fromParameter);
  const vaultAsProxy = await VaultProxy.new(vaultImplementation.address, fromParameter);
  const vault = await Vault.at(vaultAsProxy.address);
  await vault.initializeVault(...args);
  return vault;
};
