// testResultsDisplay.js
export class TestResultsDisplay {
    constructor(resultsElementId = 'test-results') {
        this.resultsElement = document.getElementById(resultsElementId);
    }

    displayResults(results, locationManager) {
        const total = results.length;
        const passed = results.filter(r => r.passed).length;
        const failed = total - passed;

        const resultsData = {
            summary: {
                total,
                passed,
                failed,
                percentage: Math.round(passed/total * 100)
            },
            results
        };

        // Create download link for complete results
        const resultsJson = JSON.stringify(resultsData, null, 2);
        const blob = new Blob([resultsJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        let html = `
            <h2>Test Results</h2>
            <div class="summary">
                <p>Total Tests: ${total}</p>
                <p>Passed: ${passed} (${Math.round(passed/total * 100)}%)</p>
                <p>Failed: ${failed}</p>
                <a href="${url}" download="test_results.json" class="download-btn">
                    Download Test Results
                </a>
            </div>

            <table class="results-table">
                <tr>
                    <th>Location</th>
                    <th>Region</th>
                    <th>Status</th>
                    <th>Expected Access</th>
                    <th>Required Items</th>
                    <th>Excluded Items</th>
                    <th>Details</th>
                </tr>
        `;

        for (const result of results) {
            const locationData = locationManager.locations.find(
                loc => loc.name === result.location
            );
            
            html += `
                <tr class="${result.passed ? 'pass' : 'fail'}">
                    <td>${result.location}</td>
                    <td>${locationData?.region || 'Unknown'}</td>
                    <td>${result.passed ? '✓ PASS' : '❌ FAIL'}</td>
                    <td>${result.expectedAccess ? 'Accessible' : 'Inaccessible'}</td>
                    <td>${result.requiredItems?.join(', ') || 'None'}</td>
                    <td>${result.excludedItems?.join(', ') || 'None'}</td>
                    <td>${result.message}</td>
                </tr>
            `;
        }

        html += `</table>
            <style>
                .summary { margin: 20px 0; }
                .download-btn {
                    display: inline-block;
                    padding: 10px 20px;
                    background: #4CAF50;
                    color: white;
                    text-decoration: none;
                    border-radius: 4px;
                    margin: 10px 0;
                }
                .results-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                .results-table th, .results-table td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }
                .results-table tr.pass { background-color: #e8f5e9; }
                .results-table tr.fail { background-color: #ffebee; }
            </style>
        `;

        this.resultsElement.innerHTML = html;
    }
}