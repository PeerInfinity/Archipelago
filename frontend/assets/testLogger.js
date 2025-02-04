// frontend/assets/testLogger.js

export class TestLogger {
    static enableFileSaving = false; // Default to false - will enable via UI
    static enableDebugLogging = true;
    
    constructor() {
        this.logs = [];
        this.isDebugging = false;
        this.testResults = [];
        this.ruleTraces = [];
        this.currentTestContext = null;
    }

    log(message, data = null) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                message: typeof message === 'object' ? JSON.stringify(message) : message,
                data: data ? JSON.stringify(data, null, 2) : null
            };
            
            this.logs.push(logEntry);
            
            if (this.currentTestContext) {
                if (!this.currentTestContext.logs) {
                    this.currentTestContext.logs = [];
                }
                this.currentTestContext.logs.push(logEntry);
            }

            if (this.isDebugging && TestLogger.enableDebugLogging) {
                console.log(logEntry.message);
                if (logEntry.data) {
                    console.log(logEntry.data);
                }
            }
        } catch (error) {
            console.error('Error in logger:', error);
        }
    }

    setDebugging(isDebugging) {
        this.isDebugging = isDebugging;
    }

    generateSummary() {
        const total = this.testResults.length;
        const passed = this.testResults.filter(r => r && r.result && r.result.passed).length;
        const failed = total - passed;

        return {
            total,
            passed,
            failed,
            percentage: total > 0 ? Math.round((passed / total) * 100) : 0
        };
    }

    getDebugData() {
        return {
            timestamp: new Date().toISOString(),
            testResults: this.testResults,
            summary: this.generateSummary(),
            consolidatedLogs: this.logs
        };
    }

    clear() {
        this.logs = [];
        this.ruleTraces = [];
    }

    startTest(testContext) {
        this.currentTestContext = {
            ...testContext,
            startTime: new Date().toISOString(),
            logs: [],
            traces: []
        };
    }

    endTest(result) {
        if (this.currentTestContext) {
            this.currentTestContext.endTime = new Date().toISOString();
            this.currentTestContext.result = result;
            this.testResults.push(this.currentTestContext);
            this.currentTestContext = null;
        }
    }

    log(message, data = null) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            message: typeof message === 'object' ? JSON.stringify(message) : message,
            data: data ? JSON.stringify(data, null, 2) : null
        };

        // Add to main log array
        this.logs.push(logEntry);

        // Add to current test context if one exists
        if (this.currentTestContext) {
            this.currentTestContext.logs.push(logEntry);
        }

        // Output to console if debugging is enabled
        if (this.isDebugging && TestLogger.enableDebugLogging) {
            console.log(logEntry.message);
            if (logEntry.data) {
                console.log(logEntry.data);
            }
        }
    }

    addTrace(trace) {
        const traceEntry = {
            timestamp: new Date().toISOString(),
            trace: trace.toJSON()
        };

        this.ruleTraces.push(traceEntry);
        if (this.currentTestContext) {
            this.currentTestContext.traces.push(traceEntry);
        }
    }

    clear() {
        this.logs = [];
        this.ruleTraces = [];
    }

    getDebugData() {
        return {
            timestamp: new Date().toISOString(),
            testResults: this.testResults.map(result => ({
                ...result,
                traces: result.traces.length > 0 ? result.traces : undefined
            })),
            summary: this.generateSummary(),
            ruleTraces: this.ruleTraces
        };
    }

    generateSummary() {
        const total = this.testResults.length;
        const passed = this.testResults.filter(r => r.result.passed).length;
        const failed = total - passed;

        const failureAnalysis = this.analyzeFailures();

        return {
            total,
            passed,
            failed,
            percentage: Math.round((passed / total) * 100),
            failureAnalysis
        };
    }

    analyzeFailures() {
        const failures = this.testResults.filter(r => !r.result.passed);
        
        // Group failures by type
        const byType = {};
        failures.forEach(failure => {
            const type = this.categorizeFailure(failure);
            byType[type] = byType[type] || [];
            byType[type].push(failure);
        });

        // Analyze patterns in rule traces
        const tracePatterns = this.analyzeTracePatterns(failures);

        return {
            byType,
            tracePatterns,
            commonPatterns: this.findCommonPatterns(failures)
        };
    }

    categorizeFailure(failure) {
        // Analyze traces and logs to determine failure type
        const traces = failure.traces || [];
        const lastTrace = traces[traces.length - 1];

        if (!lastTrace) {
            return 'no_trace';
        }

        // Check for helper function failures
        if (traces.some(t => t.trace.type === 'helper' && !t.trace.result)) {
            return 'helper_failure';
        }

        // Check for progressive item issues
        if (failure.testContext?.requiredItems?.some(item => 
            item.startsWith('Progressive'))) {
            return 'progressive_item';
        }

        // Check for compound rule failures
        if (traces.some(t => 
            (t.trace.type === 'and' || t.trace.type === 'or') && !t.trace.result)) {
            return 'compound_rule';
        }

        // Default
        return 'unknown';
    }

    analyzeTracePatterns(failures) {
        const patterns = {
            helperCalls: new Set(),
            failedRules: new Set(),
            itemChecks: new Set()
        };

        failures.forEach(failure => {
            failure.traces?.forEach(trace => {
                const {type, rule, result} = trace.trace;
                
                if (type === 'helper') {
                    patterns.helperCalls.add(rule.name);
                    if (!result) {
                        patterns.failedRules.add(`helper:${rule.name}`);
                    }
                } else if (type === 'item_check' && !result) {
                    patterns.itemChecks.add(rule.item);
                }
            });
        });

        return {
            helperCalls: Array.from(patterns.helperCalls),
            failedRules: Array.from(patterns.failedRules),
            itemChecks: Array.from(patterns.itemChecks)
        };
    }

    findCommonPatterns(failures) {
        // Look for common patterns in failures
        const patterns = {
            requiredItems: {},
            locations: {},
            rules: {}
        };

        failures.forEach(failure => {
            // Track required items
            failure.testContext?.requiredItems?.forEach(item => {
                patterns.requiredItems[item] = (patterns.requiredItems[item] || 0) + 1;
            });

            // Track locations
            const location = failure.testContext?.location;
            if (location) {
                patterns.locations[location] = (patterns.locations[location] || 0) + 1;
            }

            // Track rule types
            failure.traces?.forEach(trace => {
                const ruleType = trace.trace.type;
                patterns.rules[ruleType] = (patterns.rules[ruleType] || 0) + 1;
            });
        });

        return patterns;
    }

    saveToFile(locationName, testParams) {
        if (!TestLogger.enableFileSaving) {
            if (TestLogger.enableDebugLogging) {
                console.log('File saving disabled. Debug data:', {
                    location: locationName,
                    ...testParams,
                    log: this.logs
                });
            }
            return;
        }

        const debugData = {
            location: locationName,
            timestamp: new Date().toISOString(),
            testParams,
            logs: this.logs,
            traces: this.ruleTraces,
            analysis: this.generateSummary()
        };

        const blob = new Blob([JSON.stringify(debugData, null, 2)], 
            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug_${locationName.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Only called when download button is clicked
    downloadResults() {
        if (!TestLogger.enableFileSaving) return;

        const debugData = {
            timestamp: new Date().toISOString(),
            testResults: this.testResults,
            summary: this.generateSummary(),
            consolidatedLogs: this.logs
        };

        const blob = new Blob([JSON.stringify(debugData, null, 2)], 
            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `test_results_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}