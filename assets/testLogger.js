// testLogger.js
export class TestLogger {
    static enableFileSaving = false; // Control debug file saving
    static enableDebugLogging = false; // Control all debug console output
    
    constructor() {
        this.logs = [];
        this.isDebugging = false;
    }

    setDebugging(isDebugging) {
        this.isDebugging = isDebugging;
    }

    log(message, data = null) {
        const logEntry = data ? 
            `${message}: ${JSON.stringify(data, null, 2)}` : 
            message;
        this.logs.push(logEntry);
        if (this.isDebugging && TestLogger.enableDebugLogging) {
            console.log(logEntry);
        }
    }

    clear() {
        this.logs = [];
    }

    saveToFile(locationName, testParams) {
        if (!TestLogger.enableFileSaving) {
            if (TestLogger.enableDebugLogging) {
                console.log('File saving disabled. Debug data:', {
                    location: locationName,
                    ...testParams,
                    log: this.logs
                });
            }
            return;
        }

        const debugData = {
            location: locationName,
            timestamp: new Date().toISOString(),
            ...testParams,
            log: this.logs
        };

        const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug_${locationName.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}