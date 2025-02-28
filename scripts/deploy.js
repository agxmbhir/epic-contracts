const hre = require("hardhat");

async function main() {
  console.log("Deploying AttestationPlatform contract...");

  // The number of required attestors for a complete attestation
  const requiredAttestorCount = 2; // Exchange and Regulator
  
  // Deploy the contract
  const AttestationPlatform = await hre.ethers.getContractFactory("AttestationPlatform");
  const attestationPlatform = await AttestationPlatform.deploy(requiredAttestorCount);
  
  await attestationPlatform.waitForDeployment();
  
  const address = await attestationPlatform.getAddress();
  console.log(`AttestationPlatform deployed to: ${address}`);
  
  console.log("Deployment complete!");
  
  // For testnet/mainnet deployments, uncomment these lines:
  // console.log("Waiting for block confirmations...");
  // await attestationPlatform.deploymentTransaction().wait(5);
  // 
  // console.log("Verifying contract on Etherscan...");
  // try {
  //   await hre.run("verify:verify", {
  //     address: address,
  //     constructorArguments: [requiredAttestorCount],
  //   });
  //   console.log("Contract verified on Etherscan!");
  // } catch (error) {
  //   console.error("Error verifying contract:", error);
  // }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });