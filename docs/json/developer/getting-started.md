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

### 1. Clone the Repository

First, clone the project repository from GitHub to your local machine.

```bash
git clone <repository-url>
cd archipelago-json-export-tools
```

### 2. Set Up the Python Environment

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

### 3. Run the Frontend Locally

The frontend application must be served by an HTTP server because modern browser security policies prevent Web Workers (a core part of the architecture) from running on pages loaded directly from the local filesystem (`file://`).

The simplest way to do this is with Python's built-in HTTP server.

```bash
# Navigate to the frontend directory
cd frontend

# Start the server (this will serve the current directory)
# For Python 3:
python -m http.server 8000
```

Now, open your web browser and navigate to: **`http://localhost:8000/`**

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
5.  Refresh the page at `http://localhost:8000/`.

You should see the title of the Inventory panel change to "My Inventory".

### 3. Run Automated Tests

This project includes an end-to-end test suite using Playwright that validates the entire frontend system, including the crucial `testSpoilers` logic validation. To run it:

1.  Make sure you have Node.js and npm installed.
2.  In the project's root directory, run `npm install` to get the testing dependencies.
3.  Ensure the local server is still running (`python -m http.server 8000` in the `frontend` directory).
4.  In a **new terminal**, run the primary test command from the project root:
    ```bash
    npm test
    ```
5.  The test runner will launch a headless browser, run through the application's internal test suite, and report the results to the console. For a more detailed, human-readable report, you can run `npm run test:analyze` after the test completes.

#### Other Test Commands

-   `npm run test:headed`: Runs tests in a visible browser, which is useful for observing the test execution.
-   `npm run test:debug`: Runs tests in Playwright's debug mode for step-by-step execution.
-   `npm run test:ui`: Opens Playwright's interactive UI for managing and running tests.

**Note on Cursor Editor:** If you are using the Cursor editor, there is a known issue where Playwright commands may fail on the first attempt. If `npm test` fails, simply run it a second time.

## Next Steps

You are now ready to start developing! Refer to the following documents for more detailed information:

-   **[System Architecture](./architecture.md)**: For a high-level understanding of how the project is structured.
-   **[Creating Modules](./guides/creating-modules.md)**: For a practical guide on adding new features.
-   **[Testing Pipeline](./guides/testing-pipeline.md)**: To understand how game logic is tested and validated using spoiler logs.