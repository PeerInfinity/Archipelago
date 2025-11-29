/**
 * Old School Runescape state management and helper functions.
 */

/**
 * OSRS-specific helper functions.
 */
export const helperFunctions = {
  /**
   * Calculate the total quest points the player has collected.
   * Quest points are earned by collecting QP event items like "1 QP (Misthalin Mystery)".
   * The number at the start of the item name indicates how many quest points it's worth.
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @returns {number} Total quest points
   */
  quest_points(snapshot, staticData) {
    let qp = 0;

    // Quest point items follow the pattern: "N QP (Quest Name)"
    // where N is the number of quest points (can be 1, 2, 3, 4, 5, or 6)
    if (snapshot?.inventory) {
      for (const [itemName, count] of Object.entries(snapshot.inventory)) {
        if (count > 0 && itemName.includes(' QP (')) {
          // Extract the number from the start of the item name
          // e.g., "1 QP (Misthalin Mystery)" -> 1
          const match = itemName.match(/^(\d+) QP \(/);
          if (match) {
            qp += parseInt(match[1], 10);
          }
        }
      }
    }

    return qp;
  },
};
