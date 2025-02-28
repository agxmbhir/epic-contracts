/**
 * Attestation Flow Integration Script
 *
 * This script integrates the following components:
 * 1. Attestor Nodes - Generate encrypted attestations
 * 2. AttestationPlatform Contract - Collects and stores attestations
 * 3. SP1 Prover - Generates ZK proofs for attestation verification
 *
 * The flow works as follows:
 * 1. Generate keys for homomorphic encryption
 * 2. Create attestations (exchange reserves and regulator liabilities)
 * 3. Submit attestations to the smart contract
 * 4. Listen for attestation complete event
 * 5. Generate ZK proof using SP1
 * 6. Submit verification result to the contract
 *
 * Configuration is loaded from .env file (copy from .env.example)
 */

// Load environment variables from .env file
require("dotenv").config();

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { spawn } = require("child_process");

// Configuration from environment variables
const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS ||
  (() => {
    console.error("❌ CONTRACT_ADDRESS not set in .env file");
    process.exit(1);
  })();

// Attestation values
const EXCHANGE_VALUE = process.env.EXCHANGE_VALUE || "1000000";
const REGULATOR_VALUE = process.env.REGULATOR_VALUE || "900000";
const OPERATION = process.env.OPERATION || "GreaterThan";

// Directories for attestation data
const TEMP_DIR = path.join(__dirname, "../attestation_temp");
const KEYS_DIR = path.join(TEMP_DIR, "keys");
const ATTESTATIONS_DIR = path.join(TEMP_DIR, "attestations");

// Path to epic-node binary (for attestation creation)
const EPIC_NODE_BINARY =
  process.env.EPIC_NODE_BINARY || 
  "/Users/agam/succinct/epic-node/target/debug/epic-node";

// Path to SP1 binary (for proof generation)
const SP1_BINARY =
  process.env.SP1_BINARY ||
  "/Users/agam/succinct/fibonacci/target/debug/epic_attestation";

// Log configuration at startup
console.log("=== Configuration ===");
console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
console.log(`Exchange Value: ${EXCHANGE_VALUE}`);
console.log(`Regulator Value: ${REGULATOR_VALUE}`);
console.log(`Operation: ${OPERATION}`);
console.log(`Epic Node Binary: ${EPIC_NODE_BINARY}`);
console.log(`SP1 Prover Binary: ${SP1_BINARY}`);
console.log("====================\n");

// Function to ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }
  if (!fs.existsSync(ATTESTATIONS_DIR)) {
    fs.mkdirSync(ATTESTATIONS_DIR, { recursive: true });
  }
}

// Generate a single shared encryption key for all attestor nodes
async function generateKeys() {
  console.log("Generating single shared encryption key for all attestor nodes...");
  ensureDirectories();
  
  // Check if keys already exist
  const publicKeyPath = path.join(KEYS_DIR, "public.key");
  const privateKeyPath = path.join(KEYS_DIR, "private.key");
  
  if (fs.existsSync(publicKeyPath) && fs.existsSync(privateKeyPath)) {
    console.log("Using existing shared encryption keys");
    return true;
  }
  
  try {
    // Use the epic-node binary to generate deterministic keys
    console.log("Creating new encryption keys with deterministic seed...");
    const output = execSync(`${EPIC_NODE_BINARY} generate-keys 1024 ${KEYS_DIR}`, {
      cwd: TEMP_DIR
    });
    console.log(output.toString());

    // Verify keys were generated
    if (!fs.existsSync(publicKeyPath) || !fs.existsSync(privateKeyPath)) {
      throw new Error("Failed to generate encryption keys");
    }

    console.log("Encryption keys generated and saved:");
    console.log(`Public key: ${publicKeyPath}`);
    console.log(`Private key: ${privateKeyPath}`);
    console.log("\nIMPORTANT: These keys must be shared with all attestor nodes!");
    console.log("          These same keys will be needed by the monitor_events.js script.");

    return true;
  } catch (error) {
    console.error("Error generating keys:", error.message);
    if (error.stdout) console.error(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
    return false;
  }
}

// Create attestations for exchange and regulator using the shared keys
async function createAttestations(exchangeValue, regulatorValue) {
  console.log(
    `Creating attestations: Exchange=${exchangeValue}, Regulator=${regulatorValue}`
  );

  try {
    // Ensure we have the shared public key
    const publicKeyPath = path.join(KEYS_DIR, "public.key");
    if (!fs.existsSync(publicKeyPath)) {
      console.log("Public key not found - generating shared keys first");
      const keysGenerated = await generateKeys();
      if (!keysGenerated) {
        throw new Error("Failed to generate required encryption keys");
      }
    }

    console.log("Using shared public key for all attestations");
    
    // Create a temporary file with the exchange value
    const exchangeValuesFile = path.join(TEMP_DIR, "exchange_values.txt");
    fs.writeFileSync(exchangeValuesFile, exchangeValue.toString());

    // Create a temporary file with the regulator value
    const regulatorValuesFile = path.join(TEMP_DIR, "regulator_values.txt");
    fs.writeFileSync(regulatorValuesFile, regulatorValue.toString());

    // Create exchange attestation using the shared public key
    console.log("Creating exchange attestation (node 1)...");
    let output = execSync(
      `${EPIC_NODE_BINARY} create-attestation 1 ${publicKeyPath} ${exchangeValuesFile} ${path.join(ATTESTATIONS_DIR, "attestation_1.bin")}`,
      { cwd: TEMP_DIR }
    );
    console.log(output.toString());

    // Create regulator attestation using the same shared public key
    console.log("Creating regulator attestation (node 2)...");
    output = execSync(
      `${EPIC_NODE_BINARY} create-attestation 2 ${publicKeyPath} ${regulatorValuesFile} ${path.join(ATTESTATIONS_DIR, "attestation_2.bin")}`,
      { cwd: TEMP_DIR }
    );
    console.log(output.toString());

    return {
      exchangeAttestation: path.join(ATTESTATIONS_DIR, "attestation_1.bin"),
      regulatorAttestation: path.join(ATTESTATIONS_DIR, "attestation_2.bin"),
    };
  } catch (error) {
    console.error("Error creating attestations:", error.message);
    if (error.stdout) console.error(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
    return null;
  }
}

// Submit attestations to smart contract
async function submitAttestationsToContract(
  exchangeAttestation,
  regulatorAttestation
) {
  console.log("Submitting attestations to smart contract...");

  try {
    // First check if we can connect to the network
    try {
      const provider = ethers.provider;
      const network = await provider.getNetwork();
      console.log(
        `Connected to network: ${network.name} (chainId: ${network.chainId})`
      );
    } catch (error) {
      console.error(
        "Failed to connect to network. Make sure your network settings are correct in hardhat.config.js"
      );
      throw new Error("Network connection failed");
    }

    // Get contract instance
    console.log(`Connecting to contract at address: ${CONTRACT_ADDRESS}`);
    const attestationPlatform = await ethers.getContractAt(
      "AttestationPlatform",
      CONTRACT_ADDRESS
    );

    // Verify contract connection with a simple call
    try {
      // Call a simple view function to check if contract exists and is accessible
      await attestationPlatform.getAddress();
      console.log("Successfully connected to the contract");
    } catch (error) {
      console.error(
        "Failed to connect to contract. Make sure the contract address is correct and the contract is deployed on this network"
      );
      throw new Error("Contract connection failed");
    }

    // Get signers (accounts)
    const [deployer, exchange, regulator] = await ethers.getSigners();
    console.log(`Using deployer account: ${deployer.address}`);
    console.log(`Using exchange account: ${exchange.address}`);
    console.log(`Using regulator account: ${regulator.address}`);

    // Register attestors if not already registered
    console.log("Checking if attestors are registered...");
    try {
      const exchangeCount = await attestationPlatform.getAttestorCount();
      console.log(`Current attestor count: ${exchangeCount}`);

      if (exchangeCount.toString() === "0") {
        console.log("Registering attestors...");

        // Register exchange
        let tx = await attestationPlatform.registerAttestor(
          exchange.address,
          "Exchange"
        );
        await tx.wait();
        console.log(`Exchange registered: ${exchange.address}`);

        // Register regulator
        tx = await attestationPlatform.registerAttestor(
          regulator.address,
          "Regulator"
        );
        await tx.wait();
        console.log(`Regulator registered: ${regulator.address}`);
      } else {
        console.log("Attestors already registered");
      }
    } catch (error) {
      console.error("Error checking/registering attestors:", error.message);
      throw new Error("Failed to register attestors");
    }

    // Read attestation files
    console.log(`Reading attestation file: ${exchangeAttestation}`);
    const exchangeData = fs.readFileSync(exchangeAttestation);
    console.log(`Exchange attestation size: ${exchangeData.length} bytes`);

    console.log(`Reading attestation file: ${regulatorAttestation}`);
    const regulatorData = fs.readFileSync(regulatorAttestation);
    console.log(`Regulator attestation size: ${regulatorData.length} bytes`);

    // Submit exchange attestation using the deployer account which has funds
    console.log("Submitting exchange attestation...");
    console.log(
      "Note: Using deployer account for all transactions to avoid funding multiple accounts"
    );

    // Check if the contract has the submitAttestationFor function
    let hasSubmitFor = false;
    try {
      // Check if function exists (will throw if doesn't exist)
      const fragment = attestationPlatform.interface.getFunction(
        "submitAttestationFor"
      );
      hasSubmitFor = !!fragment;
      console.log("Contract has submitAttestationFor function:", hasSubmitFor);
    } catch (error) {
      console.log("Contract does not have submitAttestationFor function");
      console.log(
        "Please redeploy the contract or transfer SepoliaETH to the exchange/regulator accounts"
      );
    }

    // First, check if exchange has already submitted an attestation
    let periodId = await attestationPlatform.currentPeriodId();
    let exchangeSubmitted = false;

    try {
      // Get attestation count for current period
      const attestorCount = await attestationPlatform.getPeriodAttestorCount(
        periodId
      );

      // Check all attestors in the period to see if exchange is among them
      for (let i = 0; i < Number(attestorCount); i++) {
        const attestorAddress = await attestationPlatform.periodAttestors(
          periodId,
          i
        );
        if (attestorAddress.toLowerCase() === exchange.address.toLowerCase()) {
          exchangeSubmitted = true;
          break;
        }
      }

      if (exchangeSubmitted) {
        console.log("Exchange has already submitted an attestation");
      }
    } catch (error) {
      console.log("Error checking existing attestations:", error.message);
    }

    // Submit attestation if not already submitted
    if (!exchangeSubmitted) {
      try {
        let tx;
        if (hasSubmitFor) {
          // Use the owner's function to submit on behalf of the exchange
          console.log(
            "Submitting attestation using owner's submitAttestationFor function"
          );
          tx = await attestationPlatform.submitAttestationFor(
            exchange.address,
            ethers.hexlify(exchangeData)
          );
        } else {
          // If deployer is attempting to submit as the exchange itself
          console.log(
            "WARNING: Attempting to submit attestation directly as exchange account"
          );
          console.log(
            "This will likely fail unless the account has SepoliaETH"
          );

          // Try impersonating exchange
          try {
            tx = await attestationPlatform
              .connect(exchange)
              .submitAttestation(ethers.hexlify(exchangeData));
          } catch (error) {
            console.error("Failed to submit as exchange:", error.message);
            console.log("Attempting to submit using deployer's attestation...");

            // Register deployer as attestor if needed
            const isDeployerRegistered = (
              await attestationPlatform.attestors(deployer.address)
            ).isRegistered;
            if (!isDeployerRegistered) {
              console.log("Registering deployer as attestor...");
              const regTx = await attestationPlatform.registerAttestor(
                deployer.address,
                "DeployerAttestor"
              );
              await regTx.wait();
              console.log("Deployer registered as attestor");
            }

            // Submit attestation as deployer
            tx = await attestationPlatform.submitAttestation(
              ethers.hexlify(exchangeData)
            );
          }
        }

        console.log(`Transaction hash: ${tx.hash}`);
        await tx.wait();
        console.log("Exchange attestation submitted successfully");
      } catch (error) {
        console.error("Failed to submit exchange attestation:", error.message);
        throw error;
      }
    }

    // Submit regulator attestation using the deployer account
    console.log("Submitting regulator attestation...");

    // Check if regulator has already submitted
    let regulatorSubmitted = false;

    try {
      // Check all attestors in the period to see if regulator is among them
      const attestorCount = await attestationPlatform.getPeriodAttestorCount(
        periodId
      );

      for (let i = 0; i < Number(attestorCount); i++) {
        const attestorAddress = await attestationPlatform.periodAttestors(
          periodId,
          i
        );
        if (attestorAddress.toLowerCase() === regulator.address.toLowerCase()) {
          regulatorSubmitted = true;
          break;
        }
      }

      if (regulatorSubmitted) {
        console.log("Regulator has already submitted an attestation");
      }
    } catch (error) {
      console.log("Error checking existing attestations:", error.message);
    }

    // Submit attestation if not already submitted
    if (!regulatorSubmitted) {
      try {
        let tx;
        if (hasSubmitFor) {
          // Use the owner's function to submit on behalf of the regulator
          console.log(
            "Submitting attestation using owner's submitAttestationFor function"
          );
          tx = await attestationPlatform.submitAttestationFor(
            regulator.address,
            ethers.hexlify(regulatorData)
          );
        } else {
          // Try directly as regulator (likely to fail)
          console.log(
            "WARNING: Attempting to submit attestation directly as regulator account"
          );
          console.log(
            "This will likely fail unless the account has SepoliaETH"
          );

          try {
            tx = await attestationPlatform
              .connect(regulator)
              .submitAttestation(ethers.hexlify(regulatorData));
          } catch (error) {
            console.error("Failed to submit as regulator:", error.message);
            console.log("Attempting to submit using deployer's attestation...");

            // Use deployer (must be registered as attestor for this to work)
            const isDeployerRegistered = (
              await attestationPlatform.attestors(deployer.address)
            ).isRegistered;
            if (!isDeployerRegistered) {
              console.log("Registering deployer as attestor...");
              const regTx = await attestationPlatform.registerAttestor(
                deployer.address,
                "DeployerAttestor"
              );
              await regTx.wait();
              console.log("Deployer registered as attestor");
            }

            // Submit as deployer
            tx = await attestationPlatform.submitAttestation(
              ethers.hexlify(regulatorData)
            );
          }
        }

        console.log(`Transaction hash: ${tx.hash}`);
        await tx.wait();
        console.log("Regulator attestation submitted successfully");
      } catch (error) {
        console.error("Failed to submit regulator attestation:", error.message);
        throw error;
      }
    }

    // // Check attestation period status
    // const periodId = await attestationPlatform.currentPeriodId();
    const attestorCount = await attestationPlatform.getPeriodAttestorCount(
      periodId
    );

    console.log(`Current period: ${periodId}`);
    console.log(`Attestations received: ${attestorCount}`);

    return {
      periodId,
      complete: attestorCount >= 2, // Required attestor count
    };
  } catch (error) {
    console.error("Error submitting attestations:", error.message);
    if (error.code) {
      console.error("Error code:", error.code);
    }
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return null;
  }
}

// Generate proof using SP1 with actual attestation files
async function generateProof(
  exchangeAttestation,
  regulatorAttestation,
  operation
) {
  console.log(`Generating proof for operation: ${operation}`);

  return new Promise((resolve, reject) => {
    try {
      // Ensure the shared encryption keys are available
      const publicKeyPath = path.join(KEYS_DIR, "public.key");
      if (!fs.existsSync(publicKeyPath)) {
        console.error("Shared public key not found. Cannot generate proof.");
        reject(new Error("Missing shared encryption key"));
        return;
      }
      
      // Verify attestation files exist
      if (!fs.existsSync(exchangeAttestation) || !fs.existsSync(regulatorAttestation)) {
        console.error("Attestation files not found");
        reject(new Error("Missing attestation files"));
        return;
      }
      
      console.log("Using actual attestation files with shared encryption key");
      console.log(`Exchange attestation: ${exchangeAttestation}`);
      console.log(`Regulator attestation: ${regulatorAttestation}`);

      // Use SP1 binary for proof generation
      const process = spawn(
        SP1_BINARY,
        [
          "--prove",
          "--operation",
          operation,
          "--att-file1",
          exchangeAttestation,
          "--att-file2",
          regulatorAttestation,
          "--debug",
        ],
        { 
          cwd: TEMP_DIR,
          env: {
            ...process.env,
            KEYS_DIR: KEYS_DIR,
            ATTESTATIONS_DIR: ATTESTATIONS_DIR
          }
        }
      );

      process.stdout.on("data", (data) => {
        console.log(data.toString());
      });

      process.stderr.on("data", (data) => {
        console.error(data.toString());
      });

      process.on("close", (code) => {
        if (code === 0) {
          console.log("Proof generation completed successfully");
          resolve({
            proofPath: path.join(TEMP_DIR, "proof.bin"),
            verificationKeyPath: path.join(TEMP_DIR, "verification_key.bin"),
          });
        } else {
          console.error(`Proof generation process exited with code ${code}`);
          reject(new Error(`Proof generation failed with code ${code}`));
        }
      });
    } catch (error) {
      console.error("Error generating proof:", error.message);
      reject(error);
    }
  });
}

// Submit verification result to the contract
async function submitVerificationResult(periodId, proofPath) {
  console.log(`Submitting verification result for period ${periodId}...`);

  try {
    // Get contract instance
    const attestationPlatform = await ethers.getContractAt(
      "AttestationPlatform",
      CONTRACT_ADDRESS
    );

    // Read proof data
    const proofData = fs.readFileSync(proofPath);

    // Determine if verification passed (for demo, always true if reserves > liabilities)
    const passed =
      OPERATION === "GreaterThan" &&
      parseInt(EXCHANGE_VALUE) > parseInt(REGULATOR_VALUE);

    // Submit verification result
    const tx = await attestationPlatform.submitVerificationResult(
      periodId,
      passed,
      ethers.hexlify(proofData)
    );
    await tx.wait();

    console.log(
      `Verification result submitted: ${passed ? "PASSED" : "FAILED"}`
    );

    return {
      passed,
      transaction: tx.hash,
    };
  } catch (error) {
    console.error("Error submitting verification result:", error.message);
    return null;
  }
}

// Event listener for AttestationPeriodComplete event
async function waitForAttestationComplete(attestationPlatform, periodId) {
  console.log(
    `Waiting for all attestations to be submitted for period ${periodId}...`
  );

  // Check if already complete
  const attestorCount = await attestationPlatform.getPeriodAttestorCount(
    periodId
  );
  if (attestorCount >= 2) {
    console.log("Attestation period already complete");
    return true;
  }

  return new Promise((resolve) => {
    attestationPlatform.on(
      "AttestationPeriodComplete",
      (completedPeriodId, count) => {
        if (completedPeriodId.toString() === periodId.toString()) {
          console.log(
            `Attestation period ${periodId} complete with ${count} attestations`
          );
          resolve(true);
        }
      }
    );

    // Set a timeout in case no event is received
    setTimeout(() => {
      console.log("Timeout waiting for attestation period complete event");
      resolve(false);
    }, 60000); // 1 minute timeout
  });
}

// Main function to run the full attestation flow
async function runAttestationFlow() {
  console.log("Starting attestation flow integration");

  // Ensure all directories exist
  ensureDirectories();

  // Step 1: Generate keys
  console.log("\n=== Step 1: Generate encryption keys ===");
  const keysGenerated = await generateKeys();
  if (!keysGenerated) {
    console.error("Failed to generate keys. Aborting.");
    return;
  }

  // Step 2: Create attestations
  console.log("\n=== Step 2: Create attestations ===");
  const attestations = await createAttestations(
    EXCHANGE_VALUE,
    REGULATOR_VALUE
  );
  if (!attestations) {
    console.error("Failed to create attestations. Aborting.");
    return;
  }

  // Step 3: Submit attestations to contract
  console.log("\n=== Step 3: Submit attestations to contract ===");
  const submissionResult = await submitAttestationsToContract(
    attestations.exchangeAttestation,
    attestations.regulatorAttestation
  );
  if (!submissionResult) {
    console.error("Failed to submit attestations. Aborting.");
    return;
  }

  // Get contract instance for event listening
  const attestationPlatform = await ethers.getContractAt(
    "AttestationPlatform",
    CONTRACT_ADDRESS
  );

  // Step 4: Wait for attestation period complete (if not already)
  console.log("\n=== Step 4: Wait for attestation period complete ===");
  if (!submissionResult.complete) {
    const complete = await waitForAttestationComplete(
      attestationPlatform,
      submissionResult.periodId
    );
    if (!complete) {
      console.error("Attestation period not completed. Aborting.");
      return;
    }
  } else {
    console.log("Attestation period already complete");
  }

  // Inform about next steps with monitor_events.js
  console.log("\n=== Attestation Submission Complete ===");
  console.log(`Exchange reserves: ${EXCHANGE_VALUE}`);
  console.log(`Regulator liabilities: ${REGULATOR_VALUE}`);

  if (submissionResult.complete) {
    console.log("\nAll attestations have been submitted successfully.");
    console.log("The attestation period is now complete.");
  } else {
    console.log("\nAttestation period not yet complete. Waiting for more attestations.");
    console.log("Once all required attestations are submitted, the period will be marked complete.");
  }
  
  console.log("\n=== Next Steps: Monitor Events to Generate Proof ===");
  console.log("To complete the verification process, run the monitor_events.js script:");
  console.log("  npx hardhat run scripts/monitor_events.js --network <network>");
  console.log("\nThe monitor_events.js script will:");
  console.log("1. Detect the AttestationPeriodComplete event");
  console.log("2. Retrieve the attestations from the blockchain");
  console.log("3. Generate a proof using the shared encryption keys");
  console.log("4. Submit the verification result back to the smart contract");
  
  // Optional: Can generate proof here if immediate testing is needed
  if (submissionResult.complete) {
    console.log("\nTIP: You can also generate a proof immediately by running:");
    console.log(`${SP1_BINARY} --prove --operation ${OPERATION} --att-file1 ${attestations.exchangeAttestation} --att-file2 ${attestations.regulatorAttestation} --debug`);
  }

  // Clean up if needed
  // fs.rmdirSync(TEMP_DIR, { recursive: true });
}

// Run the attestation flow
if (require.main === module) {
  runAttestationFlow()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Error in attestation flow:", error);
      process.exit(1);
    });
}

module.exports = {
  runAttestationFlow,
  generateKeys,
  createAttestations,
  submitAttestationsToContract,
  generateProof,
  submitVerificationResult,
};
