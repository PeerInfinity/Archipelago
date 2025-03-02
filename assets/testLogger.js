// testLogger.js
export class TestLogger {
  static MAX_LOGS_PER_TEST = 1000; // Limit logs per test
  static MAX_LOG_LENGTH = 500; // Limit individual log length
  static enableFileSaving = false;
  static enableDebugLogging = false;

  constructor() {
    this.logs = [];
    this.isDebugging = false;
    this.testResults = [];
    this.ruleTraces = [];
    this.currentTestContext = null;
  }

  truncateLog(message) {
    if (
      typeof message === 'string' &&
      message.length > TestLogger.MAX_LOG_LENGTH
    ) {
      return (
        message.substring(0, TestLogger.MAX_LOG_LENGTH) + '... (truncated)'
      );
    }
    return message;
  }

  log(message, data = null) {
    if (!this.isDebugging || !TestLogger.enableDebugLogging) {
      return;
    }

    try {
      // Skip logging if we've hit the limit for this test
      if (
        this.currentTestContext &&
        this.currentTestContext.logs &&
        this.currentTestContext.logs.length >= TestLogger.MAX_LOGS_PER_TEST
      ) {
        return;
      }

      let truncatedMessage = this.truncateLog(message);
      let truncatedData = null;

      if (data) {
        try {
          // Convert data to string and truncate
          const dataStr =
            typeof data === 'string' ? data : JSON.stringify(data);
          truncatedData = this.truncateLog(dataStr);
        } catch (e) {
          truncatedData = '(Data too large to stringify)';
        }
      }

      const logEntry = {
        timestamp: new Date().toISOString(),
        message: truncatedMessage,
        data: truncatedData,
      };

      // Add to main logs array
      this.logs.push(logEntry);

      // Add to current test context if one exists
      if (this.currentTestContext) {
        if (!this.currentTestContext.logs) {
          this.currentTestContext.logs = [];
        }
        this.currentTestContext.logs.push(logEntry);
      }

      // Output to console if appropriate
      if (this.isDebugging && TestLogger.enableDebugLogging) {
        console.log(truncatedMessage);
        if (truncatedData) {
          console.log(truncatedData);
        }
      }
    } catch (error) {
      console.error('Error in logger:', error);
    }
  }

  setDebugging(isDebugging) {
    this.isDebugging = isDebugging;
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
      traces: [],
    };
  }

  endTest(result) {
    if (this.currentTestContext) {
      this.currentTestContext.endTime = new Date().toISOString();
      this.currentTestContext.result = result;

      // Ensure logs array isn't too large before adding to results
      if (this.currentTestContext.logs?.length > TestLogger.MAX_LOGS_PER_TEST) {
        this.currentTestContext.logs = this.currentTestContext.logs.slice(
          0,
          TestLogger.MAX_LOGS_PER_TEST
        );
        this.currentTestContext.logs.push({
          timestamp: new Date().toISOString(),
          message: `Log truncated: ${this.currentTestContext.logs.length} entries exceeded limit`,
        });
      }

      this.testResults.push(this.currentTestContext);
      this.currentTestContext = null;
    }
  }

  getDebugData() {
    // Create a slimmed down version of the debug data
    return {
      timestamp: new Date().toISOString(),
      testResults: this.testResults.map((result) => ({
        location: result.location,
        result: result.result,
        startTime: result.startTime,
        endTime: result.endTime,
        // Only include the first and last few logs
        logs: result.logs
          ? [
              ...result.logs.slice(0, 10),
              ...(result.logs.length > 20
                ? [
                    {
                      message: `... ${
                        result.logs.length - 20
                      } logs omitted ...`,
                    },
                  ]
                : []),
              ...result.logs.slice(-10),
            ]
          : [],
      })),
      summary: this.generateSummary(),
    };
  }

  generateSummary() {
    const total = this.testResults.length;
    const passed = this.testResults.filter((r) => r.result?.passed).length;
    const failed = total - passed;

    return {
      total,
      passed,
      failed,
      percentage: total > 0 ? Math.round((passed / total) * 100) : 0,
    };
  }
}
