#!/bin/bash
# Verify Firestore indexes are deployed and enabled
# This script checks index status via Firebase CLI

set -euo pipefail

echo "🔍 Checking Firebase CLI installation..."
if ! command -v firebase &> /dev/null; then
  echo "❌ Firebase CLI not found. Install with: npm install -g firebase-tools"
  exit 1
fi

echo "📋 Checking Firestore index status..."
echo ""

# List indexes and show status
firebase firestore:indexes

echo ""
echo "✅ To view detailed status, visit:"
echo "   https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes"
echo ""
echo "📊 All indexes should show 'Enabled' status for production readiness."
