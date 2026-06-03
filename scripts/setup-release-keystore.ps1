<#
.SYNOPSIS
    One-time setup for signing Memoir release APKs on Windows.

.DESCRIPTION
    Generates a PKCS12 (.p12) keystore using only Windows' built-in
    New-SelfSignedCertificate cmdlet — no JDK, no openssl, no Git Bash
    required. Optionally uploads the four required GitHub Secrets via
    the GitHub CLI if it is installed and authenticated; otherwise
    writes a paste-ready file for the GitHub web UI.

.NOTES
    Run from PowerShell in the repo root:
        powershell -ExecutionPolicy Bypass -File scripts\setup-release-keystore.ps1

    IMPORTANT: keep memoir-release.p12 + the password in a safe place.
    If you lose them you can never publish an in-place upgrade for
    users who already installed an earlier release.
#>

[CmdletBinding()]
param(
    [string]$Repo = 'DTS-11/Memoir',
    [string]$KeystorePath = 'memoir-release.p12',
    [string]$KeyAlias = 'memoir'
)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "== Memoir release keystore setup ==" -ForegroundColor Cyan
Write-Host "This will generate a self-signed PKCS12 keystore valid for ~27 years."
Write-Host ""

# ---- Overwrite guard -------------------------------------------------
if (Test-Path $KeystorePath) {
    $reply = Read-Host "$KeystorePath already exists. Overwrite? (y/N)"
    if ($reply -notmatch '^[Yy]') {
        Write-Host "Aborted." -ForegroundColor Yellow
        return
    }
    Remove-Item $KeystorePath -Force
}

# ---- Password prompt -------------------------------------------------
function Read-PasswordSecure {
    while ($true) {
        $a = Read-Host -AsSecureString -Prompt "Keystore password (min 6 chars)"
        $b = Read-Host -AsSecureString -Prompt "Confirm password"
        $aPlain = [System.Net.NetworkCredential]::new('', $a).Password
        $bPlain = [System.Net.NetworkCredential]::new('', $b).Password
        if ($aPlain.Length -lt 6) {
            Write-Host "Password too short. Try again." -ForegroundColor Yellow
            continue
        }
        if ($aPlain -ne $bPlain) {
            Write-Host "Passwords do not match. Try again." -ForegroundColor Yellow
            continue
        }
        return @{ Secure = $a; Plain = $aPlain }
    }
}

$pw = Read-PasswordSecure
$passwordSecure = $pw.Secure
$passwordPlain  = $pw.Plain

# ---- Generate self-signed cert + key ---------------------------------
Write-Host ""
Write-Host "Generating self-signed certificate and RSA key..." -ForegroundColor Cyan

$certParams = @{
    Subject           = "CN=Memoir, O=Memoir, C=XX"
    KeyAlgorithm      = 'RSA'
    KeyLength         = 2048
    HashAlgorithm     = 'SHA256'
    NotBefore         = (Get-Date).AddDays(-1)
    NotAfter          = (Get-Date).AddYears(27)
    CertStoreLocation = 'Cert:\CurrentUser\My'
    KeyExportPolicy   = 'Exportable'
    KeyUsage          = 'DigitalSignature'
    FriendlyName      = $KeyAlias
    Type              = 'Custom'
}

$cert = New-SelfSignedCertificate @certParams

try {
    # Export as PKCS12 (.NET's PFX format == PKCS12).
    $pfxBytes = $cert.Export('Pfx', $passwordPlain)
    [System.IO.File]::WriteAllBytes(
        (Join-Path (Get-Location) $KeystorePath),
        $pfxBytes
    )
}
finally {
    # Clean up the cert from the Windows store so it doesn't linger.
    Remove-Item $cert.PSPath -Force -ErrorAction SilentlyContinue
}

Write-Host "Wrote $((Resolve-Path $KeystorePath).Path)" -ForegroundColor Green

# ---- Verify the keystore round-trips ---------------------------------
try {
    $verify = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
        $KeystorePath,
        $passwordSecure,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
    )
    $fingerprint = ($verify.GetCertHashString('SHA256') -split '(..)' | Where-Object { $_ }) -join ':'
    Write-Host ""
    Write-Host "Certificate SHA-256 fingerprint:" -ForegroundColor Cyan
    Write-Host "  $fingerprint"
    Write-Host "(This identity must stay the same for all future releases.)"
}
catch {
    Write-Error "Failed to verify the generated keystore: $_"
    exit 1
}

# ---- Base64 for GitHub Secret ----------------------------------------
$base64 = [Convert]::ToBase64String($pfxBytes)

# ---- Upload secrets (gh CLI) OR write paste-ready file ---------------
$ghAvailable = $false
if (Get-Command gh -ErrorAction SilentlyContinue) {
    try {
        gh auth status 1>$null 2>$null
        if ($LASTEXITCODE -eq 0) { $ghAvailable = $true }
    }
    catch {}
}

Write-Host ""
if ($ghAvailable) {
    Write-Host "GitHub CLI detected and authenticated. Uploading secrets to $Repo ..." -ForegroundColor Cyan
    $base64        | gh secret set ANDROID_KEYSTORE_BASE64   -R $Repo
    $passwordPlain | gh secret set ANDROID_KEYSTORE_PASSWORD -R $Repo
    $KeyAlias      | gh secret set ANDROID_KEY_ALIAS         -R $Repo
    $passwordPlain | gh secret set ANDROID_KEY_PASSWORD      -R $Repo
    Write-Host ""
    Write-Host "All four GitHub Secrets are set on $Repo." -ForegroundColor Green
    Write-Host "Verify with: gh secret list -R $Repo"
    if (Test-Path 'github-secrets-to-upload.txt') {
        Remove-Item 'github-secrets-to-upload.txt' -Force
    }
}
else {
    $secretsPath = 'github-secrets-to-upload.txt'
    @"
Upload these four GitHub Secrets at:
  https://github.com/$Repo/settings/secrets/actions

----------------------------------------------------------------
ANDROID_KEYSTORE_BASE64
----------------------------------------------------------------
$base64

----------------------------------------------------------------
ANDROID_KEYSTORE_PASSWORD
----------------------------------------------------------------
(paste the keystore password you typed in the terminal)

----------------------------------------------------------------
ANDROID_KEY_ALIAS
----------------------------------------------------------------
$KeyAlias

----------------------------------------------------------------
ANDROID_KEY_PASSWORD
----------------------------------------------------------------
(paste the same keystore password again)
"@ | Set-Content -Path $secretsPath -Encoding utf8

    Write-Host "GitHub CLI not found (or not authenticated)." -ForegroundColor Yellow
    Write-Host "Wrote paste-ready values to: $secretsPath"
    Write-Host ""
    Write-Host "Open the file, copy each value into the matching secret on GitHub,"
    Write-Host "then delete the file. It is gitignored and contains only the"
    Write-Host "base64'd keystore, never the password."
}

Write-Host ""
Write-Host "== Next steps ==" -ForegroundColor Cyan
Write-Host "1. Back up $KeystorePath and the password to a password manager."
Write-Host "2. Verify the four secrets exist on GitHub."
Write-Host "3. Tell Claude 'secrets are set' so it can push the release tag,"
Write-Host "   or run it yourself:  git tag v0.1.0 ; git push origin v0.1.0"
Write-Host ""
