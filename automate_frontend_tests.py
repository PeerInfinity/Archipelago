import asyncio
import subprocess
import os
import json
import socket
import time
from urllib.request import urlopen
from playwright.async_api import async_playwright

SAVE_JSON_FILES = False  # Set to True to save JSON files, False to skip

async def run_frontend_tests():
    # Define a folder for storing test results
    downloads_dir = os.path.join(os.getcwd(), "test_results")
    os.makedirs(downloads_dir, exist_ok=True)

    port = 8000
    server_process = None
    should_start_server = not is_port_in_use(port)

    try:
        if should_start_server:
            print("Starting HTTP server...")
            frontend_dir = os.path.join(os.getcwd(), "frontend")
            server_process = subprocess.Popen(
                ["python", "-m", "http.server", str(port)],
                cwd=frontend_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            # Wait for server to start
            if not await wait_for_server(port):
                raise Exception("Failed to start HTTP server")
        else:
            print("Using existing HTTP server on port 8000")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                accept_downloads=True,
                viewport={'width': 1280, 'height': 720}
            )
            
            # Create a new page and add console logging
            page = await context.new_page()

            # Enhanced console logging
            page.on('console', lambda msg: print(f'BROWSER LOG: {msg.text}'))
            page.on('pageerror', lambda err: print(f'BROWSER ERROR: {err.text}'))
            
            # Network request logging
            async def log_request(request):
                print(f'Request: {request.method} {request.url}')
                try:
                    if request.resource_type == 'script':
                        print(f'Loading script: {request.url}')
                except:
                    pass

            async def log_response(response):
                print(f'Response: {response.status} {response.url}')
                if response.status >= 400:
                    print(f'Error loading: {response.url}')
                    try:
                        text = await response.text()
                        print(f'Error content: {text[:200]}...')  # First 200 chars
                    except:
                        print('Could not get error content')

            page.on('request', log_request)
            page.on('response', log_response)

            print("Loading test runner page...")
            response = await page.goto(f"http://localhost:{port}/frontend/test_runner.html")
            
            if not response.ok:
                print(f"Failed to load page: {response.status} {response.status_text}")
                try:
                    content = await response.text()
                    print(f"Error page content: {content[:500]}...")  # First 500 chars
                except:
                    print("Could not get error page content")
                raise Exception("Failed to load test runner page")
                
            print("Page loaded, checking scripts...")
            
            # Check if required scripts are loaded
            scripts = await page.evaluate('''
                () => {
                    return {
                        scripts: Array.from(document.scripts).map(s => s.src),
                        modules: Array.from(document.scripts).filter(s => s.type === 'module').map(s => s.src)
                    }
                }
            ''')
            print("Loaded scripts:", json.dumps(scripts, indent=2))

            print("Waiting for tests...")
            try:
                # First wait for locationTests to be defined
                print("Checking for script load errors...")
                errors = await page.evaluate("window.moduleLoadErrors || []")
                if errors:
                    print("Script load errors found:", json.dumps(errors, indent=2))
                    raise Exception("Script loading failed")
                    
                print("Waiting for LocationTester definition...")
                await page.wait_for_function(
                    "typeof LocationTester !== 'undefined'",
                    timeout=30000
                )
                print("LocationTester class loaded")
                
                # Then wait for test completion
                await page.wait_for_function(
                    "window.testsCompleted === true",
                    timeout=120000,  # 2 minutes
                    polling=100  # Check more frequently
                )
                print("Tests completed")
                
            except Exception as e:
                print(f"Error during test execution: {e}")
                
                # Try to get any console logs or errors
                logs = await page.evaluate('''
                    () => {
                        if (window.testLogger && testLogger.logs) {
                            return testLogger.logs;
                        }
                        return [];
                    }
                ''')
                print("Test logs:", json.dumps(logs, indent=2))
                
                # Try to get any available debug data
                debug_data = await page.evaluate("window.debugData || {error: 'No debug data available'}")
                print("Debug data:", json.dumps(debug_data, indent=2))
                
                raise

            # Get debug data
            debug_data = await page.evaluate("window.debugData")
            if not debug_data:
                raise Exception("No debug data available after test completion")

            # Save debug logs (only if enabled)
            if SAVE_JSON_FILES:
                debug_output = os.path.join(downloads_dir, "debug_logs_automated.json")
                with open(debug_output, "w", encoding="utf-8") as f:
                    json.dump(debug_data, f, indent=2)
                print(f"Debug logs saved to {debug_output}")
            else:
                print("Skipping debug logs save (disabled in configuration)")

            # Save HTML snapshot
            html_content = await page.content()
            html_output = os.path.join(downloads_dir, "test_results_automated.html")
            with open(html_output, "w", encoding="utf-8") as f:
                f.write(html_content)
            print(f"HTML snapshot saved to {html_output}")

            # Handle test results
            async with page.expect_download() as download_info:
                await page.click(".download-btn")
            download = await download_info.value
            
            if SAVE_JSON_FILES:
                json_output = os.path.join(downloads_dir, "test_results_automated.json")
                await download.save_as(json_output)
                print(f"Test results saved to {json_output}")
            else:
                print("Skipping JSON results save (disabled in configuration)")

            # Process and display results directly from the download
            try:
                results_string = await download.path()
                with open(results_string, 'r') as f:
                    results = json.load(f)

                    # Process results
                    try:
                        if isinstance(results, str):
                            results = json.loads(results)
                        
                        if 'summary' in results:
                            summary = results['summary']
                            print(f"Test Summary: {json.dumps(summary, indent=2)}")
                        
                            # Print first few failures if we have detailed results
                            if 'results' in results:
                                failures = [r for r in results['results'] 
                                          if not r.get('result', {}).get('passed', False)]
                                if failures:
                                    print("\nFirst few failures:")
                                    for i, failure in enumerate(failures[:3]):
                                        print(f"\n{i+1}. {failure.get('location', 'Unknown')}:")
                                        print(f"   Message: {failure.get('result', {}).get('message', 'No message')}")
                                        print(f"   Required Items: {', '.join(failure.get('requiredItems', []))}")
                    except Exception as e:
                        print(f"Error processing results: {e}")
                        if isinstance(results, str):
                            print(f"Raw results (first 500 chars): {results[:500]}...")

            except Exception as e:
                print(f"Error reading test results: {e}")
                print(f"Raw results: {results}")

            await browser.close()

    except Exception as e:
        print(f"An error occurred: {e}")
        raise

    finally:
        if server_process:
            server_process.terminate()
            server_process.wait()
            print("HTTP server stopped.")

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('localhost', port))
            return False
        except socket.error:
            return True

async def wait_for_server(port: int, timeout: int = 5) -> bool:
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            urlopen(f'http://localhost:{port}')
            return True
        except:
            await asyncio.sleep(0.1)
    return False

if __name__ == "__main__":
    asyncio.run(run_frontend_tests())