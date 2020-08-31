const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    development: {
     host: "127.0.0.1",
     port: 8545,
     network_id: "*",
     gas: 6721975,
    },
    ropsten: {
      provider: function () {
        const secret = require("./secret.json");
        return new HDWalletProvider(secret.mnemonic, `https://ropsten.infura.io/v3/${secret.infuraKey}`, 1);
      },
      network_id: 3,
      gas: 4721975,
      skipDryRun: true,
      gasPrice: 23000000000,
    },
    mainnet: {
      provider: function () {
        const secret = require("./secret.json");
        return new HDWalletProvider(secret.mnemonic, `https://mainnet.infura.io/v3/${secret.infuraKey}`);
      },
      network_id: 1,
      gas: 6721975,
      skipDryRun: true,
      gasPrice: 75000000000,
    },
  },
  mocha: {
    timeout: 1200000
  },
  plugins: ["solidity-coverage"],
  compilers: {
    solc: {
      version: "0.5.16",
      settings: {
       optimizer: {
         enabled: true,
         runs: 150
       },
      }
    }
  }
}
