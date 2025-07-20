# AIM Staking Program

A flexible staking program on Solana, built with Anchor.

## Features

- **Platform Initialization**: A central authority can initialize the staking platform.
- **Multi-Authority Management**: The platform supports multiple administrators who can register projects and manage other authorities.
- **Project Registration**: Authorities can register multiple staking projects.
- **Configurable Projects**: Each project can have its own name, staking token (SPL Token or Token-2022), vault, and a custom list of allowed staking durations.
- **Fee Management**: Project fees (for unstaking and emergency unstaking) and the fee-receiving wallet can be configured by an authority.
- **Token-2022 Support**: The program is compatible with both the standard SPL Token and the newer Token-2022 standard.
- **Flexible Staking**: Users can stake tokens for durations specified in each project's configuration.
- **Multiple Stakes**: Users can have multiple, independent stakes within the same project.
- **Standard Unstake**: Users can withdraw their staked tokens after the lock-up period.
- **Emergency Unstake**: A failsafe option for users to withdraw their tokens immediately, incurring a fee.

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
    It will output something like `aim_staking_program_v2: <new-program-id>`. Copy the `<new-program-id>`.

    Next, open `Anchor.toml` and update the `aim_staking` address under `[programs.localnet]` with the new program ID.

    ```toml
    [programs.localnet]
    aim_staking_program_v2 = "<new-program-id>"
    ```

    Then, update the program ID in the source code. Open `programs/aim_staking_program_v2/src/lib.rs` and replace the existing address in `declare_id!` with your new program ID.

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
    -   `authorities`: A list of public keys with the authority to manage the platform (e.g., register projects, add/remove other authorities).
    -   `project_count`: A counter for the number of projects registered, used for deriving project PDAs.

-   `ProjectConfig`: Stores details for each staking project.
    -   `project_id`: A unique ID for the project.
    -   `authority`: The authority for the project, who can update its configuration.
    -   `token_mint`: The mint address of the token that can be staked in this project.
    -   `token_program`: The program ID of the token standard used (SPL Token or Token-2022).
    -   `vault`: The address of the token account (PDA) that holds all staked tokens for the project.
    -   `name`: A human-readable name for the project (up to 32 characters).
    -   `fee_wallet`: The public key of the wallet that will receive unstaking fees.
    -   `unstake_fee_bps`: The fee in basis points (1/100th of 1%) charged on a normal unstake.
    -   `emergency_unstake_fee_bps`: The fee in basis points charged on an emergency unstake.
    -   `allowed_durations`: A list of integers representing the allowed staking durations in days (e.g., `[7, 14, 30]`).

-   `UserStakeInfo`: Holds information about a user's individual stake. A user can have multiple `UserStakeInfo` accounts for a single project.
    -   `user`: The public key of the user who made the stake.
    -   `project_config`: The public key of the `ProjectConfig` this stake belongs to.
    -   `project_id`: The ID of the project.
    -   `stake_id`: A unique identifier for this specific stake, provided by the user. Allows for multiple stakes per user per project.
    -   `amount`: The amount of tokens staked.
    -   `stake_timestamp`: The Unix timestamp when the stake was created.
    -   `duration_days`: The duration of the stake in days. Must be one of the values in the project's `allowed_durations`.
    -   `is_staked`: A boolean flag indicating if the stake is currently active. This is set to `false` after an unstake or emergency unstake.

-   `UnstakeInfo`: Created when a user unstakes. It records the details of the withdrawal event.
    -   `user`: The public key of the user who unstaked.
    -   `project_config`: The public key of the `ProjectConfig`.
    -   `project_id`: The ID of the project.
    -   `stake_info`: A reference back to the original `UserStakeInfo` account.
    -   `stake_id`: The unique identifier for the original stake.
    -   `amount`: The amount of tokens that were originally staked.
    -   `unstake_timestamp`: The Unix timestamp when the unstake occurred.
    -   `status`: The type of unstake (`Unstaked` or `EmergencyUnstaked`).

### Instructions

-   `initialize_platform()`: Initializes the `PlatformConfig` singleton and sets the signer as the first platform authority. Must be called once before any other instructions.
    -   **Signer:** Initial Platform Authority

-   `add_authority(new_authority: Pubkey)`: Adds a new authority to the platform's list of administrators.
    -   **Signer:** An existing Platform Authority
    -   **Args:**
        -   `new_authority`: The public key of the new authority to add.

-   `remove_authority(authority_to_remove: Pubkey)`: Removes an authority from the platform.
    -   **Signer:** An existing Platform Authority
    -   **Args:**
        -   `authority_to_remove`: The public key of the authority to remove.

-   `register_project(name: String, allowed_durations: Vec<u32>)`: Creates a new `ProjectConfig` for a new staking pool.
    -   **Signer:** Platform Authority
    -   **Args:**
        -   `name`: A name for the new project (max 32 chars).
        -   `allowed_durations`: A list of integers specifying the allowed staking durations in days.

-   `update_allowed_durations(new_durations: Vec<u32>)`: Updates the list of allowed staking durations for an existing project.
    -   **Signer:** Platform Authority
    -   **Args:**
        -   `new_durations`: The new list of allowed staking durations.

-   `update_project_config(fee_wallet: Pubkey, unstake_fee_bps: u16, emergency_unstake_fee_bps: u16)`: Updates the fee configuration for an existing project.
    -   **Signer:** Platform Authority
    -   **Args:**
        -   `fee_wallet`: The new wallet to receive fees.
        -   `unstake_fee_bps`: The new fee for regular unstakes.
        -   `emergency_unstake_fee_bps`: The new fee for emergency unstakes.

-   `stake(amount: u64, duration_days: u32, stake_id: u64)`: Stakes a certain `amount` of tokens for a specified `duration_days`.
    -   **Signer:** User
    -   **Args:**
        -   `amount`: The number of tokens to stake.
        -   `duration_days`: The staking duration. Must be a value present in the project's `allowed_durations` list.
        -   `stake_id`: A client-generated unique ID for the stake.

-   `unstake(stake_id: u64)`: Allows a user to withdraw their tokens after the staking lock-up period has ended. It sets the original stake's `is_staked` flag to `false` and creates a new `UnstakeInfo` account to record the event.
    -   **Signer:** User
    -   **Args:**
        -   `stake_id`: The ID of the stake to withdraw.

-   `emergency_unstake(stake_id: u64)`: Allows immediate withdrawal of staked tokens. It sets the original stake's `is_staked` flag to `false` and creates a new `UnstakeInfo` account with an `EmergencyUnstaked` status to record the event.
    -   **Signer:** User
    -   **Args:**
        -   `stake_id`: The ID of the stake to withdraw.

### Events

-   `StakeEvent`: Emitted when a user stakes tokens.
-   `UnstakeEvent`: Emitted on a successful unstake.
-   `EmergencyUnstakeEvent`: Emitted on an emergency unstake.

### Errors

-   `NotPlatformAuthority`: Thrown if the signer of an administrative instruction is not in the platform's list of authorities.
-   `AuthorityAlreadyExists`: Thrown when trying to add an authority that is already in the list.
-   `AuthorityNotFound`: Thrown when trying to remove an authority that is not in the list.
-   `CannotRemoveLastAuthority`: Thrown if an attempt is made to remove the last remaining platform authority.
-   `InvalidDuration`: Thrown if a staking duration is provided that is not in the project's `allowed_durations` list.
-   `LockupPeriodNotEnded`: Thrown if a user tries to unstake before the lock-up period is over.
-   `NameTooLong`: Thrown if the project name in `register_project` exceeds 32 characters.
-   `InvalidFeeWallet`: Thrown if the provided fee wallet account is incorrect during an unstake.
-   `StakeNotActive`: Thrown if an unstake or emergency unstake is attempted on a stake that is no longer active.

### PDAs (Program Derived Addresses)

The program uses several PDAs to manage accounts. Here is how they are derived:

-   **Platform Config:** `[b"platform"]`
-   **Project Config:** `[b"project", project_count.to_le_bytes()]`
-   **Vault:** `[b"vault", project_count.to_le_bytes()]`
-   **Vault Authority:** `[b"vault-authority", project_count.to_le_bytes()]`
-   **User Stake Info:** `[b"stake", project_config_key.to_bytes(), user_key.as_ref(), stake_id.to_le_bytes()]`
-   **Unstake Info:** `[b"unstake", stake_info_key.as_ref()]`

## Program Architecture

### `aim_staking_program_v2`

The core on-chain program contains all the business logic for staking, unstaking, and project management. It is responsible for:
- Validating instructions.
- Transferring tokens between users and vaults.
- Storing and managing state in Solana accounts.

### Key PDAs (Program Derived Addresses)

-   **Platform Config**: `[b"platform"]`
    -   A singleton PDA that ensures there is only one global platform configuration.
-   **Project Config**: `[b"project", project_count.to_le_bytes()]`
    -   Unique for each project, derived from a sequential project counter.
-   **Vault**: `[b"vault", project_count.to_le_bytes()]`
    -   A token account PDA for each project to hold staked tokens securely.
-   **Vault Authority**: `[b"vault-authority", project_count.to_le_bytes()]`
    -   A PDA that acts as the authority for the `Vault`, allowing the program to sign for token transfers.
-   **User Stake Info**: `[b"stake", project_config_pubkey, user_pubkey, stake_id.to_le_bytes()]`
    -   A unique PDA for each individual stake, allowing a user to have multiple stakes in the same project.

## Deployed Programs and Accounts (Devnet)

This section lists the public keys for the program and related accounts deployed on the Solana Devnet, as captured from a test execution.

### `aim_staking_program_v2`

*   **Program ID**: `FG8P631H9q5b53qsVM9aD71GZTWBKvujtqeWUGstpeka`

### Key Actors & Wallets

*   **Platform & Project Authority**: `7aDFhTQwPMwWGckTHL2gebSDSvey8iXodLdR6vEVxgMu`
*   **User Wallet**: `CDmUCaBAUVa7eERKFJr3PER1aeknpTLdkbmzuFR6MhJm`
*   **Fee Wallet**: `7Gq1ffkZjR7UiChhQRJtRjienP8C3psWjTdAAkVnkiZZ`
*   **New authority Wallet**: `GDsKa8AWhNnHFaQMqDxngFNvFgPD6uvAJzBaBLhAY3nU`

### Platform & System Accounts

*   **Platform Config PDA**: `DYESfSzsvqYbe9ViubUoKZfKbE9wKHLydDiZ6qXpifix` 

## Deployed Programs and Accounts (Mainnet)

### `aim_staking_program_v2`

*   **Program ID**: `B44fUqmZNMyaUVGqs7pb9ZLPBsjJ3ho6F8cTj1MpjJmJ`
