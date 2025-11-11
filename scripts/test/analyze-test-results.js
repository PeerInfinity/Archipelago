#!/usr/bin/env node

/**
 * Test Results Analyzer
 * Generates concise, human-readable reports from verbose Playwright output
 */

import fs from 'fs';
import path from 'path';

// Store output for writing to file
let outputBuffer = '';

function log(message) {
  console.log(message);
  outputBuffer += message + '\n';
}

function analyzePlaywrightReport(reportPath = 'playwright-report.json') {
  if (!fs.existsSync(reportPath)) {
    console.error(`Report file not found: ${reportPath}`);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  
  log('Archipelago Test Results Summary');
  log('=====================================\n');
  
  // Overall stats
  const stats = report.stats;
  log('Overall Statistics:');
  log(`   Duration: ${(stats.duration / 1000).toFixed(2)}s`);
  log(`   Tests Expected: ${stats.expected}`);
  log(`   Passed: ${stats.expected - stats.unexpected}`);
  log(`   Failed: ${stats.unexpected}`);
  log(`   Skipped: ${stats.skipped}`);
  log(`   Flaky: ${stats.flaky}\n`);

  // Extract in-app test results from browser logs
  const tests = extractInAppTestResults(report);
  if (tests) {
    log('In-App Test Details:');
    log(`   Total Run: ${tests.summary.totalRun}`);
    log(`   Passed: ${tests.summary.passedCount}`);
    log(`   Failed: ${tests.summary.failedCount}`);
    
    // Calculate runtime statistics
    const runtimeData = tests.testDetails.map(test => {
      if (test.runtime !== undefined) {
        return test.runtime;
      }
      
      // Calculate runtime from timestamps
      const allTimestamps = [];
      
      if (test.logs && test.logs.length > 0) {
        test.logs.forEach(log => {
          if (log.timestamp) {
            allTimestamps.push(new Date(log.timestamp).getTime());
          }
        });
      }
      
      if (test.conditions && test.conditions.length > 0) {
        test.conditions.forEach(condition => {
          if (condition.timestamp) {
            allTimestamps.push(new Date(condition.timestamp).getTime());
          }
        });
      }
      
      if (allTimestamps.length >= 2) {
        const minTime = Math.min(...allTimestamps);
        const maxTime = Math.max(...allTimestamps);
        return maxTime - minTime;
      } else if (allTimestamps.length === 1) {
        // Single timestamp tests get 0ms runtime
        return 0;
      }
      
      return null;
    }).filter(runtime => runtime !== null);
    
    if (runtimeData.length > 0) {
      const totalRuntime = runtimeData.reduce((sum, runtime) => sum + runtime, 0);
      const averageRuntime = totalRuntime / runtimeData.length;
      const maxRuntime = Math.max(...runtimeData);
      const minRuntime = Math.min(...runtimeData);
      
      log(`   Total Runtime: ${totalRuntime < 1000 ? totalRuntime + 'ms' : (totalRuntime / 1000).toFixed(2) + 's'}`);
      log(`   Average Runtime: ${averageRuntime < 1000 ? averageRuntime.toFixed(1) + 'ms' : (averageRuntime / 1000).toFixed(2) + 's'}`);
      log(`   Fastest Test: ${minRuntime < 1000 ? minRuntime + 'ms' : (minRuntime / 1000).toFixed(2) + 's'}`);
      log(`   Slowest Test: ${maxRuntime < 1000 ? maxRuntime + 'ms' : (maxRuntime / 1000).toFixed(2) + 's'}`);
    }
    log('');
    
    // Show test details in columns
    log('   Status    Runtime    Category                    Test Name');
    log('   ------    -------    --------                    ---------');
    
    tests.testDetails.forEach(test => {
      const status = test.status === 'passed' ? '[PASS]' : 
                    test.status === 'failed' ? '[FAIL]' : 
                    test.status === 'disabled' ? '[SKIP]' : '[????]';
      
      // Calculate runtime from timestamps if available
      let runtimeText = '';
      let calculatedRuntime = null;
      
      if (test.runtime !== undefined) {
        calculatedRuntime = test.runtime;
      } else {
        // Try to calculate runtime from logs or conditions timestamps
        const allTimestamps = [];
        
        // Collect timestamps from logs
        if (test.logs && test.logs.length > 0) {
          test.logs.forEach(log => {
            if (log.timestamp) {
              allTimestamps.push(new Date(log.timestamp).getTime());
            }
          });
        }
        
        // Collect timestamps from conditions
        if (test.conditions && test.conditions.length > 0) {
          test.conditions.forEach(condition => {
            if (condition.timestamp) {
              allTimestamps.push(new Date(condition.timestamp).getTime());
            }
          });
        }
        
        // Calculate runtime if we have timestamps
        if (allTimestamps.length >= 2) {
          const minTime = Math.min(...allTimestamps);
          const maxTime = Math.max(...allTimestamps);
          calculatedRuntime = maxTime - minTime;
        } else if (allTimestamps.length === 1 && test.status !== 'disabled') {
          // For tests with only one timestamp, we can't calculate duration
          // but we can indicate they ran quickly
          calculatedRuntime = 0;
        }
      }
      
      // Format runtime text
      if (test.status === 'disabled') {
        runtimeText = '';
      } else if (calculatedRuntime !== null) {
        if (calculatedRuntime < 1000) {
          runtimeText = `${calculatedRuntime}ms`;
        } else {
          runtimeText = `${(calculatedRuntime / 1000).toFixed(2)}s`;
        }
      } else {
        runtimeText = 'N/A';
      }
      
      // Format columns with fixed widths
      const statusCol = status.padEnd(9);
      const runtimeCol = runtimeText.padEnd(10);
      const categoryCol = test.category.padEnd(27);
      const nameCol = test.name;
      
      log(`   ${statusCol} ${runtimeCol} ${categoryCol} ${nameCol}`);
      
      if (test.status === 'failed') {
        // Show failed conditions
        if (test.conditions) {
          const failedConditions = test.conditions.filter(c => c.status === 'failed');
          if (failedConditions.length > 0) {
            log(`      Failed Conditions:`);
            failedConditions.forEach(condition => {
              log(`        [FAIL] ${condition.description}`);
              if (condition.timestamp) {
                const time = new Date(condition.timestamp).toLocaleTimeString();
                log(`               at ${time}`);
              }
            });
          }
        }
        
        // Show error logs
        if (test.logs) {
          const errorLogs = test.logs.filter(log => log.type === 'error' || log.message.toLowerCase().includes('error') || log.message.toLowerCase().includes('fail'));
          if (errorLogs.length > 0) {
            log(`      Error Logs:`);
            errorLogs.forEach(logEntry => {
              const time = logEntry.timestamp ? new Date(logEntry.timestamp).toLocaleTimeString() : 'N/A';
              log(`        [${time}] ${logEntry.message}`);
            });
          }
        }
        
        // Show recent logs leading up to failure
        if (test.logs && test.logs.length > 0) {
          const recentLogs = test.logs.slice(-3); // Last 3 logs
          if (recentLogs.length > 0) {
            log(`      Recent Activity:`);
            recentLogs.forEach(logEntry => {
              const time = logEntry.timestamp ? new Date(logEntry.timestamp).toLocaleTimeString() : 'N/A';
              const type = logEntry.type ? logEntry.type.toUpperCase() : 'LOG';
              log(`        [${time}] [${type}] ${logEntry.message.substring(0, 80)}${logEntry.message.length > 80 ? '...' : ''}`);
            });
          }
        }
        log(''); // Extra line after failed test details
      }
    });
    log('');
  }

  // Performance insights
  analyzePerformance(report);
  
  // Error analysis
  analyzeErrors(report);
  
  // Write output to file
  const outputPath = 'playwright-analysis.txt';
  try {
    fs.writeFileSync(outputPath, outputBuffer);
    console.log(`\nAnalysis saved to: ${outputPath}`);
  } catch (error) {
    console.error(`Failed to write analysis to file: ${error.message}`);
  }
}

function extractInAppTestResults(report) {
  // Look for the __playwrightTestResults__ in stdout
  const stdout = report.suites?.[0]?.suites?.[0]?.specs?.[0]?.tests?.[0]?.results?.[0]?.stdout;
  if (!stdout) return null;
  
  for (const log of stdout) {
    if (log.text.includes('Full in-app test results:')) {
      try {
        // Extract the JSON part after "Full in-app test results: "
        const jsonStart = log.text.indexOf('Full in-app test results: ') + 'Full in-app test results: '.length;
        const jsonStr = log.text.substring(jsonStart).trim();
        return JSON.parse(jsonStr);
      } catch (e) {
        // Continue searching or try a different approach
        try {
          const match = log.text.match(/Full in-app test results: ({.*})/s);
          if (match) {
            return JSON.parse(match[1]);
          }
        } catch (e2) {
          // Continue searching
        }
      }
    }
  }
  return null;
}

function analyzePerformance(report) {
  log('Performance Analysis:');
  
  const testResult = report.suites?.[0]?.suites?.[0]?.specs?.[0]?.tests?.[0]?.results?.[0];
  if (testResult) {
    log(`   Test Execution: ${(testResult.duration / 1000).toFixed(2)}s`);
    
    // Analyze timing from logs if available
    const stdout = testResult.stdout || [];
    const timingEvents = stdout
      .filter(logEntry => logEntry.text.includes('Polling for condition') || logEntry.text.includes('Condition met'))
      .map(logEntry => ({
        timestamp: extractTimestamp(logEntry.text),
        message: logEntry.text.trim()
      }));
    
    if (timingEvents.length > 0) {
      log('   Key Timing Events:');
      timingEvents.slice(0, 5).forEach(event => {
        const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'N/A';
        log(`      ${time}: ${event.message.substring(0, 80)}...`);
      });
    }
  }
  log('');
}

function analyzeErrors(report) {
  const errors = [];
  
  // Check for test-level errors
  const testResult = report.suites?.[0]?.suites?.[0]?.specs?.[0]?.tests?.[0]?.results?.[0];
  if (testResult?.errors?.length > 0) {
    errors.push(...testResult.errors);
  }
  
  // Check for browser errors in logs
  const stdout = testResult?.stdout || [];
  const browserErrors = stdout
    .filter(logEntry => logEntry.text.includes('BROWSER LOG (error)') || logEntry.text.includes('ERROR'))
    .map(logEntry => logEntry.text.trim());
  
  if (errors.length > 0 || browserErrors.length > 0) {
    log('Error Analysis:');
    
    if (errors.length > 0) {
      log('   Test Errors:');
      errors.forEach(error => {
        log(`      ${error.message || error}`);
      });
    }
    
    if (browserErrors.length > 0) {
      log('   Browser Errors:');
      browserErrors.slice(0, 3).forEach(error => {
        log(`      ${error.substring(0, 100)}...`);
      });
    }
  } else {
    log('No errors detected\n');
  }
}

function extractTimestamp(logText) {
  const match = logText.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/);
  return match ? match[1] : null;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzePlaywrightReport(process.argv[2]);
}

export { analyzePlaywrightReport };