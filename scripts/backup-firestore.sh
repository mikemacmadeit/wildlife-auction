#!/bin/bash

# Firestore Backup Script
# 
# Exports Firestore data to Google Cloud Storage with environment-scoped paths
# 
# Prerequisites:
# - gcloud CLI installed and authenticated
# - GCS bucket created and hardened (see runbook)
# - Appropriate IAM permissions
#
# Usage:
#   ./backup-firestore.sh [ENV] [BUCKET_NAME] [PROJECT_ID]
#
# Arguments:
#   ENV: Environment (dev|staging|prod) - REQUIRED
#   BUCKET_NAME: GCS bucket name - REQUIRED
#   PROJECT_ID: GCP project ID - Optional (uses gcloud config if not provided)
#
# Example:
#   ./backup-firestore.sh prod wildlife-exchange-backups wildlife-exchange

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
ENV=${1:-}
BUCKET_NAME=${2:-}
PROJECT_ID=${3:-${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || echo "")}}

# Validation
if [ -z "$ENV" ]; then
  echo -e "${RED}Error: ENV (dev|staging|prod) is required${NC}" >&2
  echo "Usage: $0 [ENV] [BUCKET_NAME] [PROJECT_ID]" >&2
  exit 1
fi

if [[ ! "$ENV" =~ ^(dev|staging|prod)$ ]]; then
  echo -e "${RED}Error: ENV must be one of: dev, staging, prod${NC}" >&2
  exit 1
fi

if [ -z "$BUCKET_NAME" ]; then
  echo -e "${RED}Error: BUCKET_NAME is required${NC}" >&2
  echo "Usage: $0 [ENV] [BUCKET_NAME] [PROJECT_ID]" >&2
  exit 1
fi

if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}Error: PROJECT_ID must be provided or set in gcloud config${NC}" >&2
  exit 1
fi

# Safety check for production
if [ "$ENV" = "prod" ]; then
  echo -e "${YELLOW}⚠️  WARNING: This will create a backup for PRODUCTION environment${NC}"
  echo -e "${YELLOW}Press Ctrl+C within 5 seconds to cancel...${NC}"
  sleep 5
fi

# Generate timestamp (UTC)
TIMESTAMP=$(date -u +%Y-%m-%d-%H%M%S)
EXPORT_PATH="${ENV}/firestore/${TIMESTAMP}"
FULL_PATH="gs://${BUCKET_NAME}/${EXPORT_PATH}"

echo -e "${GREEN}Starting Firestore backup...${NC}"
echo "Environment: ${ENV}"
echo "Project: ${PROJECT_ID}"
echo "Bucket: ${BUCKET_NAME}"
echo "Export Path: ${FULL_PATH}"
echo ""

# Collections to backup
COLLECTIONS=(
  "users"
  "listings"
  "orders"
  "messages"
  "auditLogs"
  "stripeEvents"
  "chargebacks"
  "opsHealth"
  "offers"
  "supportTickets"
  "knowledgeBaseArticles"
  "checkoutSessions"
)

# Create export
echo "Exporting collections: ${COLLECTIONS[*]}"
echo ""

gcloud firestore export "${FULL_PATH}" \
  --project="${PROJECT_ID}" \
  --collection-ids=$(IFS=,; echo "${COLLECTIONS[*]}") \
  --async

# Wait for export to complete and get operation ID
echo "Waiting for export to start..."
sleep 5

# Get the latest export operation
OPERATION=$(gcloud firestore operations list \
  --project="${PROJECT_ID}" \
  --filter="metadata.database:${PROJECT_ID}" \
  --format="value(name)" \
  --limit=1)

if [ -z "$OPERATION" ]; then
  echo -e "${RED}Error: Could not find export operation${NC}" >&2
  exit 1
fi

echo "Export operation: ${OPERATION}"
echo "Monitoring export progress..."

# Poll for completion (with timeout)
TIMEOUT=3600  # 1 hour
ELAPSED=0
INTERVAL=30

while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS=$(gcloud firestore operations describe "${OPERATION}" \
    --project="${PROJECT_ID}" \
    --format="value(done)" 2>/dev/null || echo "false")
  
  if [ "$STATUS" = "True" ]; then
    echo -e "${GREEN}Export completed successfully!${NC}"
    break
  fi
  
  echo "Export in progress... (${ELAPSED}s elapsed)"
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo -e "${RED}Error: Export timed out after ${TIMEOUT} seconds${NC}" >&2
  exit 1
fi

# Verify export completed successfully
FINAL_STATUS=$(gcloud firestore operations describe "${OPERATION}" \
  --project="${PROJECT_ID}" \
  --format="value(error.code)" 2>/dev/null || echo "")

if [ -n "$FINAL_STATUS" ]; then
  ERROR_MSG=$(gcloud firestore operations describe "${OPERATION}" \
    --project="${PROJECT_ID}" \
    --format="value(error.message)" 2>/dev/null || echo "Unknown error")
  echo -e "${RED}Error: Export failed: ${ERROR_MSG}${NC}" >&2
  exit 1
fi

# Verify backup files exist
echo ""
echo "Verifying backup files..."
if ! gsutil ls "${FULL_PATH}/" >/dev/null 2>&1; then
  echo -e "${RED}Error: Backup path does not exist: ${FULL_PATH}${NC}" >&2
  exit 1
fi

# Create success marker
echo "Creating success marker..."
echo "Backup completed successfully at $(date -u -Iseconds)" | \
  gsutil cp - "${FULL_PATH}/_SUCCESS"

# Verify success marker
if ! gsutil stat "${FULL_PATH}/_SUCCESS" >/dev/null 2>&1; then
  echo -e "${YELLOW}Warning: Could not create success marker${NC}" >&2
else
  echo -e "${GREEN}Success marker created${NC}"
fi

# Print summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Backup completed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo "Environment: ${ENV}"
echo "Backup Path: ${FULL_PATH}"
echo "Timestamp: ${TIMESTAMP}"
echo "Project: ${PROJECT_ID}"
echo ""
echo "To verify this backup, run:"
echo "  bash scripts/verify-firestore-backup.sh ${ENV} ${BUCKET_NAME}"
echo ""
echo "To restore this backup (TEST IN ISOLATED PROJECT FIRST):"
echo "  gcloud firestore import ${FULL_PATH} --project=[TARGET_PROJECT_ID]"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
