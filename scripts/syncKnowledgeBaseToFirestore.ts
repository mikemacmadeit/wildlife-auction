/**
 * Knowledge Base Sync Script
 * 
 * Reads markdown KB files from /knowledge_base directory and syncs them to Firestore.
 * Safe to re-run (idempotent) - updates existing articles by slug.
 * 
 * Usage:
 *   npx tsx scripts/syncKnowledgeBaseToFirestore.ts
 * 
 * Environment:
 *   Requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { getAdminDb } from '../lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import matter from 'gray-matter';

const KB_DIR = join(process.cwd(), 'knowledge_base');

interface KBFileFrontmatter {
  title: string;
  slug: string;
  category: string;
  audience: string | string[];
  tags?: string | string[];
  enabled?: boolean;
  version?: number;
}

async function getAllMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await getAllMarkdownFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        files.push(fullPath);
      }
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error(`Error reading directory ${dir}:`, error);
    }
  }
  return files;
}

function parseFrontmatter(content: string): { frontmatter: KBFileFrontmatter; body: string } {
  try {
    const parsed = matter(content);
    const frontmatter = parsed.data as any;

    // Normalize audience to array
    let audience: string[] = ['all'];
    if (frontmatter.audience) {
      if (typeof frontmatter.audience === 'string') {
        audience = frontmatter.audience.split(',').map((a: string) => a.trim());
      } else if (Array.isArray(frontmatter.audience)) {
        audience = frontmatter.audience;
      }
    }

    // Normalize tags to array
    let tags: string[] = [];
    if (frontmatter.tags) {
      if (typeof frontmatter.tags === 'string') {
        tags = frontmatter.tags.split(',').map((t: string) => t.trim().toLowerCase());
      } else if (Array.isArray(frontmatter.tags)) {
        tags = frontmatter.tags.map((t: string) => t.trim().toLowerCase());
      }
    }

    return {
      frontmatter: {
        title: frontmatter.title || '',
        slug: frontmatter.slug || '',
        category: frontmatter.category || 'other',
        audience,
        tags,
        enabled: frontmatter.enabled !== false,
        version: frontmatter.version || 1,
      },
      body: parsed.content.trim(),
    };
  } catch (error) {
    console.error('Error parsing frontmatter:', error);
    throw error;
  }
}

async function syncKBToFirestore() {
  console.log('🚀 Starting Knowledge Base sync...\n');

  try {
    // Initialize Firestore
    const db = getAdminDb();
    console.log('✅ Connected to Firestore\n');

    // Get all markdown files
    console.log(`📂 Scanning ${KB_DIR} for markdown files...`);
    const files = await getAllMarkdownFiles(KB_DIR);
    console.log(`   Found ${files.length} markdown file(s)\n`);

    if (files.length === 0) {
      console.log('⚠️  No markdown files found. Create KB articles in /knowledge_base directory.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(content);

        // Validate required fields
        if (!frontmatter.slug || !frontmatter.title || !body) {
          console.error(`❌ Skipping ${filePath}: Missing required fields (slug, title, or content)`);
          skippedCount++;
          continue;
        }

        // Check if article exists
        const docRef = db.collection('knowledgeBaseArticles').doc(frontmatter.slug);
        const existing = await docRef.get();

        const now = Timestamp.now();
        const existingData = existing.exists ? existing.data() : null;

        // Determine if we should update (if content changed or doesn't exist)
        const shouldUpdate = !existing.exists || existingData?.content !== body;

        if (shouldUpdate) {
          const updateData: any = {
            slug: frontmatter.slug,
            title: frontmatter.title,
            content: body,
            category: frontmatter.category,
            audience: frontmatter.audience,
            tags: frontmatter.tags || [],
            enabled: frontmatter.enabled !== false,
            updatedAt: now,
            updatedBy: 'system_sync',
          };

          if (!existing.exists) {
            // New article
            updateData.version = 1;
            updateData.createdAt = now;
            updateData.createdBy = 'system_sync';
            await docRef.set(updateData);
            console.log(`✅ Created: ${frontmatter.slug}`);
            successCount++;
          } else {
            // Update existing
            const newVersion = (existingData?.version || 1) + 1;
            updateData.version = newVersion;
            await docRef.set(updateData, { merge: true });
            console.log(`🔄 Updated: ${frontmatter.slug} (v${newVersion})`);
            successCount++;
          }
        } else {
          console.log(`⏭️  Skipped: ${frontmatter.slug} (no changes)`);
          skippedCount++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing ${filePath}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Sync Summary:');
    console.log(`   ✅ Created/Updated: ${successCount}`);
    console.log(`   ⏭️  Skipped (no changes): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('\n✨ Sync complete!');
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  syncKBToFirestore()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { syncKBToFirestore };
