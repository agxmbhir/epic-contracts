/**
 * Check Contract Script
 * 
 * This script verifies if the contract is deployed and correctly accessible
 * on the specified network
 */

const { ethers } = require("hardhat");

// The contract address to check
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  // Get network information
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
  
  // Get contract bytecode to check if contract exists
  const bytecode = await provider.getCode(CONTRACT_ADDRESS);
  if (bytecode === "0x") {
    console.error(`No contract deployed at address ${CONTRACT_ADDRESS}`);
    return;
  }
  
  console.log(`Contract exists at ${CONTRACT_ADDRESS} (bytecode length: ${bytecode.length})`);
  
  // Try to connect to the contract with our ABI
  try {
    const attestationPlatform = await ethers.getContractAt("AttestationPlatform", CONTRACT_ADDRESS);
    console.log("Successfully connected to contract with AttestationPlatform ABI");
    
    // Test calling some functions
    try {
      const attestorCount = await attestationPlatform.getAttestorCount();
      console.log(`getAttestorCount() returned: ${attestorCount}`);
    } catch (error) {
      console.error("Error calling getAttestorCount():", error.message);
    }
    
    try {
      const periodId = await attestationPlatform.currentPeriodId();
      console.log(`currentPeriodId() returned: ${periodId}`);
    } catch (error) {
      console.error("Error calling currentPeriodId():", error.message);
    }
    
    // Get the owner of the contract
    try {
      const owner = await attestationPlatform.owner();
      console.log(`Contract owner: ${owner}`);
    } catch (error) {
      console.error("Error calling owner():", error.message);
    }
    
    // Get our current accounts
    const [deployer, exchange, regulator] = await ethers.getSigners();
    console.log(`Our account addresses:`);
    console.log(`- Deployer: ${deployer.address}`);
    console.log(`- Exchange: ${exchange.address}`);
    console.log(`- Regulator: ${regulator.address}`);
    
  } catch (error) {
    console.error("Failed to connect to contract with AttestationPlatform ABI:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });