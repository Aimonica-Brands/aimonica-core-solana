# AIM Staking Program

A flexible staking program on Solana, built with Anchor.

## Features

- **Platform Initialization**: A central authority can initialize the staking platform.
- **Project Registration**: The authority can register multiple staking projects, each with its own token and vault.
- **Flexible Staking**: Users can stake tokens for predefined durations (e.g., 7, 14, 30 days).
- **Standard Unstake**: Users can withdraw their staked tokens and rewards after the lock-up period.
- **Emergency Unstake**: A failsafe option for users to withdraw their tokens immediately if needed, forfeiting any rewards.

## Instructions

### Prerequisites

- Rust
- Solana CLI
- Anchor Framework
- Node.js & Yarn

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd aim_staking_program
    ```

2.  **Install dependencies:**
    ```bash
    anchor build
    npm install
    ```

### Deployment

1.  **Start a local validator:**
    ```bash
    solana-test-validator
    ```

2.  **Deploy the program:**
    ```bash
    anchor deploy
    ```

### Usage

The program can be interacted with via tests or a custom frontend.

-   **Run tests:**
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