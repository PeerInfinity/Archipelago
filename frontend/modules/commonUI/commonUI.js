// commonUI.js - Common UI functions that can be shared between components

import { evaluateRule } from '../stateManager/ruleEngine.js';
import { processRule } from '../stateManager/ruleProcessor.js';
import { renderingProcessor } from '../stateManager/renderingProcessor.js';
// Import the function directly from its source file
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('commonUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[commonUI] ${message}`, ...data);
  }
}

/**
 * A shared UI utility class that contains common functions for use across multiple components
 */
class CommonUI {
  constructor() {
    // REMOVED internal state: this.colorblindMode = true;
    // Add state for colorblind mode, managed via setColorblindMode
    this._colorblindMode = false; // Default to false
    this.unknownEvaluationCount = 0; // Counter for undefined evaluations
  }

  // Add a method to set colorblind mode externally
  setColorblindMode(isEnabled) {
    log('info', `[CommonUI] Setting colorblind mode: ${isEnabled}`);
    this._colorblindMode = !!isEnabled;
  }

  // Method to reset the unknown evaluation counter
  resetUnknownEvaluationCount() {
    this.unknownEvaluationCount = 0;
  }

  // Method to log and get the current unknown evaluation count
  logAndGetUnknownEvaluationCount(
    contextMessage = 'Logic tree rendering cycle'
  ) {
    //log('info',
    //  `[CommonUI] ${contextMessage}: Encountered ${this.unknownEvaluationCount} unresolved rule evaluations (undefined).`
    //);
    return this.unknownEvaluationCount;
  }

  /**
   * Renders a logic tree from a rule object using the shared rule processor.
   * Enhanced version that supports colorblind mode and displays full rule details.
   * @param {Object} rule - The rule object to render
   * @param {boolean} useColorblindMode - Whether to show colorblind indicators.
   * @param {object} stateSnapshotInterface - The interface providing state access methods.
   * @returns {HTMLElement} - The rendered logic tree
   */
  renderLogicTree(rule, useColorblindMode, stateSnapshotInterface) {
    // Update the rendering processor's unknown evaluation count tracking
    renderingProcessor.unknownEvaluationCount = this.unknownEvaluationCount;
    
    const options = {
      useColorblindMode: useColorblindMode ?? this._colorblindMode,
      _colorblindMode: this._colorblindMode
    };
    
    const result = processRule(rule, stateSnapshotInterface, renderingProcessor, options);
    
    // Sync the counter back to this instance
    this.unknownEvaluationCount = renderingProcessor.unknownEvaluationCount;
    
    return result;
  }

  /**
   * Creates a region link element for use in UI components
   * @param {string} regionName - The name of the region to link to
   * @param {boolean} useColorblindMode - Whether to use colorblind indicators.
   * @param {object} snapshot - The current state snapshot containing reachability info.
   * @returns {HTMLElement} - The created region link
   */
  createRegionLink(regionName, useColorblindMode, snapshot) {
    const link = document.createElement('span');
    link.textContent = regionName;
    link.classList.add('region-link');
    link.dataset.region = regionName;
    link.title = `Click to view the ${regionName} region`;

    // Determine region accessibility status from snapshot.reachability
    const rawStatus = snapshot?.reachability?.[regionName];
    let displayStatus; // Will be true (accessible), false (inaccessible), or undefined (unknown)

    if (
      rawStatus === 'reachable' ||
      rawStatus === 'checked' ||
      rawStatus === true
    ) {
      displayStatus = true;
    } else if (rawStatus === undefined) {
      displayStatus = undefined; // Explicitly undefined if not in snapshot or snapshot missing
    } else {
      // Covers: false, 'unreachable', 'locked', or any other string not explicitly 'reachable' or 'checked'
      displayStatus = false;
    }

    // Set appropriate color and class
    link.classList.remove('accessible', 'inaccessible', 'unknown-reachability'); // Clear previous classes
    if (displayStatus === true) {
      link.style.color = 'inherit'; // Or a specific green, e.g., from CSS variables
      link.classList.add('accessible');
    } else if (displayStatus === false) {
      link.style.color = 'red'; // Consistent with other inaccessible elements
      link.classList.add('inaccessible');
    } else {
      // displayStatus is undefined
      link.style.color = '#808080'; // Gray for unknown
      link.classList.add('unknown-reachability'); // Use a specific class for unknown
    }

    // Add colorblind symbol if enabled
    if (useColorblindMode) {
      // Remove existing symbol if any, to prevent duplicates on re-renders
      const existingSymbol = link.querySelector('.colorblind-symbol');
      if (existingSymbol) {
        existingSymbol.remove();
      }

      const symbolSpan = document.createElement('span');
      symbolSpan.classList.add('colorblind-symbol');

      if (displayStatus === true) {
        symbolSpan.textContent = ' ✓';
        symbolSpan.classList.add('accessible');
      } else if (displayStatus === false) {
        symbolSpan.textContent = ' ✗';
        symbolSpan.classList.add('inaccessible');
      } else {
        // displayStatus is undefined
        symbolSpan.textContent = ' ?';
        symbolSpan.classList.add('unknown');
      }
      link.appendChild(symbolSpan);
    }

    // Add click handler
    link.addEventListener('click', (e) => {
      log(
        'info',
        `[commonUI] Click listener ON REGION LINK for "${regionName}" in commonUI.js has FIRED.`
      ); // NEW TOP-LEVEL DEBUG LOG
      e.stopPropagation(); // Prevent event from bubbling to parent elements

      // Publish panel activation first
      eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' });
      log('info', `[commonUI] Published ui:activatePanel for regionsPanel.`);

      // Then publish navigation
      eventBus.publish('ui:navigateToRegion', { regionName: regionName });
      log(
        'info',
        `[commonUI] Published ui:navigateToRegion for ${regionName}.`
      ); // Changed from "SUCCESSFULLY PUBLISHED" for clarity
    });

    return link;
  }

  /**
   * Creates a location link element for use in UI components
   * @param {string} locationName - The name of the location to link to
   * @param {string} regionName - The region containing this location
   * @param {boolean} useColorblindMode - Whether to use colorblind indicators.
   * @param {object} snapshot - The current state snapshot containing location/reachability info.
   * @returns {HTMLElement} - The created location link
   */
  createLocationLink(locationName, regionName, useColorblindMode, snapshot) {
    const link = document.createElement('span');
    link.textContent = locationName;
    link.classList.add('location-link');
    link.dataset.location = locationName;
    link.dataset.region = regionName;
    link.title = `Click to view ${locationName} in the ${regionName} region`;

    // Find the location data FROM THE SNAPSHOT
    let locationData = null;
    for (const loc of snapshot?.locations || []) {
      if (loc.name === locationName && loc.region === regionName) {
        locationData = loc;
        break;
      }
    }

    // Determine if location is accessible and checked FROM THE SNAPSHOT
    const isAccessible = locationData?.isAccessible === true;
    const checkedLocations = new Set(snapshot?.checkedLocations || []);
    const isChecked = checkedLocations.has(locationName);

    // Set appropriate class
    if (isChecked) {
      link.classList.add('checked-loc');
    } else if (isAccessible) {
      link.classList.add('accessible');
    } else {
      link.classList.add('inaccessible');
    }

    // Add colorblind symbol if enabled
    if (useColorblindMode) {
      const symbolSpan = document.createElement('span');
      symbolSpan.classList.add('colorblind-symbol');

      if (isAccessible) {
        symbolSpan.textContent = ' ✓';
        symbolSpan.classList.add('accessible');
      } else {
        symbolSpan.textContent = ' ✗';
        symbolSpan.classList.add('inaccessible');
      }

      link.appendChild(symbolSpan);
    }

    // Add click handler
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      // Publish an event with location and region names
      log(
        'info',
        `[commonUI] Publishing ui:navigateToLocation for ${locationName} in ${regionName}`
      );
      eventBus.publish('ui:navigateToLocation', {
        locationName: locationName,
        regionName: regionName,
      });
    });

    return link;
  }

  /**
   * Toggles the 'colorblind-mode' class on an element.
   * @param {HTMLElement} element - The element to toggle the class on.
   * @param {boolean} isEnabled - Whether colorblind mode is enabled for this context.
   */
  applyColorblindClass(element, isEnabled) {
    if (element) {
      element.classList.toggle('colorblind-mode', !!isEnabled);
    }
  }
}

// Create a singleton instance
const commonUIInstance = new CommonUI(); // Rename instance for clarity

// --- Export bound methods as named constants ---
export const renderLogicTree =
  commonUIInstance.renderLogicTree.bind(commonUIInstance);
export const setColorblindMode =
  commonUIInstance.setColorblindMode.bind(commonUIInstance);
export const createRegionLink =
  commonUIInstance.createRegionLink.bind(commonUIInstance);
export const createLocationLink =
  commonUIInstance.createLocationLink.bind(commonUIInstance);
export const applyColorblindClass =
  commonUIInstance.applyColorblindClass.bind(commonUIInstance);
export const resetUnknownEvaluationCounter =
  commonUIInstance.resetUnknownEvaluationCount.bind(commonUIInstance);
export const logAndGetUnknownEvaluationCounter =
  commonUIInstance.logAndGetUnknownEvaluationCount.bind(commonUIInstance);

// Also keep the default export of the instance for potential compatibility
export default commonUIInstance;

// --- Utility Functions ---

/**
 * Debounce function: Limits the rate at which a function can fire.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of millisconds to delay.
 * @param {boole
a n} immediate If true, trigger the function on the leading edge instead of the trailing.
 *
  @returns {Function} The debounced function.
 */
export function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const context = this;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}
