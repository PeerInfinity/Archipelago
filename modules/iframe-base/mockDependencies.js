// Simplified mock dependencies for iframe-base module
// This module now only provides basic communication with the main app

import { createSharedLogger } from './shared/sharedLogger.js';

// Create logger for this module
const logger = createSharedLogger('mockDependencies');

/**
 * Basic communication proxy - can be extended later if needed
 */
export class BasicProxy {
    constructor(iframeClient) {
        this.iframeClient = iframeClient;
    }

    getConnectionStatus() {
        return this.iframeClient.isConnected;
    }
}