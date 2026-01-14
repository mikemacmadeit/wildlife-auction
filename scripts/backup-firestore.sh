#!/bin/bash

# Firestore Backup Script
# 
# Exports Firestore data to Google Cloud Storage
# 
# Prerequisites:
# - gcloud CLI installed and authenticated
# - GCS bucket created
# - Appropriate IAM permissions
#
# Usage:
#   ./backup-firestore.sh [BUCKET_NAME] [PROJECT_ID]

set -e

BUCKET_NAME=${1:-"wildlife-exchange-backups"}
PROJECT_ID=${2:-${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project)}}

if [ -z "$PROJECT_ID" ]; then
  echo "Error: PROJECT_ID must be provided or set in gcloud config"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_PATH="firestore-backups/${TIMESTAMP}"

echo "Starting Firestore backup..."
echo "Project: $PROJECT_ID"
echo "Bucket: $BUCKET_NAME"
echo "Export Path: $EXPORT_PATH"

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
)

# Create export
gcloud firestore export gs://${BUCKET_NAME}/${EXPORT_PATH} \
  --project=${PROJECT_ID} \
  --collection-ids=$(IFS=,; echo "${COLLECTIONS[*]}")

echo "Backup completed successfully!"
echo "Location: gs://${BUCKET_NAME}/${EXPORT_PATH}"

# Optional: List backup contents
echo ""
echo "Backup contents:"
gsutil ls -r gs://${BUCKET_NAME}/${EXPORT_PATH}
