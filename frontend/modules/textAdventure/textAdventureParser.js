// Command parser for text adventure module

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('textAdventureParser', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[textAdventureParser] ${message}`, ...data);
  }
}

export class TextAdventureParser {
    constructor() {
        // Define command verbs
        this.moveVerbs = ['move', 'go', 'travel', 'to'];
        this.checkVerbs = ['check', 'examine', 'search'];
        this.lookVerbs = ['look', 'l'];
        this.inventoryVerbs = ['inventory', 'inv', 'items'];
        this.helpVerbs = ['help', '?'];
    }

    /**
     * Parse user input and return command object
     * @param {string} input - User input text
     * @param {Array} availableLocations - Available locations in current region
     * @param {Array} availableExits - Available exits in current region
     * @returns {Object} Parsed command object
     */
    parseCommand(input, availableLocations = [], availableExits = []) {
        if (!input || typeof input !== 'string') {
            return { type: 'error', message: 'Please enter a command.' };
        }

        const trimmed = input.trim().toLowerCase();
        if (!trimmed) {
            return { type: 'error', message: 'Please enter a command.' };
        }

        log('debug', 'Parsing command:', trimmed);

        // Handle help commands
        if (this.helpVerbs.includes(trimmed)) {
            return { type: 'help' };
        }

        // Handle inventory commands
        if (this.inventoryVerbs.includes(trimmed)) {
            return { type: 'inventory' };
        }

        // Handle look commands
        if (this.lookVerbs.includes(trimmed)) {
            return { type: 'look' };
        }

        // Try to extract verb and target
        const { verb, target } = this.extractVerbAndTarget(trimmed);
        
        if (!target) {
            return { type: 'error', message: 'Unrecognized command. Type "help" for available commands.' };
        }

        // Find matching locations and exits
        const matchingLocations = this.findMatches(target, availableLocations);
        const matchingExits = this.findMatches(target, availableExits);

        log('debug', 'Matches found:', { locations: matchingLocations, exits: matchingExits });

        // Handle explicit verb commands
        if (verb) {
            if (this.moveVerbs.includes(verb)) {
                return this.handleMoveCommand(target, matchingExits);
            } else if (this.checkVerbs.includes(verb)) {
                return this.handleCheckCommand(target, matchingLocations);
            } else if (this.lookVerbs.includes(verb)) {
                // "look" with a target is treated as same as check
                return this.handleCheckCommand(target, matchingLocations);
            } else {
                return { type: 'error', message: 'Unrecognized command. Type "help" for available commands.' };
            }
        }

        // Handle ambiguous commands (no explicit verb)
        return this.handleAmbiguousCommand(target, matchingLocations, matchingExits);
    }

    /**
     * Extract verb and target from input
     * @param {string} input - Cleaned input string
     * @returns {Object} Object with verb and target
     */
    extractVerbAndTarget(input) {
        const words = input.split(/\s+/);
        
        if (words.length === 1) {
            // Single word - could be target without verb
            return { verb: null, target: words[0] };
        }

        const firstWord = words[0];
        const allVerbs = [...this.moveVerbs, ...this.checkVerbs];
        
        if (allVerbs.includes(firstWord)) {
            // First word is a verb
            const target = words.slice(1).join(' ');
            return { verb: firstWord, target: target };
        }

        // No recognized verb, treat entire input as target
        return { verb: null, target: input };
    }

    /**
     * Find matching items from a list (case-insensitive, supports partial matches)
     * @param {string} target - Target name to match
     * @param {Array} items - Array of item names to search
     * @returns {Array} Array of matching items with match quality
     */
    findMatches(target, items) {
        if (!items || !Array.isArray(items)) {
            return [];
        }

        const matches = [];
        const targetLower = target.toLowerCase();

        for (const item of items) {
            const itemLower = item.toLowerCase();
            
            if (itemLower === targetLower) {
                // Exact match
                matches.push({ name: item, quality: 'exact' });
            } else if (itemLower.includes(targetLower)) {
                // Partial match
                matches.push({ name: item, quality: 'partial' });
            }
        }

        // Sort by match quality (exact matches first)
        matches.sort((a, b) => {
            if (a.quality === 'exact' && b.quality !== 'exact') return -1;
            if (b.quality === 'exact' && a.quality !== 'exact') return 1;
            return 0;
        });

        return matches;
    }

    /**
     * Handle move command
     * @param {string} target - Target exit name
     * @param {Array} matchingExits - Matching exits
     * @returns {Object} Command result
     */
    handleMoveCommand(target, matchingExits) {
        if (matchingExits.length === 0) {
            return { type: 'error', message: `Unrecognized exit: ${target}` };
        }

        // Use best match (first in sorted array)
        const bestMatch = matchingExits[0];
        return { 
            type: 'move', 
            target: bestMatch.name,
            matchQuality: bestMatch.quality 
        };
    }

    /**
     * Handle check command
     * @param {string} target - Target location name
     * @param {Array} matchingLocations - Matching locations
     * @returns {Object} Command result
     */
    handleCheckCommand(target, matchingLocations) {
        if (matchingLocations.length === 0) {
            return { type: 'error', message: `Unrecognized location: ${target}` };
        }

        // Use best match (first in sorted array)
        const bestMatch = matchingLocations[0];
        return { 
            type: 'check', 
            target: bestMatch.name,
            matchQuality: bestMatch.quality 
        };
    }

    /**
     * Handle ambiguous command (no explicit verb)
     * @param {string} target - Target name
     * @param {Array} matchingLocations - Matching locations
     * @param {Array} matchingExits - Matching exits
     * @returns {Object} Command result
     */
    handleAmbiguousCommand(target, matchingLocations, matchingExits) {
        const hasLocationMatch = matchingLocations.length > 0;
        const hasExitMatch = matchingExits.length > 0;

        if (!hasLocationMatch && !hasExitMatch) {
            return { type: 'error', message: `Unrecognized location or exit: ${target}` };
        }

        if (hasLocationMatch && hasExitMatch) {
            // Check if we have exact matches for both
            const exactLocationMatch = matchingLocations.find(l => l.quality === 'exact');
            const exactExitMatch = matchingExits.find(e => e.quality === 'exact');

            if (exactLocationMatch && exactExitMatch) {
                // Both have exact matches - ask for clarification
                return { 
                    type: 'error', 
                    message: `Ambiguous name '${target}'. Did you mean to move to ${target} or check location ${target}?` 
                };
            }
        }

        // Prioritize exact matches, then by accessibility (would need state info)
        // For now, prioritize locations over exits when ambiguous
        if (hasLocationMatch) {
            const bestMatch = matchingLocations[0];
            return { 
                type: 'check', 
                target: bestMatch.name,
                matchQuality: bestMatch.quality,
                wasAmbiguous: hasExitMatch
            };
        } else {
            const bestMatch = matchingExits[0];
            return { 
                type: 'move', 
                target: bestMatch.name,
                matchQuality: bestMatch.quality,
                wasAmbiguous: false
            };
        }
    }

    /**
     * Get help text
     * @returns {string} Help text
     */
    getHelpText() {
        return `Available commands:
• move <exit>, go <exit> - Move to an exit
• check <location>, examine <location> - Check a location
• look, l - Look around the current region
• inventory, inv - Show your inventory
• help, ? - Show this help text

You can also just type the name of a location or exit directly.`;
    }
}