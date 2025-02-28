const hre = require("hardhat");

// Update this with the deployed contract address after deployment
const CONTRACT_ADDRESS = "0xedd936ABe0f934E121d0F5E0E9D385a06fe0b7EE"; // Default local deployment address

async function main() {
  // Get the deployed contract
  const attestationPlatform = await hre.ethers.getContractAt(
    "AttestationPlatform",
    CONTRACT_ADDRESS
  );

  console.log("Interacting with AttestationPlatform at:", CONTRACT_ADDRESS);

  // 1. Register attestors
  console.log("\nRegistering attestors...");

  // Get signers (accounts)
  const [deployer, exchange, regulator] = await hre.ethers.getSigners();

  // Register exchange
  let tx = await attestationPlatform.registerAttestor(
    exchange.address,
    "Exchange A"
  );
  await tx.wait();
  console.log(`Exchange registered: ${exchange.address}`);

  // Register regulator
  tx = await attestationPlatform.registerAttestor(
    regulator.address,
    "Regulator B"
  );
  await tx.wait();
  console.log(`Regulator registered: ${regulator.address}`);

  // 2. Submit attestations
  console.log("\nSubmitting attestations...");

  // Exchange submits attestation (mock encrypted data)
  const exchangeAttestationData = hre.ethers.hexlify(
    hre.ethers.randomBytes(100)
  );
  tx = await attestationPlatform
    .connect(exchange)
    .submitAttestation(exchangeAttestationData);
  await tx.wait();
  console.log("Exchange attestation submitted");

  // Regulator submits attestation (mock encrypted data)
  const regulatorAttestationData = hre.ethers.hexlify(
    hre.ethers.randomBytes(100)
  );
  tx = await attestationPlatform
    .connect(regulator)
    .submitAttestation(regulatorAttestationData);
  await tx.wait();
  console.log("Regulator attestation submitted");

  // 3. Check attestation period status
  const periodId = await attestationPlatform.currentPeriodId();
  const attestorCount = await attestationPlatform.getPeriodAttestorCount(
    periodId
  );
  console.log(`\nCurrent period: ${periodId}`);
  console.log(`Attestations received: ${attestorCount}`);

  // 4. Add verification rule
  console.log("\nAdding verification rule...");
  const ruleDescription = "Reserves must exceed liabilities";
  const ruleData = hre.ethers.hexlify(
    hre.ethers.toUtf8Bytes("reserves > liabilities")
  );
  tx = await attestationPlatform.addVerificationRule(ruleDescription, ruleData);
  await tx.wait();
  console.log("Verification rule added");

  // 5. Submit verification result (mock proof data)
  console.log("\nSubmitting verification result...");
  const passed = true; // Verification passed
  const proofData = hre.ethers.hexlify(hre.ethers.randomBytes(200)); // Mock ZK proof
  tx = await attestationPlatform.submitVerificationResult(
    periodId,
    passed,
    proofData
  );
  await tx.wait();
  console.log("Verification result submitted");

  // 6. Get verification result
  const result = await attestationPlatform.verificationResults(periodId);
  console.log("\nVerification result:");
  console.log(`- Passed: ${result.passed}`);
  console.log(
    `- Timestamp: ${new Date(Number(result.timestamp) * 1000).toLocaleString()}`
  );

  console.log("\nInteraction complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
