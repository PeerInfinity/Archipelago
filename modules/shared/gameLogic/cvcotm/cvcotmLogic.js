// Castlevania - Circle of the Moon game-specific logic

export const cvcotmLogic = {
    // Special handling for CvCotM-specific regions
    shouldExcludeRegionFromComparison: (regionName) => {
        // Menu is a structural region, not a gameplay region
        // It's added by the exporter but doesn't appear in sphere logs
        return regionName === 'Menu';
    },

    // Helper function mappings for CvCotM-specific rules
    helperFunctions: {
        // Movement abilities
        'has_jump_level_1': (state, player) => {
            // Basic jump - usually available from start
            return true;
        },
        'has_jump_level_2': (state, player) => {
            // Double jump
            return state.has('Double', player);
        },
        'has_kick': (state, player) => {
            // Kick boots
            return state.has('Kick Boots', player);
        },
        'has_tackle': (state, player) => {
            // Tackle ability
            return state.has('Tackle', player);
        },
        'has_roc_wing': (state, player) => {
            // Roc Wing for high jumps
            return state.has('Roc Wing', player);
        },
        
        // DSS Cards - checking for specific card combinations
        'has_freeze': (state, player) => {
            // Freeze enemies - requires specific DSS cards
            return state.has('Mercury Card', player) && state.has('Serpent Card', player);
        },
        'has_cleansing': (state, player) => {
            // Cleansing ability - requires specific cards
            return state.has('Venus Card', player) && state.has('Unicorn Card', player);
        },
        
        // Key items
        'has_last_key': (state, player) => {
            return state.has('Last Key', player);
        },
        
        // Combat abilities
        'can_push_crates': (state, player) => {
            // Push Heavy Crate ability
            return state.has('Heavy Ring', player) || state.has('Tackle', player);
        },
        'can_break_blocks': (state, player) => {
            // Break blocks - various methods
            return state.has('Kick Boots', player) || state.has('Tackle', player);
        }
    },

    // Process helper function calls in rules
    processHelperCall: function(helperName, args, state, player) {
        const helperFunc = this.helperFunctions[helperName];
        if (helperFunc) {
            return helperFunc(state, player, ...args);
        }
        
        // Log unknown helper for debugging
        console.warn(`[cvcotmLogic] Unknown helper function: ${helperName}`);
        return false;
    },

    // Check if a rule's function_call is a CvCotM helper
    isGameHelper: function(functionCall) {
        if (!functionCall || !functionCall.function) return false;
        
        // Check for attribute access pattern (self.helper_name)
        if (functionCall.function.type === 'attribute' && 
            functionCall.function.object?.type === 'name' &&
            functionCall.function.object?.name === 'self') {
            const helperName = functionCall.function.attr;
            return helperName in this.helperFunctions;
        }
        
        return false;
    },

    // Evaluate a CvCotM-specific rule
    evaluateRule: function(rule, state, player) {
        if (!rule) return false;
        
        // Handle function_call type rules that are CvCotM helpers
        if (rule.type === 'function_call' && this.isGameHelper(rule)) {
            const helperName = rule.function.attr;
            return this.processHelperCall(helperName, rule.args || [], state, player);
        }
        
        // Let the main rule engine handle other rule types
        return null; // Signal to use default evaluation
    }
};

// Register the logic module
if (typeof window !== 'undefined') {
    window.gameLogicModules = window.gameLogicModules || {};
    window.gameLogicModules['cvcotm'] = cvcotmLogic;
    window.gameLogicModules['Castlevania - Circle of the Moon'] = cvcotmLogic;
}

export default cvcotmLogic;