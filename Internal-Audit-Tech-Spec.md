### **Internal Audit Tech Spec**

#### **Changelog**
*   `Version 1.1.0 (2025-07-11)`: Updated to reflect multi-authority management and configurable staking durations per project.
*   `Version 1.0.0 (2025-06-22)`: Initial document creation based on the `aimonica-core-solana` repository.

#### **Project outline**
This project is a flexible staking program on the Solana blockchain, built using the Anchor framework. It allows a group of platform authorities to create and manage multiple, distinct staking projects. Each project can be configured with its own staking token, a list of allowed staking durations, a fee structure, and a fee-receiving wallet.

End-users can stake tokens into any of these projects for the lock-up durations defined by that project. The system supports both a standard unstaking process after the lock-up period and an emergency unstake option for immediate withdrawal, which may incur a higher fee.

#### **Blockchain features and solution design**
*   **Blockchain:** The project is exclusively built on the **Solana** blockchain.
*   **Cross-chain Interaction:** There is no cross-chain communication or asset bridging involved. The entire logic is self-contained on Solana.
*   **Wallet Interaction:**
    *   **User Wallets:** Users interact with the dApp using their own external Solana wallets (e.g., Phantom, Solflare). All state-changing actions (stake, unstake) require the user to sign a transaction with their private key.
    *   **Service-Provided Wallets:** The service itself does not provide or manage user wallets. The platform's administrative wallets are managed externally.

#### **Scope**
All "write" operations that result in a blockchain transaction are listed below. These represent every possible state change within the system.

1.  `initialize_platform`: A one-time instruction to create the global `PlatformConfig` account. This sets the initial platform authority.
2.  `add_authority`: Adds a new public key to the list of platform authorities. Can only be called by an existing authority.
3.  `remove_authority`: Removes a public key from the list of platform authorities. Can only be called by an existing authority.
4.  `register_project`: Creates a new staking project (`ProjectConfig` account) and its associated token vault. Can only be called by a platform authority. Requires an initial list of allowed staking durations.
5.  `update_project_config`: Modifies the fee configuration of an existing project. Can only be called by a platform authority.
6.  `update_allowed_durations`: Modifies the list of allowed staking durations for an existing project. Can only be called by a platform authority.
7.  `stake`: A user action to lock a specified amount of tokens in a project for an allowed duration. This creates a `UserStakeInfo` account.
8.  `unstake`: A user action to withdraw tokens after the lock-up period has expired.
9.  `emergency_unstake`: A user action to withdraw tokens *before* the lock-up period has expired.

Read-only interactions, such as fetching account states (`PlatformConfig`, `ProjectConfig`, `UserStakeInfo`) to display on a frontend, are also necessary but do not involve transactions or signatures from the user. The program also emits events (`StakeEvent`, `UnstakeEvent`, `EmergencyUnstakeEvent`) which can be monitored by off-chain services.

#### **Smart contracts design**
The system consists of a single on-chain program (`aim_staking_program_v2`) that orchestrates all logic. It interacts with standard Solana programs (`System Program` for account creation, `SPL Token Program` for token transfers).

**1. On-chain Program: `aim_staking_program_v2`**
*   **Role:** This is the core program containing all business logic for platform setup, project management, and user staking actions.
*   **Accounts Managed:**
    *   `PlatformConfig`: A singleton PDA (`seeds = [b"platform"]`) storing global configuration, including a list of `authorities`.
    *   `ProjectConfig`: A PDA (`seeds = [b"project", project_id]`) for each staking project, containing its specific rules (token mint, vault, fees, `allowed_durations`, etc.).
    *   `UserStakeInfo`: A PDA (`seeds = [b"stake", project_config_key, user_key, stake_id]`) for each individual stake made by a user.
*   **Privileged Roles:**
    *   **Platform Authority (`PlatformConfig.authorities`):**
        *   **Holder:** A list of public keys. The first authority is the wallet that executes the `initialize_platform` instruction.
        *   **Capabilities:**
            *   Can call `register_project` to create new staking pools.
            *   Can call `add_authority` and `remove_authority` to manage the list of authorities.
            *   Can call `update_project_config` and `update_allowed_durations` to manage any project.
*   **Standards Followed:**
    *   It uses Program Derived Addresses (PDAs) for all program-owned accounts, which is a standard Solana security practice.
    *   It correctly interacts with the `SPL Token Program` and `Token-2022` for all token-related operations.
    *   It uses Anchor's `constraint` checks (e.g., checking if a signer is in the `authorities` list) to enforce permissions.

**2. External Contracts Interacted With:**
*   **Solana System Program (`11111111111111111111111111111111`):** Used for creating new accounts on-chain.
*   **SPL Token Program (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`):** Used for token operations.
*   **SPL Token 2022 Program (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpG41LSV`):** The newer token standard, also supported for token operations.

#### **Migrations design**
There is no complex migration script (`migrations/deploy.ts` is empty). The deployment and initialization process relies on standard Anchor tooling and the test scripts.
1.  **Deployment:** The program is deployed using `anchor deploy`. This uploads the compiled Rust code to the Solana network and associates it with a program ID.
2.  **Initialization:**
    *   A client-side script (like the one in `tests/aim_staking_program_v2.ts`) is responsible for calling the initial instructions.
    *   `initialize_platform` must be called once by the designated authority wallet to create the `PlatformConfig` account.
    *   Subsequently, any of the authorities can call `register_project` to create one or more staking pools.

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
*   **Platform Authority Wallet(s):**
    *   **Type:** Should be a highly secure hardware wallet or multi-sig.
    *   **Access:** Limited to high-level management or a DAO governance body.
    *   **Security:** Requires multi-person approval for any transaction if using a multi-sig.
    *   **Purpose:** These wallets form the group of administrators for the platform. They can initialize the platform, register new staking projects, and manage other authorities.
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
3.  **Initialize Platform:** Execute a script (or a UI admin panel) that calls the `initialize_platform` instruction. This transaction must be signed by the designated **initial Platform Authority Wallet**. This wallet becomes the first administrator.
4.  **(Optional) Add More Authorities:** The initial authority can execute `add_authority` to add other wallets to the list of administrators.
5.  **Register Project(s):** For each staking pool to be offered, execute a script/UI action that calls `register_project`. This must be signed by **any Platform Authority Wallet**.
6.  **Configure Project(s):** If needed, call `update_project_config` or `update_allowed_durations` to modify project settings. This must be signed by **any Platform Authority Wallet**.
7.  **Ready for Users:** Once projects are registered, the frontend can display them, and users can begin staking.