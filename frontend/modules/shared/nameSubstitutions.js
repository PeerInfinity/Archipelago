/**
 * Name Substitution Utilities
 *
 * Builds substitution Maps from the name_substitutions dictionary in rules.json
 * and provides lookup/reverse-lookup helpers.
 *
 * name_substitutions has the shape:
 *   { items: { internalName: displayName }, locations: { ... }, regions: { ... } }
 */

/**
 * Build separate substitution Maps for items, locations, and regions.
 * @param {Object} nameSubstitutions - The name_substitutions object from rules.json
 * @returns {{ items: Map<string,string>, locations: Map<string,string>, regions: Map<string,string> }}
 */
export function buildSubstitutionMaps(nameSubstitutions) {
  const items = new Map();
  const locations = new Map();
  const regions = new Map();

  if (!nameSubstitutions) {
    return { items, locations, regions };
  }

  if (nameSubstitutions.items) {
    for (const [internal, display] of Object.entries(nameSubstitutions.items)) {
      items.set(internal, display);
    }
  }
  if (nameSubstitutions.locations) {
    for (const [internal, display] of Object.entries(nameSubstitutions.locations)) {
      locations.set(internal, display);
    }
  }
  if (nameSubstitutions.regions) {
    for (const [internal, display] of Object.entries(nameSubstitutions.regions)) {
      regions.set(internal, display);
    }
  }

  return { items, locations, regions };
}

/**
 * Look up the display name for an internal name, falling back to the internal name itself.
 * @param {Map<string,string>} substitutionMap - One of the Maps from buildSubstitutionMaps
 * @param {string} internalName - The internal/generic name
 * @returns {string} The display name, or internalName if no substitution exists
 */
export function getDisplayName(substitutionMap, internalName) {
  if (!substitutionMap || !internalName) return internalName;
  return substitutionMap.get(internalName) ?? internalName;
}

/**
 * Build a reverse map (display name → internal name) from a substitution map.
 * @param {Map<string,string>} substitutionMap - One of the Maps from buildSubstitutionMaps
 * @returns {Map<string,string>} Reverse lookup map
 */
export function buildReverseMap(substitutionMap) {
  const reverse = new Map();
  if (!substitutionMap) return reverse;
  for (const [internal, display] of substitutionMap) {
    reverse.set(display, internal);
  }
  return reverse;
}
