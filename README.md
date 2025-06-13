# AIM Staking Program

A flexible staking program on Solana, built with Anchor.

## Features

- **Platform Initialization**: A central authority can initialize the staking platform.
- **Project Registration**: The authority can register multiple staking projects, each with its own token and vault.
- **Flexible Staking**: Users can stake tokens for predefined durations (e.g., 7, 14, 30 days).
- **Standard Unstake**: Users can withdraw their staked tokens and rewards after the lock-up period.
- **Emergency Unstake**: A failsafe option for users to withdraw their tokens immediately if needed, forfeiting any rewards.

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
    This command compiles the Rust code and generates the program's IDL (Interface Definition Language).
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

## Program Details

### Accounts

-   `PlatformConfig`: Singleton account to hold platform-wide configuration like the authority and project count.
-   `ProjectConfig`: Stores details for each staking project, including its authority, token mint, and vault address.
-   `UserStakeInfo`: Holds information about a user's stake, such as the amount, stake time, and duration.

### Instructions

-   `initialize_platform()`: Initializes the `PlatformConfig`.
-   `register_project()`: Creates a new `ProjectConfig` for a new staking pool.
-   `stake(amount, duration_days)`: Stakes a certain `amount` of tokens for a specified `duration_days`.
-   `unstake()`: Allows a user to withdraw their tokens after the staking period.
-   `emergency_unstake()`: Allows immediate withdrawal of staked tokens.

### Events

-   `StakeEvent`: Emitted when a user stakes tokens.
-   `UnstakeEvent`: Emitted on a successful unstake.
-   `EmergencyUnstakeEvent`: Emitted on an emergency unstake.

### Errors

-   `InvalidDuration`: Thrown if an unsupported staking duration is provided.
-   `LockupPeriodNotEnded`: Thrown if a user tries to unstake before the lock-up period is over. 