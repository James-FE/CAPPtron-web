[CmdletBinding()]
param(
  [string]$Owner = 'James-FE',
  [string]$Repository = 'CAPPtron-web'
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI is required: https://cli.github.com/'
}
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Run gh auth login first.' }

$target = "$Owner/$Repository"
$existing = & gh api "repos/$target/rulesets"
if ($LASTEXITCODE -ne 0) { throw 'Cannot read rulesets; verify admin access and GitHub plan.' }
$existingRules = $existing | ConvertFrom-Json
if ($existingRules | Where-Object { $_.name -eq 'Protect default branch' }) {
  Write-Host 'Ruleset already exists. Edit it in GitHub Settings > Rules > Rulesets.'
  exit 0
}

Write-Host 'Make sure Frontend Quality completed successfully on main before adding a required check.'
& gh api --method POST "repos/$target/rulesets" --input '.github/rulesets/main.json'
if ($LASTEXITCODE -ne 0) {
  throw 'Ruleset creation failed. GitHub Pro/Team may be required for a private repository.'
}
Write-Host "Ruleset created for $target"
