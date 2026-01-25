#!/usr/bin/env node
/**
 * Copy Lint Script
 * 
 * Scans user-facing strings for banned terms that could cause payment processor issues.
 * Fails the build if banned terms are found in user-facing text.
 * 
 * Banned terms:
 * - "exotic" (when referring to animals)
 * - "escrow" (use "delayed settlement" instead)
 * - "buy wildlife" / "sell wildlife"
 * - "wildlife marketplace" (as descriptor)
 * 
 * Exception: "Wildlife Exchange" as brand name is allowed.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const BANNED_TERMS = [
  { pattern: /\bexotic\s+(animal|animals|species|listing|listings)\b/gi, description: 'exotic animals/species/listings' },
  { pattern: /\bescrow\b/gi, description: 'escrow (use "delayed settlement" instead)' },
  { pattern: /\bbuy\s+wildlife\b/gi, description: 'buy wildlife' },
  { pattern: /\bsell\s+wildlife\b/gi, description: 'sell wildlife' },
  { pattern: /\bwildlife\s+marketplace\b/gi, description: 'wildlife marketplace (as descriptor)' },
  { pattern: /\bexotic\s+marketplace\b/gi, description: 'exotic marketplace' },
];

const ALLOWED_EXCEPTIONS = [
  'Wildlife Exchange', // Brand name
  'wildlife_exotics', // Category enum value (not display text)
  'EXOTIC_SPECIES', // Constant name
  'exotic-species', // File name
  'other_exotic', // Enum value
];

const SCAN_DIRS = [
  'app',
  'components',
  'lib/email',
];

const SCAN_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

interface Violation {
  file: string;
  line: number;
  text: string;
  term: string;
}

function isException(text: string, line: string): boolean {
  // Check if text contains allowed exceptions
  for (const exception of ALLOWED_EXCEPTIONS) {
    if (line.includes(exception)) {
      // Only allow if it's clearly not user-facing (e.g., in a comment, variable name, or enum value)
      const lowerLine = line.toLowerCase();
      if (
        lowerLine.includes('//') && lowerLine.indexOf('//') < line.indexOf(exception) ||
        lowerLine.includes('enum') ||
        lowerLine.includes('const') ||
        lowerLine.includes('type') ||
        lowerLine.includes('interface') ||
        lowerLine.includes('export') && (lowerLine.includes('=') || lowerLine.includes(':'))
      ) {
        return true;
      }
    }
  }
  return false;
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      // Skip comments that are clearly code-only (JSDoc, code comments without user-facing strings)
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) {
        // Skip if it's clearly a code comment (no quotes, contains code terms like 'filter:', 'type:', 'const', etc.)
        if (!trimmedLine.includes('"') && !trimmedLine.includes("'") && !trimmedLine.includes('`')) {
          // Also skip if it contains code patterns
          if (
            trimmedLine.includes('filter:') ||
            trimmedLine.includes('type:') ||
            trimmedLine.includes('const') ||
            trimmedLine.includes('legacy') ||
            trimmedLine.includes('key name') ||
            trimmedLine.includes('NOTE:') ||
            trimmedLine.includes('TODO:') ||
            trimmedLine.includes('FIXME:')
          ) {
            return; // Skip code-only comments
          }
        }
      }
      
      BANNED_TERMS.forEach(({ pattern, description }) => {
        const matches = line.matchAll(pattern);
        for (const match of matches) {
          const matchedText = match[0];
          
          // Check if this is an allowed exception
          if (isException(matchedText, line)) {
            return;
          }
          
          // Check if it's in a string literal (user-facing)
          const matchIndex = match.index!;
          const beforeMatch = line.substring(0, matchIndex);
          const afterMatch = line.substring(matchIndex + matchedText.length);
          
          // Check if it's inside quotes (likely user-facing)
          const quotesBefore = (beforeMatch.match(/['"`]/g) || []).length;
          const quotesAfter = (afterMatch.match(/['"`]/g) || []).length;
          
          // Skip if it's clearly code (enum value, filter key, type definition, tab value, etc.)
          const lowerLine = line.toLowerCase();
          if (
            lowerLine.includes("filter: '") ||
            lowerLine.includes('filter: "') ||
            (lowerLine.includes("type ") && lowerLine.includes("'escrow'")) ||
            lowerLine.includes('value="escrow"') ||
            lowerLine.includes("value='escrow'") ||
            lowerLine.includes('=== \'escrow\'') ||
            lowerLine.includes('=== "escrow"') ||
            lowerLine.includes('? \'escrow\'') ||
            lowerLine.includes('? "escrow"') ||
            lowerLine.includes('legacy') ||
            lowerLine.includes('internal') ||
            lowerLine.includes('key name') ||
            (lowerLine.includes('const') && lowerLine.includes('escrow')) ||
            (lowerLine.includes('usestate') && lowerLine.includes('escrow')) ||
            (lowerLine.includes('activetab') && lowerLine.includes('escrow')) ||
            (lowerLine.includes('tabstrigger') && lowerLine.includes('value='))
          ) {
            return; // Skip internal code usage
          }
          
          // If odd number of quotes before and after, it's inside a string
          if (quotesBefore % 2 === 1 || quotesAfter % 2 === 1 || quotesBefore > 0) {
            violations.push({
              file: filePath,
              line: index + 1,
              text: line.trim(),
              term: description,
            });
          }
        }
      });
    });
  } catch (error) {
    console.error(`Error scanning ${filePath}:`, error);
  }
  
  return violations;
}

function scanDirectory(dir: string, violations: Violation[] = []): Violation[] {
  try {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules, .next, etc.
        if (entry.startsWith('.') || entry === 'node_modules' || entry === '.next' || entry === 'dist') {
          continue;
        }
        scanDirectory(fullPath, violations);
      } else if (stat.isFile()) {
        const ext = extname(entry);
        if (SCAN_EXTENSIONS.includes(ext)) {
          const fileViolations = scanFile(fullPath);
          violations.push(...fileViolations);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }
  
  return violations;
}

function main() {
  console.log('🔍 Scanning for banned terms in user-facing copy...\n');
  
  const allViolations: Violation[] = [];
  
  SCAN_DIRS.forEach(dir => {
    if (statSync(dir).isDirectory()) {
      const violations = scanDirectory(dir);
      allViolations.push(...violations);
    }
  });
  
  if (allViolations.length > 0) {
    console.error('❌ Found banned terms in user-facing copy:\n');
    
    allViolations.forEach(({ file, line, text, term }) => {
      console.error(`  ${file}:${line}`);
      console.error(`    Term: ${term}`);
      console.error(`    Text: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}\n`);
    });
    
    console.error(`\n❌ Found ${allViolations.length} violation(s). Please replace banned terms with compliant alternatives.`);
    console.error('\nAllowed alternatives:');
    console.error('  - "exotic animals" → "registered livestock" or "specialty livestock"');
    console.error('  - "escrow" → "delayed settlement" or remove');
    console.error('  - "wildlife marketplace" → "livestock & ranch marketplace"');
    console.error('  - "buy/sell wildlife" → "buy/sell registered livestock"');
    
    process.exit(1);
  } else {
    console.log('✅ No banned terms found in user-facing copy.');
    process.exit(0);
  }
}

main();
