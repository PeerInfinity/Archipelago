#!/usr/bin/env node
/**
 * Frontend bundler script using esbuild
 *
 * Bundles the frontend for production while preserving the ability
 * to run unbundled in development mode.
 *
 * Usage:
 *   node scripts/build/bundle-frontend.js [--watch] [--minify]
 *
 * Options:
 *   --watch    Watch for changes and rebuild automatically
 *   --minify   Minify the output (default in production)
 *   --no-minify  Don't minify (useful for debugging bundled version)
 */

import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const frontendDir = path.join(projectRoot, 'frontend');
const distDir = path.join(frontendDir, 'dist');

// Parse command line arguments
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const minify = args.includes('--minify') || (!args.includes('--no-minify') && !watch);

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Build configuration
const buildOptions = {
  entryPoints: [path.join(frontendDir, 'init-bundled.js')],
  bundle: true,
  outfile: path.join(distDir, 'bundle.js'),
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: minify,
  sourcemap: true,
  metafile: true,

  // Keep dynamic imports for code splitting potential
  splitting: false,

  // Log level
  logLevel: 'info',

  // Define any globals if needed
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
  },

  // Banner to identify the bundle
  banner: {
    js: `/* Archipelago JSON Frontend - Bundled ${new Date().toISOString()} */`,
  },
};

// Files that need to be copied to dist (workers, etc. that can't be bundled)
const filesToCopy = [
  {
    src: path.join(frontendDir, 'modules/stateManager/stateManagerWorker.js'),
    dest: path.join(distDir, 'stateManagerWorker.js'),
  },
];

// Copy required files to dist
function copyFilesToDist() {
  for (const { src, dest } of filesToCopy) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`   Copied: ${path.basename(src)}`);
    } else {
      console.warn(`   Warning: ${src} not found`);
    }
  }
}

/**
 * Validates that all enabled modules in modules.json are present in
 * init-bundled.js's BUNDLED_MODULES map. Any enabled module that is missing
 * will be dynamically imported at runtime, which creates duplicate singleton
 * instances (eventBus, settingsManager, etc.) and breaks event subscriptions.
 */
function validateBundledModules() {
  const modulesJsonPath = path.join(frontendDir, 'module-configs/modules.json');
  const initBundledPath = path.join(frontendDir, 'init-bundled.js');

  const modulesJson = JSON.parse(fs.readFileSync(modulesJsonPath, 'utf8'));
  const enabledModules = Object.entries(modulesJson.moduleDefinitions)
    .filter(([, def]) => def.enabled)
    .map(([id]) => id);

  const initBundledSrc = fs.readFileSync(initBundledPath, 'utf8');

  // Extract BUNDLED_MODULES block content
  const blockMatch = initBundledSrc.match(/const BUNDLED_MODULES\s*=\s*\{([\s\S]*?)\};/);
  if (!blockMatch) {
    console.warn('⚠️  Could not locate BUNDLED_MODULES in init-bundled.js — skipping validation.');
    return;
  }

  // Extract keys from lines like "  optionsPanel: optionsPanelModule,"
  const bundledKeys = new Set(
    [...blockMatch[1].matchAll(/^\s+([\w-]+)\s*:/gm)].map(m => m[1])
  );

  const missing = enabledModules.filter(id => !bundledKeys.has(id));
  if (missing.length > 0) {
    console.warn('');
    console.warn('⚠️  WARNING: The following enabled modules are missing from BUNDLED_MODULES in init-bundled.js:');
    for (const id of missing) {
      console.warn(`   - ${id}`);
    }
    console.warn('   These modules will be dynamically imported in bundled mode, which creates');
    console.warn('   duplicate singleton instances and breaks event subscriptions.');
    console.warn('   Add them to init-bundled.js to fix this.');
    console.warn('');
  } else {
    console.log('✅ All enabled modules are present in BUNDLED_MODULES.');
  }
}

async function build() {
  console.log(`\n📦 Building frontend bundle...`);
  console.log(`   Entry: ${buildOptions.entryPoints[0]}`);
  console.log(`   Output: ${buildOptions.outfile}`);
  console.log(`   Minify: ${minify}`);
  console.log(`   Sourcemap: ${buildOptions.sourcemap}`);
  console.log('');

  try {
    // Validate module coverage before building
    console.log('🔍 Validating bundled module coverage...');
    validateBundledModules();

    // Copy required files (workers, etc.)
    console.log('📋 Copying required files...');
    copyFilesToDist();
    console.log('');

    if (watch) {
      // Watch mode
      const context = await esbuild.context(buildOptions);
      await context.watch();
      console.log('👀 Watching for changes...\n');
    } else {
      // Single build
      const result = await esbuild.build(buildOptions);

      // Report bundle size
      if (result.metafile) {
        const outputs = result.metafile.outputs;
        for (const [file, info] of Object.entries(outputs)) {
          if (file.endsWith('.js')) {
            const sizeKB = (info.bytes / 1024).toFixed(1);
            const sizeMB = (info.bytes / 1024 / 1024).toFixed(2);
            console.log(`✅ Bundle created: ${path.basename(file)}`);
            console.log(`   Size: ${sizeKB} KB (${sizeMB} MB)`);
            console.log(`   Inputs: ${Object.keys(info.inputs).length} files`);
          }
        }

        // Write metafile for analysis
        const metafilePath = path.join(distDir, 'metafile.json');
        fs.writeFileSync(metafilePath, JSON.stringify(result.metafile, null, 2));
        console.log(`\n📊 Build analysis written to: dist/metafile.json`);
        console.log(`   Visualize at: https://esbuild.github.io/analyze/`);
      }

      console.log('\n✨ Build complete!\n');
    }
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

build();
