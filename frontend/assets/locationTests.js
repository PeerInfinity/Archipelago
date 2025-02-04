// frontend/assets/locationTests.js

import { LocationManager } from './locationManager.js';
import { evaluateRule } from './ruleEngine.js';
import { ALTTPInventory } from './games/alttp/inventory.js';
import { ALTTPState } from './games/alttp/state.js';
import { ALTTPHelpers } from './games/alttp/helpers.js';
import { TestLogger } from './testLogger.js';
import { TestResultsDisplay } from './testResultsDisplay.js';

export class LocationTester {
    constructor() {
        this.locationManager = new LocationManager();
        this.logger = new TestLogger();
        this.display = new TestResultsDisplay();
        this.progressionMapping = null;
        this.currentLocation = null;
        console.log('LocationTester initialized');
    }

    async loadRulesData() {
        try {
            const response = await fetch('./test_output_rules.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const rulesData = await response.json();
            this.locationManager.loadFromJSON(rulesData);
            this.progressionMapping = rulesData.progression_mapping["1"];
            return true;
        } catch (error) {
            console.error('Error loading rules data:', error);
            throw error;
        }
    }

    createInventory(items = [], excludeItems = []) {
        const state = new ALTTPState(this.logger);
        const inventory = new ALTTPInventory(
            items,
            excludeItems,
            this.progressionMapping,
            this.locationManager.itemData,
            this.logger
        );
        
        inventory.helpers = new ALTTPHelpers(inventory, state);
        inventory.state = state;

        return inventory;
    }

    async runLocationTests(testCases) {
        this.logger.setDebugging(true);
        this.logger.clear();

        let failureCount = 0;
        
        try {
            console.log(`Running ${testCases.length} test cases`);
            
            for (const [location, expectedAccess, requiredItems = [], excludedItems = []] of testCases) {
                this.currentLocation = location;
                
                this.logger.startTest({
                    location,
                    expectedAccess,
                    requiredItems,
                    excludedItems
                });
                
                const testResult = await this.runSingleTest(
                    location, 
                    expectedAccess, 
                    requiredItems, 
                    excludedItems
                );

                if (!testResult.passed) {
                    failureCount++;
                }
                
                this.logger.endTest(testResult);
            }

            // Add debug data to window for Playwright
            window.debugData = this.logger.getDebugData();
            
            // Display results
            this.display.displayResults(this.logger.testResults, this.locationManager);
            
            // Signal test completion and verify it was set
            window.testsCompleted = true;
            console.log('Test completion flag set:', window.testsCompleted);
            
            return failureCount;
            
        } catch (error) {
            console.error('Error in runLocationTests:', error);
            window.testsCompleted = true;
            throw error;
        }
    }

    async runSingleTest(location, expectedAccess, requiredItems, excludedItems) {
        try {
            console.log(`Running test for ${location}:`, {
                expectedAccess,
                requiredItems,
                excludedItems
            });
            
            const inventory = this.createInventory(requiredItems, excludedItems);
            const locationData = this.locationManager.locations.find(loc => 
                loc.name === location && loc.player === 1
            );

            if (!locationData) {
                console.log(`Location not found: ${location}`);
                return this.createTestResult(location, false, 
                    `Location not found: ${location}`, expectedAccess);
            }

            console.log('Evaluating rules for:', location);
            const accessRuleResult = evaluateRule(locationData.access_rule, inventory);
            const pathRuleResult = evaluateRule(locationData.path_rules, inventory);
            const isAccessible = accessRuleResult && pathRuleResult;
            
            console.log('Rule results:', {
                accessRuleResult,
                pathRuleResult,
                isAccessible,
                expectedAccess
            });
            
            const passed = isAccessible === expectedAccess;
            if (!passed) {
                const result = this.createTestResult(location, false,
                    `Expected: ${expectedAccess}, Got: ${isAccessible}`,
                    expectedAccess, requiredItems, excludedItems);
                console.log('Created failure result:', result);
                return result;
            }
            
            if (expectedAccess && requiredItems.length && !excludedItems.length) {
                console.log('Testing partial inventories');
                const partialResult = await this.testPartialInventories(
                    location, locationData, requiredItems, expectedAccess
                );
                if (!partialResult.passed) {
                    console.log('Partial inventory test failed:', partialResult);
                    return partialResult;
                }
            }

            const result = this.createTestResult(location, true, 'Test passed',
                expectedAccess, requiredItems, excludedItems);
            console.log('Created success result:', result);
            return result;
                
        } catch (error) {
            console.error('Error in runSingleTest:', error);
            return this.createTestResult(location, false,
                `Test error: ${error.message}`,
                expectedAccess, requiredItems, excludedItems);
        }
    }

    async testPartialInventories(location, locationData, requiredItems, expectedAccess) {
        for (const missingItem of requiredItems) {
            const partialInventory = this.createInventory(
                requiredItems.filter(item => item !== missingItem)
            );
            
            const partialAccessRule = evaluateRule(locationData.access_rule, partialInventory);
            const partialPathRule = evaluateRule(locationData.path_rules, partialInventory);
            const partialAccess = partialAccessRule && partialPathRule;
            
            if (partialAccess) {
                return this.createTestResult(location, false,
                    `Location accessible without required item: ${missingItem}`,
                    expectedAccess, requiredItems, [missingItem]);
            }
        }
        
        return this.createTestResult(location, true, 'Partial inventory tests passed',
            expectedAccess, requiredItems, []);
    }

    createTestResult(location, passed, message, expectedAccess, requiredItems = [], excludedItems = []) {
        // Create the base result
        const result = {
            location,
            passed,
            message,
            expectedAccess,
            requiredItems,
            excludedItems,
            debugLog: this.logger.isDebugging ? this.logger.logs : undefined
        };

        // Log the created result for debugging
        console.log('Created test result:', {
            location,
            passed,
            message,
        });

        return result;
    }

}

// Initialize and run tests when page loads
window.onload = async () => {
    console.log('Starting tests...');
    const tester = new LocationTester();
    
    try {
        await tester.loadRulesData();
        
        const testCasesResponse = await fetch('test_cases.json');
        if (!testCasesResponse.ok) {
            throw new Error(`Failed to load test cases: ${testCasesResponse.status}`);
        }
        const testCasesData = await testCasesResponse.json();
        
        if (!testCasesData.location_tests) {
            throw new Error('No location_tests found in test cases file');
        }

        console.log(`Loaded ${testCasesData.location_tests.length} test cases`);
        const failures = await tester.runLocationTests(testCasesData.location_tests);
        console.log(`Tests completed with ${failures} failures`);
        
    } catch (error) {
        console.error('Test execution failed:', error);
        document.getElementById('test-results').innerHTML = `
            <h2>Test Execution Failed</h2>
            <pre style="color: red;">${error.message}</pre>
            <pre>${error.stack}</pre>
        `;
        window.testsCompleted = true;
    }
};