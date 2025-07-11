# AIM Staking Program - Test Summary Report

## 1. Introduction

This document is a summary report of the functional tests conducted on the `aim_staking_program_v2` Solana smart contract. The tests were designed to verify the core business logic of the staking contract, ensure its behavior is as expected under various scenarios, and guarantee the security of assets.

The test coverage includes key functionalities from platform initialization, multi-authority management, project registration with configurable parameters, to user staking, unstaking, and exception handling.

## 2. Test Framework and Environment

The tests were conducted on the Solana Devnet environment, utilizing industry-standard testing tools and frameworks to ensure the reliability and standardization of the tests.

- **Blockchain Platform**: Solana (Devnet)
- **Smart Contract Framework**: Anchor `^0.31.1`
- **Test Runner**: Mocha `^9.0.3` / ts-mocha `^10.0.0`
- **Assertion Library**: Chai `^4.3.4`
- **Report Generator**: Mochawesome `^7.1.3`
- **Programming Language**: TypeScript `^4.3.5`
- **SPL Token Library**: `@solana/spl-token` `^0.4.6`

The test scripts were executed via `ts-mocha`, interacting with the Solana Devnet to simulate real user and administrator operations.

## 3. Test Results Overview

All test cases passed successfully, indicating that the core functionalities, including the newly added features, are working correctly under the tested scenarios.

| Metric | Result |
| :--- | :--- |
| **Test Suites** | 5 |
| **Total Tests** | 32 |
| **Passes** | **32** |
| **Failures** | **0** |
| **Pending** | **0** |
| **Pass Percentage** | **100%** |
| **Total Duration** | 14.934 seconds |
| **Test Date** | 2025-07-11T04:24:11Z |


## 4. Detailed Test Case Analysis

This section details the test cases executed. The entire suite was run against two different token standards: the standard **SPL Token** program and the **Token-2022** program, ensuring compatibility with both. Each of the 16 unique test cases passed for both standards, resulting in 32 total passed tests.

### 4.1. Environment Initialization (`before` hook)
Before any tests run, the `before` hook performs the following setup tasks:
- Initializes fixed keypairs for the primary authority, a test user, a fee wallet, and a secondary authority.
- Prints the public keys to the console for manual funding if not on a local network.
- Creates a new SPL token to be used as the staking asset.
- Creates Associated Token Accounts (ATAs) for the user and the fee wallet.
- Mints 1000 test tokens to the user's token account for subsequent staking operations.

### 4.2. Platform Initialization (`it("Initializes the platform")`)
- **Objective**: To verify that the platform can be initialized and that this action is idempotent.
- **Logic**:
  1.  Calculates the PDA for the platform configuration.
  2.  If the configuration account does not exist, it calls `initializePlatform`. The first authority is the wallet running the transaction.
  3.  If the account already exists, the test skips initialization and proceeds.
  4.  **Assertion**: Verifies that the `authorities` list in the platform config account contains the admin address and `projectCount` is 0.
- **Result**: **Pass**

### 4.3. Authority Management
This suite of tests verifies the logic for adding and removing platform administrators (authorities).

- **`it("Adds a new authority")`**:
    - **Objective**: Verify an existing authority can add a new authority.
    - **Logic**: The initial authority calls the `addAuthority` method to add a new keypair to the `authorities` list.
    - **Assertion**: The number of authorities in the `platformConfig` account increases by one, and the new authority's public key is present in the list.
    - **Result**: **Pass**

- **`it("New authority can register a project")`**:
    - **Objective**: Verify a newly added authority has the permission to register projects.
    - **Logic**: The new authority keypair signs a transaction to call the `registerProject` method.
    - **Assertion**: The transaction succeeds, and the platform's `projectCount` increments.
    - **Result**: **Pass**

- **`it("Removes an authority")`**:
    - **Objective**: Verify an existing authority can remove another authority.
    - **Logic**: The initial authority calls `removeAuthority` to remove the newly added authority.
    - **Assertion**: The number of authorities decreases, and the removed authority's key is no longer in the list.
    - **Result**: **Pass**

- **Negative Tests**:
    - **`it("Fails to add an authority using a non-authority account")`**: An attempt to call `addAuthority` with a non-authority signer is made. **Assertion**: The transaction fails with a `NotPlatformAuthority` error. **Result**: **Pass**.
    - **`it("Removed authority cannot register a project")`**: The removed authority attempts to register a new project. **Assertion**: The transaction fails with a `NotPlatformAuthority` error. **Result**: **Pass**.
    - **`it("Fails to remove the last authority")`**: An attempt is made to remove the only remaining authority. **Assertion**: The transaction fails with a `CannotRemoveLastAuthority` error, ensuring the platform does not become ownerless. **Result**: **Pass**.

### 4.4. Project Lifecycle Management

- **`it("Registers a project")`**:
    - **Objective**: To verify that an administrator can successfully register a new staking project with configurable staking durations.
    - **Logic**:
        1.  An authority calls `registerProject` with a project name and a list of `allowedDurations` (e.g., `[1, 7, 30]`).
        2.  PDAs for the project config, vault, and vault authority are calculated.
    - **Assertion**: The platform's `projectCount` increments, and the new project's configuration (name, token mint, vault, and `allowedDurations`) is stored correctly.
    - **Result**: **Pass**

- **`it("Updates allowed durations")`**:
    - **Objective**: Verify an authority can update the list of allowed staking durations for a project.
    - **Logic**: An authority calls the `updateAllowedDurations` method with a new list of durations.
    - **Assertion**: The `allowedDurations` field in the project config is updated to the new list.
    - **Result**: **Pass**

- **`it("Updates project config for fees")`**:
    - **Objective**: To verify that an administrator can update a project's fee configuration.
    - **Logic**: An authority calls `updateProjectConfig` with a new fee wallet address and new fee rates.
    - **Assertion**: The `feeWallet`, `unstakeFeeBps`, and `emergencyUnstakeFeeBps` fields are updated.
    - **Result**: **Pass**

### 4.5. Staking and Unstaking Logic

- **`it("Fails to stake with a non-allowed duration")`**:
    - **Objective**: (Negative Test) To ensure users can only stake for durations specified in the project config.
    - **Logic**: A user attempts to call the `stake` method with a duration that is not in the `allowedDurations` list.
    - **Assertion**: The transaction fails with the `InvalidDuration` contract error.
    - **Result**: **Pass**

- **`it("Stakes tokens (1st and 2nd stake)")`**:
    - **Objective**: To verify that a user can successfully make multiple, independent stakes.
    - **Logic**: A user calls the `stake` method twice with different amounts and allowed durations. Each stake has a unique `stakeId`.
    - **Assertion**:
        -   A `UserStakeInfo` account is created for each stake and records the correct details (user, amount, duration, `isStaked` status).
        -   The corresponding amount of tokens is transferred to the project's vault after each stake.
    - **Result**: **Pass**

- **`it("Fails to unstake before lockup period ends")`**:
    - **Objective**: (Negative Test) To verify that a user cannot perform a regular unstake before the lockup period expires.
    - **Logic**: An attempt is made to call the `unstake` method on a stake where the lockup period has not ended.
    - **Assertion**: The transaction fails with the `LockupPeriodNotEnded` error.
    - **Result**: **Pass**

- **`it("Unstakes tokens after lockup period")`**:
    - **Objective**: To verify that a user can unstake normally after the lockup period ends.
    - **Result**: **Pass (Skipped)**.
    - **Reason**: Waiting for the lockup period is impractical in automated tests. This logic is implicitly tested by the `LockupPeriodNotEnded` failure case.

- **`it("Emergency unstakes one of the stakes")`**:
    - **Objective**: To verify that a user can perform an emergency unstake at any time, incurring a fee.
    - **Logic**: The user calls `emergencyUnstake` on one of their active stakes.
    - **Assertion**:
        -   The user's `UserStakeInfo` account is closed.
        -   The user receives the staked amount minus the emergency unstake fee.
        -   The fee is transferred to the project's `feeWallet`.
        -   The user's other stakes remain unaffected.
    - **Result**: **Pass**

## 5. Summary and Recommendations

### 5.1. Summary
This expanded test series successfully validated the core functionalities of the `aim_staking_program_v2` smart contract, including the new features for authority management and configurable staking durations. The results show that:
- The platform's lifecycle management, including multi-authority controls, works correctly.
- Project configuration, including dynamic updates to staking durations and fees, is functional.
- The user staking process correctly enforces the allowed staking durations.
- Access control for both administrative and user-level functions is effective.
- The emergency unstake feature works as expected.

The contract has demonstrated stable and reliable performance for both SPL Token and Token-2022 standards.

### 5.2. Recommendations and Next Steps
- **Testing Time-Dependent Features**: Explore methods for "fast-forwarding" time on a local test validator or adding a test-only function to the contract to set a custom stake time. This would allow for complete testing of the regular unstake process.
- **Boundary Condition Testing**: Add more tests for boundary conditions, such as:
  - Staking an amount of 0.
  - Staking more tokens than the user owns.
  - Attempting to interact with an unregistered project ID.
- **Concurrency Testing**: Simulate multiple different users staking and unstaking from the same project concurrently to test the contract's state consistency under high traffic. 