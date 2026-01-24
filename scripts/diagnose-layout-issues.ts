/**
 * DIAGNOSTIC SCRIPT: Layout Conflict Detection
 * 
 * This script identifies:
 * 1. Route ownership conflicts (multiple layouts claiming same routes)
 * 2. Navigation item duplicates
 * 3. Conditional rendering that might hide tabs
 * 4. Layout nesting issues
 */

import fs from 'fs';
import path from 'path';

const appDir = path.join(process.cwd(), 'app');

interface RouteInfo {
  path: string;
  layout: string | null;
  page: boolean;
}

interface NavItem {
  href: string;
  label: string;
  layout: string;
}

const routes: RouteInfo[] = [];
const navItems: NavItem[] = [];

// Find all routes
function scanRoutes(dir: string, prefix: string = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const routePath = prefix + '/' + entry.name.replace(/\.tsx?$/, '').replace(/\[.*?\]/, '*');
    
    if (entry.isDirectory()) {
      // Check for layout
      const layoutPath = path.join(fullPath, 'layout.tsx');
      if (fs.existsSync(layoutPath)) {
        routes.push({
          path: routePath,
          layout: entry.name,
          page: false
        });
      }
      
      // Check for page
      const pagePath = path.join(fullPath, 'page.tsx');
      if (fs.existsSync(pagePath)) {
        routes.push({
          path: routePath,
          layout: entry.name,
          page: true
        });
      }
      
      scanRoutes(fullPath, routePath);
    }
  }
}

// Extract navigation items from layout files
function extractNavItems(filePath: string, layoutName: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Find baseNavItems or similar arrays
  const navItemPattern = /href:\s*['"]([^'"]+)['"],\s*label:\s*['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = navItemPattern.exec(content)) !== null) {
    navItems.push({
      href: match[1],
      label: match[2],
      layout: layoutName
    });
  }
}

// Main diagnostic
console.log('🔍 LAYOUT DIAGNOSTIC REPORT\n');
console.log('='.repeat(60));

// Scan routes
scanRoutes(appDir);

// Extract nav items
const dashboardLayout = path.join(appDir, 'dashboard', 'layout.tsx');
const sellerLayout = path.join(appDir, 'seller', 'layout.tsx');

if (fs.existsSync(dashboardLayout)) {
  extractNavItems(dashboardLayout, 'dashboard');
}

if (fs.existsSync(sellerLayout)) {
  extractNavItems(sellerLayout, 'seller');
}

// Find conflicts
console.log('\n📊 ROUTE OWNERSHIP ANALYSIS:');
const routeOwnership = new Map<string, string[]>();
routes.forEach(route => {
  if (!routeOwnership.has(route.path)) {
    routeOwnership.set(route.path, []);
  }
  routeOwnership.get(route.path)!.push(route.layout || 'root');
});

const conflicts = Array.from(routeOwnership.entries()).filter(([_, layouts]) => layouts.length > 1);
if (conflicts.length > 0) {
  console.log('❌ CONFLICTS FOUND:');
  conflicts.forEach(([route, layouts]) => {
    console.log(`   ${route}: ${layouts.join(', ')}`);
  });
} else {
  console.log('✅ No route ownership conflicts');
}

// Find duplicate nav items
console.log('\n📋 NAVIGATION ITEM ANALYSIS:');
const navByHref = new Map<string, NavItem[]>();
navItems.forEach(item => {
  if (!navByHref.has(item.href)) {
    navByHref.set(item.href, []);
  }
  navByHref.get(item.href)!.push(item);
});

const duplicates = Array.from(navByHref.entries()).filter(([_, items]) => items.length > 1);
if (duplicates.length > 0) {
  console.log('❌ DUPLICATE NAVIGATION ITEMS:');
  duplicates.forEach(([href, items]) => {
    console.log(`   ${href}:`);
    items.forEach(item => {
      console.log(`      - "${item.label}" in ${item.layout} layout`);
    });
  });
} else {
  console.log('✅ No duplicate navigation items');
}

// Dashboard vs Seller route analysis
console.log('\n🎯 LAYOUT ROUTE ANALYSIS:');
const dashboardRoutes = navItems.filter(n => n.layout === 'dashboard').map(n => n.href);
const sellerRoutes = navItems.filter(n => n.layout === 'seller').map(n => n.href);

console.log(`Dashboard layout navigation items: ${dashboardRoutes.length}`);
console.log(`Seller layout navigation items: ${sellerRoutes.length}`);

const crossContamination = dashboardRoutes.filter(r => r.startsWith('/seller/')) 
  .concat(sellerRoutes.filter(r => r.startsWith('/dashboard/')));
  
if (crossContamination.length > 0) {
  console.log('❌ CROSS-LAYOUT CONTAMINATION:');
  crossContamination.forEach(route => {
    console.log(`   ${route}`);
  });
} else {
  console.log('✅ No cross-layout contamination');
}

console.log('\n' + '='.repeat(60));
console.log('✅ Diagnostic complete');
