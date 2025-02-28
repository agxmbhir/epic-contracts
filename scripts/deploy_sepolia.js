/**
 * Deploy Script for Sepolia
 * 
 * This script will:
 * 1. Deploy the AttestationPlatform contract to Sepolia
 * 2. Log the deployed address for future reference
 * 3. Perform basic validation to ensure the contract is working
 */

const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying AttestationPlatform contract to Sepolia...");

  // Get network information to verify we're on Sepolia
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
  
  if (network.chainId !== 11155111) {
    console.warn("Warning: Not deploying to Sepolia. Current network ID:", network.chainId);
    console.warn("Make sure you're using --network sepolia flag");
  }
  
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  
  // Check balance
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance < ethers.parseEther("0.01")) {
    console.error("Error: Insufficient balance for deployment");
    return;
  }

  // The number of required attestors for a complete attestation
  const requiredAttestorCount = 2; // Exchange and Regulator
  
  // Deploy the contract
  const AttestationPlatform = await ethers.getContractFactory("AttestationPlatform");
  console.log("Deploying contract...");
  const attestationPlatform = await AttestationPlatform.deploy(requiredAttestorCount);
  
  await attestationPlatform.waitForDeployment();
  
  const address = await attestationPlatform.getAddress();
  console.log(`AttestationPlatform deployed to: ${address}`);
  console.log("Save this address for future reference!");
  
  // Verify the contract is working
  console.log("\nVerifying contract functionality...");
  
  // Check attestor count
  const attestorCount = await attestationPlatform.getAttestorCount();
  console.log(`Initial attestor count: ${attestorCount}`);
  
  // Check period ID
  const periodId = await attestationPlatform.currentPeriodId();
  console.log(`Initial period ID: ${periodId}`);
  
  // Check owner
  const owner = await attestationPlatform.owner();
  console.log(`Contract owner: ${owner}`);
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Owner is deployer: ${owner.toLowerCase() === deployer.address.toLowerCase()}`);
  
  console.log("\nDeployment and verification complete!");
  console.log(`Use this address in your scripts: export CONTRACT_ADDRESS="${address}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });