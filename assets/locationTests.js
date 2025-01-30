// locationTester.js
import { LocationManager } from './locationManager.js';
import { evaluateRule } from './ruleEngine.js';
import { Inventory } from './inventory.js';
import { TestLogger } from './testLogger.js';
import { TestResultsDisplay } from './testResultsDisplay.js';

export class LocationTester {
    constructor() {
        this.locationManager = new LocationManager();
        this.logger = new TestLogger();
        this.display = new TestResultsDisplay();
        this.testResults = [];
        this.progressionMapping = null;
        this.currentLocation = null;
    }

    async loadRulesData() {
        try {
            const response = await fetch('./test_output_rules.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const rulesData = await response.json();
            this.logger.log('Loaded rules data');
            this.locationManager.loadFromJSON(rulesData);
            this.progressionMapping = rulesData.progression_mapping["1"];  // Get player 1's mapping
            this.logger.log('Rules and progression mapping loaded:', this.progressionMapping);
        } catch (error) {
            console.error('Error loading rules data:', error);
            throw error;
        }
    }

    createInventory(items = [], excludeItems = []) {
        const debugLog = this.logger.isDebugging ? this.logger.logs : null;
        const inventory = new Inventory(
            items,
            excludeItems,
            this.progressionMapping,
            this.locationManager.itemData, // Add this
            debugLog
        );
        // Add debug property for rule engine
        if (debugLog) {
            inventory.debug = {
                log: (msg) => this.logger.log(msg)
            };
        }
        return inventory;
    }

    async runLocationTests(testCases) {
        let failureCount = 0;
        const results = [];
    
        this.logger.log(`Running ${testCases.length} test cases`);
        
        for (const [location, expectedAccess, requiredItems = [], excludedItems = []] of testCases) {
            this.currentLocation = location;
            this.logger.setDebugging(location === "Sunken Treasure");
            this.logger.clear();
            
            const testResult = await this.runSingleTest(
                location, 
                expectedAccess, 
                requiredItems, 
                excludedItems
            );

            results.push(testResult);
            if (!testResult.passed) {
                failureCount++;
                
                if (this.logger.isDebugging) {
                    this.logger.saveToFile(location, {
                        requiredItems,
                        excludedItems,
                        expectedAccess
                    });
                }
            }
        }
    
        this.display.displayResults(results, this.locationManager);
        return failureCount;
    }

    async runSingleTest(location, expectedAccess, requiredItems, excludedItems) {
        this.logger.log(`\nTesting location: ${location}`);
        this.logger.log('Test parameters:', {
            expectedAccess,
            requiredItems,
            excludedItems
        });
        
        const inventory = this.createInventory(requiredItems, excludedItems);
        const locationData = this.locationManager.locations.find(loc => 
            loc.name === location && loc.player === 1
        );

        if (!locationData) {
            return this.createTestResult(location, false, 
                `Location not found: ${location}`, expectedAccess);
        }

        this.logger.log('Location data:', locationData);
        this.logger.log('Testing access rules...');
        
        const accessRuleResult = evaluateRule(locationData.access_rule, inventory);
        const pathRuleResult = evaluateRule(locationData.path_rules, inventory);
        const isAccessible = accessRuleResult && pathRuleResult;
        
        this.logger.log('Rule evaluation results:', {
            accessRuleResult,
            pathRuleResult,
            isAccessible
        });
        
        const passed = isAccessible === expectedAccess;
        if (!passed) {
            this.logger.log(`Test failed: expected ${expectedAccess}, got ${isAccessible}`);
            return this.createTestResult(location, false,
                `Expected: ${expectedAccess}, Got: ${isAccessible}`,
                expectedAccess, requiredItems, excludedItems);
        }
        
        // Test partial inventory if needed
        if (expectedAccess && requiredItems.length && !excludedItems.length) {
            const partialResult = await this.testPartialInventories(
                location, locationData, requiredItems, expectedAccess
            );
            if (!partialResult.passed) {
                return partialResult;
            }
        }

        return this.createTestResult(location, true, 'Test passed',
            expectedAccess, requiredItems, excludedItems);
    }

    async testPartialInventories(location, locationData, requiredItems, expectedAccess) {
        this.logger.log('\nTesting partial inventories...');
        
        for (const missingItem of requiredItems) {
            this.logger.log(`Testing without item: ${missingItem}`);
            const partialInventory = this.createInventory(
                requiredItems.filter(item => item !== missingItem)
            );
            
            const partialAccessRule = evaluateRule(locationData.access_rule, partialInventory);
            const partialPathRule = evaluateRule(locationData.path_rules, partialInventory);
            const partialAccess = partialAccessRule && partialPathRule;
            
            if (partialAccess) {
                this.logger.log('WARNING: Location accessible without required item');
                return this.createTestResult(location, false,
                    `Location accessible without required item: ${missingItem}`,
                    expectedAccess, requiredItems, [missingItem]);
            }
        }
        
        return this.createTestResult(location, true, 'Partial inventory tests passed',
            expectedAccess, requiredItems, []);
    }

    createTestResult(location, passed, message, expectedAccess, requiredItems = [], excludedItems = []) {
        return {
            location,
            passed,
            message,
            expectedAccess,
            requiredItems,
            excludedItems,
            debugLog: this.logger.isDebugging ? this.logger.logs : undefined
        };
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
        `;
    }
};