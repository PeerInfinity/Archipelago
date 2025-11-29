/**
 * Centralized player ID utilities
 * Ensures consistent type handling across the codebase
 *
 * All player IDs are normalized to strings to match JSON key format.
 */

export const DEFAULT_PLAYER_ID = '1';

export const PlayerIdUtils = {
  /**
   * Normalize player ID to canonical string form
   * @param {string|number|null|undefined} id - Player ID in any format
   * @returns {string} Normalized player ID
   */
  normalize(id) {
    if (id === null || id === undefined) {
      return DEFAULT_PLAYER_ID;
    }
    return String(id);
  },

  /**
   * Convert player ID to number (for legacy code or numeric comparisons)
   * @param {string|number|null|undefined} id - Player ID
   * @returns {number} Numeric player ID
   */
  toNumber(id) {
    const normalized = this.normalize(id);
    return parseInt(normalized, 10);
  },

  /**
   * Access player-specific data from object with string keys
   * @param {Object} dataObject - Object with player IDs as keys
   * @param {string|number} playerId - Player ID
   * @returns {*} Data for the specified player
   */
  getPlayerData(dataObject, playerId) {
    if (!dataObject) return undefined;
    const normalized = this.normalize(playerId);
    return dataObject[normalized];
  },

  /**
   * Set player-specific data in object
   * @param {Object} dataObject - Object with player IDs as keys
   * @param {string|number} playerId - Player ID
   * @param {*} value - Value to set
   */
  setPlayerData(dataObject, playerId, value) {
    if (!dataObject) return;
    const normalized = this.normalize(playerId);
    dataObject[normalized] = value;
  },

  /**
   * Validate player ID format
   * @param {string|number} id - Player ID to validate
   * @returns {boolean} True if valid (non-empty numeric string)
   */
  isValid(id) {
    if (id === null || id === undefined) return false;
    const str = String(id);
    return /^\d+$/.test(str); // Numeric string
  },

  /**
   * Check if two player IDs are equal (handles type coercion)
   * @param {string|number} id1 - First player ID
   * @param {string|number} id2 - Second player ID
   * @returns {boolean} True if equal after normalization
   */
  equals(id1, id2) {
    return this.normalize(id1) === this.normalize(id2);
  }
};
