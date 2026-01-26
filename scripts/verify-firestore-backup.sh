#!/bin/bash

# Firestore Backup Verification Script
# 
# Verifies that the latest backup exists, is complete, and is not stale
# 
# Usage:
#   ./verify-firestore-backup.sh [ENV] [BUCKET_NAME]
#
# Arguments:
#   ENV: Environment (dev|staging|prod) - REQUIRED
#   BUCKET_NAME: GCS bucket name - REQUIRED
#
# Exit codes:
#   0: Backup exists and is fresh (< 25 hours old)
#   1: Backup missing, stale, or incomplete

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
ENV=${1:-}
BUCKET_NAME=${2:-}

# Validation
if [ -z "$ENV" ]; then
  echo -e "${RED}Error: ENV (dev|staging|prod) is required${NC}" >&2
  echo "Usage: $0 [ENV] [BUCKET_NAME]" >&2
  exit 1
fi

if [[ ! "$ENV" =~ ^(dev|staging|prod)$ ]]; then
  echo -e "${RED}Error: ENV must be one of: dev, staging, prod${NC}" >&2
  exit 1
fi

if [ -z "$BUCKET_NAME" ]; then
  echo -e "${RED}Error: BUCKET_NAME is required${NC}" >&2
  echo "Usage: $0 [ENV] [BUCKET_NAME]" >&2
  exit 1
fi

BACKUP_PREFIX="gs://${BUCKET_NAME}/${ENV}/firestore/"

echo "Verifying backup for environment: ${ENV}"
echo "Bucket: ${BUCKET_NAME}"
echo ""

# Check if backup path exists
if ! gsutil ls "${BACKUP_PREFIX}" >/dev/null 2>&1; then
  echo -e "${RED}❌ ERROR: Backup path does not exist: ${BACKUP_PREFIX}${NC}" >&2
  exit 1
fi

# Find latest backup (by timestamp in folder name)
LATEST_BACKUP=$(gsutil ls "${BACKUP_PREFIX}" | grep -E '[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}/$' | sort -r | head -1)

if [ -z "$LATEST_BACKUP" ]; then
  echo -e "${RED}❌ ERROR: No backups found in ${BACKUP_PREFIX}${NC}" >&2
  exit 1
fi

# Remove trailing slash
LATEST_BACKUP="${LATEST_BACKUP%/}"

# Extract timestamp from path (format: YYYY-MM-DD-HHMMSS)
BACKUP_NAME=$(basename "${LATEST_BACKUP}")
TIMESTAMP_PATTERN="([0-9]{4})-([0-9]{2})-([0-9]{2})-([0-9]{2})([0-9]{2})([0-9]{2})"

if [[ ! "$BACKUP_NAME" =~ $TIMESTAMP_PATTERN ]]; then
  echo -e "${RED}❌ ERROR: Invalid backup timestamp format: ${BACKUP_NAME}${NC}" >&2
  exit 1
fi

YEAR="${BASH_REMATCH[1]}"
MONTH="${BASH_REMATCH[2]}"
DAY="${BASH_REMATCH[3]}"
HOUR="${BASH_REMATCH[4]}"
MINUTE="${BASH_REMATCH[5]}"
SECOND="${BASH_REMATCH[6]}"

# Convert to Unix timestamp (UTC)
BACKUP_TIMESTAMP=$(date -u -d "${YEAR}-${MONTH}-${DAY} ${HOUR}:${MINUTE}:${SECOND}" +%s 2>/dev/null || \
  date -u -j -f "%Y-%m-%d %H:%M:%S" "${YEAR}-${MONTH}-${DAY} ${HOUR}:${MINUTE}:${SECOND}" +%s 2>/dev/null || \
  echo "")

if [ -z "$BACKUP_TIMESTAMP" ]; then
  echo -e "${RED}❌ ERROR: Could not parse backup timestamp${NC}" >&2
  exit 1
fi

# Get current timestamp (UTC)
CURRENT_TIMESTAMP=$(date -u +%s)
AGE_SECONDS=$((CURRENT_TIMESTAMP - BACKUP_TIMESTAMP))
AGE_HOURS=$((AGE_SECONDS / 3600))

# Check if backup is stale (> 25 hours old)
STALE_THRESHOLD=90000  # 25 hours in seconds
if [ $AGE_SECONDS -gt $STALE_THRESHOLD ]; then
  echo -e "${RED}❌ ERROR: Backup is stale (${AGE_HOURS} hours old, threshold: 25 hours)${NC}" >&2
  echo "Backup path: ${LATEST_BACKUP}"
  echo "Backup timestamp: ${YEAR}-${MONTH}-${DAY} ${HOUR}:${MINUTE}:${SECOND} UTC"
  exit 1
fi

# Check for success marker
if ! gsutil stat "${LATEST_BACKUP}/_SUCCESS" >/dev/null 2>&1; then
  echo -e "${RED}❌ ERROR: Success marker not found: ${LATEST_BACKUP}/_SUCCESS${NC}" >&2
  exit 1
fi

# Check for required metadata files
if ! gsutil ls "${LATEST_BACKUP}/firestore_export_metadata/" >/dev/null 2>&1; then
  echo -e "${RED}❌ ERROR: Export metadata not found${NC}" >&2
  exit 1
fi

# Check for data files
if ! gsutil ls "${LATEST_BACKUP}/all_namespaces/" >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  WARNING: No data files found in all_namespaces/${NC}" >&2
  # Don't fail on this - empty database is valid
fi

# All checks passed
echo -e "${GREEN}✅ Backup verification passed${NC}"
echo "Backup path: ${LATEST_BACKUP}"
echo "Backup timestamp: ${YEAR}-${MONTH}-${DAY} ${HOUR}:${MINUTE}:${SECOND} UTC"
echo "Age: ${AGE_HOURS} hours"
echo "Success marker: ✅ Present"
echo "Metadata files: ✅ Present"

exit 0
