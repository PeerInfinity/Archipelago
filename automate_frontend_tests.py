import asyncio
import subprocess
import os
from playwright.async_api import async_playwright

async def run_frontend_tests():
    # Define a folder for storing test results.
    downloads_dir = os.path.join(os.getcwd(), "test_results")
    os.makedirs(downloads_dir, exist_ok=True)

    # Start the HTTP server in the 'frontend' folder.
    frontend_dir = os.path.join(os.getcwd(), "frontend")
    server_process = subprocess.Popen(
        ["python", "-m", "http.server", "8000"],
        cwd=frontend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    print("HTTP server started on port 8000...")

    try:
        async with async_playwright() as p:
            # Launch the browser and create a context with downloads enabled.
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(accept_downloads=True)
            page = await context.new_page()

            # Navigate to the test runner page.
            await page.goto("http://localhost:8000/test_runner.html")
            print("Navigated to test_runner.html...")

            # Wait for the test results header to appear.
            await page.wait_for_selector("#test-results h2", timeout=60000)
            print("Test results detected.")

            # Save a snapshot of the page's HTML into the test_results folder.
            html_content = await page.content()
            html_output = os.path.join(downloads_dir, "test_results_automated.html")
            with open(html_output, "w", encoding="utf-8") as f:
                f.write(html_content)
            print(f"HTML snapshot saved to {html_output}")

            # Trigger the download by clicking on the button with the class "download-btn".
            # (If your button uses a different class or attribute, update the selector accordingly.)
            async with page.expect_download() as download_info:
                await page.click(".download-btn")
            download = await download_info.value

            # Save the downloaded JSON file to the downloads folder.
            json_output = os.path.join(downloads_dir, "test_results_automated.json")
            await download.save_as(json_output)
            print(f"Downloaded JSON saved to {json_output}")

            # Close the browser.
            await browser.close()

    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        # Terminate the HTTP server.
        server_process.terminate()
        server_process.wait()
        print("HTTP server stopped.")

if __name__ == "__main__":
    asyncio.run(run_frontend_tests())
