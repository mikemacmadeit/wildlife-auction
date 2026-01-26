#!/bin/bash
# Deploy Firestore indexes from firestore.indexes.json
# This script deploys all composite indexes required for the application.

set -euo pipefail

echo "🔍 Checking Firebase CLI installation..."
if ! command -v firebase &> /dev/null; then
  echo "❌ Firebase CLI not found. Install with: npm install -g firebase-tools"
  exit 1
fi

echo "🔍 Checking firestore.indexes.json exists..."
if [ ! -f "firestore.indexes.json" ]; then
  echo "❌ firestore.indexes.json not found in current directory"
  exit 1
fi

echo "📋 Deploying Firestore indexes..."
echo "   This may take several minutes. Indexes are built in the background."
echo ""

firebase deploy --only firestore:indexes

echo ""
echo "✅ Index deployment initiated!"
echo ""
echo "📊 Next steps:"
echo "   1. Check index build status in Firebase Console:"
echo "      https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes"
echo "   2. Wait for all indexes to show 'Enabled' status (can take 5-30 minutes)"
echo "   3. Test queries to verify indexes are working"
echo ""
echo "⚠️  Note: Queries will fail with 'requires an index' errors until indexes are built."
