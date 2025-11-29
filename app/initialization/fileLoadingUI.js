// fileLoadingUI.js - File loading counter and UI management
// Extracted from init.js lines 1100-1145

// Internal state
let filesLoadedCount = 0;
const loadedFilesList = [];

/**
 * Updates the file counter display in the loading screen
 */
function updateFileCounter() {
  const counterElement = document.getElementById('files-loaded-count');
  if (counterElement) {
    counterElement.textContent = filesLoadedCount;
  }
}

/**
 * Adds a file entry to the file list display
 *
 * @param {string} fileName - Name of the file
 * @param {string} status - Status of the file load ('success' or 'error')
 */
function addFileToList(fileName, status = 'success') {
  const fileListContainer = document.getElementById('file-list-container');
  if (fileListContainer) {
    const fileEntry = document.createElement('div');
    fileEntry.className = `file-entry ${status}`;
    fileEntry.textContent = fileName;
    fileListContainer.appendChild(fileEntry);

    // Auto-scroll to bottom to show newest entries
    fileListContainer.scrollTop = fileListContainer.scrollHeight;
  }

  // Also track in array for potential future use
  loadedFilesList.push({ fileName, status, timestamp: new Date() });
}

/**
 * Increments the file counter and updates the UI
 *
 * @param {string} fileName - Name of the file that was loaded
 * @param {Object} [logger] - Logger instance (optional - logging will be skipped if not provided)
 */
export function incrementFileCounter(fileName = 'Unknown file', logger = null) {
  filesLoadedCount++;
  updateFileCounter();
  addFileToList(fileName, 'success');
  if (logger) {
    logger.debug('init', `Files loaded: ${filesLoadedCount} - Latest: ${fileName}`);
  }
}

/**
 * Adds a file error to the UI
 *
 * @param {string} fileName - Name of the file that failed to load
 * @param {Object} [logger] - Logger instance (optional - logging will be skipped if not provided)
 */
export function addFileError(fileName, logger = null) {
  addFileToList(`❌ ${fileName}`, 'error');
  if (logger) {
    logger.debug('init', `File load error: ${fileName}`);
  }
}

/**
 * Hides the loading screen
 *
 * @param {Object} [logger] - Logger instance (optional - logging will be skipped if not provided)
 */
export function hideLoadingScreen(logger = null) {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
    if (logger) {
      logger.info('init', 'Loading screen hidden');
    }
  }
}

/**
 * Gets the current count of loaded files
 *
 * @returns {number} Number of files loaded
 */
export function getLoadedFilesCount() {
  return filesLoadedCount;
}

/**
 * Gets the list of loaded files
 *
 * @returns {Array} Array of file objects with fileName, status, and timestamp
 */
export function getLoadedFilesList() {
  return [...loadedFilesList];
}

/**
 * Resets the file loading state (useful for testing)
 */
export function resetFileLoadingState() {
  filesLoadedCount = 0;
  loadedFilesList.length = 0;
  updateFileCounter();
}
