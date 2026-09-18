# Server-managed Solana USDC payouts

Minimum: 5,000 K = 5 USDC. No per-withdrawal, per-player daily, or global daily maximum. Existing K balances are preserved. Account review, available K, treasury liquidity, and Solana network fees still apply.

The game reserves K transactionally. Each withdrawal gets a unique memo and a signed transaction saved in PostgreSQL before broadcast. Retries broadcast those exact bytes. Finalized success completes the withdrawal; finalized failure returns K once. An expired transaction with no verifiable history enters review and retains its K reservation. Never manually retry that withdrawal with a new transfer without reconciling its original signature.

## Setup

Requires Node >=20.18 and the root production dependencies as well as server dependencies.

Run `tools/provision-payout-wallet.ps1 -BackupDirectory <private directory outside repo>` from the repo root, logged in to GitHub CLI. This generates a separate treasury, saves a Windows-user-encrypted backup, verifies recovery, and uploads the seed to the repository's `SOLANA_PAYOUT_SEED` Actions secret. Re-running reuses the same backup; it never rotates an existing treasury. Never print or send the seed in chat. The encrypted backup depends on that Windows profile; arrange a separately recoverable secure backup before enabling payouts.

Deploy writes `server/.payout-wallet.json` with owner-only permissions. Its key is never built into the browser. Missing configuration is disabled. Keep treasury funds separate from checkout receipts. USDC must be the Solana mainnet mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. The treasury also needs SOL for fees and recipient token-account creation. A server compromise can spend treasury funds, so use a dedicated operational wallet.

After backup, funding, and an approved live payout check, set repository Actions variables `SOLANA_PAYOUT_BACKUP_CONFIRMED=true` and `SOLANA_PAYOUT_ENABLED=true` and redeploy. Neither is set automatically. Setting enabled false stops new reservations and new signing, while previously signed transactions are reconciled. This is not a transaction cancellation switch.

Back up PostgreSQL and the treasury key securely. After restoring an old database backup, keep payouts disabled and reconcile chain history before processing jobs: restoring past the signing record can otherwise lose idempotency evidence. Keep the signed-transfer table and withdrawal ledger together.

Tests use disposable keys and a fake RPC; no test sends real funds. Mainnet delivery remains unverified until an authorized funded test is completed.

A paused wallet does not require RPC availability to serve withdrawal history. Mainnet verification remains mandatory before signing, reserving new payouts, or reconciling/broadcasting saved transfers. Deployment reports RPC readiness separately; a paused deployment can succeed with an RPC warning, which must be resolved before activation.
