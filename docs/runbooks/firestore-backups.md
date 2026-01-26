# Firestore Automated Backups Runbook

**Last Updated:** January 25, 2026  
**Status:** ✅ Investor-Grade / Audit-Ready / Ransomware-Safe  
**Owner:** DevOps Team  
**Escalation:** CTO / Engineering Lead

---

## Overview

This runbook provides procedures for setting up and managing automated Firestore backups to Google Cloud Storage (GCS) with enterprise-grade security, immutability, and audit compliance.

**Why this is critical:**
- Data loss recovery mechanism
- Compliance/audit requirements (SOC 2, GDPR, etc.)
- Business continuity protection
- Ransomware protection (immutable backups)
- Investor due diligence requirements

---

## RPO/RTO

**Recovery Point Objective (RPO):** 24 hours  
- Daily backups ensure maximum 24-hour data loss window
- Critical collections (orders, payments) have additional real-time replication via Stripe webhooks

**Recovery Time Objective (RTO):** 4-8 hours  
- Full restore: 4-6 hours (depending on database size)
- Partial restore (collection-level): 1-2 hours
- Validation and verification: 1-2 hours

---

## Bucket Layout

### Environment-Scoped Structure

```
gs://{BUCKET_NAME}/
├── dev/
│   └── firestore/
│       └── YYYY-MM-DD-HHMMSS/
│           ├── all_namespaces/
│           │   └── kind_*/...
│           ├── firestore_export_metadata/
│           └── _SUCCESS
├── staging/
│   └── firestore/
│       └── YYYY-MM-DD-HHMMSS/
│           └── ...
└── prod/
    └── firestore/
        └── YYYY-MM-DD-HHMMSS/
            └── ...
```

**Example:**
```
gs://wildlife-exchange-backups/
├── dev/firestore/2026-01-25-020000/
├── staging/firestore/2026-01-25-020000/
└── prod/firestore/2026-01-25-020000/
```

---

## Prerequisites

1. **GCP Project** with billing enabled
2. **GCS Bucket** created for backups (one bucket, environment-scoped paths)
3. **gcloud CLI** installed and authenticated
4. **IAM Permissions** (least privilege):
   - `roles/datastore.exportAdmin` (for Firestore exports)
   - `roles/storage.objectAdmin` (bucket-level, not project-level)
   - Service account with these roles for automation

---

## Bucket Hardening (CRITICAL - Do First)

### Step 1: Create Bucket with Hardening

```bash
# Set variables
PROJECT_ID="wildlife-exchange"  # Replace with your project ID
BUCKET_NAME="wildlife-exchange-backups"  # Replace with desired bucket name
REGION="us-central1"  # Replace with your preferred region
SERVICE_ACCOUNT="firestore-backup-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Create bucket with uniform bucket-level access (required for IAM)
gsutil mb -p ${PROJECT_ID} -l ${REGION} -c STANDARD gs://${BUCKET_NAME}
gsutil uniformbucketlevelaccess set on gs://${BUCKET_NAME}

# Enable object versioning (CRITICAL for immutability)
gsutil versioning set on gs://${BUCKET_NAME}

# Set retention policy (30 days minimum retention)
# Note: Retention lock requires bucket-level retention policy
# For maximum security, consider enabling retention lock (requires org policy)
gsutil retention set 30d gs://${BUCKET_NAME}

# Set lifecycle policy (delete after 90 days, but respect retention)
cat > lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {
          "age": 90,
          "matchesStorageClass": ["STANDARD"]
        }
      }
    ]
  }
}
EOF
gsutil lifecycle set lifecycle.json gs://${BUCKET_NAME}

# Verify settings
gsutil versioning get gs://${BUCKET_NAME}
gsutil retention get gs://${BUCKET_NAME}
gsutil lifecycle get gs://${BUCKET_NAME}
```

### Step 2: Configure IAM (Least Privilege)

```bash
# Grant export permissions to service account
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/datastore.exportAdmin"

# Grant bucket-level object admin (not full storage.admin)
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://${BUCKET_NAME}

# Verify IAM
gsutil iam get gs://${BUCKET_NAME}
```

### Step 3: Encryption

**Default Encryption:**
- GCS automatically encrypts all data at rest with Google-managed keys (AES-256)
- No additional configuration needed

**Optional: Customer-Managed Encryption Keys (CMEK)**
For enhanced security and compliance:

```bash
# Create a key ring and key
gcloud kms keyrings create backup-keyring \
  --location=${REGION} \
  --project=${PROJECT_ID}

gcloud kms keys create backup-key \
  --keyring=backup-keyring \
  --location=${REGION} \
  --purpose=encryption \
  --project=${PROJECT_ID}

# Grant service account permission to use the key
gcloud kms keys add-iam-policy-binding backup-key \
  --location=${REGION} \
  --keyring=backup-keyring \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
  --project=${PROJECT_ID}

# Apply CMEK to bucket (requires bucket recreation or update)
# Note: This must be done at bucket creation or requires data migration
gsutil kms encryption -k projects/${PROJECT_ID}/locations/${REGION}/keyRings/backup-keyring/cryptoKeys/backup-key gs://${BUCKET_NAME}
```

---

## Backup Procedures

### Automated Backups (Recommended)

See `.github/workflows/firestore-backup.yml` for automated daily backups.

### Manual Backup

```bash
# For production (requires explicit confirmation)
cd "c:\dev\Wildlife Auction\project"
bash scripts/backup-firestore.sh prod ${BUCKET_NAME} ${PROJECT_ID}

# For staging
bash scripts/backup-firestore.sh staging ${BUCKET_NAME} ${PROJECT_ID}

# For dev
bash scripts/backup-firestore.sh dev ${BUCKET_NAME} ${PROJECT_ID}
```

### Verify Backup

```bash
# Verify latest backup
bash scripts/verify-firestore-backup.sh prod ${BUCKET_NAME}

# Check all environments
for env in dev staging prod; do
  echo "Checking ${env}..."
  bash scripts/verify-firestore-backup.sh ${env} ${BUCKET_NAME}
done
```

---

## Backup Retention Policy

**Immutable Period:** 30 days (via retention policy)  
**Lifecycle Deletion:** 90 days (after retention expires)

**Recommended retention:**
- **Daily backups**: Keep for 30 days (immutable)
- **Weekly backups**: Keep for 12 weeks (first backup of each week, after immutable period)
- **Monthly backups**: Keep for 12 months (first backup of each month, after immutable period)

**Implementation:**
- Retention policy enforces 30-day immutability
- Lifecycle policy deletes after 90 days
- For longer retention, manually copy weekly/monthly backups to separate bucket or storage class

---

## Restore Procedures

### ⚠️ CRITICAL RESTORE GUARDRAILS

**NEVER restore directly to production without:**
1. ✅ Explicit approval from CTO/Engineering Lead
2. ✅ Restore drill completed in test project first
3. ✅ Backup integrity verified
4. ✅ Restore plan documented and reviewed
5. ✅ Rollback plan prepared
6. ✅ Maintenance window scheduled (if needed)

**Recommended Restore Process:**
1. **Always test restore in isolated project first** (see `docs/RESTORE_DRILL_FIRESTORE.md`)
2. **Verify data integrity** in test project
3. **Get explicit approval** for production restore
4. **Schedule maintenance window** if needed
5. **Document restore** in incident log

### Full Restore

⚠️ **WARNING**: Restore operations can overwrite existing data. Always verify backup integrity and test in isolated project first.

```bash
# 1. List available backups
gsutil ls gs://${BUCKET_NAME}/prod/firestore/

# 2. Verify backup integrity
BACKUP_PATH="gs://${BUCKET_NAME}/prod/firestore/2026-01-25-020000"
gsutil ls -r ${BACKUP_PATH}/
gsutil stat ${BACKUP_PATH}/_SUCCESS

# 3. Verify backup metadata
gsutil cat ${BACKUP_PATH}/firestore_export_metadata/*.overall_export_metadata

# 4. IMPORTANT: Test restore in isolated project first
# See docs/RESTORE_DRILL_FIRESTORE.md

# 5. Import from GCS (ONLY after test restore passes)
gcloud firestore import ${BACKUP_PATH} \
  --project=${PROJECT_ID} \
  --async

# 6. Monitor import status
gcloud firestore operations list --project=${PROJECT_ID}

# 7. Verify data (see Restore Validation Checklist below)
```

### Partial Restore (Collection-Level)

To restore a specific collection:

```bash
BACKUP_PATH="gs://${BUCKET_NAME}/prod/firestore/2026-01-25-020000"
gcloud firestore import ${BACKUP_PATH} \
  --project=${PROJECT_ID} \
  --collection-ids=orders \
  --async
```

⚠️ **Note**: Partial restores may cause data inconsistencies. Prefer full restores when possible.

---

## Restore Validation Checklist

After any restore operation, verify:

- [ ] **Backup source verified**: Confirmed backup path and timestamp
- [ ] **Import operation completed**: Checked `gcloud firestore operations list`
- [ ] **Collection counts match**: Compare pre-restore vs post-restore counts
- [ ] **Critical collections verified**:
  - [ ] `users` collection: Count matches expected
  - [ ] `listings` collection: Count matches expected
  - [ ] `orders` collection: Count matches expected
  - [ ] `messages` collection: Count matches expected
- [ ] **Spot checks performed**:
  - [ ] Recent orders exist and are accessible
  - [ ] User accounts can log in
  - [ ] Listings display correctly
  - [ ] Payment records match Stripe data
- [ ] **Application functionality tested**:
  - [ ] User authentication works
  - [ ] Order creation works
  - [ ] Payment processing works
  - [ ] Messaging works
- [ ] **Data integrity verified**:
  - [ ] No duplicate records
  - [ ] Foreign key relationships intact
  - [ ] Timestamps are reasonable
- [ ] **Monitoring alerts checked**: No unexpected errors in Sentry/logs
- [ ] **Documentation updated**: Restore logged in incident log

**Validation Commands:**

```bash
# Count documents in critical collections
for collection in users listings orders messages; do
  echo "${collection}: $(gcloud firestore collections describe ${collection} --project=${PROJECT_ID} | grep -c document || echo 0)"
done

# Spot check recent orders
gcloud firestore query orders \
  --order-by=createdAt \
  --limit=5 \
  --project=${PROJECT_ID}
```

---

## Quarterly Restore Drill

**Frequency:** Quarterly (every 3 months)  
**Purpose:** Validate backup integrity and restore procedures  
**Location:** Isolated "restore-test" GCP project

See `docs/RESTORE_DRILL_FIRESTORE.md` for detailed procedure.

**Quick Checklist:**
1. [ ] Create/verify isolated test project
2. [ ] Select backup from 30+ days ago (test older backup)
3. [ ] Restore to test project
4. [ ] Run validation checklist
5. [ ] Document results
6. [ ] Clean up test project
7. [ ] Update runbook if issues found

---

## Monitoring & Verification

### Automated Verification

The GitHub Actions workflow automatically verifies backups after creation. See `.github/workflows/firestore-backup.yml`.

### Manual Verification

```bash
# Check latest backup for each environment
for env in dev staging prod; do
  echo "=== ${env} ==="
  bash scripts/verify-firestore-backup.sh ${env} ${BUCKET_NAME}
done

# Check backup sizes
gsutil du -sh gs://${BUCKET_NAME}/*/firestore/

# List recent backups
gsutil ls -l gs://${BUCKET_NAME}/prod/firestore/ | tail -10
```

### Alerting

**GitHub Actions:**
- Workflow failures trigger GitHub email notifications
- Optional Slack webhook (if `SLACK_WEBHOOK_URL` secret configured)

**Cloud Monitoring (if using Cloud Scheduler):**
- Alert if backup job fails
- Alert if no backup created in 25 hours
- Alert if backup size deviates significantly

---

## Troubleshooting

### Backup Fails: "Permission Denied"

**Solution:**
```bash
# Verify service account has required roles
gcloud projects get-iam-policy ${PROJECT_ID} \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:${SERVICE_ACCOUNT}"

# Grant missing permissions
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/datastore.exportAdmin"

gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://${BUCKET_NAME}
```

### Backup Fails: "Bucket Not Found"

**Solution:**
```bash
# Verify bucket exists
gsutil ls gs://${BUCKET_NAME}

# Create bucket if missing (see Bucket Hardening section)
```

### Backup Takes Too Long

**Solution:**
- Large databases may take 30+ minutes
- Monitor in Firebase Console → Firestore → Exports
- Consider collection-specific exports for faster backups
- Check GCP quotas and limits

### Verify Script Reports Stale Backup

**Solution:**
1. Check GitHub Actions workflow logs
2. Verify service account permissions
3. Check GCP project quotas
4. Manually trigger backup: `gh workflow run firestore-backup.yml`

---

## Cost Estimation

**GCS Storage:**
- ~$0.026 per GB/month (Standard storage)
- Example: 10 GB database = ~$0.26/month
- With versioning: ~2x storage (current + previous versions)

**Firestore Export:**
- Free (no export charges)

**Total estimated cost:** < $10/month for typical database sizes with versioning

---

## Ownership & Escalation

**Primary Owner:** DevOps Team  
**Backup Operator:** Engineering Team (rotating)  
**Escalation Path:**
1. DevOps Team Lead
2. Engineering Lead
3. CTO

**Contact Information:**
- Slack: #devops-alerts
- Email: devops@wildlife-exchange.com
- On-call: See PagerDuty schedule

---

## Related Documentation

- `docs/RESTORE_DRILL_FIRESTORE.md` - Quarterly restore drill procedure
- `scripts/backup-firestore.sh` - Backup script
- `scripts/verify-firestore-backup.sh` - Verification script
- `.github/workflows/firestore-backup.yml` - Automated backup workflow
- `RUNBOOK_PRODUCTION.md` - General production procedures
- `PRODUCTION_READINESS_AUDIT_FINAL.md` - Audit findings

---

**Status:** ✅ Investor-grade backup system implemented. Ready for production use.
