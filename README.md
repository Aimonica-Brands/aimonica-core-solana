# AIM Staking Program

A flexible staking program on Solana, built with Anchor.

## Features

- **Platform Initialization**: A central authority can initialize the staking platform.
- **Project Registration**: The authority can register multiple staking projects.
- **Configurable Projects**: Each project can have its own name, staking token (SPL Token or Token-2022), and vault.
- **Fee Management**: Project authority can set a separate fee wallet and configure fees for unstaking and emergency unstaking.
- **Token-2022 Support**: The program is compatible with both the standard SPL Token and the newer Token-2022 standard, allowing for a wider range of tokens to be staked.
- **Flexible Staking**: Users can stake tokens for predefined durations (e.g., 1, 7, 14, 30 days).
- **Multiple Stakes**: Users can have multiple, independent stakes within the same project.
- **Standard Unstake**: Users can withdraw their staked tokens and any rewards (if applicable, not implemented in this version) after the lock-up period, minus a small fee.
- **Emergency Unstake**: A failsafe option for users to withdraw their tokens immediately if needed, potentially incurring a higher fee and forfeiting any rewards.

## Getting Started

Follow these instructions to set up the development environment and run the project.

### 1. Environment Setup

The following tools are required:
- Rust
- Solana CLI
- Anchor Framework
- Node.js & Yarn

The recommended way to install these dependencies is by using the official Solana and Anchor installation scripts.

**On macOS and Linux:**

Run this single command in your terminal. It will install Rust, the Solana CLI, the Anchor version manager (avm), Node.js, and Yarn.

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
```

After the script finishes, restart your terminal and install the latest version of the Anchor CLI:

```bash
avm install latest
avm use latest
```

**On Windows:**

1.  Install Windows Subsystem for Linux (WSL).
2.  Open your WSL terminal (e.g., Ubuntu).
3.  Run the installation command for macOS/Linux shown above inside your WSL terminal.

For more details, refer to the [official Anchor installation guide](https://www.anchor-lang.com/docs/installation).

### 2. Project Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd aimonica-core-solana
    ```

2.  **Install project dependencies:**
    ```bash
    npm install
    ```

3.  **Build the Anchor program:**
    This command compiles the Rust code, generates the program's IDL (Interface Definition Language), and creates a new keypair for the program if one doesn't exist.
    ```bash
    anchor build
    ```

4.  **Update Program ID:**
    After the first build, a new program ID is generated. You need to update this ID in your configuration files.

    First, get the new program ID:
    ```bash
    anchor keys list
    ```
    It will output something like `aim_staking: <new-program-id>`. Copy the `<new-program-id>`.

    Next, open `Anchor.toml` and update the `aim_staking` address under `[programs.localnet]` with the new program ID.

    ```toml
    [programs.localnet]
    aim_staking_program = "<new-program-id>"
    ```

    Then, update the program ID in the source code. Open `programs/aim_staking_program/src/lib.rs` and replace the existing address in `declare_id!` with your new program ID.

    ```rust
    declare_id!("<new-program-id>");
    ```

5.  **Rebuild the program:**
    After updating the ID, rebuild the program to apply the changes.
    ```bash
    anchor build
    ```

## Usage

To test and interact with the program, you can use the following commands.

1.  **Start a local validator:**
    Open a new terminal and run:
    ```bash
    solana-test-validator
    ```
    This will start a local Solana cluster. Keep it running.

2.  **Deploy the program:**
    In your project directory terminal, deploy the compiled program to your local validator.
    ```bash
    anchor deploy
    ```

3.  **Run tests:**
    This command will build, deploy, and run the tests for your project on the local validator.
    ```bash
    anchor test
    ```

## Testing

This project uses `mocha` for testing and `mochawesome` to generate HTML reports.

### Run Tests

To execute the test suite, run the following command. This will run all tests defined in the `tests/` directory.

```bash
npm test
```

### Generate Test Report

To run the tests and generate a user-friendly HTML report, use this command:

```bash
npm run test:report
```

After the tests complete, the report will be available at `mochawesome-report/mochawesome.html`. You can open this file in your browser to view a detailed breakdown of the test results.

## Program Details

### Accounts

-   `PlatformConfig`: Singleton account to hold platform-wide configuration.
    -   `authority`: The public key with the authority to register new projects.
    -   `project_count`: A counter for the number of projects registered, used for deriving project PDAs.

-   `ProjectConfig`: Stores details for each staking project.
    -   `project_id`: A unique ID for the project.
    -   `authority`: The public key with the authority to update the project configuration (e.g., fees).
    -   `token_mint`: The mint address of the token that can be staked in this project.
    -   `token_program`: The program ID of the token standard used (SPL Token or Token-2022).
    -   `vault`: The address of the token account (PDA) that holds all staked tokens for the project.
    -   `name`: A human-readable name for the project (up to 32 characters).
    -   `fee_wallet`: The public key of the wallet that will receive unstaking fees.
    -   `unstake_fee_bps`: The fee in basis points (1/100th of 1%) charged on a normal unstake.
    -   `emergency_unstake_fee_bps`: The fee in basis points charged on an emergency unstake.

-   `UserStakeInfo`: Holds information about a user's individual stake. A user can have multiple `UserStakeInfo` accounts for a single project.
    -   `user`: The public key of the user who made the stake.
    -   `project_config`: The public key of the `ProjectConfig` this stake belongs to.
    -   `project_id`: The ID of the project.
    -   `stake_id`: A unique identifier for this specific stake, provided by the user. Allows for multiple stakes per user per project.
    -   `amount`: The amount of tokens staked.
    -   `stake_timestamp`: The Unix timestamp when the stake was created.
    -   `duration_days`: The duration of the stake in days.
    -   `is_staked`: A boolean flag indicating if the stake is currently active.

### Instructions

-   `initialize_platform()`: Initializes the `PlatformConfig` singleton. Must be called once before any other instructions.
    -   **Signer:** Platform Authority

-   `register_project(name: String)`: Creates a new `ProjectConfig` for a new staking pool.
    -   **Signer:** Platform Authority
    -   **Args:**
        -   `name`: A name for the new project (max 32 chars).

-   `update_project_config(fee_wallet: Pubkey, unstake_fee_bps: u16, emergency_unstake_fee_bps: u16)`: Updates the configuration for an existing project.
    -   **Signer:** Project Authority
    -   **Args:**
        -   `fee_wallet`: The new wallet to receive fees.
        -   `unstake_fee_bps`: The new fee for regular unstakes.
        -   `emergency_unstake_fee_bps`: The new fee for emergency unstakes.

-   `stake(amount: u64, duration_days: u32, stake_id: u64)`: Stakes a certain `amount` of tokens for a specified `duration_days`.
    -   **Signer:** User
    -   **Args:**
        -   `amount`: The number of tokens to stake.
        -   `duration_days`: The staking duration. Supported values: 1, 7, 14, 30.
        -   `stake_id`: A client-generated unique ID for the stake.

-   `unstake(stake_id: u64)`: Allows a user to withdraw their tokens after the staking lock-up period has ended. The unstake fee will be deducted from the staked amount.
    -   **Signer:** User
    -   **Args:**
        -   `stake_id`: The ID of the stake to withdraw.

-   `emergency_unstake(stake_id: u64)`: Allows immediate withdrawal of staked tokens before the lock-up period ends. The emergency unstake fee will be deducted.
    -   **Signer:** User
    -   **Args:**
        -   `stake_id`: The ID of the stake to withdraw.

### Events

-   `StakeEvent`: Emitted when a user stakes tokens.
-   `UnstakeEvent`: Emitted on a successful unstake.
-   `EmergencyUnstakeEvent`: Emitted on an emergency unstake.

### Errors

-   `InvalidDuration`: Thrown if an unsupported staking duration is provided.
-   `LockupPeriodNotEnded`: Thrown if a user tries to unstake before the lock-up period is over.
-   `NameTooLong`: Thrown if the project name in `register_project` exceeds 32 characters.
-   `InvalidFeeWallet`: Thrown if the provided fee wallet account is incorrect during an unstake.

### PDAs (Program Derived Addresses)

The program uses several PDAs to manage accounts. Here is how they are derived:

-   **Platform Config:** `[b"platform"]`
-   **Project Config:** `[b"project", project_count.to_le_bytes()]`
-   **Vault:** `[b"vault", project_count.to_le_bytes()]`
-   **Vault Authority:** `[b"vault-authority", project_count.to_le_bytes()]`
-   **Stake Info:** `[b"stake", project_config_pubkey.to_bytes(), user_pubkey.to_bytes(), stake_id.to_le_bytes()]`

## Deployed Programs and Accounts (Devnet)

This section lists the public keys for the program and related accounts deployed on the Solana Devnet, as captured from a test execution.

### `aim_staking_program`

*   **Program ID**: `DdB4xNCwXYoVfanj9Kek3CWJN1jDD9MZXxLeAYnh5u4Y`

### Key Actors & Wallets

*   **Platform & Project Authority**: `EQbG6xoyY1sCEmH3JohA6LzNfew35eCGYj2PUtMwR8xS`
*   **User Wallet**: `CDmUCaBAUVa7eERKFJr3PER1aeknpTLdkbmzuFR6MhJm`
*   **Fee Wallet (Owner)**: `7Gq1ffkZjR7UiChhQRJtRjienP8C3psWjTdAAkVnkiZZ`
*   **Fee Wallet Token Account**: `6YVhPmwfB66tPDLYF5QyJvXPQLwj98CXArZUJ1HeWbKN`

### Staking Project: "My Test Project"

This project was registered and interacted with during the test run.

*   **Project Name**: `My Test Project`
*   **Project Config PDA**: `J1trx6Q6bwA5jMGn2BXwGCHpuwKdQ9136KuTuZrCh4uM`
*   **Staking Token Mint**: `AijSUnF9eyDxC6TbtQyEEispbHKDhhVZ46Xp8dFT9ng7`
*   **Token Vault PDA**: `8sKjqtNgXmKjBuSR69y8CPFJfyWKwFgbVo59SyTcQR5v`
*   **Vault Authority PDA**: `8jji6LHzCnx1xkrrwakvmmk9tP7Utp3kpPbeykf3TjMF`

### User Staking Data

*   **User Token Account**: `D5qCDFZX2z69wAiBseRjusxgN7e7cJaYjYQ37z9Bw2ZN`
*   **Stake Info PDA (1st stake)**: `BUkJqBsTzUY2AULZWq12Qw2B1k7rxNLVWfJmf9JB2iXu`
*   **Stake Info PDA (2nd stake)**: `J7PJqrQvoaUSUCXqeuVv8TKZ3EWADTWMrdaAngJhE1pX`

### Platform & System Accounts

*   **Platform Config PDA**: `Gn8xQoQJqZrgyd2fBfKJvByHJnYP2HeoPz5X6d3Jamzt` 