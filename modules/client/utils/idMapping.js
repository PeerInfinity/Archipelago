// client/utils/idMapping.js - Enhanced with caching and initialization

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('idMapping', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[idMapping] ${message}`, ...data);
  }
}

/**
 * Cache for mapping between server IDs and names.
 * Populated from dataPackage for faster lookup.
 */
const mappingCache = {
  // Item mappings: serverId -> itemName
  itemMappings: new Map(),

  // Location mappings: serverId -> locationName
  locationMappings: new Map(),

  // Reverse mappings: itemName -> serverId
  itemNameToId: new Map(),

  // Reverse mappings: locationName -> serverId
  locationNameToId: new Map(),

  // Version tracking
  dataPackageVersion: null,
};

/**
 * Initialize mapping caches from a data package
 * @param {Object} dataPackage - The data package received from the server
 * @param {string} clientGameName - The game name for this client's slot (optional, if not provided loads all games)
 */
export function initializeMappingsFromDataPackage(dataPackage, clientGameName = null) {
  if (!dataPackage || !dataPackage.games) {
    log('warn', 'Cannot initialize mappings: Invalid data package');
    return false;
  }

  try {
    // Clear existing caches
    mappingCache.itemMappings.clear();
    mappingCache.locationMappings.clear();
    mappingCache.itemNameToId.clear();
    mappingCache.locationNameToId.clear();

    // Store version
    mappingCache.dataPackageVersion = dataPackage.version;

    // If clientGameName is provided, only load mappings for that game
    // Otherwise, load all games (legacy behavior, but can cause ID collisions in multiworld)
    const gamesToProcess = clientGameName
      ? { [clientGameName]: dataPackage.games[clientGameName] }
      : dataPackage.games;

    if (clientGameName && !dataPackage.games[clientGameName]) {
      log('warn', `Cannot find game '${clientGameName}' in data package. Available games: ${Object.keys(dataPackage.games).join(', ')}`);
      return false;
    }

    // Process game mappings
    for (const [gameName, gameData] of Object.entries(gamesToProcess)) {
      if (!gameData) continue;

      // Process item mappings
      if (gameData.item_name_to_id) {
        for (const [itemName, itemId] of Object.entries(
          gameData.item_name_to_id
        )) {
          const numericId = Number(itemId);
          mappingCache.itemMappings.set(numericId, itemName);
          mappingCache.itemNameToId.set(itemName, numericId);
        }
      }

      // Process location mappings
      if (gameData.location_name_to_id) {
        for (const [locationName, locationId] of Object.entries(
          gameData.location_name_to_id
        )) {
          const numericId = Number(locationId);
          mappingCache.locationMappings.set(numericId, locationName);
          mappingCache.locationNameToId.set(locationName, numericId);
        }
      }
    }

    log(
      'info',
      `Mapping cache initialized${clientGameName ? ` for game '${clientGameName}'` : ''} with ${mappingCache.itemMappings.size} items and ${mappingCache.locationMappings.size} locations`
    );
    return true;
  } catch (error) {
    log('error', 'Error initializing mappings from data package:', error);
    return false;
  }
}

/**
 * Try to load and initialize mappings from localStorage
 * @returns {boolean} - Whether initialization was successful
 */
export function loadMappingsFromStorage() {
  try {
    const dataPackageStr = localStorage.getItem('dataPackage');
    if (!dataPackageStr) {
      return false;
    }

    const dataPackage = JSON.parse(dataPackageStr);
    if (!dataPackage || !dataPackage.games) {
      return false;
    }

    const success = initializeMappingsFromDataPackage(dataPackage);
    return success;
  } catch (error) {
    log('warn', 'Error loading mappings from storage:', error);
    return false;
  }
}

/**
 * Get item name from server item ID using cached mappings or stateManager
 * @param {number} serverId - Server item ID
 * @param {Object} stateManager - The stateManager instance (optional)
 * @returns {string} - The item name or a fallback string
 */
export function getItemNameFromServerId(serverId, stateManager = null) {
  if (serverId === null || serverId === undefined) {
    return 'Unknown';
  }

  // Cast to number to ensure consistent lookup
  const numericId = Number(serverId);

  // First check the cache
  if (mappingCache.itemMappings.has(numericId)) {
    return mappingCache.itemMappings.get(numericId);
  }

  // Try stateManager if available
  if (stateManager) {
    // Try direct lookup with stateManager's method
    if (
      stateManager.getItemNameFromId &&
      typeof stateManager.getItemNameFromId === 'function'
    ) {
      const itemName = stateManager.getItemNameFromId(numericId);
      if (itemName) {
        // Add to cache for next time
        mappingCache.itemMappings.set(numericId, itemName);
        return itemName;
      }
    }
  }

  // Return a placeholder with the ID for clarity
  return `Item ${numericId}`;
}

/**
 * Get location name from server location ID using cached mappings or stateManager
 * @param {number} serverId - Server location ID
 * @param {Object} stateManager - The stateManager instance (optional)
 * @returns {string} - The location name or a fallback string
 */
export function getLocationNameFromServerId(serverId, stateManager = null) {
  if (serverId === null || serverId === undefined) {
    return 'Unknown';
  }

  // Cast to number to ensure consistent lookup
  const numericId = Number(serverId);

  // First check the cache
  if (mappingCache.locationMappings.has(numericId)) {
    return mappingCache.locationMappings.get(numericId);
  }

  // Try stateManager if available
  if (stateManager) {
    // Try direct lookup with stateManager's method
    if (
      stateManager.getLocationNameFromId &&
      typeof stateManager.getLocationNameFromId === 'function'
    ) {
      const locationName = stateManager.getLocationNameFromId(numericId);
      if (locationName) {
        // Add to cache for next time
        mappingCache.locationMappings.set(numericId, locationName);
        return locationName;
      }
    }

    // If direct lookup failed, try to find location in locations array
    if (stateManager.locations) {
      const location = stateManager.locations.find(
        (loc) => Number(loc.id) === numericId
      );
      if (location) {
        // Add to cache for next time
        mappingCache.locationMappings.set(numericId, location.name);
        return location.name;
      }
    }
  }

  // Return a placeholder with the ID for clarity
  return `Location ${numericId}`;
}

/**
 * Get server location ID from location name or object
 * @param {string|Object} location - Location name or object
 * @param {Object} stateManager - The stateManager instance (optional)
 * @returns {number|null} - The server location ID or null if not found
 */
export function getServerLocationId(location, stateManager = null) {
  if (!location) {
    return null;
  }

  // Handle location object
  if (typeof location === 'object') {
    // If location has an id, use it directly
    if (location.id !== undefined && location.id !== null) {
      return Number(location.id);
    }

    // If location has a name, look up by name
    if (location.name) {
      location = location.name;
    } else {
      return null;
    }
  }

  // At this point, location should be a string (name)

  // First check the cache
  if (mappingCache.locationNameToId.has(location)) {
    return mappingCache.locationNameToId.get(location);
  }

  // Use stateManager's mapping if available
  if (stateManager) {
    if (
      stateManager.getLocationId &&
      typeof stateManager.getLocationId === 'function'
    ) {
      const id = stateManager.getLocationId(location);
      if (id !== null && id !== undefined) {
        // Add to cache for next time
        mappingCache.locationNameToId.set(location, Number(id));
        return Number(id);
      }
    }

    // Try direct lookup in locationNameToId (legacy approach)
    if (
      stateManager.locationNameToId &&
      stateManager.locationNameToId[location] !== undefined
    ) {
      const id = Number(stateManager.locationNameToId[location]);
      // Add to cache for next time
      mappingCache.locationNameToId.set(location, id);
      return id;
    }

    // Try getting from static data (new approach)
    if (
      stateManager.getStaticData &&
      typeof stateManager.getStaticData === 'function'
    ) {
      try {
        const staticData = stateManager.getStaticData();
        if (
          staticData?.locationNameToId &&
          staticData.locationNameToId[location] !== undefined
        ) {
          const id = Number(staticData.locationNameToId[location]);
          // Add to cache for next time
          mappingCache.locationNameToId.set(location, id);
          return id;
        }
      } catch (error) {
        log('warn', '[idMapping] Error accessing static data for location ID lookup:', error);
      }
    }
  }

  return null;
}

/**
 * Get server item ID from item name
 * @param {string} itemName - Item name
 * @param {Object} stateManager - The stateManager instance (optional)
 * @returns {number|null} - The server item ID or null if not found
 */
export function getServerItemId(itemName, stateManager = null) {
  if (!itemName) {
    return null;
  }

  // First check the cache
  if (mappingCache.itemNameToId.has(itemName)) {
    return mappingCache.itemNameToId.get(itemName);
  }

  // Use stateManager's mapping if available
  if (stateManager) {
    if (
      stateManager.getItemId &&
      typeof stateManager.getItemId === 'function'
    ) {
      const id = stateManager.getItemId(itemName);
      if (id !== null && id !== undefined) {
        // Add to cache for next time
        mappingCache.itemNameToId.set(itemName, Number(id));
        return Number(id);
      }
    }

    // Try direct lookup in itemNameToId (legacy approach)
    if (
      stateManager.itemNameToId &&
      stateManager.itemNameToId[itemName] !== undefined
    ) {
      const id = Number(stateManager.itemNameToId[itemName]);
      // Add to cache for next time
      mappingCache.itemNameToId.set(itemName, id);
      return id;
    }

    // Try getting from static data (new approach)
    if (
      stateManager.getStaticData &&
      typeof stateManager.getStaticData === 'function'
    ) {
      try {
        const staticData = stateManager.getStaticData();
        if (
          staticData?.itemNameToId &&
          staticData.itemNameToId[itemName] !== undefined
        ) {
          const id = Number(staticData.itemNameToId[itemName]);
          // Add to cache for next time
          mappingCache.itemNameToId.set(itemName, id);
          return id;
        }
      } catch (error) {
        log('warn', '[idMapping] Error accessing static data for item ID lookup:', error);
      }
    }
  }

  return null;
}

// Export the mapping cache for potential direct access
export { mappingCache };
