/**
 * Dark Souls III-specific game logic
 */

function initGameLogic(globalState) {
  const helpers = {};

  /**
   * Check if a location has been checked (collected)
   * This is used to handle location_check rules which are converted from self._can_get() calls
   */
  helpers.location_check = function(context, location) {
    // Check if the location is in the checked locations
    const checkedLocations = globalState?.checkedLocations || new Set();
    
    // The location needs to be accessible AND checked
    // First verify it's accessible
    const accessibleLocations = globalState?.accessibleLocations || [];
    if (!accessibleLocations.includes(location)) {
      return false;
    }
    
    // For the purpose of progression logic, a location is considered "checked"
    // if it's accessible. This matches the Python behavior where _can_get() 
    // checks if a location CAN be reached, not if it HAS been collected.
    return true;
  };

  return helpers;
}

// Export for use in the game logic registry
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initGameLogic };
}