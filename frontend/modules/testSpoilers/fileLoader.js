/**
 * File Loader Module for Test Spoilers
 *
 * Handles loading and parsing of spoiler log files from URLs or local file system.
 * Extracted from testSpoilerUI.js to improve code organization and maintainability.
 *
 * DATA FLOW:
 * Input: Spoiler log file (.jsonl format) from URL or File object
 *   - URL: Derived from ruleset path (e.g., "path/to/seed_rules.json" → "path/to/seed_spheres_log.jsonl")
 *   - File: Selected by user via file input
 *
 * Processing:
 *   1. Fetch or read file content as text
 *   2. Split text into lines
 *   3. Parse each line as JSON object
 *   4. Validate parsed events (check for 'type' property)
 *   5. Collect valid events into array
 *
 * Output: Parsed spoiler log data
 *   - Array of event objects: [{type: 'state_update', ...}, {type: 'location_check', ...}, ...]
 *   - Each event has a 'type' property and event-specific data
 *
 * @module testSpoilers/fileLoader
 */

import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('testSpoilerUI:FileLoader');

/**
 * Handles loading and parsing of spoiler log files from various sources.
 *
 * Supports both auto-loading from derived URLs and manual file selection.
 * Parses JSONL format where each line is a JSON event object.
 *
 * @class FileLoader
 * @memberof module:testSpoilers/fileLoader
 */
export class FileLoader {
  constructor() {
    // No parameters needed - logger is module-level
    logger.debug('FileLoader constructor called');
  }

  /**
   * Attempts to auto-load a spoiler log based on ruleset path
   *
   * DATA FLOW:
   * Input: Ruleset path (e.g., "presets/alttp/MySeed123/MySeed123_rules.json")
   *   ├─> rulesetPath: string (path to rules JSON file)
   *   ├─> currentLogPath: string (currently loaded log path, to prevent duplicates)
   *   ├─> currentLogData: Array|null (currently loaded log data, to verify data exists)
   *   ├─> isLoadingLogPath: string|null (path currently being loaded, to prevent concurrent loads)
   *
   * Processing:
   *   ├─> Clean ruleset path (remove leading "./")
   *   ├─> Extract directory and filename
   *   ├─> Derive log path: replace "_rules.json" with "_spheres_log.jsonl"
   *   ├─> Check if already loading or loaded (with data verification)
   *   ├─> Fetch from URL
   *   ├─> Parse text into lines
   *   ├─> Parse each line as JSON event
   *   ├─> Validate events array
   *
   * Output: Parse result
   *   ├─> success: boolean (true if loaded successfully)
   *   ├─> logData: Array (parsed event objects)
   *   ├─> logPath: string (path to loaded log)
   *   ├─> error: string (error message if failed)
   *
   * @param {string} rulesetPath - Path to the rules JSON file
   * @param {string} currentLogPath - Currently loaded log path (to prevent duplicates)
   * @param {Array|null} currentLogData - Currently loaded log data (to verify data exists)
   * @param {string|null} isLoadingLogPath - Path currently being loaded (to prevent concurrent loads)
   * @returns {Promise<Object>} Result object with success, logData, logPath, and optional error properties
   */
  async attemptAutoLoad(rulesetPath, currentLogPath, currentLogData, isLoadingLogPath) {
    logger.debug('attemptAutoLoad called', { rulesetPath, currentLogPath, hasData: !!(currentLogData && currentLogData.length), isLoadingLogPath });

    // Derive log path from ruleset path
    let logPath;
    if (rulesetPath) {
      // Remove leading "./" if present to avoid fetch issues
      const cleanedRulesetPath = rulesetPath.startsWith('./')
        ? rulesetPath.substring(2)
        : rulesetPath;

      const lastSlashIndex = cleanedRulesetPath.lastIndexOf('/');
      const directoryPath =
        lastSlashIndex === -1
          ? ''
          : cleanedRulesetPath.substring(0, lastSlashIndex);
      const rulesFilename =
        lastSlashIndex === -1
          ? cleanedRulesetPath
          : cleanedRulesetPath.substring(lastSlashIndex + 1);

      let baseNameForLog;
      if (rulesFilename.endsWith('_rules.json')) {
        baseNameForLog = rulesFilename.substring(
          0,
          rulesFilename.length - '_rules.json'.length
        );

        // Check if this is a multiworld player-specific rules file (contains _P{number})
        // For example: "AP_14089154938208861744_P1_rules.json" should become "AP_14089154938208861744"
        // Pattern: _P followed by digits
        const multiworldPlayerPattern = /_P\d+$/;
        if (multiworldPlayerPattern.test(baseNameForLog)) {
          baseNameForLog = baseNameForLog.replace(multiworldPlayerPattern, '');
          logger.info(
            `Detected multiworld player-specific rules file. Base name for log: "${baseNameForLog}"`
          );
        }
      } else if (rulesFilename.endsWith('.json')) {
        baseNameForLog = rulesFilename.substring(
          0,
          rulesFilename.length - '.json'.length
        );
        logger.warn(
          `Ruleset filename "${rulesFilename}" from path "${rulesetPath}" did not end with "_rules.json". Using "${baseNameForLog}" as base for log file (by removing .json).`
        );
      } else {
        // If no .json extension, this is unexpected for a rules file path
        baseNameForLog = rulesFilename;
        logger.error(
          `Ruleset filename "${rulesFilename}" from path "${rulesetPath}" did not have a .json extension. This might lead to an incorrect log path. Using "${baseNameForLog}" as base.`
        );
      }

      if (directoryPath) {
        // If rulesetPath was "presets/foo/bar_rules.json", logPath becomes "presets/foo/bar_spheres_log.jsonl"
        logPath = `${directoryPath}/${baseNameForLog}_spheres_log.jsonl`;
      } else {
        // If rulesetPath was "bar_rules.json", logPath becomes "./bar_spheres_log.jsonl"
        logPath = `./${baseNameForLog}_spheres_log.jsonl`;
      }
      logger.info(`Derived logPath: "${logPath}" from rulesetPath: "${rulesetPath}"`);
    } else {
      logger.warn(
        'Cannot attempt auto-load: rulesetPath is undefined or invalid for logPath generation.'
      );
      return {
        success: false,
        logData: null,
        logPath: null,
        error: 'Cannot determine ruleset for auto-load.'
      };
    }

    // Check 1: Is this exact log path currently being loaded?
    if (isLoadingLogPath === logPath) {
      logger.info(
        `Auto-load for ${logPath} is already in progress. Skipping duplicate attempt.`
      );
      return {
        success: false,
        logData: null,
        logPath,
        error: 'Already loading this log path.'
      };
    }

    // Check 2: Is this exact log path already loaded and processed successfully?
    // Must verify BOTH path match AND that data exists and has content
    if (currentLogPath === logPath && currentLogData && currentLogData.length > 0) {
      logger.info(
        `Spoiler log for ${logPath} is already loaded and processed. No need to reload.`
      );
      return {
        success: true,
        logData: null, // Indicate already loaded (caller should use existing data)
        logPath,
        alreadyLoaded: true
      };
    }

    // Attempt to fetch and parse the log
    try {
      logger.info(`Attempting to fetch server-side spoiler log: ${logPath}`);

      const response = await fetch(logPath);
      if (!response.ok) {
        logger.warn(
          `Failed to fetch spoiler log from ${logPath}: ${response.status} ${response.statusText}`
        );
        return {
          success: false,
          logData: null,
          logPath,
          error: `Could not fetch ${logPath}: ${response.status} ${response.statusText}`
        };
      }

      const fileContent = await response.text();
      const parsedResult = this._parseLogText(fileContent, logPath);

      if (!parsedResult.success) {
        return {
          success: false,
          logData: null,
          logPath,
          error: parsedResult.error
        };
      }

      logger.info(
        `Successfully fetched and parsed spoiler log from: ${logPath}. Found ${parsedResult.logData.length} events.`
      );

      return {
        success: true,
        logData: parsedResult.logData,
        logPath
      };
    } catch (error) {
      logger.warn(
        `Failed to auto-load or process spoiler log from ${logPath}. Error: ${error.message}`
      );
      return {
        success: false,
        logData: null,
        logPath,
        error: `Auto-load failed: ${error.message}`
      };
    }
  }

  /**
   * Reads and parses a spoiler log file selected by the user
   *
   * DATA FLOW:
   * Input: File object from file input
   *   ├─> file: File object (from <input type="file">)
   *   ├─> signal: AbortSignal (for cancellation support)
   *
   * Processing:
   *   ├─> Create FileReader
   *   ├─> Set up abort handling
   *   ├─> Read file as text
   *   ├─> Parse text into lines
   *   ├─> Parse each line as JSON event
   *   ├─> Validate events array
   *
   * Output: Parse result
   *   ├─> success: boolean (true if loaded successfully)
   *   ├─> logData: Array (parsed event objects)
   *   ├─> fileName: string (name of loaded file)
   *   ├─> error: string (error message if failed)
   *
   * @param {File} file - File object from file input
   * @param {AbortSignal} signal - Abort signal for cancellation
   * @returns {Promise<Object>} Result object with success, logData, fileName, and optional error properties
   */
  async readFile(file, signal) {
    logger.debug('readFile called', { fileName: file.name });

    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        logger.info('File reading aborted before starting');
        return reject(new DOMException('Aborted by user', 'AbortError'));
      }

      const reader = new FileReader();

      const handleAbort = () => {
        if (reader.readyState === FileReader.LOADING) {
          reader.abort();
        }
        logger.info('File reading operation aborted');
        reject(new DOMException('Aborted by user', 'AbortError'));
      };

      signal.addEventListener('abort', handleAbort, { once: true });

      reader.onload = (e) => {
        signal.removeEventListener('abort', handleAbort);
        try {
          const fileContent = e.target.result;
          const parsedResult = this._parseLogText(fileContent, file.name);

          if (!parsedResult.success) {
            logger.warn(`No valid log events found in file: ${file.name}`);
            resolve({
              success: false,
              logData: null,
              fileName: file.name,
              error: parsedResult.error
            });
            return;
          }

          logger.info(
            `Successfully read and parsed ${parsedResult.logData.length} events from ${file.name}`
          );

          resolve({
            success: true,
            logData: parsedResult.logData,
            fileName: file.name
          });
        } catch (error) {
          logger.error(
            `Error processing file content for ${file.name}: ${error.message}`
          );
          reject(error);
        }
      };

      reader.onerror = (e) => {
        signal.removeEventListener('abort', handleAbort);
        logger.error(`FileReader error for ${file.name}:`, e);
        reject(new Error(`FileReader error: ${e.target.error.name}`));
      };

      reader.onabort = () => {
        // Catch direct aborts on reader if they happen before our listener
        signal.removeEventListener('abort', handleAbort);
        logger.info(`FileReader explicitly aborted for ${file.name}`);
        reject(new DOMException('Aborted by user', 'AbortError'));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Extracts base filename from path (removes directory and extension)
   *
   * @param {string} filePathOrName - Full path or filename
   * @returns {string} Base filename without extension
   *
   * @example
   * extractFilenameBase('path/to/MySeed123_rules.json') → 'MySeed123_rules'
   * extractFilenameBase('MySeed123.json') → 'MySeed123'
   * extractFilenameBase(null) → 'unknown_ruleset'
   */
  extractFilenameBase(filePathOrName) {
    if (!filePathOrName) return 'unknown_ruleset';

    // Split by forward slash, take last part, split by dot
    const parts = filePathOrName.split(/[/]/).pop().split('.');

    if (parts.length > 1) {
      parts.pop(); // Remove extension
      return parts.join('.'); // Rejoin if there were multiple dots
    }

    return parts[0];
  }

  /**
   * Parses spoiler log text into event objects
   *
   * DATA FLOW:
   * Input: Raw log text (JSONL format)
   *   ├─> text: string (file content)
   *   ├─> source: string (file name or path, for logging)
   *
   * Processing:
   *   ├─> Split text into lines
   *   ├─> For each non-empty line:
   *   │   ├─> Parse as JSON
   *   │   ├─> Validate has 'type' property
   *   │   ├─> Add to events array
   *   │   └─> Log errors for invalid lines
   *   ├─> Check if any valid events found
   *
   * Output: Parse result
   *   ├─> success: boolean
   *   ├─> logData: Array (if successful)
   *   ├─> error: string (if failed)
   *
   * @param {string} text - Raw log text
   * @param {string} source - Source identifier (file name or path) for logging
   * @returns {Object} Result object with success property, and optional logData or error properties
   * @private
   */
  _parseLogText(text, source = 'log file') {
    const lines = text.split('\n');
    const newLogEvents = [];

    for (const line of lines) {
      if (line.trim() === '') continue;

      try {
        const parsedEvent = JSON.parse(line);

        // Detailed logging for parsed event
        logger.verbose(`Parsed line from ${source} into object:`, parsedEvent);

        // Validate event has a type property
        if (
          parsedEvent &&
          typeof parsedEvent.type === 'string' &&
          parsedEvent.type.trim() !== ''
        ) {
          logger.verbose(`Event type found: '${parsedEvent.type}'`);
        } else if (parsedEvent && parsedEvent.hasOwnProperty('type')) {
          logger.warn(
            `Event type is present but invalid (undefined, null, or empty string): '${parsedEvent.type}'`,
            parsedEvent
          );
        } else {
          logger.warn(
            `Parsed object is missing 'type' property from ${source}:`,
            parsedEvent
          );
        }

        newLogEvents.push(parsedEvent);
      } catch (parseError) {
        logger.error(
          `Failed to parse line from ${source}: "${line}". Error: ${parseError.message}`
        );
        // Continue parsing other lines
      }
    }

    if (newLogEvents.length === 0) {
      logger.warn(`${source} was empty or contained no valid JSONL entries`);
      return {
        success: false,
        error: 'No valid log events found in file'
      };
    }

    return {
      success: true,
      logData: newLogEvents
    };
  }
}

export default FileLoader;
