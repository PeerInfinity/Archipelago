#!/usr/bin/env node

/**
 * Test Health Check
 * Validates test environment and configuration before running tests
 */

import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runHealthCheck() {
  console.log('🔍 Archipelago Test Environment Health Check');
  console.log('============================================\n');

  const checks = [
    checkServerRunning,
    checkFrontendFiles,
    checkTestConfiguration,
    checkBrowserDependencies,
    checkTestData
  ];

  let allPassed = true;

  for (const check of checks) {
    try {
      const result = await check();
      console.log(`${result.passed ? '✅' : '❌'} ${result.name}`);
      if (result.details) {
        console.log(`   ${result.details}`);
      }
      if (!result.passed) {
        allPassed = false;
        if (result.remedy) {
          console.log(`   💡 Remedy: ${result.remedy}`);
        }
      }
    } catch (error) {
      console.log(`❌ ${check.name} - Error: ${error.message}`);
      allPassed = false;
    }
    console.log('');
  }

  console.log(`\n${allPassed ? '✅' : '❌'} Overall Health: ${allPassed ? 'GOOD' : 'ISSUES DETECTED'}`);
  
  if (!allPassed) {
    console.log('\n⚠️  Some issues detected. Please address them before running tests.');
    process.exit(1);
  }
}

async function checkServerRunning() {
  try {
    const response = await fetch('http://localhost:8000/frontend/');
    return {
      name: 'Development Server',
      passed: response.ok,
      details: response.ok ? 'Server responding at http://localhost:8000' : `Server returned ${response.status}`,
      remedy: !response.ok ? 'Run: python -m http.server 8000' : null
    };
  } catch (error) {
    return {
      name: 'Development Server',
      passed: false,
      details: 'Server not accessible',
      remedy: 'Run: python -m http.server 8000'
    };
  }
}

async function checkFrontendFiles() {
  const requiredFiles = [
    'frontend/index.html',
    'frontend/init.js',
    'frontend/modules.json',
    'frontend/modes.json'
  ];

  const missing = requiredFiles.filter(file => !fs.existsSync(file));
  
  return {
    name: 'Frontend Files',
    passed: missing.length === 0,
    details: missing.length === 0 ? 'All required files present' : `Missing: ${missing.join(', ')}`,
    remedy: missing.length > 0 ? 'Ensure frontend files are properly deployed' : null
  };
}

async function checkTestConfiguration() {
  const configExists = fs.existsSync('playwright.config.js');
  const testExists = fs.existsSync('tests/e2e/app.spec.js');
  
  let testConfig = null;
  if (configExists) {
    try {
      const configContent = fs.readFileSync('playwright.config.js', 'utf8');
      testConfig = {
        hasTimeout: configContent.includes('timeout'),
        hasReporter: configContent.includes('reporter')
      };
    } catch (e) {
      // Config file issues
    }
  }

  return {
    name: 'Test Configuration',
    passed: configExists && testExists,
    details: `Config: ${configExists ? '✓' : '✗'}, Test file: ${testExists ? '✓' : '✗'}`,
    remedy: !configExists || !testExists ? 'Ensure Playwright configuration and test files exist' : null
  };
}

async function checkBrowserDependencies() {
  try {
    const { stdout } = await execAsync('npx playwright --version');
    const version = stdout.trim();
    
    // Check if browsers are installed
    const { stderr } = await execAsync('npx playwright install --dry-run 2>&1');
    const browsersInstalled = !stderr.includes('needs to be installed');
    
    return {
      name: 'Browser Dependencies',
      passed: browsersInstalled,
      details: `Playwright ${version}, Browsers: ${browsersInstalled ? 'Installed' : 'Missing'}`,
      remedy: !browsersInstalled ? 'Run: npx playwright install' : null
    };
  } catch (error) {
    return {
      name: 'Browser Dependencies',
      passed: false,
      details: 'Playwright not found or misconfigured',
      remedy: 'Run: npm install @playwright/test && npx playwright install'
    };
  }
}

async function checkTestData() {
  const testDataPaths = [
    'frontend/presets/adventure',
    'frontend/modules/tests',
    'frontend/modules/testSpoilers'
  ];

  const available = testDataPaths.filter(path => fs.existsSync(path));
  
  return {
    name: 'Test Data',
    passed: available.length === testDataPaths.length,
    details: `${available.length}/${testDataPaths.length} test data directories found`,
    remedy: available.length < testDataPaths.length ? 'Ensure test data files are present' : null
  };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runHealthCheck().catch(console.error);
}

export { runHealthCheck };