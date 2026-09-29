// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title P2P Lending Escrow
/// @notice Holds a lender's principal in escrow until the borrower repays it with interest.
/// @dev Risk scores are attested by a trusted oracle role; they are never self-reported by the borrower.
contract P2PLendingEscrow is AccessControl, Pausable, ReentrancyGuard {
    uint256 private constant RATE_SCALE = 1e18;
    uint256 private constant BASIS_POINTS = 10_000;
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    uint256 private constant TIER_ONE_MIN_RM = 500 * RATE_SCALE;
    uint256 private constant TIER_ONE_MAX_RM = 3_000 * RATE_SCALE;
    uint256 private constant TIER_TWO_MIN_RM = 3_001 * RATE_SCALE;
    uint256 private constant TIER_TWO_MAX_RM = 15_000 * RATE_SCALE;

    uint256 private constant MAX_INTEREST_RATE_BPS = 5_000; // 50% APR sanity cap
    uint256 private constant MIN_DURATION = 1 days;
    uint256 private constant MAX_DURATION = 3_650 days;

    /// @dev Sentinel held in `riskScore` until the oracle submits a real assessment.
    uint64 private constant PENDING_RISK_SCORE = type(uint64).max;

    bytes32 public constant DEFAULT_MANAGER_ROLE = keccak256("DEFAULT_MANAGER_ROLE");
    bytes32 public constant RISK_ORACLE_ROLE = keccak256("RISK_ORACLE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    enum LoanTier {
        Tier1,
        Tier2
    }

    enum LoanState {
        Requested,
        Active,
        Repaid,
        Defaulted
    }

    /// @dev Field order and widths are chosen so the struct occupies 5 storage slots instead of 10.
    struct Loan {
        uint256 id;
        address borrower;
        LoanState state;
        address lender;
        uint96 principal;
        uint32 interestRate;
        uint40 duration;
        uint40 startTime;
        uint64 riskScore;
        bytes32 riskHash;
    }

    error InvalidExchangeRate();
    error InvalidLoanAmount(uint256 amount);
    error InvalidInterestRate(uint256 interestRate);
    error InvalidDuration(uint256 duration);
    error InvalidRiskScore(uint256 riskScore);
    error InvalidLoanId(uint256 loanId);
    error InvalidLoanState(uint256 loanId, LoanState state);
    error BorrowerCannotFundOwnLoan(uint256 loanId);
    error BorrowerOnly(uint256 loanId, address caller);
    error RiskAssessmentPending(uint256 loanId);
    error RiskAssessmentAlreadySubmitted(uint256 loanId);
    error IncorrectFundingAmount(uint256 expected, uint256 received);
    error IncorrectRepaymentAmount(uint256 expected, uint256 received);
    error LoanNotPastDue(uint256 loanId);
    error TransferFailed(address recipient, uint256 amount);

    uint256 public immutable rmPerEth;
    uint256 public loanCount;
    mapping(uint256 => Loan) public loans;

    event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 principal, LoanTier tier);
    event RiskAssessed(uint256 indexed loanId, uint256 riskScore, bytes32 riskHash);
    event LoanFunded(uint256 indexed loanId, address indexed lender, uint256 principal);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event LoanDefaulted(uint256 indexed loanId);

    constructor(uint256 rmPerEth_) {
        if (rmPerEth_ == 0) revert InvalidExchangeRate();
        rmPerEth = rmPerEth_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DEFAULT_MANAGER_ROLE, msg.sender);
        _grantRole(RISK_ORACLE_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    /// @dev Reverts unless `principal`'s RM-equivalent value falls within the bounds for `tier`.
    modifier withinTierCap(uint256 principal, LoanTier tier) {
        (uint256 minRm, uint256 maxRm) = _tierBounds(tier);
        uint256 rmValue = _rmEquivalent(principal);
        if (rmValue < minRm || rmValue > maxRm) revert InvalidLoanAmount(principal);
        _;
    }

    /// @notice Opens a loan request for the caller. Funding requires a prior risk assessment.
    function requestLoan(
        uint256 principal,
        uint256 interestRate,
        uint256 duration,
        LoanTier tier
    ) external whenNotPaused withinTierCap(principal, tier) returns (uint256 loanId) {
        if (principal > type(uint96).max) revert InvalidLoanAmount(principal);
        if (interestRate > MAX_INTEREST_RATE_BPS) revert InvalidInterestRate(interestRate);
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidDuration(duration);

        loanId = ++loanCount;
        loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            state: LoanState.Requested,
            lender: address(0),
            principal: uint96(principal),
            interestRate: uint32(interestRate),
            duration: uint40(duration),
            startTime: 0,
            riskScore: PENDING_RISK_SCORE,
            riskHash: bytes32(0)
        });

        emit LoanRequested(loanId, msg.sender, principal, tier);
    }

    /// @notice Records the off-chain AI risk assessment for a requested loan.
    /// @param riskHash Cryptographic commitment to the off-chain risk payload; never raw applicant data.
    function submitRiskAssessment(
        uint256 loanId,
        uint256 riskScore,
        bytes32 riskHash
    ) external onlyRole(RISK_ORACLE_ROLE) {
        Loan storage loan = _getLoan(loanId);
        if (loan.state != LoanState.Requested) revert InvalidLoanState(loanId, loan.state);
        if (loan.riskScore != PENDING_RISK_SCORE) revert RiskAssessmentAlreadySubmitted(loanId);
        if (riskScore > RATE_SCALE) revert InvalidRiskScore(riskScore);

        loan.riskScore = uint64(riskScore);
        loan.riskHash = riskHash;

        emit RiskAssessed(loanId, riskScore, riskHash);
    }

    /// @notice Funds a requested loan with the exact principal amount and forwards it to the borrower.
    function fundLoan(uint256 loanId) external payable whenNotPaused nonReentrant {
        Loan storage loan = _getLoan(loanId);
        if (loan.state != LoanState.Requested) revert InvalidLoanState(loanId, loan.state);
        if (loan.riskScore == PENDING_RISK_SCORE) revert RiskAssessmentPending(loanId);
        if (msg.sender == loan.borrower) revert BorrowerCannotFundOwnLoan(loanId);
        if (msg.value != loan.principal) revert IncorrectFundingAmount(loan.principal, msg.value);

        address borrower = loan.borrower;
        uint256 principal = loan.principal;

        loan.lender = msg.sender;
        loan.startTime = uint40(block.timestamp);
        loan.state = LoanState.Active;

        (bool sent, ) = payable(borrower).call{value: principal}("");
        if (!sent) revert TransferFailed(borrower, principal);

        emit LoanFunded(loanId, msg.sender, principal);
    }

    /// @notice Repays an active loan in full; principal plus interest is forwarded to the lender.
    function repayLoan(uint256 loanId) external payable whenNotPaused nonReentrant {
        Loan storage loan = _getLoan(loanId);
        if (loan.state != LoanState.Active) revert InvalidLoanState(loanId, loan.state);
        if (msg.sender != loan.borrower) revert BorrowerOnly(loanId, msg.sender);

        uint256 amountDue = _repaymentAmount(loan);
        if (msg.value != amountDue) revert IncorrectRepaymentAmount(amountDue, msg.value);

        address lender = loan.lender;
        loan.state = LoanState.Repaid;

        (bool sent, ) = payable(lender).call{value: amountDue}("");
        if (!sent) revert TransferFailed(lender, amountDue);

        emit LoanRepaid(loanId, msg.sender, amountDue);
    }

    /// @notice Marks an active loan as defaulted once its duration has elapsed without repayment.
    function markDefaulted(uint256 loanId) external onlyRole(DEFAULT_MANAGER_ROLE) {
        Loan storage loan = _getLoan(loanId);
        if (loan.state != LoanState.Active) revert InvalidLoanState(loanId, loan.state);
        if (block.timestamp < loan.startTime + loan.duration) revert LoanNotPastDue(loanId);

        loan.state = LoanState.Defaulted;
        emit LoanDefaulted(loanId);
    }

    /// @notice Pauses loan requests, funding, and repayments in an emergency.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resumes normal operation after a pause.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Returns the total wei owed (principal + accrued interest) for a loan.
    function repaymentAmount(uint256 loanId) external view returns (uint256) {
        return _repaymentAmount(_getLoan(loanId));
    }

    function _tierBounds(LoanTier tier) private pure returns (uint256 minRm, uint256 maxRm) {
        if (tier == LoanTier.Tier1) return (TIER_ONE_MIN_RM, TIER_ONE_MAX_RM);
        return (TIER_TWO_MIN_RM, TIER_TWO_MAX_RM);
    }

    function _rmEquivalent(uint256 principal) private view returns (uint256) {
        return Math.mulDiv(principal, rmPerEth, 1 ether);
    }

    function _repaymentAmount(Loan storage loan) private view returns (uint256) {
        uint256 principal = loan.principal;
        uint256 yearlyInterest = Math.mulDiv(principal, loan.interestRate, BASIS_POINTS);
        uint256 interest = Math.mulDiv(yearlyInterest, loan.duration, SECONDS_PER_YEAR);
        return principal + interest;
    }

    function _getLoan(uint256 loanId) private view returns (Loan storage loan) {
        if (loanId == 0 || loanId > loanCount) revert InvalidLoanId(loanId);
        return loans[loanId];
    }
}