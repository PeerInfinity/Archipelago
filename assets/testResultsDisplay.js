import stateManager from './stateManagerSingleton.js';

// testResultsDisplay.js
export class TestResultsDisplay {
  constructor(resultsElementId = 'test-results') {
    this.resultsElement = document.getElementById(resultsElementId);
  }

  displayResults(results) {
    // Calculate summary data directly
    const total = results.length;
    const passed = results.filter((r) => r.result?.passed).length;
    const failed = total - passed;
    const percentage = Math.round((passed / total) * 100);

    let html = `
      <h2>Test Results</h2>
      <div class="summary">
        <p>Total Tests: ${total}</p>
        <p>Passed: ${passed} (${percentage}%)</p>
        <p>Failed: ${failed}</p>
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

    // Process each result individually to avoid large string operations
    for (const testContext of results) {
      try {
        const result = testContext.result;
        if (!result) continue;

        const locationData = stateManager.locations.find(
          (loc) => loc.name === testContext.location
        );

        // Build row HTML with safe text handling
        html += '<tr class="' + (result.passed ? 'pass' : 'fail') + '">';
        html += '<td>' + this.escapeHtml(testContext.location) + '</td>';
        html +=
          '<td>' + this.escapeHtml(locationData?.region || 'Unknown') + '</td>';
        html += '<td>' + (result.passed ? '✓ PASS' : '❌ FAIL') + '</td>';
        html +=
          '<td>' +
          (result.expectedAccess ? 'Accessible' : 'Inaccessible') +
          '</td>';
        html +=
          '<td>' +
          this.escapeHtml(result.requiredItems?.join(', ') || 'None') +
          '</td>';
        html +=
          '<td>' +
          this.escapeHtml(result.excludedItems?.join(', ') || 'None') +
          '</td>';
        html +=
          '<td>' + this.escapeHtml(result.message || 'No details') + '</td>';
        html += '</tr>';
      } catch (error) {
        console.error('Error processing test result:', error);
        // Add error row
        html += `
          <tr class="error">
            <td colspan="7">Error processing test result: ${this.escapeHtml(
              error.message
            )}</td>
          </tr>
        `;
      }
    }

    html += `</table>
      <style>
        .summary { margin: 20px 0; }
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
        .results-table tr.error { background-color: #fff3e0; }
      </style>
    `;

    // Update the DOM with our constructed HTML
    try {
      this.resultsElement.innerHTML = html;
    } catch (error) {
      console.error('Error updating results display:', error);
      this.resultsElement.innerHTML = `
        <div class="error">
          Error displaying results: ${this.escapeHtml(error.message)}
        </div>
      `;
    }
  }

  // Helper method to safely escape HTML special characters
  escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
