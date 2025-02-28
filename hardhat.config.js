/**
 * @type import('hardhat/config').HardhatUserConfig
 */

// Uncomment the lines below to enable the dotenv plugin
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    // Uncomment for deployment
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: {
        mnemonic: process.env.MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 10,
      },
      chainId: 11155111,
    },
    goerli: {
      url: process.env.GOERLI_RPC_URL || "",
      accounts: {
        mnemonic: process.env.MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 10,
      },
      chainId: 5,
    },
  },
  // Uncomment for Etherscan verification
  // etherscan: {
  //   apiKey: process.env.ETHERSCAN_API_KEY
  // },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
