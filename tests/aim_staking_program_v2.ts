import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AimStakingProgramV2 } from "../target/types/aim_staking_program_v2";
import { TOKEN_PROGRAM_ID, createMint, createAssociatedTokenAccount, mintTo, getAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";

describe("aim_staking_program_v2", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AimStakingProgramV2 as Program<AimStakingProgramV2>;
  const authority = provider.wallet.publicKey;
  // Use a fixed keypair for development to manually fund it.
  // Public key: CDmUCaBAUVa7eERKFJr3PER1aeknpTLdkbmzuFR6MhJm
  const user = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from([104,6,27,155,224,174,1,74,31,122,9,169,139,243,245,178,51,62,178,251,223,165,114,130,221,223,189,211,211,108,114,234,166,181,206,158,177,135,230,10,6,143,200,153,178,235,105,165,170,148,170,169,97,108,202,97,159,84,49,207,127,17,47,150])
  );
  // Using a fixed keypair for the fee wallet for consistent testing.
  // Public key: 7Gq1ffkZjR7UiChhQRJtRjienP8C3psWjTdAAkVnkiZZ
  // The secret key must be a 64-byte array and cryptographically valid.
  const feeWallet = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from([29,86,39,101,159,45,98,248,245,180,94,32,142,241,153,168,220,15,226,131,233,50,204,106,183,196,82,12,242,69,158,30,93,52,30,214,192,107,155,91,239,210,114,57,115,167,200,38,98,199,105,170,93,128,61,55,139,161,4,28,165,46,180,108])
  );
  // Using a fixed keypair for the new authority for consistent testing.
  // Public key: GDsKa8AWhNnHFaQMqDxngFNvFgPD6uvAJzBaBLhAY3nU
  const newAuthority = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from([193,209,44,152,172,165,106,185,158,23,176,152,117,171,99,230,145,217,168,224,4,23,88,103,126,128,166,230,231,244,56,104,226,43,43,187,62,154,98,132,85,177,127,160,249,115,76,60,202,166,2,23,89,97,170,150,89,107,185,138,162,6,70,189])
  );

  // Helper function to sleep
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // We will run the tests for both SPL Token and Token-2022
  [
    { tokenProgram: TOKEN_PROGRAM_ID, name: "SPL Token" },
    { tokenProgram: TOKEN_2022_PROGRAM_ID, name: "Token-2022" }
  ].forEach(({ tokenProgram, name }, suiteIndex) => { // Added suiteIndex
    describe(`with ${name}`, () => {
      let tokenMint: anchor.web3.PublicKey;
      let userTokenAccount: anchor.web3.PublicKey;
      let feeWalletTokenAccount: anchor.web3.PublicKey;

      let platformConfigPda: anchor.web3.PublicKey;
      let projectConfigPda: anchor.web3.PublicKey;
      let vaultPda: anchor.web3.PublicKey;
      let vaultAuthorityPda: anchor.web3.PublicKey;
      let stakeInfoPda: anchor.web3.PublicKey;
      let newAuthorityProjectConfigPda: anchor.web3.PublicKey;

      // To manage multiple stakes
      const stakes: {
        id: anchor.BN,
        pda: anchor.web3.PublicKey,
        amount: anchor.BN,
        duration: number
      }[] = [];

      before(async () => {
        // On devnet/testnet, airdrops can be unreliable. It's better to fund these accounts manually.
        console.log(`User public key: ${user.publicKey.toBase58()}`);
        console.log(`Fee wallet public key: ${feeWallet.publicKey.toBase58()}`);
        console.log(`New authority public key: ${newAuthority.publicKey.toBase58()}`);

        // Conditionally airdrop SOL only on localnet
        if (provider.connection.rpcEndpoint.includes("localhost") || provider.connection.rpcEndpoint.includes("127.0.0.1")) {
          console.log("Running on localnet, attempting to airdrop SOL...");
          await provider.connection.requestAirdrop(user.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
          await provider.connection.requestAirdrop(feeWallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
          await provider.connection.requestAirdrop(newAuthority.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
          console.log("Airdrop requests sent.");
        } else {
          console.log("Running on devnet/testnet. Please ensure all three accounts are funded with some SOL to avoid errors.");
        }
        
        // Give it a moment for transactions to process
        await sleep(1000);

        // Create a new token mint
        tokenMint = await createMint(
          provider.connection,
          (provider.wallet as any).payer,
          authority,
          null,
          9,
          undefined,
          undefined,
          tokenProgram
        );

        // Create token account for the fee wallet
        feeWalletTokenAccount = await createAssociatedTokenAccount(
          provider.connection,
          (provider.wallet as any).payer, // The authority pays for this transaction
          tokenMint,
          feeWallet.publicKey,
          {},
          tokenProgram
        );

        // Create token account for the user
        userTokenAccount = await createAssociatedTokenAccount(
          provider.connection,
          (provider.wallet as any).payer,
          tokenMint,
          user.publicKey,
          {},
          tokenProgram
        );

        // Mint some tokens to the user's account
        await mintTo(
          provider.connection,
          (provider.wallet as any).payer,
          tokenMint,
          userTokenAccount,
          authority,
          1000 * 10 ** 9, // 1000 tokens
          [],
          undefined,
          tokenProgram
        );
      });

      it("Initializes the platform", async () => {
        [platformConfigPda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("platform")],
            program.programId
          );

        // Check if platform is already initialized
        try {
          const existingPlatformConfig = await program.account.platformConfig.fetch(platformConfigPda);
          console.log("Platform already initialized, skipping initialization");
          // If platform exists, verify the initializer is an authority
          assert.ok(existingPlatformConfig.authorities.some(auth => auth.equals(authority)));
          return;
        } catch (error) {
          // Platform doesn't exist, proceed with initialization
        }

        const accounts = {
          platformConfig: platformConfigPda,
          authority: authority,
          systemProgram: anchor.web3.SystemProgram.programId,
        };
        console.log("initializePlatform accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));

        const txid_initialize = await program.methods
          .initializePlatform()
          .accountsStrict(accounts)
          .rpc();
        console.log("initializePlatform transaction:", txid_initialize);

        const platformConfigAccount = await program.account.platformConfig.fetch(platformConfigPda);
        assert.equal(platformConfigAccount.authorities.length, 1);
        assert.ok(platformConfigAccount.authorities[0].equals(authority));
        assert.equal(platformConfigAccount.projectCount.toNumber(), 0);
      });

      it("Registers a project", async () => {
        // Get current platform state
        const platformConfigAccountBefore = await program.account.platformConfig.fetch(platformConfigPda);
        const projectCount = platformConfigAccountBefore.projectCount;

        [projectConfigPda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("project"), projectCount.toBuffer('le', 8)],
          program.programId
        );

        [vaultPda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("vault"), projectCount.toBuffer('le', 8)],
            program.programId
        );
        
        [vaultAuthorityPda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("vault-authority"), projectCount.toBuffer('le', 8)],
            program.programId
        );

        // Check if project is already registered
        try {
          const existingProjectConfig = await program.account.projectConfig.fetch(projectConfigPda);
          console.log("Project already registered, skipping registration");
          // Verify the project configuration
          assert.ok(existingProjectConfig.tokenMint.equals(tokenMint));
          assert.ok(existingProjectConfig.vault.equals(vaultPda));
          return;
        } catch (error) {
          // Project doesn't exist, proceed with registration
        }

        const accounts = {
          platformConfig: platformConfigPda,
          projectConfig: projectConfigPda,
          tokenMint: tokenMint,
          vault: vaultPda,
          vaultAuthority: vaultAuthorityPda,
          authority: authority,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: tokenProgram,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        };
        console.log("registerProject accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));

        const projectName = "My Test Project";
        const allowedDurations = [1, 7, 30]; // e.g., 1 day, 7 days, 30 days
        console.log("registerProject params:", { projectName, allowedDurations });
        const txid_register = await program.methods
          .registerProject(projectName, allowedDurations)
          .accountsStrict(accounts)
          .rpc();
        console.log("registerProject transaction:", txid_register);

        const platformConfigAccountAfter = await program.account.platformConfig.fetch(platformConfigPda);
        assert.equal(platformConfigAccountAfter.projectCount.toNumber(), projectCount.toNumber() + 1);

        const projectConfigAccount = await program.account.projectConfig.fetch(projectConfigPda);
        assert.ok(projectConfigAccount.tokenMint.equals(tokenMint));
        assert.ok(projectConfigAccount.vault.equals(vaultPda));
        assert.equal(projectConfigAccount.name, projectName);
        assert.ok(projectConfigAccount.feeWallet.equals(authority));
        assert.ok(projectConfigAccount.tokenProgram.equals(tokenProgram));
        assert.equal(projectConfigAccount.unstakeFeeBps, 0);
        assert.equal(projectConfigAccount.emergencyUnstakeFeeBps, 0);
        assert.deepEqual(projectConfigAccount.allowedDurations, allowedDurations);
      });

      it("Updates allowed durations", async () => {
        const newAllowedDurations = [0, 14, 30, 90]; // Added 0 for testing unstake
        const accounts = {
          platformConfig: platformConfigPda,
          projectConfig: projectConfigPda,
          authority: authority,
          systemProgram: anchor.web3.SystemProgram.programId,
        };
        console.log("updateAllowedDurations accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
        console.log("updateAllowedDurations params:", { newAllowedDurations });

        await program.methods
          .updateAllowedDurations(newAllowedDurations)
          .accountsStrict(accounts)
          .rpc();
        
        const projectConfig = await program.account.projectConfig.fetch(projectConfigPda);
        assert.deepEqual(projectConfig.allowedDurations, newAllowedDurations);
      });

      it("Fails to stake with a non-allowed duration", async () => {
        const amountToStake = new anchor.BN(10 * 10 ** 9);
        const nonAllowedDuration = 5; // This duration is not in [14, 30, 90]
        const stakeId = new anchor.BN(99 + suiteIndex * 100); // Unique stakeId

        const [stakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("stake"), projectConfigPda.toBuffer(), user.publicKey.toBuffer(), stakeId.toBuffer('le', 8)],
            program.programId
        );

        // HACK: Provide unstakeInfo PDA to satisfy client-side validation bug
        const [unstakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("unstake"), stakeInfoPda.toBuffer()],
            program.programId
        );

        const accounts = {
            projectConfig: projectConfigPda,
            stakeInfo: stakeInfoPda,
            unstakeInfo: unstakeInfoPda, // HACK
            user: user.publicKey,
            userTokenAccount: userTokenAccount,
            vault: vaultPda,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: tokenProgram,
        };
        console.log("stake (fail) accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
        console.log("stake (fail) params:", { amountToStake: amountToStake.toString(), nonAllowedDuration, stakeId: stakeId.toString() });

        try {
            await (program.methods.stake as any)(amountToStake, nonAllowedDuration, stakeId)
                .accounts(accounts)
                .signers([user])
                .rpc();
            assert.fail("Staking should have failed with a non-allowed duration.");
        } catch (error) {
            assert.include(error.message, "InvalidDuration");
        }
      });

      describe("Authority Management", () => {
        it("Fails to add an authority using a non-authority account", async () => {
            const accounts = {
                platformConfig: platformConfigPda,
                authority: newAuthority.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            };
            console.log("addAuthority (fail) accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
            console.log("addAuthority (fail) params:", { newAuthority: authority.toBase58() });
            try {
                await program.methods
                    .addAuthority(authority)
                    .accountsStrict(accounts)
                    .signers([newAuthority])
                    .rpc();
                assert.fail("Should have failed to add authority with a non-authority key.");
            } catch (error) {
                // Anchor v0.29.0 wraps the error, so we need to check the inner message
                assert.include(error.toString(), "NotPlatformAuthority");
            }
        });

        it("Adds a new authority", async () => {
            const platformConfigBefore = await program.account.platformConfig.fetch(platformConfigPda);
            const authorityCountBefore = platformConfigBefore.authorities.length;

            const accounts = {
                platformConfig: platformConfigPda,
                authority: authority,
                systemProgram: anchor.web3.SystemProgram.programId,
            };
            console.log("addAuthority accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
            console.log("addAuthority params:", { newAuthority: newAuthority.publicKey.toBase58() });

            await program.methods
                .addAuthority(newAuthority.publicKey)
                .accountsStrict(accounts)
                .rpc();

            const platformConfigAfter = await program.account.platformConfig.fetch(platformConfigPda);
            assert.equal(platformConfigAfter.authorities.length, authorityCountBefore + 1);
            assert.ok(platformConfigAfter.authorities.some(auth => auth.equals(newAuthority.publicKey)));
        });

        it("New authority can register a project", async () => {
            const platformConfigAccountBefore = await program.account.platformConfig.fetch(platformConfigPda);
            const projectCount = platformConfigAccountBefore.projectCount;

            [newAuthorityProjectConfigPda] = await anchor.web3.PublicKey.findProgramAddress(
                [Buffer.from("project"), projectCount.toBuffer('le', 8)],
                program.programId
            );

            const [newVaultPda] = await anchor.web3.PublicKey.findProgramAddress(
                [Buffer.from("vault"), projectCount.toBuffer('le', 8)],
                program.programId
            );

            const [newVaultAuthorityPda] = await anchor.web3.PublicKey.findProgramAddress(
                [Buffer.from("vault-authority"), projectCount.toBuffer('le', 8)],
                program.programId
            );
            
            const accounts = {
                platformConfig: platformConfigPda,
                projectConfig: newAuthorityProjectConfigPda,
                tokenMint: tokenMint,
                vault: newVaultPda,
                vaultAuthority: newVaultAuthorityPda,
                authority: newAuthority.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: tokenProgram,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            };
            
            const projectName = "Project by New Authority";
            const allowedDurations = [1, 2, 3];
            console.log("registerProject (new authority) accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
            console.log("registerProject (new authority) params:", { projectName, allowedDurations });
            await program.methods
                .registerProject(projectName, allowedDurations)
                .accountsStrict(accounts)
                .signers([newAuthority])
                .rpc();

            const platformConfigAccountAfter = await program.account.platformConfig.fetch(platformConfigPda);
            assert.equal(platformConfigAccountAfter.projectCount.toNumber(), projectCount.toNumber() + 1);
            
            const projectConfigAccount = await program.account.projectConfig.fetch(newAuthorityProjectConfigPda);
            assert.equal(projectConfigAccount.name, projectName);
        });

        it("Removes an authority", async () => {
            const platformConfigBefore = await program.account.platformConfig.fetch(platformConfigPda);
            const authorityCountBefore = platformConfigBefore.authorities.length;

            const accounts = {
                platformConfig: platformConfigPda,
                authority: authority,
                systemProgram: anchor.web3.SystemProgram.programId,
            };
            console.log("removeAuthority accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
            console.log("removeAuthority params:", { authorityToRemove: newAuthority.publicKey.toBase58() });

            await program.methods
                .removeAuthority(newAuthority.publicKey)
                .accountsStrict(accounts)
                .rpc();

            const platformConfigAfter = await program.account.platformConfig.fetch(platformConfigPda);
            assert.equal(platformConfigAfter.authorities.length, authorityCountBefore - 1);
            assert.isFalse(platformConfigAfter.authorities.some(auth => auth.equals(newAuthority.publicKey)));
        });

        it("Removed authority cannot register a project", async () => {
            const platformConfigAccountBefore = await program.account.platformConfig.fetch(platformConfigPda);
            const projectCount = platformConfigAccountBefore.projectCount;

            const [newProjectConfigPda] = await anchor.web3.PublicKey.findProgramAddress(
                [Buffer.from("project"), projectCount.toBuffer('le', 8)],
                program.programId
            );

            const [newVaultPda] = await anchor.web3.PublicKey.findProgramAddress(
                [Buffer.from("vault"), projectCount.toBuffer('le', 8)],
                program.programId
            );

            const [newVaultAuthorityPda] = await anchor.web3.PublicKey.findProgramAddress(
                [Buffer.from("vault-authority"), projectCount.toBuffer('le', 8)],
                program.programId
            );
            
            const accounts = {
                platformConfig: platformConfigPda,
                projectConfig: newProjectConfigPda,
                tokenMint: tokenMint,
                vault: newVaultPda,
                vaultAuthority: newVaultAuthorityPda,
                authority: newAuthority.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: tokenProgram,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            };
            
            try {
                const projectName = "Project by Removed Authority";
                const allowedDurations = [4, 5, 6];
                console.log("registerProject (removed authority) accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
                console.log("registerProject (removed authority) params:", { projectName, allowedDurations });
                await program.methods
                    .registerProject(projectName, allowedDurations)
                    .accountsStrict(accounts)
                    .signers([newAuthority])
                    .rpc();
                assert.fail("Removed authority should not be able to register a project.");
            } catch (error) {
                assert.include(error.toString(), "NotPlatformAuthority");
            }
        });

        it("Removed authority cannot update project config", async () => {
            const accounts = {
                platformConfig: platformConfigPda,
                projectConfig: newAuthorityProjectConfigPda,
                authority: newAuthority.publicKey,
            };
            console.log("updateProjectConfig (removed authority) accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
            try {
                await program.methods
                    .updateProjectConfig(feeWallet.publicKey, 500, 500)
                    .accountsStrict(accounts)
                    .signers([newAuthority])
                    .rpc();
                assert.fail("Removed authority should not be able to update project config.");
            } catch (error) {
                assert.include(error.toString(), "NotPlatformAuthority");
            }
        });

        it("Fails to remove the last authority", async () => {
            const platformConfig = await program.account.platformConfig.fetch(platformConfigPda);
            // In our test flow, there should only be one authority left.
            assert.equal(platformConfig.authorities.length, 1);
            const lastAuthority = platformConfig.authorities[0];

            const accounts = {
                platformConfig: platformConfigPda,
                authority: authority, // The signer must be an authority
                systemProgram: anchor.web3.SystemProgram.programId,
            };
            console.log("removeAuthority (fail) accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
            console.log("removeAuthority (fail) params:", { authorityToRemove: lastAuthority.toBase58() });
            try {
                await program.methods
                    .removeAuthority(lastAuthority)
                    .accountsStrict(accounts)
                    .rpc();
                assert.fail("Should have failed to remove the last authority.");
            } catch (error) {
                assert.include(error.toString(), "CannotRemoveLastAuthority");
            }
        });
      });

      it("Updates project config for fees", async () => {
        const unstakeFeeBps = 100; // 1%
        const emergencyUnstakeFeeBps = 100; // 1%

        const accounts = {
            platformConfig: platformConfigPda,
            projectConfig: projectConfigPda,
            authority: authority,
        };
        console.log("updateProjectConfig accounts:", JSON.stringify(accounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
        console.log("updateProjectConfig params:", { feeWallet: feeWallet.publicKey.toBase58(), unstakeFeeBps, emergencyUnstakeFeeBps });

        const txid = await program.methods
          .updateProjectConfig(feeWallet.publicKey, unstakeFeeBps, emergencyUnstakeFeeBps)
          .accountsStrict(accounts)
          .rpc();
        
        console.log("updateProjectConfig transaction:", txid);

        const projectConfigAccount = await program.account.projectConfig.fetch(projectConfigPda);
        assert.ok(projectConfigAccount.feeWallet.equals(feeWallet.publicKey));
        assert.equal(projectConfigAccount.unstakeFeeBps, unstakeFeeBps);
        assert.equal(projectConfigAccount.emergencyUnstakeFeeBps, emergencyUnstakeFeeBps);
      });

      it("Stakes tokens (1st stake)", async () => {
        const amountToStake = new anchor.BN(100 * 10 ** 9);
        const durationDays = 14; // This is now an allowed duration
        const stakeId = new anchor.BN(1 + suiteIndex * 100); // Unique stakeId

        const [stakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("stake"), projectConfigPda.toBuffer(), user.publicKey.toBuffer(), stakeId.toBuffer('le', 8)],
          program.programId
        );
        stakes.push({ id: stakeId, pda: stakeInfoPda, amount: amountToStake, duration: durationDays });

        // HACK: Provide unstakeInfo PDA to satisfy client-side validation bug
        const [unstakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("unstake"), stakeInfoPda.toBuffer()],
            program.programId
        );

        const stakeAccounts = {
          projectConfig: projectConfigPda,
          stakeInfo: stakeInfoPda,
          unstakeInfo: unstakeInfoPda, // HACK
          user: user.publicKey,
          userTokenAccount: userTokenAccount,
          vault: vaultPda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: tokenProgram,
        };
        console.log("stake (1st) accounts:", JSON.stringify(stakeAccounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
        console.log("stake (1st) params:", { amountToStake: amountToStake.toString(), durationDays, stakeId: stakeId.toString() });

        await (program.methods.stake as any)(amountToStake, durationDays, stakeId)
          .accounts(stakeAccounts)
          .signers([user])
          .rpc();

        const stakeInfoAccount = await program.account.userStakeInfo.fetch(stakeInfoPda);
        assert.ok(stakeInfoAccount.user.equals(user.publicKey));
        assert.equal(stakeInfoAccount.amount.toNumber(), amountToStake.toNumber());
        assert.equal(stakeInfoAccount.durationDays, durationDays);
        assert.equal((stakeInfoAccount as any).stakeId.toString(), stakeId.toString());
        assert.isTrue(stakeInfoAccount.isStaked);

        const vaultAccount = await getAccount(provider.connection, vaultPda, undefined, tokenProgram);
        assert.equal(vaultAccount.amount.toString(), amountToStake.toString());
      });

      it("Stakes tokens (2nd stake)", async () => {
        const vaultAccountBefore = await getAccount(provider.connection, vaultPda, undefined, tokenProgram);

        const amountToStake = new anchor.BN(50 * 10 ** 9);
        const durationDays = 30; // This is now an allowed duration
        const stakeId = new anchor.BN(2 + suiteIndex * 100); // Unique stakeId

        const [stakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("stake"), projectConfigPda.toBuffer(), user.publicKey.toBuffer(), stakeId.toBuffer('le', 8)],
          program.programId
        );
        stakes.push({ id: stakeId, pda: stakeInfoPda, amount: amountToStake, duration: durationDays });

        // HACK: Provide unstakeInfo PDA to satisfy client-side validation bug
        const [unstakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("unstake"), stakeInfoPda.toBuffer()],
            program.programId
        );

        const stakeAccounts = {
          projectConfig: projectConfigPda,
          stakeInfo: stakeInfoPda,
          unstakeInfo: unstakeInfoPda, // HACK
          user: user.publicKey,
          userTokenAccount: userTokenAccount,
          vault: vaultPda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: tokenProgram,
        };
        console.log("stake (2nd) accounts:", JSON.stringify(stakeAccounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
        console.log("stake (2nd) params:", { amountToStake: amountToStake.toString(), durationDays, stakeId: stakeId.toString() });

        await (program.methods.stake as any)(amountToStake, durationDays, stakeId)
          .accounts(stakeAccounts)
          .signers([user])
          .rpc();

        const stakeInfoAccount = await program.account.userStakeInfo.fetch(stakeInfoPda);
        assert.ok(stakeInfoAccount.user.equals(user.publicKey));
        assert.equal(stakeInfoAccount.amount.toNumber(), amountToStake.toNumber());
        assert.equal(stakeInfoAccount.durationDays, durationDays);
        assert.equal((stakeInfoAccount as any).stakeId.toString(), stakeId.toString());
        assert.isTrue(stakeInfoAccount.isStaked);

        const vaultAccountAfter = await getAccount(provider.connection, vaultPda, undefined, tokenProgram);
        const expectedVaultAmount = BigInt(vaultAccountBefore.amount.toString()) + BigInt(amountToStake.toString());
        assert.equal(vaultAccountAfter.amount.toString(), expectedVaultAmount.toString());
      });

      it("Unstakes tokens after lockup period", async () => {
        // This test requires a stake with a 0-day duration, which we now allow.
        const amountToStake = new anchor.BN(10 * 10 ** 9);
        const durationDays = 0;
        const stakeId = new anchor.BN(3 + suiteIndex * 100); // Unique stakeId

        const [stakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("stake"), projectConfigPda.toBuffer(), user.publicKey.toBuffer(), stakeId.toBuffer('le', 8)],
          program.programId
        );
        // We don't add this to the main 'stakes' array as it's for a one-off test
        
        // Stake first
        // HACK: Provide unstakeInfo PDA to satisfy client-side validation bug
        const [unstakeInfoForStakePda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("unstake"), stakeInfoPda.toBuffer()],
            program.programId
        );

        await (program.methods.stake as any)(amountToStake, durationDays, stakeId)
            .accounts({
                projectConfig: projectConfigPda,
                stakeInfo: stakeInfoPda,
                unstakeInfo: unstakeInfoForStakePda, // HACK
                user: user.publicKey,
                userTokenAccount: userTokenAccount,
                vault: vaultPda,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: tokenProgram,
            })
            .signers([user])
            .rpc();

        // Now, unstake
        const [unstakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("unstake"), stakeInfoPda.toBuffer()],
            program.programId
        );

        const userTokenAccountBefore = await getAccount(provider.connection, userTokenAccount, undefined, tokenProgram);
        const feeWalletAccountBefore = await getAccount(provider.connection, feeWalletTokenAccount, undefined, tokenProgram);
        const vaultAccountBefore = await getAccount(provider.connection, vaultPda, undefined, tokenProgram);
        
        const unstakeAccounts = {
            projectConfig: projectConfigPda,
            stakeInfo: stakeInfoPda,
            unstakeInfo: unstakeInfoPda,
            user: user.publicKey,
            userTokenAccount: userTokenAccount,
            vault: vaultPda,
            vaultAuthority: vaultAuthorityPda,
            feeWallet: feeWalletTokenAccount,
            tokenProgram: tokenProgram,
            systemProgram: anchor.web3.SystemProgram.programId,
        };
        
        await program.methods.unstake(stakeId)
            .accounts(unstakeAccounts)
            .signers([user])
            .rpc();

        // 1. Verify the original stake account is marked as not staked
        const stakeInfoAccountAfter = await program.account.userStakeInfo.fetch(stakeInfoPda);
        assert.isFalse(stakeInfoAccountAfter.isStaked);

        // 2. Verify the new unstakeInfo account was created correctly
        const unstakeInfoAccount = await program.account.unstakeInfo.fetch(unstakeInfoPda);
        assert.ok(unstakeInfoAccount.user.equals(user.publicKey));
        assert.ok(unstakeInfoAccount.stakeInfo.equals(stakeInfoPda));
        assert.deepEqual(unstakeInfoAccount.status, { unstaked: {} });

        // 3. Verify token balances
        const projectConfig = await program.account.projectConfig.fetch(projectConfigPda);
        const feeAmount = BigInt(amountToStake.toString()) * BigInt(projectConfig.unstakeFeeBps) / BigInt(10000);
        const amountToUser = BigInt(amountToStake.toString()) - feeAmount;

        const userTokenAccountAfter = await getAccount(provider.connection, userTokenAccount, undefined, tokenProgram);
        const expectedUserBalance = BigInt(userTokenAccountBefore.amount.toString()) + amountToUser;
        assert.equal(userTokenAccountAfter.amount.toString(), expectedUserBalance.toString());

        const feeWalletAccountAfter = await getAccount(provider.connection, feeWalletTokenAccount, undefined, tokenProgram);
        const expectedFeeWalletBalance = BigInt(feeWalletAccountBefore.amount.toString()) + feeAmount;
        assert.equal(feeWalletAccountAfter.amount.toString(), expectedFeeWalletBalance.toString());
        
        const vaultAccountAfter = await getAccount(provider.connection, vaultPda, undefined, tokenProgram);
        const expectedVaultAmount = BigInt(vaultAccountBefore.amount) - BigInt(amountToStake.toString());
        assert.equal(vaultAccountAfter.amount.toString(), expectedVaultAmount.toString());
      });


      it("Emergency unstakes one of the stakes", async () => {
        const stakeToUnstake = stakes[0]; // Using the 14-day stake
        const remainingStake = stakes[1];
        
        const [unstakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("unstake"), stakeToUnstake.pda.toBuffer()],
          program.programId
        );

        const projectConfig = await program.account.projectConfig.fetch(projectConfigPda);
        const userTokenAccountBefore = await getAccount(provider.connection, userTokenAccount, undefined, tokenProgram);
        const stakeInfoAccountBefore = await program.account.userStakeInfo.fetch(stakeToUnstake.pda);
        const amountStaked = stakeInfoAccountBefore.amount;
        const vaultAccountBefore = await getAccount(provider.connection, vaultPda, undefined, tokenProgram);
        const feeWalletAccountBefore = await getAccount(provider.connection, feeWalletTokenAccount, undefined, tokenProgram);

        const emergencyUnstakeAccounts = {
          projectConfig: projectConfigPda,
          stakeInfo: stakeToUnstake.pda,
          unstakeInfo: unstakeInfoPda,
          user: user.publicKey,
          userTokenAccount: userTokenAccount,
          vault: vaultPda,
          vaultAuthority: vaultAuthorityPda,
          feeWallet: feeWalletTokenAccount,
          tokenProgram: tokenProgram,
          systemProgram: anchor.web3.SystemProgram.programId,
        };
        console.log("emergencyUnstake accounts:", JSON.stringify(emergencyUnstakeAccounts, (key, value) => (value?.toBase58 ? value.toBase58() : value), 2));
        console.log("emergencyUnstake params:", { stakeId: stakeToUnstake.id.toString() });

        await program.methods.emergencyUnstake(stakeToUnstake.id)
          .accounts(emergencyUnstakeAccounts)
          .signers([user])
          .rpc();
        
        // 1. The stake_info account should NOT be closed, but its status updated.
        const stakeInfoAccountAfter = await program.account.userStakeInfo.fetch(stakeToUnstake.pda);
        assert.isFalse(stakeInfoAccountAfter.isStaked);

        // 2. A new unstakeInfo account should be created.
        const unstakeInfoAccount = await program.account.unstakeInfo.fetch(unstakeInfoPda);
        assert.ok(unstakeInfoAccount.user.equals(user.publicKey));
        assert.ok(unstakeInfoAccount.stakeInfo.equals(stakeToUnstake.pda));
        assert.equal(unstakeInfoAccount.amount.toString(), amountStaked.toString());
        assert.deepEqual(unstakeInfoAccount.status, { emergencyUnstaked: {} });
        
        // 3. Verify token balances are correct.
        const feeAmount = BigInt(amountStaked.toString()) * BigInt(projectConfig.emergencyUnstakeFeeBps) / BigInt(10000);
        const amountToUser = BigInt(amountStaked.toString()) - feeAmount;

        const userTokenAccountAfter = await getAccount(provider.connection, userTokenAccount, undefined, tokenProgram);
        const expectedUserBalance = BigInt(userTokenAccountBefore.amount.toString()) + amountToUser;
        assert.equal(userTokenAccountAfter.amount.toString(), expectedUserBalance.toString());

        const feeWalletAccountAfter = await getAccount(provider.connection, feeWalletTokenAccount, undefined, tokenProgram);
        const expectedFeeWalletBalance = BigInt(feeWalletAccountBefore.amount.toString()) + feeAmount;
        assert.equal(feeWalletAccountAfter.amount.toString(), expectedFeeWalletBalance.toString());

        const vaultAccountAfter = await getAccount(provider.connection, vaultPda, undefined, tokenProgram);
        const expectedVaultAmount = BigInt(vaultAccountBefore.amount) - BigInt(amountStaked.toString());
        assert.equal(vaultAccountAfter.amount.toString(), expectedVaultAmount.toString());

        // 4. Verify the second stake is still there and active.
        const remainingStakeAccount = await program.account.userStakeInfo.fetch(remainingStake.pda);
        assert.isTrue(remainingStakeAccount.isStaked);
        assert.equal(remainingStakeAccount.amount.toString(), remainingStake.amount.toString());
        const vaultFinalAmount = await getAccount(provider.connection, vaultPda, undefined, tokenProgram);
        assert.equal(vaultFinalAmount.amount.toString(), remainingStake.amount.toString());
      });

      it("Fails to emergency unstake after lockup period ends", async () => {
        // This test uses a stake with a 0-day duration, which we have allowed.
        const amountToStake = new anchor.BN(10 * 10 ** 9);
        const durationDays = 0;
        const stakeId = new anchor.BN(4 + suiteIndex * 100); // Unique stakeId for this test

        const [stakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("stake"), projectConfigPda.toBuffer(), user.publicKey.toBuffer(), stakeId.toBuffer('le', 8)],
          program.programId
        );

        // First, we need to stake the tokens.
        const [unstakeInfoForStakePda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("unstake"), stakeInfoPda.toBuffer()],
            program.programId
        );
        await (program.methods.stake as any)(amountToStake, durationDays, stakeId)
            .accounts({
                projectConfig: projectConfigPda,
                stakeInfo: stakeInfoPda,
                unstakeInfo: unstakeInfoForStakePda,
                user: user.publicKey,
                userTokenAccount: userTokenAccount,
                vault: vaultPda,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: tokenProgram,
            })
            .signers([user])
            .rpc();

        // A small delay to ensure the next block has a later timestamp.
        await sleep(1000);

        // Now, attempt to call emergencyUnstake, which should fail.
        const [unstakeInfoPda] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("unstake"), stakeInfoPda.toBuffer()],
            program.programId
        );

        const emergencyUnstakeAccounts = {
          projectConfig: projectConfigPda,
          stakeInfo: stakeInfoPda,
          unstakeInfo: unstakeInfoPda,
          user: user.publicKey,
          userTokenAccount: userTokenAccount,
          vault: vaultPda,
          vaultAuthority: vaultAuthorityPda,
          feeWallet: feeWalletTokenAccount,
          tokenProgram: tokenProgram,
          systemProgram: anchor.web3.SystemProgram.programId,
        };

        try {
          await program.methods.emergencyUnstake(stakeId)
            .accounts(emergencyUnstakeAccounts)
            .signers([user])
            .rpc();
          assert.fail("Emergency unstake should have failed as lockup period is over.");
        } catch (error) {
          assert.include(error.toString(), "LockupPeriodEnded");
        }
      });
    });
  });
});
