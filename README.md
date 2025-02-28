# AttestationPlatform Smart Contract

A secure attestation platform that allows financial exchanges to prove their reserves exceed liabilities without revealing exact values. The system uses homomorphic encryption and zero-knowledge proofs to verify financial data while maintaining privacy.

## Project Structure

- `contracts/AttestationPlatform.sol`: The main AttestationPlatform smart contract
- `scripts/deploy.js`: Script to deploy the contract
- `scripts/interact.js`: Script to interact with the deployed contract
- `scripts/attestation_flow.js`: Integration script connecting all system components
- `test/AttestationPlatform.test.js`: Tests for the contract

## Complete System Components

This repository is part of a larger system with three main components:

1. **AttestationPlatform Contract** (this repository): Smart contract for managing encrypted attestations
2. **AttestorNodes**: Nodes that generate homomorphic encryptions of financial data
3. **SP1 Prover**: Zero-knowledge virtual machine that verifies encrypted operations

## Setup Instructions

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file:

```bash
cp .env.example .env
```

3. Update the `.env` file with your own values:
   - Add your private key (without 0x prefix)
   - Add RPC URLs for test networks
   - Add your Etherscan API key

## Running Tests

To run the tests for the contract:

```bash
npx hardhat test
```

## Deployment to Local Hardhat Network

To deploy the contract to a local Hardhat network:

```bash
npx hardhat node
```

Then in a separate terminal:

```bash
npx hardhat run scripts/deploy.js --network localhost
```

## Deployment to Testnet

To deploy the contract to a testnet (e.g., Sepolia):

1. Uncomment the network configuration in `hardhat.config.js`.
2. Ensure your `.env` file has the correct RPC URL and private key.
3. Run the deployment script:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

## Contract Verification

To verify the contract on Etherscan:

1. Uncomment the verification code in the `deploy.js` script.
2. Ensure your `.env` file has your Etherscan API key.
3. Run the deployment script:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Alternatively, you can manually verify the contract:

```bash
npx hardhat verify --network sepolia CONTRACT_ADDRESS REQUIRED_ATTESTOR_COUNT
```

Replace `CONTRACT_ADDRESS` with the deployed contract address and `REQUIRED_ATTESTOR_COUNT` with the number of required attestors.

## Interacting with the Contract

After deployment, update the `CONTRACT_ADDRESS` variable in `scripts/interact.js` with your deployed contract address, then run:

```bash
npx hardhat run scripts/interact.js --network localhost
```

Or for a testnet:

```bash
npx hardhat run scripts/interact.js --network sepolia
```

## Integration with Attestation System

The `scripts/attestation_flow.js` script provides a complete integration between all system components:

1. Generates homomorphic encryption keys
2. Creates encrypted attestations for exchange and regulator
3. Submits attestations to the smart contract
4. Listens for attestation complete event
5. Generates ZK proof of attestation validity
6. Submits verification result to the contract

To run the complete attestation flow:

```bash
# Set required environment variables
export CONTRACT_ADDRESS="0x5FbDB2315678afecb367f032d93F642f64180aa3"
export EXCHANGE_VALUE="1000000"
export REGULATOR_VALUE="900000"
export OPERATION="GreaterThan"

# Run the integration script
npx hardhat run scripts/attestation_flow.js --network sepolia
```

For more details about the integration script, see [scripts/README.md](scripts/README.md).

## Contract Functions

### Admin Functions

- `registerAttestor(address _attestor, string memory _name)`: Register an attestor.
- `addVerificationRule(string memory _description, bytes calldata _ruleData)`: Add a verification rule.
- `submitVerificationResult(uint256 _periodId, bool _passed, bytes calldata _proofData)`: Submit verification result.
- `startNewPeriod()`: Force start a new attestation period.

### Attestor Functions

- `submitAttestation(bytes calldata _encryptedData)`: Submit an attestation.

### Read Functions

- `getAttestorCount()`: Get the number of registered attestors.
- `getPeriodAttestorCount(uint256 _periodId)`: Get the number of attestors for a period.
- `getVerificationRuleCount()`: Get the count of verification rules.
- `getAttestation(uint256 _periodId, address _attestor)`: Get attestation for a specific attestor in a period.

## System Flow

1. **Setup Phase**:
   - Deploy the contract with the required number of attestors
   - Generate homomorphic encryption keys
   - Register attestors (exchange, regulator)
   - Add verification rules

2. **Attestation Submission Phase**:
   - Attestors encrypt their data (reserves, liabilities) using homomorphic encryption
   - Attestors submit encrypted data to the smart contract
   - Contract emits events when attestations are submitted
   - Contract emits event when all required attestations are received

3. **Verification Phase**:
   - SP1 program executes homomorphic operations on encrypted data
   - SP1 generates a ZK proof that operations were performed correctly
   - Admin submits verification result with ZK proof to the contract
   - Contract emits event when verification result is submitted

4. **Result Phase**:
   - Anyone can query the contract to see verification results
   - Results show if the exchange has sufficient reserves without revealing exact values

## License

MIT# epic-contracts
