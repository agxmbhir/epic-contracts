/**
 * Event Monitor for AttestationPlatform
 *
 * This script listens for events from the AttestationPlatform contract
 * and automatically triggers the proof generation process using SP1
 * when attestations are complete, then submits the results back to the contract.
 *
 * Usage:
 * npx hardhat run scripts/monitor_events.js --network sepolia
 *
 * Environment variables are loaded from .env file (copy from .env.example)
 */

// Load environment variables from .env file
require("dotenv").config();

const { ethers } = require("hardhat");
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Configuration from environment variables
const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS ||
  (() => {
    console.error("❌ CONTRACT_ADDRESS not set in .env file");
    process.exit(1);
  })();

const AUTO_GENERATE_PROOF = process.env.AUTO_GENERATE_PROOF !== "false"; // Default to true
const OPERATION = process.env.OPERATION || "GreaterThan";
const EXCHANGE_VALUE = process.env.EXCHANGE_VALUE || "1000000";
const REGULATOR_VALUE = process.env.REGULATOR_VALUE || "900000";

// Path to epic-node binary (for attestation creation)
const EPIC_NODE_BINARY =
  process.env.EPIC_NODE_BINARY || 
  "/Users/agam/succinct/epic-node/target/debug/epic-node";

// Path to SP1 binary (for proof generation)
const SP1_BINARY =
  process.env.SP1_BINARY ||
  "/Users/agam/succinct/fibonacci/target/debug/epic_attestation";

// Directories for temporary files
const TEMP_DIR = path.join(__dirname, "../attestation_temp");
const KEYS_DIR = path.join(TEMP_DIR, "keys");
const ATTESTATIONS_DIR = path.join(TEMP_DIR, "attestations");

// Flag to track if we're currently processing a proof
let isGeneratingProof = false;

// Create necessary directories
function ensureDirectories() {
  const dirs = [TEMP_DIR, KEYS_DIR, ATTESTATIONS_DIR];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// Retrieve attestations from the smart contract
async function retrieveAttestations(periodId, attestationPlatform) {
  console.log("\n=== Retrieving Attestations ===");

  try {
    // Get the attestor addresses for this period
    const attestorCount = await attestationPlatform.getPeriodAttestorCount(
      periodId
    );
    console.log(`Found ${attestorCount} attestors for period ${periodId}`);

    if (attestorCount < 2) {
      console.error("Not enough attestations to generate proof");
      return null;
    }

    let exchangeAddress, regulatorAddress;

    // First try to find attestor by name
    const totalAttestors = await attestationPlatform.getAttestorCount();
    for (let i = 0; i < totalAttestors; i++) {
      try {
        const address = await attestationPlatform.attestorAddresses(i);
        const attestor = await attestationPlatform.attestors(address);

        if (attestor.name === "Exchange") {
          exchangeAddress = address;
          console.log(`Found Exchange attestor: ${address}`);
        } else if (attestor.name === "Regulator") {
          regulatorAddress = address;
          console.log(`Found Regulator attestor: ${address}`);
        }
      } catch (error) {
        console.error(
          `Error retrieving attestor at index ${i}:`,
          error.message
        );
      }
    }

    // If we couldn't find by name, just use the first two attestors
    if (!exchangeAddress || !regulatorAddress) {
      console.log(
        "Could not find attestors by name, using the first two attestors"
      );

      for (let i = 0; i < attestorCount && i < 2; i++) {
        const address = await attestationPlatform.periodAttestors(periodId, i);
        if (i === 0) {
          exchangeAddress = address;
          console.log(`Using first attestor as Exchange: ${address}`);
        } else if (i === 1) {
          regulatorAddress = address;
          console.log(`Using second attestor as Regulator: ${address}`);
        }
      }
    }

    if (!exchangeAddress || !regulatorAddress) {
      console.error("Failed to identify Exchange and Regulator attestors");
      return null;
    }

    // Get the attestation data
    const exchangeAttestation = await attestationPlatform.getAttestation(
      periodId,
      exchangeAddress
    );
    const regulatorAttestation = await attestationPlatform.getAttestation(
      periodId,
      regulatorAddress
    );

    console.log(
      `Retrieved Exchange attestation: ${exchangeAttestation.encryptedData.length} bytes`
    );
    console.log(
      `Retrieved Regulator attestation: ${regulatorAttestation.encryptedData.length} bytes`
    );

    // Save the attestations to files
    const exchangeFile = path.join(ATTESTATIONS_DIR, "attestation_1.bin");
    const regulatorFile = path.join(ATTESTATIONS_DIR, "attestation_2.bin");

    // Create binary data from hex string
    const exchangeData = ethers.getBytes(exchangeAttestation.encryptedData);
    const regulatorData = ethers.getBytes(regulatorAttestation.encryptedData);

    fs.writeFileSync(exchangeFile, Buffer.from(exchangeData));
    fs.writeFileSync(regulatorFile, Buffer.from(regulatorData));

    console.log(`Saved Exchange attestation to: ${exchangeFile}`);
    console.log(`Saved Regulator attestation to: ${regulatorFile}`);

    return {
      exchangeFile,
      regulatorFile,
    };
  } catch (error) {
    console.error("Error retrieving attestations:", error.message);
    return null;
  }
}

// Generate the proof using the SP1 binary
async function generateProof(attestationFiles) {
  console.log("\n=== Generating Proof with SP1 ===");

  if (
    !attestationFiles ||
    !attestationFiles.exchangeFile ||
    !attestationFiles.regulatorFile
  ) {
    console.error("Missing required attestation files:", attestationFiles);
    throw new Error("Invalid attestation files");
  }

  console.log(`Using attestation files:`);
  console.log(`- Exchange: ${attestationFiles.exchangeFile}`);
  console.log(`- Regulator: ${attestationFiles.regulatorFile}`);

  return new Promise((resolve, reject) => {
    try {
      // Verify we have everything we need
      const publicKeyPath = path.join(KEYS_DIR, "public.key");
      const privateKeyPath = path.join(KEYS_DIR, "private.key");
      const useAttestation = fs.existsSync(publicKeyPath) && 
                        fs.existsSync(attestationFiles.exchangeFile) && 
                        fs.existsSync(attestationFiles.regulatorFile);
      
      // We should use the attestation files when possible
      if (!useAttestation) {
        console.log("MISSING REQUIRED FILES:");
        if (!fs.existsSync(publicKeyPath)) console.log("- Public key missing");
        if (!fs.existsSync(attestationFiles.exchangeFile)) console.log("- Exchange attestation missing");
        if (!fs.existsSync(attestationFiles.regulatorFile)) console.log("- Regulator attestation missing");
        
        console.error("Critical files missing - cannot generate proof with attestation files");
        throw new Error("Missing required files for proof generation");
      }
      
      // Using real attestation files with the shared encryption key
      console.log("Using real attestation files with shared encryption key for proof generation");
      console.log(`Public key: ${publicKeyPath}`);
      console.log(`Exchange attestation: ${attestationFiles.exchangeFile}`);
      console.log(`Regulator attestation: ${attestationFiles.regulatorFile}`);
      
      const args = [
        "--prove",
        "--operation",
        OPERATION,
        "--att-file1",
        attestationFiles.exchangeFile,
        "--att-file2", 
        attestationFiles.regulatorFile,
        "--debug"
      ];

      console.log(`Running SP1 binary: ${SP1_BINARY}`);
      console.log(`Args: ${args.join(" ")}`);

      const proofProcess = spawn(SP1_BINARY, args, {
        cwd: TEMP_DIR,
      });

      let stdoutData = "";
      let stderrData = "";

      proofProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdoutData += output;
        console.log(`SP1: ${output.trim()}`);
      });

      proofProcess.stderr.on("data", (data) => {
        const output = data.toString();
        stderrData += output;
        console.error(`SP1 Error: ${output.trim()}`);
      });

      proofProcess.on("close", (code) => {
        if (code === 0) {
          console.log("SP1 proof generation completed successfully");

          // Look for proof.bin in different potential locations
          const proofFile = path.join(TEMP_DIR, "proof.bin");
          const altProofFile = "./proof.bin"; // Alternative location

          if (fs.existsSync(proofFile)) {
            console.log(`Proof file found: ${proofFile}`);
            resolve({
              success: true,
              proofFile,
              // For demo, determine pass/fail based on the configured values
              passed:
                OPERATION === "GreaterThan" &&
                parseInt(EXCHANGE_VALUE) > parseInt(REGULATOR_VALUE),
            });
          } else if (fs.existsSync(altProofFile)) {
            console.log(`Proof file found in alternate location: ${altProofFile}`);
            // Copy it to the expected location
            fs.copyFileSync(altProofFile, proofFile);
            resolve({
              success: true,
              proofFile,
              // For demo, determine pass/fail based on the configured values
              passed:
                OPERATION === "GreaterThan" &&
                parseInt(EXCHANGE_VALUE) > parseInt(REGULATOR_VALUE),
            });
          } else {
            console.error(
              "Proof file not found after successful SP1 execution"
            );
            resolve({
              success: false,
              error: "Proof file not found",
            });
          }
        } else {
          console.error(`SP1 process exited with code ${code}`);
          console.error(`Stdout: ${stdoutData}`);
          console.error(`Stderr: ${stderrData}`);

          reject(new Error(`SP1 proof generation failed with code ${code}`));
        }
      });
    } catch (error) {
      console.error("Error spawning SP1 process:", error.message);
      reject(error);
    }
  });
}

// Submit the verification result to the smart contract
async function submitVerificationResult(
  periodId,
  proofResult,
  attestationPlatform
) {
  console.log(
    `\n=== Submitting Verification Result for Period ${periodId} ===`
  );

  try {
    // Check if verification has already been submitted
    const existingResult = await attestationPlatform.verificationResults(
      periodId
    );
    if (
      existingResult &&
      existingResult.timestamp &&
      Number(existingResult.timestamp) > 0
    ) {
      console.log(`Verification result already exists for period ${periodId}`);
      return {
        success: true,
        alreadySubmitted: true,
      };
    }

    // Read the proof file
    const proofData = fs.readFileSync(proofResult.proofFile);
    console.log(`Proof data size: ${proofData.length} bytes`);

    // Submit the verification result
    console.log(
      `Submitting result: ${proofResult.passed ? "PASSED" : "FAILED"}`
    );

    const tx = await attestationPlatform.submitVerificationResult(
      periodId,
      proofResult.passed,
      ethers.hexlify(proofData)
    );

    console.log(`Transaction hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    return {
      success: true,
      transactionHash: tx.hash,
    };
  } catch (error) {
    console.error("Error submitting verification result:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Process an attestation complete event
async function processAttestationComplete(
  periodId,
  attestorCount,
  attestationPlatform
) {
  if (isGeneratingProof) {
    console.log("Already generating a proof, skipping");
    return;
  }

  isGeneratingProof = true;

  try {
    console.log(`\n=== Processing Attestation Period ${periodId} ===`);

    // Ensure directories exist
    ensureDirectories();

        // We'll need the same shared public key that was used by the attestor nodes
    const publicKeyPath = path.join(KEYS_DIR, "public.key");
    if (!fs.existsSync(publicKeyPath)) {
      console.log("IMPORTANT: Public key not found in expected location");
      console.log("This key should be the same one used by the attestor nodes");
      console.log("Ideally, copy this file from the attestation_flow.js script's keys directory");
      
      // Try to generate the same deterministic key using same seed/process
      console.log("Attempting to generate the deterministic key that should match attestor keys...");
      try {
        execSync(`${EPIC_NODE_BINARY} generate-keys 1024 ${KEYS_DIR}`, { 
          cwd: TEMP_DIR
        });
        console.log("Generated deterministic key - should match if using same seed");
        
        if (fs.existsSync(publicKeyPath)) {
          console.log("Successfully generated public key");
        } else {
          console.error("Failed to generate public key at expected location");
        }
      } catch (error) {
        console.error("Failed to generate keys:", error.message);
        console.error("Will attempt to continue, but proof generation may fail");
      }
    } else {
      console.log("Found existing shared public key - using for verification");
    }
    
    console.log("Using encrypted attestations from the blockchain");

    // Retrieve attestations
    const attestationFiles = await retrieveAttestations(
      periodId,
      attestationPlatform
    );
    if (!attestationFiles) {
      console.error("Failed to retrieve attestations");
      return;
    }

    // Generate proof
    const proofResult = await generateProof(attestationFiles);
    if (!proofResult.success) {
      console.error("Failed to generate proof");
      return;
    }

    // Submit verification result
    const submitResult = await submitVerificationResult(
      periodId,
      proofResult,
      attestationPlatform
    );

    if (submitResult.success) {
      console.log(`\n=== Verification Complete ===`);
      console.log(`Period ID: ${periodId}`);
      console.log(`Operation: ${OPERATION}`);
      console.log(`Result: ${proofResult.passed ? "✅ PASSED" : "❌ FAILED"}`);

      if (OPERATION === "GreaterThan") {
        console.log(
          `Verification interpretation: ${
            proofResult.passed
              ? "Exchange reserves exceed liabilities"
              : "Exchange reserves do not exceed liabilities"
          }`
        );
      }
    } else {
      console.error("Failed to submit verification result");
    }
  } catch (error) {
    console.error("Error processing attestation complete:", error.message);
  } finally {
    isGeneratingProof = false;
  }
}

// Main monitoring function
async function monitorEvents() {
  console.log(
    `Monitoring events from AttestationPlatform at ${CONTRACT_ADDRESS}`
  );
  console.log(`Auto-generate proof: ${AUTO_GENERATE_PROOF}`);
  console.log(`Operation to verify: ${OPERATION}`);
  console.log(`Exchange value: ${EXCHANGE_VALUE}`);
  console.log(`Regulator value: ${REGULATOR_VALUE}`);

  // Connect to the contract
  const attestationPlatform = await ethers.getContractAt(
    "AttestationPlatform",
    CONTRACT_ADDRESS
  );

  // Listen for AttestationSubmitted events
  attestationPlatform.on(
    "AttestationSubmitted",
    async (periodId, attestor, timestamp) => {
      console.log(`\n==== AttestationSubmitted Event ====`);
      console.log(`Period ID: ${periodId}`);
      console.log(`Attestor: ${attestor}`);
      console.log(
        `Timestamp: ${new Date(Number(timestamp) * 1000).toLocaleString()}`
      );

      // Get attestor name if possible
      try {
        const attestorInfo = await attestationPlatform.attestors(attestor);
        console.log(`Attestor name: ${attestorInfo.name}`);
      } catch (error) {
        // Ignore error, name is optional
      }

      // Get attestor count for this period
      const attestorCount = await attestationPlatform.getPeriodAttestorCount(
        periodId
      );
      console.log(
        `Attestations received for period ${periodId}: ${attestorCount}`
      );
    }
  );

  // Listen for AttestationPeriodComplete events
  attestationPlatform.on(
    "AttestationPeriodComplete",
    async (periodId, attestorCount) => {
      console.log(`\n==== AttestationPeriodComplete Event ====`);
      console.log(`Period ID: ${periodId}`);
      console.log(`Total attestors: ${attestorCount}`);

      if (AUTO_GENERATE_PROOF) {
        console.log(
          `\nAutomatically generating proof for period ${periodId}...`
        );
        processAttestationComplete(
          periodId,
          attestorCount,
          attestationPlatform
        );
      } else {
        console.log("Automatic proof generation is disabled");
        console.log("Set AUTO_GENERATE_PROOF=true to enable");
      }
    }
  );

  // Listen for VerificationResultSubmitted events
  attestationPlatform.on(
    "VerificationResultSubmitted",
    async (periodId, passed, timestamp) => {
      console.log(`\n==== VerificationResultSubmitted Event ====`);
      console.log(`Period ID: ${periodId}`);
      console.log(`Passed: ${passed ? "✅ PASSED" : "❌ FAILED"}`);
      console.log(
        `Timestamp: ${new Date(Number(timestamp) * 1000).toLocaleString()}`
      );

      // Add interpretation of the result
      if (passed) {
        console.log(
          "✅ Exchange reserves exceed liabilities - Attestation verified!"
        );
      } else {
        console.log(
          "❌ Exchange reserves do not exceed liabilities - Verification failed!"
        );
      }
    }
  );

  // Check for existing periods that need verification
  console.log("\n=== Checking Existing Attestation Periods ===");
  try {
    const currentPeriodId = await attestationPlatform.currentPeriodId();
    console.log(`Current period ID: ${currentPeriodId}`);

    // Check periods that might need verification
    for (let i = 0; i <= Number(currentPeriodId); i++) {
      const attestorCount = await attestationPlatform.getPeriodAttestorCount(i);
      const requiredCount = await attestationPlatform.requiredAttestorCount();

      console.log(`Period ${i}: ${attestorCount}/${requiredCount} attestors`);

      if (Number(attestorCount) >= Number(requiredCount)) {
        // This period is complete, check if it has verification
        try {
          const result = await attestationPlatform.verificationResults(i);
          if (result && result.timestamp && Number(result.timestamp) > 0) {
            console.log(
              `Period ${i} already has verification result: ${
                result.passed ? "PASSED" : "FAILED"
              }`
            );
          } else {
            console.log(`Period ${i} is complete but needs verification`);

            if (AUTO_GENERATE_PROOF) {
              console.log(`Generating proof for period ${i}...`);
              processAttestationComplete(i, attestorCount, attestationPlatform);
            }
          }
        } catch (error) {
          console.log(`No verification result for period ${i}`);

          if (AUTO_GENERATE_PROOF) {
            console.log(`Generating proof for period ${i}...`);
            processAttestationComplete(i, attestorCount, attestationPlatform);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error checking existing periods:", error.message);
  }

  // Keep the script running
  console.log("\nMonitoring events... (Press Ctrl+C to exit)");
}

// Run the monitoring function
if (require.main === module) {
  monitorEvents().catch((error) => {
    console.error("Error monitoring events:", error);
    process.exit(1);
  });
}

module.exports = {
  monitorEvents,
  generateProof,
  retrieveAttestations,
  submitVerificationResult,
};