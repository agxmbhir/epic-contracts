# Setup Instructions for Homomorphic Attestation Platform

This guide explains how to set up and run the complete homomorphic attestation system with all its components integrated.

## System Components

1. **AttestationPlatform Contract**: Ethereum smart contract that collects encrypted attestations.
2. **Attestor Nodes**: Generate encrypted attestations using homomorphic encryption.
3. **SP1 Prover**: Generates zero-knowledge proofs to validate attestation rules.
4. **Monitor**: Listens for blockchain events and triggers proof generation.

## Setup Steps

### 1. Environment Configuration

First, create a `.env` file with your configuration:

```bash
cp .env.example .env
```

Then edit the `.env` file with your values:

```
# Set your Ethereum private key and RPC URLs
PRIVATE_KEY=your_private_key_here
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_infura_key

# Set the deployed contract address
CONTRACT_ADDRESS=0x71A042aD6932Cd2fB8a1a459aC9E6589093cB6d7

# Path to the SP1 binary
SP1_BINARY=/Users/agam/succinct/fibonacci/target/debug/epic_attestation

# Configuration for attestations
EXCHANGE_VALUE=1000000
REGULATOR_VALUE=900000
OPERATION=GreaterThan
AUTO_GENERATE_PROOF=true
```

### 2. Deploy the Smart Contract

If you haven't deployed the smart contract yet:

```bash
npx hardhat run scripts/deploy_sepolia.js --network sepolia
```

Update your `.env` file with the deployed contract address.

### 3. Start the Monitoring System

The monitoring system listens for blockchain events and automatically generates proofs:

```bash
npx hardhat run scripts/monitor_events.js --network sepolia
```

This will:
- Listen for AttestationSubmitted events
- Detect when attestation periods are complete
- Download attestations from the contract
- Generate ZK proofs using SP1
- Submit verification results back to the contract

Keep this running in a separate terminal window.

### 4. Run the Complete Attestation Flow

To run through the entire attestation flow manually:

```bash
npx hardhat run scripts/attestation_flow.js --network sepolia
```

This will:
1. Generate homomorphic encryption keys
2. Create encrypted attestations
3. Submit attestations to the contract
4. Wait for the attestation period to complete
5. Generate a ZK proof
6. Submit the verification result

## Testing Locally

For local testing:

1. Start a local Hardhat node:
```bash
npx hardhat node
```

2. Deploy to localhost:
```bash
npx hardhat run scripts/deploy.js --network localhost
```

3. Run the monitoring system:
```bash
npx hardhat run scripts/monitor_events.js --network localhost
```

4. Run the attestation flow:
```bash
npx hardhat run scripts/attestation_flow.js --network localhost
```

## Troubleshooting

### Contract Not Found
- Make sure the CONTRACT_ADDRESS in your .env file is correct
- Verify the contract is deployed to the specified network

### Insufficient Funds
- Make sure your wallet has enough Sepolia ETH
- For testnet ETH, use a faucet such as https://sepoliafaucet.com/

### SP1 Binary Not Found
- Ensure the SP1_BINARY path in your .env file is correct
- Make sure the binary is compiled and executable

### Submission Errors
- Check the contract's submitAttestationFor function exists (newer contract versions)
- Ensure the attestor addresses are properly registered

## Getting Sepolia ETH

For Sepolia testnet ETH, you can use any of these faucets:
- https://sepoliafaucet.com/
- https://sepolia-faucet.pk910.de/
- https://faucet.sepolia.dev/

Remember to fund at least your deployer account.