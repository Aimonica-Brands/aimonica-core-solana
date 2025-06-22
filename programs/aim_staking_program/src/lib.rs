use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("5BH7DL2muAL9w3LYcZWcB1U8JA1dc7KFaCfTpKJ5RjmD");

#[program]
pub mod aim_staking_program {
    use super::*;

    pub fn initialize_platform(ctx: Context<InitializePlatform>) -> Result<()> {
        let platform_config = &mut ctx.accounts.platform_config;
        platform_config.authority = *ctx.accounts.authority.key;
        platform_config.project_count = 0;
        Ok(())
    }

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
        project_config.unstake_fee_bps = 0;
        project_config.emergency_unstake_fee_bps = 0;
        
        platform_config.project_count += 1;
        Ok(())
    }

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
        token::transfer(cpi_ctx, amount)?;

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
            token::transfer(cpi_ctx_fee, fee_amount)?;
        }

        // Transfer remaining tokens to user
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount_to_user)?;
        
        stake_info.is_staked = false;

        emit!(UnstakeEvent {
            user: stake_info.user,
            project_id: stake_info.project_id,
            stake_id: stake_info.stake_id,
            amount: stake_info.amount,
        });

        Ok(())
    }

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
            token::transfer(cpi_ctx_fee, fee_amount)?;
        }

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount_to_user)?;

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

#[account]
pub struct PlatformConfig {
    pub authority: Pubkey,
    pub project_count: u64,
}

#[account]
pub struct ProjectConfig {
    pub project_id: u64,
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub vault: Pubkey,
    pub name: String,
    pub fee_wallet: Pubkey,
    pub unstake_fee_bps: u16,
    pub emergency_unstake_fee_bps: u16,
}

#[account]
pub struct UserStakeInfo {
    pub user: Pubkey,
    pub project_config: Pubkey,
    pub project_id: u64,
    pub stake_id: u64,
    pub amount: u64,
    pub stake_timestamp: i64,
    pub duration_days: u32,
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
        space = 8 + 8 + 32 + 32 + 32 + (4 + 32) + 32 + 2 + 2,
        seeds = [b"project", platform_config.project_count.to_le_bytes().as_ref()],
        bump
    )]
    pub project_config: Account<'info, ProjectConfig>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        token::mint = token_mint,
        token::authority = vault_authority,
        seeds = [b"vault", platform_config.project_count.to_le_bytes().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: PDA used as vault authority
    #[account(
        seeds = [b"vault-authority", platform_config.project_count.to_le_bytes().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
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
        has_one = vault
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
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(stake_id: u64)]
pub struct Unstake<'info> {
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
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut,
        seeds = [b"vault", project_config.project_id.to_le_bytes().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
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
    pub fee_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(stake_id: u64)]
pub struct EmergencyUnstake<'info> {
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
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut,
        seeds = [b"vault", project_config.project_id.to_le_bytes().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
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
    pub fee_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ============== EVENTS ==============

#[event]
pub struct StakeEvent {
    pub user: Pubkey,
    pub project_id: u64,
    pub stake_id: u64,
    pub amount: u64,
    pub duration_days: u32,
}

#[event]
pub struct UnstakeEvent {
    pub user: Pubkey,
    pub project_id: u64,
    pub stake_id: u64,
    pub amount: u64,
}

#[event]
pub struct EmergencyUnstakeEvent {
    pub user: Pubkey,
    pub project_id: u64,
    pub stake_id: u64,
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
