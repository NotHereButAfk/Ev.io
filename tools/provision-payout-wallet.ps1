param([Parameter(Mandatory=$true)][string]$BackupDirectory)
$ErrorActionPreference = 'Stop'
# Run from the repository root. Only the public address reaches stdout.
Add-Type -AssemblyName System.Security
$backupRoot = [IO.Path]::GetFullPath($BackupDirectory)
$repoRoot = [IO.Path]::GetFullPath((Get-Location).Path)
if ($backupRoot.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup must be outside the repository' }
[IO.Directory]::CreateDirectory($backupRoot) | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $backupRoot /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect backup directory' }
$backupFile = Join-Path $backupRoot 'payout-seed.dpapi'
if (Test-Path -LiteralPath $backupFile) {
  $seedBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($backupFile),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
} else {
  $seedBytes = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($seedBytes)
  $protected = [Security.Cryptography.ProtectedData]::Protect($seedBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($backupFile,$protected)
}
try {
  $roundTrip = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($backupFile),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  if ([Convert]::ToHexString($roundTrip) -ne [Convert]::ToHexString($seedBytes)) { throw 'Backup verification failed' }
  $seedHex = [Convert]::ToHexString($seedBytes).ToLowerInvariant()
  $publicAddress = $seedHex | node --input-type=module -e 'import {signerFromSeed} from "./server/solana-payouts.mjs";let s="";for await(const c of process.stdin)s+=c;console.log((await signerFromSeed(s.trim())).address);'
  if ($LASTEXITCODE -ne 0 -or $publicAddress -notmatch '^[1-9A-HJ-NP-Za-km-z]{32,44}$') { throw 'Wallet derivation failed' }
  $seedHex | gh secret set SOLANA_PAYOUT_SEED --repo NotHereButAfk/Ev.io
  if ($LASTEXITCODE -ne 0) { throw 'Secret upload failed; encrypted backup retained' }
  [IO.File]::WriteAllText((Join-Path $backupRoot 'public-address.txt'),$publicAddress)
  Write-Output "Public payout address: $publicAddress"
  Write-Output "Encrypted backup: $backupFile (requires this Windows user profile). Payouts remain disabled."
} finally {
  if ($seedBytes) { [Array]::Clear($seedBytes) }
  if ($roundTrip) { [Array]::Clear($roundTrip) }
  $seedHex = $null
}
