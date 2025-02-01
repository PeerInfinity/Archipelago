# Running Frontend Tests

The Archipelago JSON Rules system includes automated testing to verify that the JavaScript rule evaluation matches the Python implementation. The testing process is now fully automated using Playwright.

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

## Test Results

The automated testing process generates two types of output:

1. HTML Snapshot (`test_results_automated.html`)
   - Visual representation of test results
   - Pass/fail status for each test case
   - Detailed information about failures
   - Summary statistics

2. JSON Results (`test_results_automated.json`)
   ```json
   {
     "summary": {
       "total": 155,
       "passed": 128,
       "failed": 27,
       "percentage": 83
     },
     "results": [
       {
         "location": "Location Name",
         "passed": true/false,
         "message": "Test details",
         "expectedAccess": true/false,
         "requiredItems": ["item1", "item2"],
         "excludedItems": ["item3"],
         "debugLog": ["log entry 1", "log entry 2"]
       }
     ]
   }
   ```

## Generated Files

The testing process generates several files:

- `frontend/test_output_rules.json`: Rule definitions exported from Python
- `frontend/test_cases.json`: Test cases exported from Python
- `test_results/test_results_automated.json`: Test execution results
- `test_results/test_results_automated.html`: HTML snapshot of results

## Debugging Failed Tests

When tests fail, you can:

1. Check the HTML snapshot for a visual overview of failures
2. Examine the JSON results file for detailed error information
3. Look for debug logs in the test results for specific test cases
4. Run the tests manually using the legacy method to interact with the test runner directly

## Configuration

The automated testing process can be configured through several options:

- `TestLogger.enableFileSaving`: Enable/disable saving debug files for failed tests
- `TestLogger.enableDebugLogging`: Enable/disable detailed console logging
- Playwright browser options in `automate_frontend_tests.py`

## Adding New Tests

When adding new tests:

1. Create test cases in your Python test file
2. Run the test using pytest
3. The frontend tests will run automatically
4. Check results in the test_results directory

The automated process ensures that both Python and JavaScript implementations stay in sync as new features are added.