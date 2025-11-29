# Getting Started for Developers (Windows)

This guide provides the necessary steps to set up a local development environment for the Archipelago JSON Export Tools project on Windows.

## Prerequisites

### Required Software

- **Git**: [Download Git for Windows](https://git-scm.com/download/win)
- **Python 3.11.9+**: [Download Python](https://www.python.org/downloads/windows/)
    - **Important**:
      - Windows requires Python 3.11.9 or newer for full functionality (including `ModuleUpdate.py`)
      - Check "Add Python to PATH" during installation
      - Download the latest 3.11.x or 3.12.x version from the Python website
- **A Modern Web Browser**: Chrome, Firefox, or Edge.

### Recommended Tools

- **Visual Studio Code**: [Download VS Code](https://code.visualstudio.com/)
- **Node.js & npm**: [Download Node.js](https://nodejs.org/en/download/) (LTS version recommended)
    - Required for running automated tests.

## Project Setup

### Option 1: Automated Setup (Recommended)

We provide a setup script that handles most of the configuration for you.

1.  **Open PowerShell** (or Command Prompt/Terminal) and navigate to the folder where you want to install the project.

2.  **Clone the repository**:
    ```powershell
    git clone -b JSONExport https://github.com/PeerInfinity/Archipelago.git archipelago-json
    cd archipelago-json
    ```

3.  **Run the setup script**:
    ```powershell
    python scripts/setup/setup_dev_environment.py
    ```

    This script will:
    - Create a Python virtual environment (`.venv`)
    - Install required dependencies
    - Generate necessary template files
    - Configure the host settings

### Option 2: Manual Setup

If you prefer to set up manually:

1.  **Clone the repository**:
    ```powershell
    git clone -b JSONExport https://github.com/PeerInfinity/Archipelago.git archipelago-json
    cd archipelago-json
    ```

2.  **Set up Python Virtual Environment**:
    ```powershell
    python -m venv .venv
    .venv\Scripts\activate
    pip install -r requirements.txt
    ```

    > [!NOTE]
    > If you get an error about "running scripts is disabled on this system", see the [Troubleshooting](#troubleshooting) section below.

3.  **Install Additional Dependencies**:
    ```powershell
    python ModuleUpdate.py --yes
    ```

## Running the Application

The frontend must be served by a local HTTP server.

1.  **Activate the Virtual Environment** (if not already active):
    ```powershell
    .venv\Scripts\activate
    ```

2.  **Start the Server**:
    ```powershell
    python -m http.server 8000
    ```

3.  **Open in Browser**:
    Navigate to [http://localhost:8000/frontend/](http://localhost:8000/frontend/)

## Running Tests

To run the automated test suite:

1.  **Install Node.js dependencies** (first time only):
    ```powershell
    npm install
    npx playwright install chromium
    ```

2.  **Run the tests**:
    ```powershell
    npm test
    ```

    The test runner will automatically start the HTTP server if it's not already running.

For more details on test commands and parameters, see the [Run Automated Tests](./getting-started.md#3-run-automated-tests) section in the main guide.

## Troubleshooting

### PowerShell Execution Policy Error

If you see an error like `cannot be loaded because running scripts is disabled on this system` when trying to activate the virtual environment:

**Solution 1: Temporarily allow scripts (Recommended)**
Run this command in your current PowerShell session:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```
Then try activating again: `.venv\Scripts\activate`

**Solution 2: Use Command Prompt instead**
Command Prompt doesn't have the same execution policy restrictions as PowerShell:
```cmd
.venv\Scripts\activate.bat
```

**Solution 3: Use the Python executable directly**
Instead of activating the environment, you can run commands using the virtual environment's Python directly:
```powershell
.venv\Scripts\python.exe -m http.server 8000
```

This approach works for any Python command without needing to activate the virtual environment.

### Unicode Errors

If you see `UnicodeEncodeError` when running scripts, try setting the encoding environment variable:
```powershell
$env:PYTHONIOENCODING='utf-8'
```
Then run your command again.

### Python Version Issues

If you see an error like `Incompatible Python Version found` when running `ModuleUpdate.py`:

1. **Check your Python version**:
   ```powershell
   python --version
   ```

2. **Install Python 3.11.9 or newer**:
   - Download from [python.org/downloads/windows](https://www.python.org/downloads/windows/)
   - Make sure to check "Add Python to PATH" during installation
   - After installing, you may need to restart your terminal

3. **Recreate the virtual environment** with the new Python version:
   ```powershell
   # Remove old virtual environment
   Remove-Item -Recurse -Force .venv

   # Create new one with updated Python
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

> [!NOTE]
> Python 3.11.9+ is only required if you plan to work with the testing pipeline. Basic frontend development can work with Python 3.8+.

## Next Steps

- **[Basic Workflow & Verification](./getting-started.md#basic-workflow--verification)**: Follow the verification steps in the main guide.
- **[VSCode Setup](./getting-started.md#vscode-setup)**: Configure VS Code for the project.
- **[Advanced Setup](./getting-started.md#advanced-setup)**: For testing pipeline and adding support for new games.
