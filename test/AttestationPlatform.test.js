const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AttestationPlatform", function () {
  let attestationPlatform;
  let owner, exchange, regulator, other;
  const requiredAttestorCount = 2;

  beforeEach(async function () {
    // Get signers
    [owner, exchange, regulator, other] = await ethers.getSigners();
    
    // Deploy contract
    const AttestationPlatform = await ethers.getContractFactory("AttestationPlatform");
    attestationPlatform = await AttestationPlatform.deploy(requiredAttestorCount);
  });

  describe("Deployment", function () {
    it("Should set the correct required attestor count", async function () {
      expect(await attestationPlatform.requiredAttestorCount()).to.equal(requiredAttestorCount);
    });
    
    it("Should set the owner correctly", async function () {
      expect(await attestationPlatform.owner()).to.equal(owner.address);
    });
  });
  
  describe("Attestor Registration", function () {
    it("Should register attestors correctly", async function () {
      await attestationPlatform.registerAttestor(exchange.address, "Exchange A");
      
      const attestor = await attestationPlatform.attestors(exchange.address);
      expect(attestor.addr).to.equal(exchange.address);
      expect(attestor.name).to.equal("Exchange A");
      expect(attestor.isRegistered).to.be.true;
      
      expect(await attestationPlatform.getAttestorCount()).to.equal(1);
    });
    
    it("Should prevent duplicate registration", async function () {
      await attestationPlatform.registerAttestor(exchange.address, "Exchange A");
      
      await expect(
        attestationPlatform.registerAttestor(exchange.address, "Exchange A Again")
      ).to.be.revertedWith("Attestor already registered");
    });
    
    it("Should only allow owner to register attestors", async function () {
      await expect(
        attestationPlatform.connect(other).registerAttestor(exchange.address, "Exchange A")
      ).to.be.revertedWithCustomError(attestationPlatform, "OwnableUnauthorizedAccount");
    });
  });
  
  describe("Attestation Submission", function () {
    beforeEach(async function () {
      // Register attestors
      await attestationPlatform.registerAttestor(exchange.address, "Exchange A");
      await attestationPlatform.registerAttestor(regulator.address, "Regulator B");
    });
    
    it("Should allow registered attestors to submit attestations", async function () {
      const attestationData = ethers.hexlify(ethers.randomBytes(100));
      
      await attestationPlatform.connect(exchange).submitAttestation(attestationData);
      
      const periodId = await attestationPlatform.currentPeriodId();
      const attestation = await attestationPlatform.getAttestation(periodId, exchange.address);
      
      expect(attestation.attestor).to.equal(exchange.address);
      expect(attestation.encryptedData).to.equal(attestationData);
      expect(Number(attestation.timestamp)).to.be.greaterThan(0);
    });
    
    it("Should prevent unregistered attestors from submitting", async function () {
      await expect(
        attestationPlatform.connect(other).submitAttestation("0x123456")
      ).to.be.revertedWith("Sender is not a registered attestor");
    });
    
    it("Should prevent duplicate submission for same period", async function () {
      const attestationData = ethers.hexlify(ethers.randomBytes(100));
      
      await attestationPlatform.connect(exchange).submitAttestation(attestationData);
      
      await expect(
        attestationPlatform.connect(exchange).submitAttestation(attestationData)
      ).to.be.revertedWith("Attestor already submitted for this period");
    });
    
    it("Should emit AttestationPeriodComplete when all required attestations are received", async function () {
      const exchangeData = ethers.hexlify(ethers.randomBytes(100));
      const regulatorData = ethers.hexlify(ethers.randomBytes(100));
      
      await attestationPlatform.connect(exchange).submitAttestation(exchangeData);
      
      await expect(attestationPlatform.connect(regulator).submitAttestation(regulatorData))
        .to.emit(attestationPlatform, "AttestationPeriodComplete")
        .withArgs(0, 2);
    });
  });
  
  describe("Verification", function () {
    beforeEach(async function () {
      // Register attestors
      await attestationPlatform.registerAttestor(exchange.address, "Exchange A");
      await attestationPlatform.registerAttestor(regulator.address, "Regulator B");
      
      // Submit attestations
      await attestationPlatform.connect(exchange).submitAttestation(ethers.hexlify(ethers.randomBytes(100)));
      await attestationPlatform.connect(regulator).submitAttestation(ethers.hexlify(ethers.randomBytes(100)));
    });
    
    it("Should add verification rules", async function () {
      const description = "Reserves > Liabilities";
      const ruleData = ethers.hexlify(ethers.toUtf8Bytes("reserves > liabilities"));
      
      await expect(attestationPlatform.addVerificationRule(description, ruleData))
        .to.emit(attestationPlatform, "VerificationRuleAdded")
        .withArgs(0, description);
      
      const rule = await attestationPlatform.verificationRules(0);
      expect(rule.description).to.equal(description);
      expect(rule.ruleData).to.equal(ruleData);
    });
    
    it("Should submit verification results", async function () {
      const periodId = await attestationPlatform.currentPeriodId();
      const passed = true;
      const proofData = ethers.hexlify(ethers.randomBytes(200));
      
      await expect(attestationPlatform.submitVerificationResult(periodId, passed, proofData))
        .to.emit(attestationPlatform, "VerificationResultSubmitted")
        .withArgs(periodId, passed, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
      
      const result = await attestationPlatform.verificationResults(periodId);
      expect(result.passed).to.equal(passed);
      expect(result.proofData).to.equal(proofData);
    });
    
    it("Should start a new period after verification result", async function () {
      const initialPeriodId = await attestationPlatform.currentPeriodId();
      const proofData = ethers.hexlify(ethers.randomBytes(200));
      
      await attestationPlatform.submitVerificationResult(initialPeriodId, true, proofData);
      
      const newPeriodId = await attestationPlatform.currentPeriodId();
      expect(newPeriodId).to.equal(initialPeriodId + 1n);
    });
  });
});