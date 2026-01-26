# Firestore Backup Implementation Summary

**Date:** January 25, 2026  
**Status:** ✅ **COMPLETE** - Investor-Grade / Audit-Ready / Ransomware-Safe

---

## Files Added/Changed

### Documentation
1. **`docs/runbooks/firestore-backups.md`** - ✅ **UPDATED**
   - Investor-grade runbook with RPO/RTO, encryption, immutability
   - Environment-scoped bucket layout
   - Restore guardrails (never restore directly to prod)
   - Ownership & escalation section
   - Restore validation checklist

2. **`docs/RESTORE_DRILL_FIRESTORE.md`** - ✅ **NEW**
   - Quarterly restore drill procedure
   - Step-by-step restore to isolated test project
   - Validation commands and checklist
   - Cleanup procedures

### Scripts
3. **`scripts/backup-firestore.sh`** - ✅ **UPDATED**
   - Accepts environment argument (dev|staging|prod)
   - Environment-scoped paths: `gs://{bucket}/{env}/firestore/YYYY-MM-DD-HHMMSS/`
   - Creates `_SUCCESS` marker file
   - Prints final export path clearly
   - Production safety check (5-second warning)
   - Strict error handling (`set -euo pipefail`)

4. **`scripts/verify-firestore-backup.sh`** - ✅ **NEW**
   - Verifies latest backup exists
   - Checks for `_SUCCESS` marker
   - Validates backup age (< 25 hours)
   - Checks for metadata files
   - Exits non-zero if missing/stale
   - Prints last backup time + path

### Automation
5. **`.github/workflows/firestore-backup.yml`** - ✅ **NEW**
   - Daily schedule: 2 AM UTC
   - Manual trigger with environment selection
   - Runs for all environments (dev, staging, prod) on schedule
   - Uses modern `google-github-actions/auth@v2` and `setup-gcloud@v2`
   - Runs backup then verify
   - Fails workflow if verify fails
   - Optional Slack webhook notification on failure

---

## Exact Commands to Enable Versioning + Retention Policy

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

---

## How to Run a Manual Backup for Prod

### Prerequisites
1. `gcloud` CLI installed and authenticated
2. GCS bucket created and hardened (see commands above)
3. Service account has required permissions

### Command

```bash
# Navigate to project directory
cd "c:\dev\Wildlife Auction\project"

# Run backup for production
bash scripts/backup-firestore.sh prod ${BUCKET_NAME} ${PROJECT_ID}

# Example with actual values:
bash scripts/backup-firestore.sh prod wildlife-exchange-backups wildlife-exchange
```

**Note:** The script will:
- Show a 5-second warning for production backups
- Create backup at: `gs://{BUCKET_NAME}/prod/firestore/YYYY-MM-DD-HHMMSS/`
- Create `_SUCCESS` marker file
- Print the final export path

### Verify Backup

```bash
# Verify the backup was created successfully
bash scripts/verify-firestore-backup.sh prod ${BUCKET_NAME}

# Example:
bash scripts/verify-firestore-backup.sh prod wildlife-exchange-backups
```

---

## How to Trigger the GitHub Action Manually

### Option 1: Via GitHub UI

1. Go to: `https://github.com/[YOUR_ORG]/[YOUR_REPO]/actions/workflows/firestore-backup.yml`
2. Click **"Run workflow"** button (top right)
3. Select environment: `dev`, `staging`, or `prod`
4. Click **"Run workflow"**

### Option 2: Via GitHub CLI

```bash
# Install GitHub CLI if not installed
# https://cli.github.com/

# Authenticate
gh auth login

# Trigger workflow
gh workflow run firestore-backup.yml \
  -f environment=prod

# Or for all environments (scheduled run)
gh workflow run firestore-backup.yml
```

### Option 3: Via API

```bash
# Get your GitHub token
GITHUB_TOKEN="your_github_token"
REPO="your-org/your-repo"

# Trigger workflow
curl -X POST \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  https://api.github.com/repos/${REPO}/actions/workflows/firestore-backup.yml/dispatches \
  -d '{"ref":"main","inputs":{"environment":"prod"}}'
```

---

## Required GitHub Secrets

Configure these in: `Settings → Secrets and variables → Actions`

### Required Secrets

1. **`GCP_SA_KEY`** - Service account JSON key
   - Create service account in GCP Console
   - Grant roles: `datastore.exportAdmin` and `storage.objectAdmin` (bucket-level)
   - Download JSON key
   - Add as secret

2. **`GCP_PROJECT_ID_PROD`** - Production GCP project ID
   - Example: `wildlife-exchange`

3. **`GCP_PROJECT_ID_STAGING`** - Staging GCP project ID
   - Example: `wildlife-exchange-staging`

4. **`GCP_PROJECT_ID_DEV`** - Development GCP project ID
   - Example: `wildlife-exchange-dev`

5. **`GCS_BUCKET_NAME`** - GCS bucket name for backups
   - Example: `wildlife-exchange-backups`

### Optional Secrets

6. **`SLACK_WEBHOOK_URL`** - Slack webhook URL for failure notifications
   - Create webhook in Slack: `Settings → Apps → Incoming Webhooks`
   - Add webhook URL as secret
   - If not configured, GitHub email notifications will trigger on failure

---

## Bucket Layout Example

```
gs://wildlife-exchange-backups/
├── dev/
│   └── firestore/
│       ├── 2026-01-25-020000/
│       │   ├── all_namespaces/
│       │   ├── firestore_export_metadata/
│       │   └── _SUCCESS
│       └── 2026-01-26-020000/
│           └── ...
├── staging/
│   └── firestore/
│       ├── 2026-01-25-020000/
│       └── ...
└── prod/
    └── firestore/
        ├── 2026-01-25-020000/
        └── ...
```

---

## Key Features Implemented

### ✅ Investor-Grade
- RPO/RTO documented (24h RPO, 4-8h RTO)
- Encryption notes (default + optional CMEK)
- Ownership & escalation section
- Quarterly restore drill procedure

### ✅ Audit-Ready
- Environment-scoped bucket layout
- Immutability (versioning + 30-day retention)
- Restore validation checklist
- Comprehensive documentation

### ✅ Ransomware-Safe
- 30-day immutable retention policy
- Versioning enabled (protects against deletion)
- Least-privilege IAM
- Isolated restore test procedure

### ✅ Production-Safe
- Never restore directly to prod guardrails
- Restore drill to isolated test project
- Production backup confirmation (5-second warning)
- Comprehensive validation checklist

---

## Next Steps

1. ✅ **Complete**: All scripts and documentation created
2. ⏳ **TODO**: Create GCS bucket and apply hardening commands
3. ⏳ **TODO**: Configure GitHub Secrets
4. ⏳ **TODO**: Test manual backup for each environment
5. ⏳ **TODO**: Verify GitHub Actions workflow runs successfully
6. ⏳ **TODO**: Schedule first quarterly restore drill

---

## Related Documentation

- `docs/runbooks/firestore-backups.md` - Main backup runbook
- `docs/RESTORE_DRILL_FIRESTORE.md` - Quarterly restore drill
- `scripts/backup-firestore.sh` - Backup script
- `scripts/verify-firestore-backup.sh` - Verification script
- `.github/workflows/firestore-backup.yml` - Automated workflow

---

**Status:** ✅ Implementation complete. Ready for bucket setup and secret configuration.
