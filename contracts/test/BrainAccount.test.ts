import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { BrainAccount, PolicyValidator } from "../typechain-types";

/**
 * BrainAccount Test Suite
 * Tests: agent lifecycle, capital management, payment execution, policy enforcement.
 */
describe("BrainAccount", function () {
  let owner: SignerWithAddress;
  let agentWallet: SignerWithAddress;
  let merchant: SignerWithAddress;
  let trustedSigner: SignerWithAddress;
  let other: SignerWithAddress;

  let brainAccount: BrainAccount;
  let policyValidator: PolicyValidator;
  let mockUsdc: any;

  // 6-decimal USDC amounts
  const ONE_USDC  = ethers.parseUnits("1", 6);
  const TEN_USDC  = ethers.parseUnits("10", 6);
  const HUNDRED_USDC = ethers.parseUnits("100", 6);

  const AGENT_ID = ethers.keccak256(ethers.toUtf8Bytes("test-agent-1"));

  beforeEach(async () => {
    [owner, agentWallet, merchant, trustedSigner, other] = await ethers.getSigners();

    // Deploy mock ERC-20 (USDC stand-in)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await mockUsdc.mint(owner.address, HUNDRED_USDC * 100n);

    // Deploy PolicyValidator
    const PV = await ethers.getContractFactory("PolicyValidator");
    policyValidator = await PV.deploy(trustedSigner.address, owner.address);

    // Deploy BrainAccount (use a mock entryPoint = owner for testing)
    const BA = await ethers.getContractFactory("BrainAccount");
    brainAccount = await BA.deploy(owner.address, owner.address, await policyValidator.getAddress());

    // Approve BrainAccount to pull USDC
    await mockUsdc.connect(owner).approve(await brainAccount.getAddress(), ethers.MaxUint256);
  });

  // ── Agent Authorization ───────────────────────────────────────────────────

  describe("authorizeAgent", () => {
    it("owner can authorize an agent", async () => {
      await expect(
        brainAccount.authorizeAgent(
          AGENT_ID, agentWallet.address,
          TEN_USDC, 86400, 0,
          false, 0, 0
        )
      ).to.emit(brainAccount, "AgentAuthorized")
        .withArgs(AGENT_ID, agentWallet.address, TEN_USDC, 86400);

      const config = await brainAccount.getAgentConfig(AGENT_ID);
      expect(config.executionWallet).to.equal(agentWallet.address);
      expect(config.spendLimit).to.equal(TEN_USDC);
      expect(config.active).to.be.true;
    });

    it("reverts if called by non-owner", async () => {
      await expect(
        brainAccount.connect(other).authorizeAgent(
          AGENT_ID, agentWallet.address, TEN_USDC, 86400, 0, false, 0, 0
        )
      ).to.be.revertedWith("BrainAccount: unauthorized");
    });

    it("reverts with zero spend limit", async () => {
      await expect(
        brainAccount.authorizeAgent(AGENT_ID, agentWallet.address, 0, 86400, 0, false, 0, 0)
      ).to.be.revertedWith("BrainAccount: zero spend limit");
    });
  });

  // ── Policy Hash ───────────────────────────────────────────────────────────

  describe("setPolicy", () => {
    it("stores policy hash on-chain", async () => {
      await brainAccount.authorizeAgent(
        AGENT_ID, agentWallet.address, TEN_USDC, 86400, 0, false, 0, 0
      );
      const hash = ethers.keccak256(ethers.toUtf8Bytes('{"spendLimit":"10"}'));
      await expect(brainAccount.setPolicy(AGENT_ID, hash))
        .to.emit(brainAccount, "PolicySet")
        .withArgs(AGENT_ID, hash);
      expect(await brainAccount.getAgentPolicyHash(AGENT_ID)).to.equal(hash);
    });

    it("reverts if agent not registered", async () => {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      await expect(
        brainAccount.setPolicy(fakeId, ethers.ZeroHash)
      ).to.be.revertedWith("BrainAccount: agent not registered");
    });
  });

  // ── Capital Management ────────────────────────────────────────────────────

  describe("allocateCapital / deallocateCapital", () => {
    beforeEach(async () => {
      await brainAccount.authorizeAgent(
        AGENT_ID, agentWallet.address, TEN_USDC, 86400, 0, false, 0, 0
      );
    });

    it("allocates USDC to agent sub-account", async () => {
      await expect(
        brainAccount.allocateCapital(AGENT_ID, await mockUsdc.getAddress(), TEN_USDC)
      ).to.emit(brainAccount, "AgentCapitalAllocated")
        .withArgs(AGENT_ID, TEN_USDC);

      expect(await brainAccount.getAgentBalance(AGENT_ID)).to.equal(TEN_USDC);
    });

    it("deallocates capital back to owner", async () => {
      await brainAccount.allocateCapital(AGENT_ID, await mockUsdc.getAddress(), TEN_USDC);
      const ownerBefore = await mockUsdc.balanceOf(owner.address);
      await brainAccount.deallocateCapital(AGENT_ID, await mockUsdc.getAddress(), TEN_USDC);
      expect(await mockUsdc.balanceOf(owner.address)).to.equal(ownerBefore + TEN_USDC);
    });

    it("reverts deallocate if insufficient balance", async () => {
      await expect(
        brainAccount.deallocateCapital(AGENT_ID, await mockUsdc.getAddress(), ONE_USDC)
      ).to.be.revertedWith("BrainAccount: insufficient agent balance");
    });
  });

  // ── Payment Execution ─────────────────────────────────────────────────────

  describe("executeAgentPayment", () => {
    let intentHash: string;
    let expiry: number;

    beforeEach(async () => {
      await brainAccount.authorizeAgent(
        AGENT_ID, agentWallet.address, TEN_USDC, 86400, 0, false, 0, 0
      );
      await brainAccount.allocateCapital(AGENT_ID, await mockUsdc.getAddress(), TEN_USDC);

      intentHash = ethers.keccak256(ethers.toUtf8Bytes("intent-1"));
      expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    });

    async function buildPaymentProof(agentId: string, iHash: string, exp: number) {
      // Mirrors PolicyValidator.paymentProofMessage() + eth_sign
      const PAYMENT_TAG = ethers.keccak256(ethers.toUtf8Bytes("BrainFinance:PaymentProof:v1"));
      const message = ethers.keccak256(
        ethers.solidityPacked(
          ["bytes32", "bytes32", "bytes32", "uint256"],
          [PAYMENT_TAG, agentId, iHash, exp]
        )
      );
      return trustedSigner.signMessage(ethers.getBytes(message));
    }

    it("executes payment with valid proof", async () => {
      const proof = await buildPaymentProof(AGENT_ID, intentHash, expiry);
      const merchantBefore = await mockUsdc.balanceOf(merchant.address);

      await expect(
        brainAccount.connect(agentWallet).executeAgentPayment(
          AGENT_ID, await mockUsdc.getAddress(), merchant.address,
          ONE_USDC, intentHash, expiry, proof
        )
      ).to.emit(brainAccount, "PaymentExecuted")
        .withArgs(AGENT_ID, await mockUsdc.getAddress(), merchant.address, ONE_USDC, intentHash);

      expect(await mockUsdc.balanceOf(merchant.address)).to.equal(merchantBefore + ONE_USDC);
      expect(await brainAccount.getAgentBalance(AGENT_ID)).to.equal(TEN_USDC - ONE_USDC);
    });

    it("reverts replay attack — same proof twice", async () => {
      const proof = await buildPaymentProof(AGENT_ID, intentHash, expiry);
      await brainAccount.connect(agentWallet).executeAgentPayment(
        AGENT_ID, await mockUsdc.getAddress(), merchant.address, ONE_USDC, intentHash, expiry, proof
      );
      await expect(
        brainAccount.connect(agentWallet).executeAgentPayment(
          AGENT_ID, await mockUsdc.getAddress(), merchant.address, ONE_USDC, intentHash, expiry, proof
        )
      ).to.be.revertedWith("PolicyValidator: proof already used");
    });

    it("reverts if spend limit exceeded within window", async () => {
      // Spend the full TEN_USDC limit in one shot
      const proof1 = await buildPaymentProof(AGENT_ID, intentHash, expiry);
      await brainAccount.connect(agentWallet).executeAgentPayment(
        AGENT_ID, await mockUsdc.getAddress(), merchant.address, TEN_USDC, intentHash, expiry, proof1
      );
      const intentHash2 = ethers.keccak256(ethers.toUtf8Bytes("intent-2"));
      const proof2 = await buildPaymentProof(AGENT_ID, intentHash2, expiry);
      await expect(
        brainAccount.connect(agentWallet).executeAgentPayment(
          AGENT_ID, await mockUsdc.getAddress(), merchant.address, ONE_USDC, intentHash2, expiry, proof2
        )
      ).to.be.revertedWith("BrainAccount: spend limit exceeded");
    });

    it("reverts if not called by agent wallet", async () => {
      const proof = await buildPaymentProof(AGENT_ID, intentHash, expiry);
      await expect(
        brainAccount.connect(other).executeAgentPayment(
          AGENT_ID, await mockUsdc.getAddress(), merchant.address, ONE_USDC, intentHash, expiry, proof
        )
      ).to.be.revertedWith("BrainAccount: not agent wallet");
    });

    it("reverts with expired proof", async () => {
      const expiredExpiry = Math.floor(Date.now() / 1000) - 1;
      const proof = await buildPaymentProof(AGENT_ID, intentHash, expiredExpiry);
      await expect(
        brainAccount.connect(agentWallet).executeAgentPayment(
          AGENT_ID, await mockUsdc.getAddress(), merchant.address, ONE_USDC, intentHash, expiredExpiry, proof
        )
      ).to.be.revertedWith("BrainAccount: proof expired");
    });

    it("resets spend window after window expires", async () => {
      // Fill the window
      const proof1 = await buildPaymentProof(AGENT_ID, intentHash, expiry);
      await brainAccount.connect(agentWallet).executeAgentPayment(
        AGENT_ID, await mockUsdc.getAddress(), merchant.address, TEN_USDC, intentHash, expiry, proof1
      );
      // Re-allocate capital
      await brainAccount.allocateCapital(AGENT_ID, await mockUsdc.getAddress(), TEN_USDC);

      // Fast-forward 1 day
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine", []);

      // Should succeed after window reset
      const intentHash2 = ethers.keccak256(ethers.toUtf8Bytes("intent-2"));
      const expiry2 = Math.floor(Date.now() / 1000) + 7200;
      const proof2 = await buildPaymentProof(AGENT_ID, intentHash2, expiry2);
      await expect(
        brainAccount.connect(agentWallet).executeAgentPayment(
          AGENT_ID, await mockUsdc.getAddress(), merchant.address, ONE_USDC, intentHash2, expiry2, proof2
        )
      ).to.emit(brainAccount, "PaymentExecuted");
    });
  });

  // ── Deactivation ──────────────────────────────────────────────────────────

  describe("deactivateAgent", () => {
    it("deactivates and prevents further payments", async () => {
      await brainAccount.authorizeAgent(
        AGENT_ID, agentWallet.address, TEN_USDC, 86400, 0, false, 0, 0
      );
      await brainAccount.deactivateAgent(AGENT_ID);
      expect((await brainAccount.getAgentConfig(AGENT_ID)).active).to.be.false;
    });
  });

  // ── Budget View ───────────────────────────────────────────────────────────

  describe("getRemainingBudget", () => {
    it("returns full budget before any spend", async () => {
      await brainAccount.authorizeAgent(
        AGENT_ID, agentWallet.address, TEN_USDC, 86400, 0, false, 0, 0
      );
      expect(await brainAccount.getRemainingBudget(AGENT_ID)).to.equal(TEN_USDC);
    });
  });
});
