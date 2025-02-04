# Test Runner Documentation

The Archipelago JSON Rules system includes automated testing to verify JavaScript rule evaluation matches Python behavior. Tests run automatically using Playwright, with comprehensive debug logging and result analysis.

## Prerequisites

Before running the tests, you need to install Playwright and its browser dependencies:

```bash
pip install playwright
playwright install
```

## Running Tests

There are two ways to run the tests:

### 1. Automated Testing (Recommended)

The tests can now be run directly from pytest without manual intervention. The test process will:

1. Run the Python test case
2. Generate the necessary JSON files
3. Start a local HTTP server
4. Launch a headless browser
5. Execute the frontend tests
6. Save test results
7. Clean up automatically

To run a test:

```bash
pytest worlds/alttp/test/vanilla/TestLightWorld.py::TestLightWorld -v
```

The test results will be saved to:
- `test_results/test_results_automated.html` - HTML snapshot of test results
- `test_results/test_results_automated.json` - Detailed test results in JSON format

### 2. Manual Testing (Legacy Method)

You can still run the tests manually if needed:

1. Configure test execution in VS Code:
   ```json
   {
       "name": "Python: TestLightWorld",
       "type": "debugpy",
       "request": "launch",
       "module": "pytest",
       "args": [
           "worlds/alttp/test/vanilla/TestLightWorld.py::TestLightWorld",
           "-v",
           "--capture=tee-sys",
           "-o", "log_cli=true",
           ">", "pytest_output.txt"
       ],
       "console": "integratedTerminal"
   }
   ```

2. Run the test to generate JSON files:
   - `test_output_rules.json`: Converted rules
   - `test_cases.json`: Test cases

3. Start a local server:
   ```bash
   python -m http.server 8000
   ```

4. Open test runner:
   ```
   http://localhost:8000/frontend/test_runner.html
   ```

### Generated Files

The testing process generates:

1. Rule Definitions (`test_output_rules.json`)
   - Exported rules from Python
   - Helper function references
   - Item and location data

2. Test Cases (`test_cases.json`)
   - Test specifications from Python
   - Location access requirements
   - Required/excluded items

3. Test Results (`test_results_automated.json`)
```javascript
{
  "summary": {
    "total": number,
    "passed": number,
    "failed": number,
    "percentage": number
  },
  "results": [{
    "location": string,
    "result": {
      "passed": boolean,
      "message": string,
      "expectedAccess": boolean,
      "requiredItems": string[],
      "excludedItems": string[]
    },
    "debugLog": LogEntry[]
  }]
}
```

4. Debug Logs (`debug_logs_automated.json`)
```javascript
{
  "timestamp": string,
  "testResults": TestResult[],
  "summary": {
    "total": number,
    "passed": number,
    "failed": number,
    "percentage": number,
    "failureAnalysis": {
      "byType": Record<string, TestResult[]>,
      "tracePatterns": {
        "helperCalls": string[],
        "failedRules": string[],
        "itemChecks": string[]
      },
      "commonPatterns": {
        "requiredItems": Record<string, number>,
        "locations": Record<string, number>,
        "rules": Record<string, number>
      }
    }
  },
  "ruleTraces": [{
    "timestamp": string,
    "trace": {
      "type": string,
      "rule": Rule,
      "depth": number,
      "result": boolean,
      "startTime": string,
      "endTime": string,
      "children": Trace[]
    }
  }]
}
```

## Debug Logging

The test system provides comprehensive debug logging:

### Rule Evaluation
- Step-by-step rule processing
- Helper function execution
- Inventory state changes
- Rule evaluation results

### Test Execution
- Test case setup
- Rule loading
- Location access checks
- Item management

### Failure Analysis
- Rule evaluation traces
- Inventory state at failure
- Helper execution logs
- Common failure patterns

## Implementation Details

### Frontend Test Runner

The test runner (`LocationTester` class):
1. Loads rule definitions
2. Creates test inventory
3. Processes test cases
4. Evaluates location access
5. Records results and debug info
6. Analyzes test failures

### Debug Infrastructure

Debug logging tracks:
- Rule evaluation steps
- Helper function calls
- Inventory operations
- Location access checks
- Test case execution
- Result analysis

### Test Result Analysis

The system analyzes test results to identify:
- Common failure patterns
- Problematic rule types
- Helper function issues
- Item dependencies
- State management problems

## Configuration

Test execution can be configured through:

```javascript
TestLogger.enableFileSaving // Enable/disable file output
TestLogger.enableDebugLogging // Enable/disable debug logs
```

Playwright options in `automate_frontend_tests.py`:
- Browser selection
- Headless mode
- Viewport settings
- Network conditions

## Debugging Failed Tests

When tests fail:

1. Check Results Summary
   - Review failure count and percentage
   - Examine failure categories
   - Look for patterns

2. Analyze Debug Logs
   - Review rule evaluation traces
   - Check inventory state
   - Examine helper execution
   - Look for error patterns

3. Review Test Cases
   - Verify test specifications
   - Check required items
   - Validate expected access

4. Use Visual Inspection
   - Run tests with debug logging
   - Use browser DevTools
   - Check network requests
   - Monitor console output

## Adding New Tests

To add new tests:

1. Create Test Cases
```python
self.run_location_tests([
    ["Location Name", False, []],
    ["Location Name", True, ["Required Item"]],
    ["Location Name", False, [], ["Excluded Item"]]
])
```

2. Run Tests
```bash
pytest path/to/test_file.py -v
```

3. Check Results
- Review automated test results
- Examine debug logs
- Analyze any failures

4. Debug Issues
- Use debug logging
- Check rule evaluation
- Verify helper execution
- Validate inventory state