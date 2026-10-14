[CmdletBinding()]
param(
  [string]$Owner = 'James-FE',
  [string]$Repository = 'CAPPtron-web'
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

foreach ($command in @('git', 'gh', 'npm')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Required executable missing: $command"
  }
}

& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Run gh auth login with the GitHub owner account first.' }
$loggedIn = (& gh api user --jq .login)
if ($LASTEXITCODE -ne 0 -or $loggedIn -ne $Owner) {
  throw "GitHub CLI is not authenticated as $Owner. Stop to avoid creating under the wrong account."
}

& npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install failed; no remote changes were made.' }
& npm run format
if ($LASTEXITCODE -ne 0) { throw 'Formatting failed.' }
& npm run quality
if ($LASTEXITCODE -ne 0) { throw 'Quality gate failed; no remote changes were made.' }

if (-not (Test-Path '.git')) {
  & git init -b main
  if ($LASTEXITCODE -ne 0) { throw 'git init failed.' }
}

$identity = (& git config user.email)
if (-not $identity) { throw 'Set git config user.email before publishing.' }
& git add --all
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  & git commit -m 'chore: initialize CAPPtron-web and quality gates'
  if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
}

$target = "$Owner/$Repository"
& gh repo view $target --json name 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  & gh repo create $target --private --source . --remote origin --push
  if ($LASTEXITCODE -ne 0) { throw 'Creating private GitHub repository failed.' }
} else {
  $origin = (& git remote get-url origin 2>$null)
  if ($LASTEXITCODE -ne 0) {
    & git remote add origin "https://github.com/$target.git"
    if ($LASTEXITCODE -ne 0) { throw 'Setting git remote failed.' }
  } elseif ($origin -notin @("https://github.com/$target.git", "https://github.com/$target", "git@github.com:$target.git")) {
    throw "Origin points at a different repository: $origin"
  }
  & git push -u origin main
  if ($LASTEXITCODE -ne 0) { throw 'git push failed; inspect remote history.' }
}
Write-Host "Published https://github.com/$target"
Write-Host 'Next: verify the initial Quality run, then run scripts/configure-ruleset.ps1.'
Write-Host 'Codex automatic PR review must be enabled separately in the reviewing account.'
