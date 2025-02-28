# Homomorphic Attestation Integration Flow

This directory contains scripts to integrate all components of the homomorphic attestation system:

1. **AttestorNodes**: Generate encrypted attestations using homomorphic encryption
2. **AttestationPlatform Contract**: Deployed on Sepolia to collect and manage attestations
3. **SP1 Prover**: Generates zero-knowledge proofs for verification

## Main Integration Script

The main integration script is `attestation_flow.js`. It implements the complete flow from attestation generation to contract verification:

1. Generate homomorphic encryption keys
2. Create encrypted attestations for exchange and regulator
3. Submit attestations to the smart contract
4. Listen for attestation complete event
5. Generate ZK proof of attestation validity
6. Submit verification result to the contract

## Prerequisites

- Node.js and npm installed
- Hardhat environment set up
- SP1 and Rust toolchain installed
- The AttestationPlatform contract deployed on a network (local or Sepolia)
- Compiled epic_attestation binary from the fibonacci/script directory

## Configuration

You can configure the script using environment variables:

```bash
# Contract address of deployed AttestationPlatform
export CONTRACT_ADDRESS="0x5FbDB2315678afecb367f032d93F642f64180aa3"

# Exchange reserves value
export EXCHANGE_VALUE="1000000"

# Regulator liabilities value
export REGULATOR_VALUE="900000"

# Operation to verify (GreaterThan, LessThan, Equal)
export OPERATION="GreaterThan"
```

## Running the Integration Flow

To run the complete attestation flow:

```bash
npx hardhat run scripts/attestation_flow.js --network sepolia
```

For local testing:

```bash
npx hardhat run scripts/attestation_flow.js --network localhost
```

## Individual Steps

The script includes modular functions that can be used independently:

### 1. Generate Keys

Generate homomorphic encryption keys for attestations:

```javascript
await generateKeys();
```

### 2. Create Attestations

Create encrypted attestations for exchange and regulator:

```javascript
const attestations = await createAttestations(exchangeValue, regulatorValue);
```

### 3. Submit Attestations

Submit attestations to the deployed AttestationPlatform contract:

```javascript
const submissionResult = await submitAttestationsToContract(
  attestations.exchangeAttestation,
  attestations.regulatorAttestation
);
```

### 4. Generate Proof

Generate a zero-knowledge proof of attestation validity:

```javascript
const proofResult = await generateProof(
  attestations.exchangeAttestation,
  attestations.regulatorAttestation,
  operation
);
```

### 5. Submit Verification

Submit the verification result and proof to the contract:

```javascript
const verificationResult = await submitVerificationResult(
  periodId,
  proofResult.proofPath
);
```

## Troubleshooting

- Ensure the `epic_attestation` binary is compiled and accessible
- Check that the contract address is correct
- Verify you have enough ETH for transactions on the target network
- Make sure the attestation files are readable
- For permissions errors, check file permissions on the attestation files