[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Check', 'Apply')]
  [string]$Mode = 'Plan',
  [string]$Owner = 'James-FE',
  [string]$Repository = 'CAPPtron-web',
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22+ is required.' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) is required; run gh auth login.' }

$scriptPath = Join-Path $PSScriptRoot 'sync-ruleset.mjs'
$nodeArgs = @($scriptPath, $Mode.ToLowerInvariant(), '--repo', "$Owner/$Repository")
if ($Yes) { $nodeArgs += '--yes' }
& node @nodeArgs
if ($LASTEXITCODE -ne 0) { throw "Ruleset IaC $Mode failed with exit code $LASTEXITCODE." }
