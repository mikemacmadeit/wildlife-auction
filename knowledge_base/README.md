# Knowledge Base Articles

This directory contains markdown files for Knowledge Base articles that are synced to Firestore.

## File Structure

Articles should be organized by category in subdirectories:

```
knowledge_base/
  getting-started/
    how-to-buy.md
    how-to-sell.md
  account/
    verification.md
    profile-setup.md
  listings/
    creating-listings.md
    listing-fees.md
  ...
```

## Article Format

Each markdown file must include frontmatter with the following fields:

```markdown
---
title: "How to Buy on Wildlife Exchange"
slug: "how-to-buy"
category: "getting-started"
audience: ["buyer", "all"]
tags: ["buying", "getting-started", "tutorial"]
enabled: true
version: 1
---

# Article Title

Article content in markdown format...
```

## Required Fields

- `title`: Article title (string)
- `slug`: Unique identifier (lowercase, alphanumeric, hyphens only)
- `category`: Category name (string)
- `audience`: Array of audiences: `["buyer"]`, `["seller"]`, or `["all"]`

## Optional Fields

- `tags`: Array of searchable tags (strings)
- `enabled`: Whether article is active (boolean, default: true)
- `version`: Version number (number, auto-incremented on sync)

## Syncing to Firestore

Run the sync script to upload articles to Firestore:

```bash
npx tsx scripts/syncKnowledgeBaseToFirestore.ts
```

The script is idempotent - safe to run multiple times. It will:
- Create new articles
- Update existing articles if content changed
- Skip articles with no changes
- Auto-increment version on updates

## Best Practices

1. **Slug Stability**: Once created, slugs should not change (they're used as document IDs)
2. **Clear Titles**: Use descriptive, user-friendly titles
3. **Categorization**: Use consistent category names
4. **Audience Targeting**: Specify the correct audience(s) for each article
5. **Tags**: Add relevant tags for better searchability
6. **Content Quality**: Write clear, step-by-step instructions
7. **Regular Updates**: Update articles when features change

## Categories

Suggested categories:
- `getting-started`
- `account`
- `listings`
- `bidding`
- `payments`
- `delivery`
- `disputes`
- `notifications`
- `safety`
- `troubleshooting`
