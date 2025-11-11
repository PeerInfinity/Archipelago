# Getting Started for Developers

This guide provides the necessary steps to set up a local development environment for the Archipelago JSON Export Tools project. It is intended for developers who want to contribute to the project, add new features, or debug existing functionality.

## Prerequisites

### Required Software

- **Git**: For version control.
- **Python 3.8+**: For running the backend rule exporter and a local web server.
- **A Modern Web Browser**: Chrome, Firefox, or Edge, with support for ES6 modules and Web Workers.

### Recommended Tools

- **Visual Studio Code**: A powerful code editor with excellent support for both Python and JavaScript.
- **Python `venv`**: For creating an isolated Python environment to manage dependencies.
- **Node.js & npm**: While not strictly required for basic operation, Node.js is useful for running tools like `npx serve` and for managing JavaScript dependencies if any are added in the future. It is also required for running the automated Playwright tests.

## Project Setup

You can set up your development environment either automatically using the provided setup script or manually by following the individual steps.

### Option 1: Automated Setup (Recommended)

For a quick and automated setup, use the provided setup script:

```bash
# First, clone the repository
git clone -b JSONExport https://github.com/PeerInfinity/Archipelago.git archipelago-json
cd archipelago-json

# Run the automated setup script
python scripts/setup/setup_dev_environment.py
```

The script will automatically:
- Check prerequisites (Python, Node.js)
- Create and configure the Python virtual environment
- Install all required dependencies (base + game-specific)
- Generate game template files
- Set up host configuration for testing
- Install Node.js dependencies
- Verify the complete setup

After the script completes, you can skip to the [Basic Workflow & Verification](#basic-workflow--verification) section.

### Option 2: Manual Setup

If you prefer to set up your environment manually or need to understand each step, follow the sections below.

#### 1. Clone the Repository

First, clone the project repository from GitHub to your local machine.

```bash
git clone -b JSONExport https://github.com/PeerInfinity/Archipelago.git archipelago-json
cd archipelago-json
```

#### 2. Set Up the Python Environment

The backend tools for exporting game logic are written in Python. It's best practice to create a virtual environment to handle the dependencies.

```bash
# Create a virtual environment named '.venv'
python -m venv .venv

# Activate the virtual environment
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install the required Python packages
pip install -r requirements.txt
```

**Note:** The virtual environment only stays active for the current terminal session. You'll need to reactivate it in new terminal windows by running `source .venv/bin/activate` (or `.venv\Scripts\activate` on Windows) from the project directory. However, the virtual environment is primarily needed for Python backend tools and running the HTTP server - frontend development and testing mostly relies on Node.js.

#### 3. Run the Frontend Locally

The frontend application must be served by an HTTP server because modern browser security policies prevent Web Workers (a core part of the architecture) from running on pages loaded directly from the local filesystem (`file://`).

The simplest way to do this is with Python's built-in HTTP server.

```bash
# Start the server from the project root directory
# (This ensures the frontend directory is accessible at /frontend/)
# For Python 3:
python -m http.server 8000
```

Now, open your web browser and navigate to: **`http://localhost:8000/frontend/`**

You should see the web client's interface load with its default panel layout.

## Basic Workflow & Verification

Once the application is running in your browser, you can begin development. Here is a quick workflow to verify that everything is set up correctly.

### 1. Explore the Running Application

-   Interact with the different panels (Inventory, Locations, Regions, etc.) to get a feel for the UI.
-   Open your browser's developer tools (usually by pressing `F12`) and inspect the **Console** tab. You should see log messages from the application's initialization process.
-   The application uses a structured logger. To see more detailed logs, you can type commands like `log_level stateManager DEBUG` or `log_status` directly into the browser console. For more details, see the [Logging System Reference](./reference/logging-system.md).

### 2. Make a Simple Change

To confirm your development environment is working, let's make a small change to a UI module.

1.  Open the file `frontend/modules/inventory/inventoryUI.js`.
2.  Find the `_createBaseUI()` method.
3.  Inside the `innerHTML` string for the `.inventory-header`, change `<h2>Inventory</h2>` to `<h2>My Inventory</h2>`.
4.  Save the file.
5.  Refresh the page at `http://localhost:8000/frontend/`.

You should see the title of the Inventory panel change to "My Inventory".

### 3. Run Automated Tests

**Quick Start (First Time Setup):**
```bash
npm install                        # Install dependencies
npx playwright install chromium    # Install browser binaries
npm test                          # Run tests (auto-starts HTTP server)
```

**Detailed Instructions:**

This project includes an end-to-end test suite using Playwright that validates the entire frontend system, including the crucial `testSpoilers` logic validation. To run it:

1.  Make sure you have Node.js and npm installed.
2.  In the project's root directory, run `npm install` to get the testing dependencies.
3.  Install Playwright browser binaries:
    ```bash
    npx playwright install chromium
    ```
4.  **Optional:** Pre-start the local server if desired (`python -m http.server 8000`).
    **Note:** Playwright will automatically start the server if it's not already running (see `webServer` config in `playwright.config.js`).
5.  Run the primary test command from the project root:
    ```bash
    npm test
    ```
6.  The test runner will launch a headless browser, run through the application's internal test suite, and report the results to the console. For a more detailed, human-readable report, you can run `npm run test:analyze` after the test completes.

#### Test Commands and Parameters

The test commands support parameters to customize test execution:

-   `npm test`: Basic test run (defaults to mode=test)
-   `npm test --mode=test-spoilers`: Run spoiler validation tests
-   `npm test --mode=test-full --game=alttp`: Run full tests for a specific game
-   `npm test --mode=test-spoilers --rules=./path/to/rules.json`: Test with specific rules file

**Available Parameters:**
-   `--mode`: Test mode (test, test-spoilers, test-full, test-regression, etc.)
-   `--game`: Specific game to test (alttp, adventure, etc.)
-   `--seed`: Seed number for testing
-   `--rules`: Path to rules JSON file

**Test Variants:**
-   `npm run test:headed`: Runs tests in a visible browser (supports all parameters)
-   `npm run test:debug`: Runs tests in Playwright's debug mode (supports all parameters)
-   `npm run test:ui`: Opens Playwright's interactive UI (supports all parameters)

**Examples:**
```bash
# Run spoiler tests with custom rules
npm test --mode=test-spoilers --rules=./presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json

# Debug specific game tests with visible browser
npm run test:headed --mode=test-full --game=alttp --seed=1
```

**Note on Cursor Editor:** If you are using the Cursor editor, there is a known issue where Playwright commands may fail on the first attempt. If `npm test` fails, simply run it a second time.

#### Troubleshooting: Containerized/Sandboxed Environments

If you see "Page crashed" or "Target page, context or browser has been closed" errors, you may be running in a containerized or sandboxed environment (Docker, GitHub Codespaces, etc.).

The `playwright.config.js` already includes browser launch arguments to handle these environments:
- `--no-sandbox` - Required when root user lacks sandbox permissions
- `--disable-dev-shm-usage` - Prevents shared memory issues
- `--disable-setuid-sandbox` - Alternative sandbox disabling
- `--disable-gpu` - Improves stability in headless mode
- `--single-process` - Helps in resource-constrained environments

These are already configured and should work automatically. If issues persist, verify:
1. You have sufficient memory allocated (at least 2GB recommended)
2. The `/tmp` directory is writable
3. You're running the latest Playwright version (`npm update @playwright/test`)

## VSCode Setup

If you're using Visual Studio Code, here are some recommended configuration steps to improve your development experience:

### Setting the Default Python Interpreter

To ensure VSCode uses the project's virtual environment for Python development:

1. **Open the project** in VSCode (open the `archipelago-json` folder)

2. **Open the Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`)

3. **Select Python Interpreter**:
   - Type `Python: Select Interpreter`
   - Choose the interpreter from your `.venv` directory:
     - **Windows:** `./.venv/Scripts/python.exe`
     - **macOS/Linux:** `./.venv/bin/python`

4. **Verify the selection**: You should see the virtual environment name (e.g., `(.venv)`) in the status bar at the bottom of VSCode

### Integrated Terminal

VSCode's integrated terminal should automatically activate the virtual environment when you open a new terminal session. If it doesn't:

- **Windows:** Run `.venv\Scripts\activate`
- **macOS/Linux:** Run `source .venv/bin/activate`

## Advanced Setup

The following steps are needed for working with the testing pipeline and adding support for new games. These are not required for basic frontend development.

### 1. Install Additional Dependencies

Some world modules require additional Python packages that aren't in the base requirements.txt. Run the module updater to install them:

```bash
# Make sure your virtual environment is active
source .venv/bin/activate

# Install additional dependencies for all world modules
python ModuleUpdate.py --yes
```

This will install game-specific dependencies like `pyevermizer`, `zilliandomizer`, and others needed for the full testing pipeline.

### 2. Generate Game Template Files

To work with the testing pipeline or add support for new games, you'll need template files:

```bash
# Make sure your virtual environment is active
source .venv/bin/activate

# Generate template YAML files for all supported games
python -c "from Options import generate_yaml_templates; generate_yaml_templates('Players/Templates')"
```

This creates a `Players/Templates/` directory with YAML files for each supported game (e.g., "A Hat in Time.yaml", "A Link to the Past.yaml").

**Note:** You may see some compilation warnings about `_speedups.c` - these are normal and don't affect functionality.

### 3. Set Up Host Configuration

For testing the generation pipeline, you need to create and configure a `host.yaml` file:

```bash
# Make sure your virtual environment is active
source .venv/bin/activate

# Create or update host.yaml with default settings
python Launcher.py --update_settings
```

This creates a `host.yaml` file in the project root. For testing purposes, you can either:

**Option 1: Use the convenience script (recommended)**
```bash
# Enable minimal spoiler testing (basic sphere validation)
python scripts/setup/update_host_settings.py minimal-spoilers

# Enable full spoiler testing (includes all location tracking)
python scripts/setup/update_host_settings.py full-spoilers

# Later, disable testing settings and return to normal operation
python scripts/setup/update_host_settings.py normal
```

**Option 2: Manual editing**
Edit the `host.yaml` file's `general_options` section to match one of these configurations:

**For normal operation (no testing features):**
```yaml
general_options:
  skip_required_files: false
  save_rules_json: false
  skip_preset_copy_if_rules_identical: false
  save_sphere_log: false
  verbose_sphere_log: false
  extend_sphere_log_to_all_locations: false
  log_fractional_sphere_details: true
  log_integer_sphere_details: false
  update_frontend_presets: false
```

**For minimal spoiler testing (basic sphere validation):**
```yaml
general_options:
  skip_required_files: true
  save_rules_json: true
  skip_preset_copy_if_rules_identical: false
  save_sphere_log: true
  verbose_sphere_log: false
  extend_sphere_log_to_all_locations: false
  log_fractional_sphere_details: true
  log_integer_sphere_details: false
  update_frontend_presets: true
```

**For full spoiler testing (includes all location tracking):**
```yaml
general_options:
  skip_required_files: true
  save_rules_json: true
  skip_preset_copy_if_rules_identical: false
  save_sphere_log: true
  verbose_sphere_log: false
  extend_sphere_log_to_all_locations: true
  log_fractional_sphere_details: true
  log_integer_sphere_details: false
  update_frontend_presets: true
```

**Key setting differences:**
- `extend_sphere_log_to_all_locations: false` (minimal) – Only logs progression-critical spheres for faster testing
- `extend_sphere_log_to_all_locations: true` (full) – Logs all locations including non-progression items for comprehensive validation

## Next Steps

You are now ready to start developing! Refer to the following documents for more detailed information:

-   **[System Architecture](./architecture.md)**: For a high-level understanding of how the project is structured.
-   **[Creating Modules](./guides/creating-modules.md)**: For a practical guide on adding new features.
-   **[Testing Pipeline](./guides/testing-pipeline.md)**: To understand how game logic is tested and validated using spoiler logs.