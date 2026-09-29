import { expect } from "chai";
import { network } from "hardhat";
import { beforeEach, describe, it } from "mocha";

describe("P2PLendingEscrow", function () {
  let ethers;
  let owner;
  let borrower;
  let lender;
  let escrow;

  const rmPerEth = 10_000n * 10n ** 18n;
  const principal = 100_000_000_000_000_000n;
  const annualInterestRate = 1_200n;
  const duration = 365n * 24n * 60n * 60n;
  const riskScore = 200_000_000_000_000_000n;
  const riskHash = "0x" + "11".repeat(32);

  beforeEach(async function () {
    const connection = await network.create();
    ethers = connection.ethers;
    [owner, borrower, lender] = await ethers.getSigners();

    const escrowFactory = await ethers.getContractFactory("P2PLendingEscrow");
    escrow = await escrowFactory.deploy(rmPerEth);
    await escrow.waitForDeployment();
  });

  it("funds a requested loan and repays principal plus annual interest", async function () {
    await escrow
      .connect(borrower)
      .requestLoan(principal, annualInterestRate, duration, 0);

    const loanId = await escrow.loanCount();
    await escrow
      .connect(owner)
      .submitRiskAssessment(loanId, riskScore, riskHash);

    const borrowerBalanceBefore = await ethers.provider.getBalance(
      borrower.address,
    );

    await escrow.connect(lender).fundLoan(loanId, { value: principal });

    const borrowerBalanceAfterFunding = await ethers.provider.getBalance(
      borrower.address,
    );
    expect(borrowerBalanceAfterFunding - borrowerBalanceBefore).to.equal(
      principal,
    );

    const activeLoan = await escrow.loans(loanId);
    expect(activeLoan.lender).to.equal(lender.address);
    expect(activeLoan.state).to.equal(1n);

    const amountDue = await escrow.repaymentAmount(loanId);
    expect(amountDue).to.equal(112_000_000_000_000_000n);

    const lenderBalanceBefore = await ethers.provider.getBalance(
      lender.address,
    );
    await escrow.connect(borrower).repayLoan(loanId, { value: amountDue });
    const lenderBalanceAfter = await ethers.provider.getBalance(lender.address);

    expect(lenderBalanceAfter - lenderBalanceBefore).to.equal(amountDue);
    const repaidLoan = await escrow.loans(loanId);
    expect(repaidLoan.state).to.equal(2n);
  });

  it("accepts the Tier 2 lower boundary at RM 3,001 equivalent", async function () {
    const tierTwoPrincipal = 300_100_000_000_000_000n;

    await escrow
      .connect(borrower)
      .requestLoan(tierTwoPrincipal, annualInterestRate, duration, 1);

    expect(await escrow.loanCount()).to.equal(1n);
  });

  it("rejects funding until the risk oracle submits an assessment", async function () {
    await escrow
      .connect(borrower)
      .requestLoan(principal, annualInterestRate, duration, 0);

    const loanId = await escrow.loanCount();

    await expect(
      escrow.connect(lender).fundLoan(loanId, { value: principal }),
    ).to.be.revertedWithCustomError(escrow, "RiskAssessmentPending");
  });

  it("blocks new loan requests while paused", async function () {
    await escrow.connect(owner).pause();

    await expect(
      escrow
        .connect(borrower)
        .requestLoan(principal, annualInterestRate, duration, 0),
    ).to.be.revertedWithCustomError(escrow, "EnforcedPause");
  });
});
