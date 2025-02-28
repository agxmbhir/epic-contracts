// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AttestationPlatform
 * @dev A platform for financial exchanges to prove their reserves exceed liabilities without
 * revealing exact values using homomorphic encryption and zero-knowledge proofs.
 */
contract AttestationPlatform is Ownable {
    struct Attestor {
        address addr;
        string name;
        bool isRegistered;
    }

    struct Attestation {
        address attestor;
        bytes encryptedData;
        uint256 timestamp;
    }

    struct VerificationRule {
        string description;
        bytes ruleData;
    }

    struct VerificationResult {
        bool passed;
        bytes proofData;
        uint256 timestamp;
    }

    // Required number of attestors for a complete attestation period
    uint256 public requiredAttestorCount;
    
    // Mapping of registered attestors
    mapping(address => Attestor) public attestors;
    
    // Array of attestor addresses for enumeration
    address[] public attestorAddresses;
    
    // Current attestation period
    uint256 public currentPeriodId = 0;
    
    // Mapping from period ID to attestations
    mapping(uint256 => mapping(address => Attestation)) public attestations;
    
    // Mapping from period ID to attestor addresses that have submitted
    mapping(uint256 => address[]) public periodAttestors;
    
    // Verification rules
    VerificationRule[] public verificationRules;
    
    // Verification results by period
    mapping(uint256 => VerificationResult) public verificationResults;

    // Events
    event AttestorRegistered(address indexed attestor, string name);
    event AttestationSubmitted(uint256 indexed periodId, address indexed attestor, uint256 timestamp);
    event AttestationPeriodComplete(uint256 indexed periodId, uint256 attestorCount);
    event VerificationRuleAdded(uint256 indexed ruleId, string description);
    event VerificationResultSubmitted(uint256 indexed periodId, bool passed, uint256 timestamp);

    /**
     * @dev Constructor
     * @param _requiredAttestorCount Number of attestors required for a complete attestation period
     */
    constructor(uint256 _requiredAttestorCount) Ownable(msg.sender) {
        requiredAttestorCount = _requiredAttestorCount;
    }

    /**
     * @dev Register an attestor
     * @param _attestor Address of the attestor
     * @param _name Name or identifier of the attestor (e.g., "Exchange A", "Regulator B")
     */
    function registerAttestor(address _attestor, string memory _name) external onlyOwner {
        require(!attestors[_attestor].isRegistered, "Attestor already registered");
        
        attestors[_attestor] = Attestor({
            addr: _attestor,
            name: _name,
            isRegistered: true
        });
        
        attestorAddresses.push(_attestor);
        
        emit AttestorRegistered(_attestor, _name);
    }

    /**
     * @dev Submit an attestation
     * @param _encryptedData Encrypted attestation data
     */
    function submitAttestation(bytes calldata _encryptedData) external {
        require(attestors[msg.sender].isRegistered, "Sender is not a registered attestor");
        require(attestations[currentPeriodId][msg.sender].timestamp == 0, "Attestor already submitted for this period");
        
        attestations[currentPeriodId][msg.sender] = Attestation({
            attestor: msg.sender,
            encryptedData: _encryptedData,
            timestamp: block.timestamp
        });
        
        periodAttestors[currentPeriodId].push(msg.sender);
        
        emit AttestationSubmitted(currentPeriodId, msg.sender, block.timestamp);
        
        // Check if attestation period is complete
        if (periodAttestors[currentPeriodId].length >= requiredAttestorCount) {
            emit AttestationPeriodComplete(currentPeriodId, periodAttestors[currentPeriodId].length);
        }
    }
    
    /**
     * @dev Submit an attestation on behalf of a registered attestor (admin only)
     * @param _attestor Address of the attestor to submit for
     * @param _encryptedData Encrypted attestation data
     */
    function submitAttestationFor(address _attestor, bytes calldata _encryptedData) external onlyOwner {
        require(attestors[_attestor].isRegistered, "Address is not a registered attestor");
        require(attestations[currentPeriodId][_attestor].timestamp == 0, "Attestor already submitted for this period");
        
        attestations[currentPeriodId][_attestor] = Attestation({
            attestor: _attestor,
            encryptedData: _encryptedData,
            timestamp: block.timestamp
        });
        
        periodAttestors[currentPeriodId].push(_attestor);
        
        emit AttestationSubmitted(currentPeriodId, _attestor, block.timestamp);
        
        // Check if attestation period is complete
        if (periodAttestors[currentPeriodId].length >= requiredAttestorCount) {
            emit AttestationPeriodComplete(currentPeriodId, periodAttestors[currentPeriodId].length);
        }
    }
    
    /**
     * @dev Add verification rule
     * @param _description Description of the rule
     * @param _ruleData Encoded rule data
     */
    function addVerificationRule(string memory _description, bytes calldata _ruleData) external onlyOwner {
        verificationRules.push(VerificationRule({
            description: _description,
            ruleData: _ruleData
        }));
        
        emit VerificationRuleAdded(verificationRules.length - 1, _description);
    }
    
    /**
     * @dev Submit verification result
     * @param _periodId Period ID
     * @param _passed Whether verification passed
     * @param _proofData ZK proof data
     */
    function submitVerificationResult(uint256 _periodId, bool _passed, bytes calldata _proofData) external onlyOwner {
        require(periodAttestors[_periodId].length >= requiredAttestorCount, "Attestation period not complete");
        require(verificationResults[_periodId].timestamp == 0, "Verification result already submitted");
        
        verificationResults[_periodId] = VerificationResult({
            passed: _passed,
            proofData: _proofData,
            timestamp: block.timestamp
        });
        
        emit VerificationResultSubmitted(_periodId, _passed, block.timestamp);
        
        // Start a new period
        if (_periodId == currentPeriodId) {
            currentPeriodId++;
        }
    }
    
    /**
     * @dev Get the number of attestors registered
     */
    function getAttestorCount() external view returns (uint256) {
        return attestorAddresses.length;
    }
    
    /**
     * @dev Get the number of attestors for a period
     * @param _periodId Period ID
     */
    function getPeriodAttestorCount(uint256 _periodId) external view returns (uint256) {
        return periodAttestors[_periodId].length;
    }
    
    /**
     * @dev Get verification rule count
     */
    function getVerificationRuleCount() external view returns (uint256) {
        return verificationRules.length;
    }
    
    /**
     * @dev Get attestation for a specific attestor in a period
     * @param _periodId Period ID
     * @param _attestor Attestor address
     */
    function getAttestation(uint256 _periodId, address _attestor) external view returns (Attestation memory) {
        return attestations[_periodId][_attestor];
    }
    
    /**
     * @dev Force start a new attestation period
     * Only callable by owner, useful if current period will never get enough attestations
     */
    function startNewPeriod() external onlyOwner {
        currentPeriodId++;
    }
}