# Firestore Restore Drill Procedure

**Purpose:** Quarterly validation of backup integrity and restore procedures  
**Frequency:** Every 3 months  
**Duration:** 2-4 hours  
**Location:** Isolated "restore-test" GCP project

---

## ⚠️ CRITICAL: Never Restore Directly to Production

This drill uses an **isolated test project** to validate backups without risk to production data.

---

## Prerequisites

1. **Isolated Test Project** created (e.g., `wildlife-exchange-restore-test`)
2. **GCS Bucket** access (read-only for test project)
3. **gcloud CLI** installed and authenticated
4. **Backup to test** selected (preferably 30+ days old to test older backup)

---

## Step 1: Prepare Test Project

```bash
# Set variables
TEST_PROJECT_ID="wildlife-exchange-restore-test"  # Isolated test project
SOURCE_PROJECT_ID="wildlife-exchange"  # Production project
BUCKET_NAME="wildlife-exchange-backups"
ENV="prod"  # Environment to test

# Create test project (if not exists)
gcloud projects create ${TEST_PROJECT_ID} \
  --name="Firestore Restore Test" \
  --set-as-default

# Enable billing (required for Firestore)
# Note: This must be done manually in GCP Console or via billing API

# Enable Firestore API
gcloud services enable firestore.googleapis.com \
  --project=${TEST_PROJECT_ID}

# Initialize Firestore (Native mode)
gcloud firestore databases create \
  --location=us-central \
  --project=${TEST_PROJECT_ID}
```

---

## Step 2: Select Backup to Test

```bash
# List available backups
gsutil ls gs://${BUCKET_NAME}/${ENV}/firestore/

# Select a backup (preferably 30+ days old)
BACKUP_DATE="2026-01-25-020000"  # Replace with actual backup date
BACKUP_PATH="gs://${BUCKET_NAME}/${ENV}/firestore/${BACKUP_DATE}"

# Verify backup exists and is complete
gsutil ls -r ${BACKUP_PATH}/
gsutil stat ${BACKUP_PATH}/_SUCCESS

# Verify backup metadata
gsutil cat ${BACKUP_PATH}/firestore_export_metadata/*.overall_export_metadata
```

---

## Step 3: Grant Test Project Access to Backup

```bash
# Grant test project service account access to read from backup bucket
TEST_SA="${TEST_PROJECT_ID}@appspot.gserviceaccount.com"
gsutil iam ch serviceAccount:${TEST_SA}:objectViewer gs://${BUCKET_NAME}
```

---

## Step 4: Restore to Test Project

```bash
# Import backup to test project
echo "⚠️  Restoring backup ${BACKUP_DATE} to test project ${TEST_PROJECT_ID}"
echo "This will overwrite any existing data in the test project."
echo "Press Ctrl+C within 10 seconds to cancel..."
sleep 10

gcloud firestore import ${BACKUP_PATH} \
  --project=${TEST_PROJECT_ID} \
  --async

# Monitor import status
echo "Monitoring import progress..."
OPERATION=$(gcloud firestore operations list \
  --project=${TEST_PROJECT_ID} \
  --filter="metadata.database:${TEST_PROJECT_ID}" \
  --format="value(name)" \
  --limit=1)

# Wait for completion (with timeout)
TIMEOUT=3600  # 1 hour
ELAPSED=0
INTERVAL=30

while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS=$(gcloud firestore operations describe "${OPERATION}" \
    --project=${TEST_PROJECT_ID} \
    --format="value(done)" 2>/dev/null || echo "false")
  
  if [ "$STATUS" = "True" ]; then
    echo "✅ Import completed"
    break
  fi
  
  echo "Import in progress... (${ELAPSED}s elapsed)"
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "❌ ERROR: Import timed out"
  exit 1
fi

# Verify import succeeded
FINAL_STATUS=$(gcloud firestore operations describe "${OPERATION}" \
  --project=${TEST_PROJECT_ID} \
  --format="value(error.code)" 2>/dev/null || echo "")

if [ -n "$FINAL_STATUS" ]; then
  ERROR_MSG=$(gcloud firestore operations describe "${OPERATION}" \
    --project=${TEST_PROJECT_ID} \
    --format="value(error.message)" 2>/dev/null || echo "Unknown error")
  echo "❌ ERROR: Import failed: ${ERROR_MSG}"
  exit 1
fi
```

---

## Step 5: Validation Checklist

### 5.1 Collection Counts

```bash
# Count documents in critical collections
echo "=== Collection Counts ==="
for collection in users listings orders messages; do
  COUNT=$(gcloud firestore collections describe ${collection} \
    --project=${TEST_PROJECT_ID} 2>/dev/null | grep -c document || echo 0)
  echo "${collection}: ${COUNT}"
done
```

**Expected:** Counts should match backup metadata or be reasonable (non-zero for active collections).

### 5.2 Spot Checks

```bash
# Check recent orders
echo ""
echo "=== Recent Orders (last 5) ==="
gcloud firestore query orders \
  --order-by=createdAt \
  --limit=5 \
  --project=${TEST_PROJECT_ID} \
  --format=json

# Check user accounts
echo ""
echo "=== Sample Users (first 3) ==="
gcloud firestore query users \
  --limit=3 \
  --project=${TEST_PROJECT_ID} \
  --format=json

# Check listings
echo ""
echo "=== Sample Listings (first 3) ==="
gcloud firestore query listings \
  --limit=3 \
  --project=${TEST_PROJECT_ID} \
  --format=json
```

**Validation:**
- [ ] Orders have valid structure (amount, buyerId, sellerId, etc.)
- [ ] Users have valid structure (email, displayName, etc.)
- [ ] Listings have valid structure (title, price, status, etc.)
- [ ] Timestamps are reasonable (not in future, not too old)
- [ ] No obvious data corruption

### 5.3 Data Integrity Checks

```bash
# Check for duplicate IDs (should be none)
echo ""
echo "=== Checking for duplicate document IDs ==="
# This is a simplified check - full validation requires more complex queries

# Check foreign key relationships (sample)
echo ""
echo "=== Checking order relationships ==="
# Verify orders reference valid users/listings
# (This requires application-level validation or custom scripts)
```

**Validation:**
- [ ] No duplicate document IDs
- [ ] Foreign key relationships intact (orders → users, orders → listings)
- [ ] No orphaned documents
- [ ] Timestamps are sequential and reasonable

### 5.4 Metadata Verification

```bash
# Compare backup metadata with restored data
echo ""
echo "=== Backup Metadata ==="
gsutil cat ${BACKUP_PATH}/firestore_export_metadata/*.overall_export_metadata | jq .

# Get restore operation details
echo ""
echo "=== Restore Operation Details ==="
gcloud firestore operations describe "${OPERATION}" \
  --project=${TEST_PROJECT_ID} \
  --format=json | jq .
```

**Validation:**
- [ ] Backup timestamp matches expected date
- [ ] Restore operation completed without errors
- [ ] Collection counts match (approximately, accounting for any data changes)

---

## Step 6: Application-Level Testing (Optional)

If you have application code that can connect to the test project:

```bash
# Set test project in application config
export FIREBASE_PROJECT_ID=${TEST_PROJECT_ID}

# Run application tests against restored data
# (This requires application-specific test scripts)
```

**Validation:**
- [ ] Application can connect to restored database
- [ ] User authentication works (if testing auth)
- [ ] Critical queries execute successfully
- [ ] No application errors related to data structure

---

## Step 7: Document Results

Create a drill report:

```bash
# Create report file
REPORT_FILE="restore-drill-$(date +%Y%m%d).md"
cat > ${REPORT_FILE} <<EOF
# Firestore Restore Drill Report

**Date:** $(date -I)
**Backup Tested:** ${BACKUP_DATE}
**Test Project:** ${TEST_PROJECT_ID}
**Environment:** ${ENV}

## Results

- [ ] Backup restored successfully
- [ ] Collection counts validated
- [ ] Spot checks passed
- [ ] Data integrity verified
- [ ] Application tests passed (if applicable)

## Issues Found

(List any issues discovered)

## Recommendations

(Any recommendations for improving backup/restore procedures)

## Next Drill

**Scheduled:** $(date -d "+3 months" -I)
EOF

echo "Report saved to: ${REPORT_FILE}"
```

---

## Step 8: Cleanup

```bash
# ⚠️ WARNING: This will delete all data in the test project

echo "⚠️  WARNING: This will delete the test project and all its data."
echo "Press Ctrl+C within 10 seconds to cancel..."
sleep 10

# Option 1: Delete Firestore database (keeps project)
gcloud firestore databases delete \
  --database="(default)" \
  --project=${TEST_PROJECT_ID} \
  --quiet

# Option 2: Delete entire project (more thorough)
# gcloud projects delete ${TEST_PROJECT_ID} --quiet

# Remove IAM permissions
gsutil iam ch -d serviceAccount:${TEST_SA}:objectViewer gs://${BUCKET_NAME}

echo "✅ Cleanup completed"
```

---

## Success Criteria

The restore drill is considered successful if:

1. ✅ Backup can be restored to test project
2. ✅ All collection counts are reasonable
3. ✅ Spot checks show valid data structure
4. ✅ No data corruption detected
5. ✅ Restore operation completes without errors
6. ✅ Application can connect and query data (if tested)

---

## Failure Scenarios

If the drill fails:

1. **Document the failure** in the drill report
2. **Investigate root cause**:
   - Backup corruption?
   - Restore process issue?
   - Test project configuration?
3. **Fix the issue** before next drill
4. **Update runbook** if procedure needs changes
5. **Escalate** if backup integrity is compromised

---

## Quarterly Schedule

**Q1 2026:** January 25  
**Q2 2026:** April 25  
**Q3 2026:** July 25  
**Q4 2026:** October 25

**Next Drill:** [Update after each drill]

---

## Related Documentation

- `docs/runbooks/firestore-backups.md` - Main backup runbook
- `scripts/backup-firestore.sh` - Backup script
- `scripts/verify-firestore-backup.sh` - Verification script

---

**Status:** ✅ Restore drill procedure documented. Ready for quarterly execution.
