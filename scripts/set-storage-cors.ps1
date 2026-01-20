param(
  [Parameter(Mandatory = $false)]
  [string]$Bucket = "wildlife-exchange.firebasestorage.app",

  [Parameter(Mandatory = $false)]
  [string]$CorsFile = "scripts/storage-cors.json"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CorsFile)) {
  throw "CORS file not found: $CorsFile"
}

Write-Host "Setting CORS on bucket: gs://$Bucket" -ForegroundColor Cyan
Write-Host "Using CORS file: $CorsFile" -ForegroundColor Cyan

if (-not (Get-Command gsutil -ErrorAction SilentlyContinue)) {
  throw "gsutil not found. Install Google Cloud SDK, then retry. See docs/FIREBASE_STORAGE_CORS_SETUP.md"
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud not found. Install Google Cloud SDK, then retry. See docs/FIREBASE_STORAGE_CORS_SETUP.md"
}

# Ensure the operator is authenticated; otherwise gsutil often returns 404 for private buckets.
$accountsRaw = (& gcloud auth list --format="value(account)" 2>$null)
if (-not $accountsRaw -or $accountsRaw.Trim().Length -eq 0) {
  Write-Host "❌ No Google Cloud credentials found." -ForegroundColor Red
  Write-Host "Run this once, then re-run this script:" -ForegroundColor Yellow
  Write-Host "  gcloud auth login" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "If you use a service account key instead:" -ForegroundColor Yellow
  Write-Host "  gcloud auth activate-service-account --key-file <PATH_TO_KEY_JSON>" -ForegroundColor Cyan
  exit 1
}

gsutil cors set $CorsFile ("gs://{0}" -f $Bucket)
Write-Host "✅ Applied CORS. Current bucket CORS:" -ForegroundColor Green
gsutil cors get ("gs://{0}" -f $Bucket)

