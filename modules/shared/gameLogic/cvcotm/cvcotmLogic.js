// Castlevania - Circle of the Moon game-specific logic

// Helper function mappings for CvCotM-specific rules
export const helperFunctions = {
        // Movement abilities
        'has_jump_level_1': (snapshot, staticData) => {
            // Double or Roc Wing, regardless of Roc being nerfed or not
            return !!(snapshot?.inventory?.['Double'] || snapshot?.inventory?.['Roc Wing']);
        },
        'has_jump_level_2': (snapshot, staticData) => {
            // Specifically Roc Wing, regardless of Roc being nerfed or not
            return !!(snapshot?.inventory?.['Roc Wing']);
        },
        'has_jump_level_3': (snapshot, staticData) => {
            // Roc Wing and Double OR Kick Boots if Roc is nerfed. Otherwise, just Roc.
            const hasRocWing = !!(snapshot?.inventory?.['Roc Wing']);
            if (!hasRocWing) return false;

            const playerId = snapshot?.player?.slot || '1';
            const nerfRocWing = staticData?.settings?.[playerId]?.nerf_roc_wing || 0;

            if (nerfRocWing) {
                return !!(snapshot?.inventory?.['Double'] || snapshot?.inventory?.['Kick Boots']);
            } else {
                return true; // Just Roc Wing is enough
            }
        },
        'has_jump_level_4': (snapshot, staticData) => {
            // Roc Wing and Kick Boots specifically if Roc is nerfed. Otherwise, just Roc.
            const hasRocWing = !!(snapshot?.inventory?.['Roc Wing']);
            if (!hasRocWing) return false;

            const playerId = snapshot?.player?.slot || '1';
            const nerfRocWing = staticData?.settings?.[playerId]?.nerf_roc_wing || 0;

            if (nerfRocWing) {
                return !!(snapshot?.inventory?.['Kick Boots']);
            } else {
                return true; // Just Roc Wing is enough
            }
        },
        'has_jump_level_5': (snapshot, staticData) => {
            // Roc Wing, Double, AND Kick Boots if Roc is nerfed. Otherwise, just Roc.
            const hasRocWing = !!(snapshot?.inventory?.['Roc Wing']);
            if (!hasRocWing) return false;

            const playerId = snapshot?.player?.slot || '1';
            const nerfRocWing = staticData?.settings?.[playerId]?.nerf_roc_wing || 0;

            if (nerfRocWing) {
                return !!(snapshot?.inventory?.['Double'] && snapshot?.inventory?.['Kick Boots']);
            } else {
                return true; // Just Roc Wing is enough
            }
        },
        'has_kick': (snapshot, staticData) => {
            // Kick boots
            return !!(snapshot?.inventory?.['Kick Boots']);
        },
        'has_tackle': (snapshot, staticData) => {
            // Tackle ability
            return !!(snapshot?.inventory?.['Tackle']);
        },
        'has_push': (snapshot, staticData) => {
            // Heavy Ring for pushing
            return !!(snapshot?.inventory?.['Heavy Ring']);
        },
        'has_ice_or_stone': (snapshot, staticData) => {
            // Need either Cockatrice or Serpent card
            return !!(snapshot?.inventory?.['Cockatrice Card'] ||
                     snapshot?.inventory?.['Serpent Card']);
        },
        'broke_iron_maidens': (snapshot, staticData) => {
            // Check if iron maidens are broken (via detonator or start broken option)
            return !!(snapshot?.inventory?.['Maiden Detonator']);
        },

        // DSS Cards - checking for specific card combinations
        'has_freeze': (snapshot, staticData) => {
            // Freeze enemies - requires specific DSS cards
            return !!(snapshot?.inventory?.['Mercury Card'] &&
                     snapshot?.inventory?.['Serpent Card']);
        },
        'has_cleansing': (snapshot, staticData) => {
            // Cleansing ability - requires specific cards
            return !!(snapshot?.inventory?.['Venus Card'] &&
                     snapshot?.inventory?.['Unicorn Card']);
        },

        // Key items
        'has_last_key': (snapshot, staticData) => {
            return !!(snapshot?.inventory?.['Last Key']);
        },

        // Combat abilities
        'can_push_crates': (snapshot, staticData) => {
            // Push Heavy Crate ability
            return !!(snapshot?.inventory?.['Heavy Ring'] ||
                     snapshot?.inventory?.['Tackle']);
        },
        'can_break_blocks': (snapshot, staticData) => {
            // Break blocks - various methods
            return !!(snapshot?.inventory?.['Kick Boots'] ||
                     snapshot?.inventory?.['Tackle']);
        }
};

// CvCotM-specific logic module
export const cvcotmLogic = {
    // Special handling for CvCotM-specific regions
    shouldExcludeRegionFromComparison: (regionName) => {
        // Menu is a structural region, not a gameplay region
        // It's added by the exporter but doesn't appear in sphere logs
        return regionName === 'Menu';
    }
};

// Register the logic module
if (typeof window !== 'undefined') {
    window.gameLogicModules = window.gameLogicModules || {};
    window.gameLogicModules['cvcotm'] = cvcotmLogic;
    window.gameLogicModules['Castlevania - Circle of the Moon'] = cvcotmLogic;
}

export default cvcotmLogic;