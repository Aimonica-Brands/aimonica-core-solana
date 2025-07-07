use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, Mint, TokenAccount, TokenInterface, Transfer};

declare_id!("DBLHSVJjASwJh4aQwTLLFFnSabio35b45sHu5CRBKBSH");

/// # AIM Staking Program
///
/// A flexible staking program on Solana built with Anchor.
/// This program allows a platform authority to manage multiple staking projects.
/// Each project has its own configuration for staking tokens, fees, and vaults.
/// Users can stake tokens for various durations and receive rewards (rewards not implemented yet).
/// It supports standard unstaking after a lock-up period and an emergency unstake option.
#[program]
pub mod aim_staking_program {
    use super::*;

    /// Initializes the staking platform.
    ///
    /// This must be the first instruction called. It sets up a singleton `PlatformConfig`
    /// account that holds global platform settings and tracks the number of projects.
    ///
    /// # Arguments
    ///
    /// * `ctx` - The context for this instruction, including the authority and accounts to initialize.
    ///
    /// # Errors
    ///
    /// Returns an error if the platform is already initialized.
    pub fn initialize_platform(ctx: Context<InitializePlatform>) -> Result<()> {
        let platform_config = &mut ctx.accounts.platform_config;
        platform_config.authority = *ctx.accounts.authority.key;
        platform_config.project_count = 0;
        Ok(())
    }

    /// Registers a new staking project on the platform.
    ///
    /// This can only be called by the platform authority. It creates a new `ProjectConfig`
    /// account, a token vault for the project, and increments the platform's project counter.
    ///
    /// # Arguments
    ///
    /// * `ctx` - The context for this instruction.
    /// * `name` - A human-readable name for the project (max 32 characters).
    ///
    /// # Errors
    ///
    /// Returns `NameTooLong` if the provided name exceeds 32 characters.
    pub fn register_project(ctx: Context<RegisterProject>, name: String) -> Result<()> {
        if name.len() > 32 {
            return err!(ErrorCode::NameTooLong);
        }
        let platform_config = &mut ctx.accounts.platform_config;
        let project_config = &mut ctx.accounts.project_config;

        project_config.project_id = platform_config.project_count;
        project_config.authority = *ctx.accounts.authority.key;
        project_config.token_mint = ctx.accounts.token_mint.key();
        project_config.vault = ctx.accounts.vault.key();
        project_config.name = name;
        project_config.fee_wallet = *ctx.accounts.authority.key;
        project_config.token_program = ctx.accounts.token_program.key();
        project_config.unstake_fee_bps = 0;
        project_config.emergency_unstake_fee_bps = 0;
        
        platform_config.project_count += 1;
        Ok(())
    }

    /// Updates the configuration of an existing project.
    ///
    /// This can only be called by the project's authority. It allows updating the
    /// fee wallet, unstake fee, and emergency unstake fee.
    ///
    /// # Arguments
    ///
    /// * `ctx` - The context for this instruction.
    /// * `fee_wallet` - The new public key of the wallet to receive fees.
    /// * `unstake_fee_bps` - The new fee in basis points for normal unstaking.
    /// * `emergency_unstake_fee_bps` - The new fee in basis points for emergency unstaking.
    pub fn update_project_config(
        ctx: Context<UpdateProjectConfig>,
        fee_wallet: Pubkey,
        unstake_fee_bps: u16,
        emergency_unstake_fee_bps: u16,
    ) -> Result<()> {
        let project_config = &mut ctx.accounts.project_config;
        project_config.fee_wallet = fee_wallet;
        project_config.unstake_fee_bps = unstake_fee_bps;
        project_config.emergency_unstake_fee_bps = emergency_unstake_fee_bps;
        Ok(())
    }

    /// Stakes a specified amount of tokens for a user.
    ///
    // * This instruction transfers tokens from the user's account to the project's vault
    // * and creates a `UserStakeInfo` account to track the stake's details.
    // *
    // * # Arguments
    // *
    // * * `ctx` - The context for this instruction.
    // * * `amount` - The amount of tokens to stake.
    // * * `duration_days` - The lock-up duration for the stake (e.g., 1, 7, 14, 30).
    // * * `stake_id` - A client-generated unique ID for this stake, allowing a user to have multiple stakes.
    // *
    // * # Errors
    // *
    // * Returns `InvalidDuration` if an unsupported duration is provided.
    pub fn stake(ctx: Context<Stake>, amount: u64, duration_days: u32, stake_id: u64) -> Result<()> {
        // Validate duration
        if ![1, 7, 14, 30].contains(&duration_days) {
            return err!(ErrorCode::InvalidDuration);
        }

        // Transfer tokens from user to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_interface::transfer(cpi_ctx, amount)?;

        // Create stake info
        let stake_info = &mut ctx.accounts.stake_info;
        stake_info.user = *ctx.accounts.user.key;
        stake_info.project_config = ctx.accounts.project_config.key();
        stake_info.project_id = ctx.accounts.project_config.project_id;
        stake_info.stake_id = stake_id;
        stake_info.amount = amount;
        stake_info.stake_timestamp = Clock::get()?.unix_timestamp;
        stake_info.duration_days = duration_days;
        stake_info.is_staked = true;

        emit!(StakeEvent {
            user: stake_info.user,
            project_id: stake_info.project_id,
            stake_id: stake_info.stake_id,
            amount: stake_info.amount,
            duration_days: stake_info.duration_days,
        });

        Ok(())
    }

    /// Unstakes tokens after the lock-up period has ended.
    ///
    /// This instruction checks if the lock-up duration has passed. If so, it transfers
    /// the staked tokens back to the user, minus any applicable fees. The `UserStakeInfo`
    /// account is closed, and the rent is refunded to the user.
    ///
    /// # Arguments
    ///
    /// * `ctx` - The context for this instruction.
    /// * `_stake_id` - The ID of the stake to unstake (used for PDA derivation).
    ///
    /// # Errors
    ///
    /// Returns `LockupPeriodNotEnded` if the stake is still locked.
    pub fn unstake(ctx: Context<Unstake>, _stake_id: u64) -> Result<()> {
        let stake_info = &mut ctx.accounts.stake_info;
        let clock = Clock::get()?;

        let lockup_seconds = (stake_info.duration_days as i64) * 24 * 60 * 60;
        if stake_info.stake_timestamp + lockup_seconds > clock.unix_timestamp {
            return err!(ErrorCode::LockupPeriodNotEnded);
        }

        // Transfer tokens from vault back to user
        let project_id_bytes = ctx.accounts.project_config.project_id.to_le_bytes();
        let authority_seeds = &[
            b"vault-authority".as_ref(),
            project_id_bytes.as_ref(),
            &[ctx.bumps.vault_authority],
        ];
        let signer_seeds = &[&authority_seeds[..]];

        // Fee calculation
        let fee_bps = ctx.accounts.project_config.unstake_fee_bps;
        let fee_amount = (stake_info.amount as u128)
            .checked_mul(fee_bps as u128).unwrap()
            .checked_div(10000).unwrap() as u64;
        let amount_to_user = stake_info.amount.checked_sub(fee_amount).unwrap();

        // Transfer fee to fee wallet
        if fee_amount > 0 {
            let cpi_accounts_fee = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.fee_wallet.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx_fee = CpiContext::new_with_signer(cpi_program, cpi_accounts_fee, signer_seeds);
            token_interface::transfer(cpi_ctx_fee, fee_amount)?;
        }

        // Transfer remaining tokens to user
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token_interface::transfer(cpi_ctx, amount_to_user)?;
        
        stake_info.is_staked = false;

        emit!(UnstakeEvent {
            user: stake_info.user,
            project_id: stake_info.project_id,
            stake_id: stake_info.stake_id,
            amount: stake_info.amount,
        });

        Ok(())
    }

    /// Performs an emergency unstake, allowing withdrawal before the lock-up period ends.
    ///
    /// This instruction allows a user to bypass the lock-up period but incurs a potentially
    /// higher fee. It transfers the tokens back to the user (minus fees) and closes the
    /// `UserStakeInfo` account.
    ///
    /// # Arguments
    ///
    /// * `ctx` - The context for this instruction.
    /// * `_stake_id` - The ID of the stake to unstake (used for PDA derivation).
    pub fn emergency_unstake(ctx: Context<EmergencyUnstake>, _stake_id: u64) -> Result<()> {
        let stake_info = &mut ctx.accounts.stake_info;
        
        // Transfer tokens from vault back to user
        let project_id_bytes = ctx.accounts.project_config.project_id.to_le_bytes();
        let authority_seeds = &[
            b"vault-authority".as_ref(),
            project_id_bytes.as_ref(),
            &[ctx.bumps.vault_authority],
        ];
        let signer_seeds = &[&authority_seeds[..]];

        // Fee calculation
        let fee_bps = ctx.accounts.project_config.emergency_unstake_fee_bps;
        let fee_amount = (stake_info.amount as u128)
            .checked_mul(fee_bps as u128).unwrap()
            .checked_div(10000).unwrap() as u64;
        let amount_to_user = stake_info.amount.checked_sub(fee_amount).unwrap();

        // Transfer fee to fee wallet
        if fee_amount > 0 {
            let cpi_accounts_fee = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.fee_wallet.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx_fee = CpiContext::new_with_signer(cpi_program, cpi_accounts_fee, signer_seeds);
            token_interface::transfer(cpi_ctx_fee, fee_amount)?;
        }

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token_interface::transfer(cpi_ctx, amount_to_user)?;

        stake_info.is_staked = false;
        
        emit!(EmergencyUnstakeEvent {
            user: stake_info.user,
            project_id: stake_info.project_id,
            stake_id: stake_info.stake_id,
            amount: stake_info.amount,
        });

        Ok(())
    }
}

// ============== ACCOUNTS ==============

/// Holds global configuration for the entire staking platform.
/// There is only one of these accounts, derived from the seed "platform".
#[account]
pub struct PlatformConfig {
    /// The authority that can register new projects.
    pub authority: Pubkey,
    /// A counter for the total number of projects, used to derive unique project PDAs.
    pub project_count: u64,
}

/// Stores the configuration for a single staking project.
#[account]
pub struct ProjectConfig {
    /// A unique numerical ID for the project.
    pub project_id: u64,
    /// The authority that can update this project's settings (e.g., fees).
    pub authority: Pubkey,
    /// The mint of the token that can be staked in this project.
    pub token_mint: Pubkey,
    /// The token vault (a PDA) that holds all staked tokens for this project.
    pub vault: Pubkey,
    /// A human-readable name for the project.
    pub name: String,
    /// The wallet that receives fees from unstaking.
    pub fee_wallet: Pubkey,
    /// The token program associated with the mint (SPL Token or Token-2022).
    pub token_program: Pubkey,
    /// The fee in basis points (1/100th of 1%) for a normal unstake.
    pub unstake_fee_bps: u16,
    /// The fee in basis points for an emergency unstake.
    pub emergency_unstake_fee_bps: u16,
}

/// Holds the details of a single user's stake.
/// A user can have multiple stake accounts for the same project.
#[account]
pub struct UserStakeInfo {
    /// The user who owns this stake.
    pub user: Pubkey,
    /// A reference to the `ProjectConfig` this stake belongs to.
    pub project_config: Pubkey,
    /// The ID of the project this stake belongs to.
    pub project_id: u64,
    /// A unique identifier for this stake, provided by the client.
    pub stake_id: u64,
    /// The amount of tokens staked.
    pub amount: u64,
    /// The Unix timestamp when the stake was created.
    pub stake_timestamp: i64,
    /// The duration of the stake lock-up in days.
    pub duration_days: u32,
    /// A flag indicating if the tokens are currently staked.
    pub is_staked: bool,
}

// ============== CONTEXTS ==============

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8,
        seeds = [b"platform"],
        bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterProject<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"platform"],
        bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + 8 + 32 + 32 + 32 + (4 + 32) + 32 + 32 + 2 + 2,
        seeds = [b"project", platform_config.project_count.to_le_bytes().as_ref()],
        bump
    )]
    pub project_config: Account<'info, ProjectConfig>,
    pub token_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        token::mint = token_mint,
        token::authority = vault_authority,
        seeds = [b"vault", platform_config.project_count.to_le_bytes().as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA used as vault authority
    #[account(
        seeds = [b"vault-authority", platform_config.project_count.to_le_bytes().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateProjectConfig<'info> {
    #[account(
        mut,
        has_one = authority,
    )]
    pub project_config: Account<'info, ProjectConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64, duration_days: u32, stake_id: u64)]
pub struct Stake<'info> {
    #[account(
        has_one = vault,
        constraint = project_config.token_program == token_program.key()
    )]
    pub project_config: Account<'info, ProjectConfig>,
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 4 + 1,
        seeds = [b"stake", project_config.key().to_bytes().as_ref(), user.key().as_ref(), stake_id.to_le_bytes().as_ref()],
        bump
    )]
    pub stake_info: Account<'info, UserStakeInfo>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        constraint = user_token_account.mint == project_config.token_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(stake_id: u64)]
pub struct Unstake<'info> {
    #[account(constraint = project_config.token_program == token_program.key())]
    pub project_config: Account<'info, ProjectConfig>,
    #[account(
        mut,
        has_one = user,
        seeds = [b"stake", project_config.key().to_bytes().as_ref(), user.key().as_ref(), stake_id.to_le_bytes().as_ref()],
        bump,
        close = user
    )]
    pub stake_info: Account<'info, UserStakeInfo>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        constraint = user_token_account.mint == project_config.token_mint
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut,
        seeds = [b"vault", project_config.project_id.to_le_bytes().as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA used as vault authority
    #[account(
        seeds = [b"vault-authority", project_config.project_id.to_le_bytes().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = fee_wallet.mint == project_config.token_mint,
        constraint = fee_wallet.owner == project_config.fee_wallet @ ErrorCode::InvalidFeeWallet
    )]
    pub fee_wallet: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(stake_id: u64)]
pub struct EmergencyUnstake<'info> {
    #[account(constraint = project_config.token_program == token_program.key())]
    pub project_config: Account<'info, ProjectConfig>,
    #[account(
        mut,
        has_one = user,
        seeds = [b"stake", project_config.key().to_bytes().as_ref(), user.key().as_ref(), stake_id.to_le_bytes().as_ref()],
        bump,
        close = user
    )]
    pub stake_info: Account<'info, UserStakeInfo>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        constraint = user_token_account.mint == project_config.token_mint
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut,
        seeds = [b"vault", project_config.project_id.to_le_bytes().as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA used as vault authority
    #[account(
        seeds = [b"vault-authority", project_config.project_id.to_le_bytes().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = fee_wallet.mint == project_config.token_mint,
        constraint = fee_wallet.owner == project_config.fee_wallet @ ErrorCode::InvalidFeeWallet
    )]
    pub fee_wallet: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ============== EVENTS ==============

/// Emitted when a user stakes tokens.
#[event]
pub struct StakeEvent {
    /// The user who staked the tokens.
    pub user: Pubkey,
    /// The ID of the project where the stake was made.
    pub project_id: u64,
    /// The unique ID of the stake.
    pub stake_id: u64,
    /// The amount of tokens staked.
    pub amount: u64,
    /// The lock-up duration in days.
    pub duration_days: u32,
}

/// Emitted when a user unstakes their tokens after the lock-up period.
#[event]
pub struct UnstakeEvent {
    /// The user who unstaked the tokens.
    pub user: Pubkey,
    /// The ID of the project from which the unstake occurred.
    pub project_id: u64,
    /// The unique ID of the stake that was unstaked.
    pub stake_id: u64,
    /// The original amount of tokens in the stake.
    pub amount: u64,
}

/// Emitted when a user performs an emergency unstake.
#[event]
pub struct EmergencyUnstakeEvent {
    /// The user who performed the emergency unstake.
    pub user: Pubkey,
    /// The ID of the project from which the unstake occurred.
    pub project_id: u64,
    /// The unique ID of the stake that was unstaked.
    pub stake_id: u64,
    /// The original amount of tokens in the stake.
    pub amount: u64,
}

// ============== ERRORS ==============

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid staking duration. Only 1, 7, 14, or 30 days are allowed.")]
    InvalidDuration,
    #[msg("Lockup period has not ended yet.")]
    LockupPeriodNotEnded,
    #[msg("Project name cannot exceed 32 characters.")]
    NameTooLong,
    #[msg("Invalid fee wallet.")]
    InvalidFeeWallet,
}
