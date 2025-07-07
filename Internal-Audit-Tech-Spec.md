### **Internal Audit Tech Spec**

#### **Changelog**
*   `Version 1.0.0 (2025-06-22)`: Initial document creation based on the `aimonica-core-solana` repository.

#### **Project outline**
This project is a flexible staking program on the Solana blockchain, built using the Anchor framework. It allows a central platform authority to create and manage multiple, distinct staking projects. Each project can be configured with its own staking token, fee structure, and fee-receiving wallet.

End-users can stake tokens into any of these projects for predefined lock-up durations (e.g., 7, 14, 30 days). The system supports both a standard unstaking process after the lock-up period and an emergency unstake option for immediate withdrawal, which may incur a higher fee. The reward mechanism is mentioned in the code comments but is not implemented in the current version.

#### **Blockchain features and solution design**
*   **Blockchain:** The project is exclusively built on the **Solana** blockchain.
*   **Cross-chain Interaction:** There is no cross-chain communication or asset bridging involved. The entire logic is self-contained on Solana.
*   **Wallet Interaction:**
    *   **User Wallets:** Users interact with the dApp using their own external Solana wallets (e.g., Phantom, Solflare). All state-changing actions (stake, unstake) require the user to sign a transaction with their private key.
    *   **Service-Provided Wallets:** The service itself does not provide or manage user wallets. The platform's administrative wallets are managed externally.

#### **Scope**
All "write" operations that result in a blockchain transaction are listed below. These represent every possible state change within the system.

1.  `initialize_platform`: A one-time instruction to create the global `PlatformConfig` account. This sets the initial platform authority.
2.  `register_project`: Creates a new staking project (`ProjectConfig` account) and its associated token vault. This can only be called by the platform authority.
3.  `update_project_config`: Modifies the configuration of an existing project, specifically the fee wallet and fee percentages. This can only be called by the project's authority.
4.  `stake`: A user action to lock a specified amount of tokens in a project. This creates a `UserStakeInfo` account to track the user's position and transfers tokens from the user's wallet to the project's vault.
5.  `unstake`: A user action to withdraw tokens after the lock-up period has expired. This transfers the principal amount (minus a fee) back to the user and closes the `UserStakeInfo` account.
6.  `emergency_unstake`: A user action to withdraw tokens *before* the lock-up period has expired. This transfers the principal amount (minus a higher emergency fee) back to the user and closes the `UserStakeInfo` account.

Read-only interactions, such as fetching account states (`PlatformConfig`, `ProjectConfig`, `UserStakeInfo`) to display on a frontend, are also necessary but do not involve transactions or signatures from the user. The program also emits events (`StakeEvent`, `UnstakeEvent`, `EmergencyUnstakeEvent`) which can be monitored by off-chain services.

#### **Smart contracts design**
The system consists of a single on-chain program (`aim_staking_program_v2`) that orchestrates all logic. It interacts with standard Solana programs (`System Program` for account creation, `SPL Token Program` for token transfers).

**1. On-chain Program: `aim_staking_program_v2`**
*   **Role:** This is the core program containing all business logic for platform setup, project management, and user staking actions.
*   **Accounts Managed:**
    *   `PlatformConfig`: A singleton PDA (`seeds = [b"platform"]`) storing global configuration.
    *   `ProjectConfig`: A PDA (`seeds = [b"project", project_id]`) for each staking project, containing its specific rules (token mint, vault, fees, etc.).
    *   `UserStakeInfo`: A PDA (`seeds = [b"stake", project_config_key, user_key, stake_id]`) for each individual stake made by a user.
*   **Privileged Roles:**
    *   **Platform Authority (`PlatformConfig.authority`):**
        *   **Holder:** The wallet that executes the `initialize_platform` instruction.
        *   **Capabilities:**
            *   Can call `register_project` to create new staking pools.
    *   **Project Authority (`ProjectConfig.authority`):**
        *   **Holder:** Initially set to the Platform Authority upon project registration. The design implies this could be transferred, but no such function exists in the current contract.
        *   **Capabilities:**
            *   Can call `update_project_config` to change the `fee_wallet`, `unstake_fee_bps`, and `emergency_unstake_fee_bps` for a specific project.
*   **Standards Followed:**
    *   It uses Program Derived Addresses (PDAs) for all program-owned accounts, which is a standard Solana security practice.
    *   It correctly interacts with the `SPL Token Program` for all token-related operations.
    *   It uses Anchor's `has_one` constraint to enforce ownership checks for privileged accounts.

**2. External Contracts Interacted With:**
*   **Solana System Program (`11111111111111111111111111111111`):** Used for creating new accounts on-chain.
*   **SPL Token Program (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`):** Used for all token transfers between users and project vaults.

#### **Migrations design**
There is no complex migration script (`migrations/deploy.ts` is empty). The deployment and initialization process relies on standard Anchor tooling and the test scripts.
1.  **Deployment:** The program is deployed using `anchor deploy`. This uploads the compiled Rust code to the Solana network and associates it with a program ID.
2.  **Initialization:**
    *   A client-side script (like the one in `tests/aim_staking_program_v2.ts`) is responsible for calling the initial instructions.
    *   `initialize_platform` must be called once by the designated authority wallet to create the `PlatformConfig` account.
    *   Subsequently, the same authority calls `register_project` to create one or more staking pools.

#### **Backend design**
The repository does not contain a dedicated backend service. A backend service, if built, would act as a client to the Solana blockchain. Its primary role would be to read data from the program's accounts for display and analytics. It would not hold any private keys or have privileged on-chain roles.

#### **Frontend design**
The repository does not contain a frontend application (`app/` is empty). A web or mobile frontend would be responsible for all user-facing interaction.
*   It would use a Solana JavaScript library like `@coral-xyz/anchor` or `@solana/web3.js`.
*   It would read on-chain data to display available staking projects, user's current stakes, and lock-up timers.
*   For write actions (`stake`, `unstake`), the frontend would construct the necessary transaction and request the user's wallet (e.g., Phantom) to sign and send it. The user's private keys never leave their wallet.

---

### **Roles**

#### **Wallets**

**1. Company-Managed Wallets**
*   **Deployer Wallet:**
    *   **Type:** Should be a secure hardware wallet or multi-sig (e.g., Squads).
    *   **Access:** Limited to lead developers/DevOps responsible for deployments.
    *   **Security:** Private key must be stored securely, not in plaintext in CI/CD variables or source code.
    *   **Purpose:** Pays the transaction fees for deploying the program code with `anchor deploy`.
*   **Platform Authority Wallet:**
    *   **Type:** Should be a highly secure hardware wallet or multi-sig.
    *   **Access:** Limited to high-level management or a DAO governance body.
    *   **Security:** Requires multi-person approval for any transaction.
    *   **Purpose:** Initializes the platform and registers new staking projects. This is the root authority of the system.
*   **Project Authority Wallet:**
    *   **Type:** Hardware wallet or multi-sig.
    *   **Access:** Limited to the team managing that specific project.
    *   **Security:** Secure storage and/or multi-person approval.
    *   **Purpose:** Configures project-specific fees and the fee wallet. Initially the same as the Platform Authority.
*   **Fee Wallet:**
    *   **Type:** Can be a normal wallet, but a multi-sig is recommended for fund security.
    *   **Access:** Finance or operations team.
    *   **Security:** Standard organizational practices for securing company funds.
    *   **Purpose:** Receives all fees collected from unstaking and emergency unstaking actions.

**2. Supported User Wallets**
*   Any standard Solana wallet that supports the Wallet Adapter standard is compatible. This includes, but is not limited to:
    *   Phantom
    *   Solflare
    *   Backpack
    *   Ledger (via a compatible wallet interface)

#### **Deployment Flow**

1.  **Build:** Compile the Rust program locally using `anchor build`. This generates the program's binary (`.so` file) and IDL (`.json` file).
2.  **Deploy:** Run `anchor deploy --provider <mainnet/devnet>` using the **Deployer Wallet**. This uploads the program to the specified Solana cluster.
3.  **Initialize Platform:** Execute a script (or a UI admin panel) that calls the `initialize_platform` instruction. This transaction must be signed by the designated **Platform Authority Wallet**.
4.  **Register Project(s):** For each staking pool to be offered, execute a script/UI action that calls `register_project`. This must also be signed by the **Platform Authority Wallet**.
5.  **Configure Project(s):** If needed, call `update_project_config` to set custom fees and a fee-receiving wallet for each project. This must be signed by the respective **Project Authority Wallet**.
6.  **Ready for Users:** Once projects are registered, the frontend can display them, and users can begin staking.