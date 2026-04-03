$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env.sftp")) {
  Write-Host "[error] .env.sftp not found."
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[info] installing dependencies..."
  npm install
}

Write-Host "[info] starting watch upload (Ctrl+C to stop)"
npm run watch:sftp
