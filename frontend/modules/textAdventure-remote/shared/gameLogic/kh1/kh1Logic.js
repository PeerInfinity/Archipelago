/**
 * Kingdom Hearts 1 game-specific logic
 */

const WORLDS = ["Wonderland", "Olympus Coliseum", "Deep Jungle", "Agrabah", "Monstro", "Atlantica", "Halloween Town", "Neverland", "Hollow Bastion", "End of the World"];
const KEYBLADES = ["Lady Luck", "Olympia", "Jungle King", "Three Wishes", "Wishing Star", "Crabclaw", "Pumpkinhead", "Fairy Harp", "Divine Rose", "Oblivion"];
const TORN_PAGES = ["Torn Page 1", "Torn Page 2", "Torn Page 3", "Torn Page 4", "Torn Page 5"];

export const kh1Logic = {
    /**
     * Checks if the player has access to a certain number of worlds
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: [num_of_worlds, keyblades_unlock_chests]
     * @returns {boolean}
     */
    has_x_worlds: function(state, args) {
        const num_of_worlds = args?.[0] || 0;
        const keyblades_unlock_chests = args?.[1] ?? false;
        
        let worlds_acquired = 0.0;
        for (let i = 0; i < WORLDS.length; i++) {
            if (state.hasItem(WORLDS[i])) {
                worlds_acquired += 0.5;
            }
            // Check if we have the world AND either keyblades don't unlock chests OR we have the keyblade
            // OR it's Atlantica (special case)
            if ((state.hasItem(WORLDS[i]) && (!keyblades_unlock_chests || state.hasItem(KEYBLADES[i]))) || 
                (state.hasItem(WORLDS[i]) && WORLDS[i] === "Atlantica")) {
                worlds_acquired += 0.5;
            }
        }
        return worlds_acquired >= num_of_worlds;
    },

    /**
     * Checks if the player has all emblem pieces
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: [keyblades_unlock_chests]
     * @returns {boolean}
     */
    has_emblems: function(state, args) {
        const keyblades_unlock_chests = args?.[0] ?? false;
        
        const emblem_pieces = [
            "Emblem Piece (Flame)",
            "Emblem Piece (Chest)",
            "Emblem Piece (Statue)",
            "Emblem Piece (Fountain)",
            "Hollow Bastion"
        ];
        
        // Check if we have all emblem pieces
        for (const piece of emblem_pieces) {
            const hasPiece = state.getItemCount ? state.getItemCount(piece) > 0 : state.hasItem(piece);
            if (!hasPiece) {
                return false;
            }
        }
        
        // Also need 5 worlds
        return this.has_x_worlds(state, [5, keyblades_unlock_chests]);
    },

    /**
     * Checks if the player has all puppies
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: [puppies_required]
     * @returns {boolean}
     */
    has_puppies_all: function(state, args) {
        // const puppies_required = args?.[0] || 0;
        const hasAllPuppies = state.getItemCount ? state.getItemCount("All Puppies") > 0 : state.hasItem("All Puppies");
        return hasAllPuppies;
    },

    /**
     * Checks if the player has a certain number of puppies
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: [puppies_required]
     * @returns {boolean}
     */
    has_puppies: function(state, args) {
        const puppies_required = args?.[0] || 0;
        
        if (puppies_required > 99) {
            return this.has_puppies_all(state, args);
        }
        
        let count = state.getItemCount("Puppy");
        const puppy_items = [
            "Puppies 01-03", "Puppies 04-06", "Puppies 07-09", "Puppies 10-12",
            "Puppies 13-15", "Puppies 16-18", "Puppies 19-21", "Puppies 22-24",
            "Puppies 25-27", "Puppies 28-30", "Puppies 31-33", "Puppies 34-36",
            "Puppies 37-39", "Puppies 40-42", "Puppies 43-45", "Puppies 46-48",
            "Puppies 49-51", "Puppies 52-54", "Puppies 55-57", "Puppies 58-60",
            "Puppies 61-63", "Puppies 64-66", "Puppies 67-69", "Puppies 70-72",
            "Puppies 73-75", "Puppies 76-78", "Puppies 79-81", "Puppies 82-84",
            "Puppies 85-87", "Puppies 88-90", "Puppies 91-93", "Puppies 94-96",
            "Puppies 97-99"
        ];
        
        for (const puppy_group of puppy_items) {
            const hasPuppyGroup = state.getItemCount ? state.getItemCount(puppy_group) > 0 : state.hasItem(puppy_group);
            if (hasPuppyGroup) {
                count += 3;
            }
        }
        
        return count >= puppies_required;
    },

    /**
     * Checks if the player has defensive tools
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: []
     * @returns {boolean}
     */
    has_defensive_tools: function(state, args) {
        const hasCure2 = state.getItemCount ? state.getItemCount("Progressive Cure") >= 2 : state.hasItem("Progressive Cure", 2);
        const hasLeafBracer = state.getItemCount ? state.getItemCount("Leaf Bracer") > 0 : state.hasItem("Leaf Bracer");
        const hasSecondChance = state.getItemCount ? state.getItemCount("Second Chance") > 0 : state.hasItem("Second Chance");
        return hasCure2 && (hasLeafBracer || hasSecondChance);
    },

    /**
     * Checks if the player has offensive magic
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: []
     * @returns {boolean}
     */
    has_offensive_magic: function(state, args) {
        const hasFire = state.getItemCount ? state.getItemCount("Progressive Fire") > 0 : state.hasItem("Progressive Fire");
        const hasBlizzard = state.getItemCount ? state.getItemCount("Progressive Blizzard") > 0 : state.hasItem("Progressive Blizzard");
        const hasThunder = state.getItemCount ? state.getItemCount("Progressive Thunder") > 0 : state.hasItem("Progressive Thunder");
        const hasGravity = state.getItemCount ? state.getItemCount("Progressive Gravity") > 0 : state.hasItem("Progressive Gravity");
        const hasStop = state.getItemCount ? state.getItemCount("Progressive Stop") > 0 : state.hasItem("Progressive Stop");
        return hasFire || hasBlizzard || hasThunder || hasGravity || hasStop;
    },

    /**
     * Checks if the player has a certain number of reports
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: [reports_required]
     * @returns {boolean}
     */
    has_reports: function(state, args) {
        const reports_required = args?.[0] || 0;
        
        if (reports_required > 13) {
            const hasAllReports = state.getItemCount ? state.getItemCount("All Ansem Reports") > 0 : state.hasItem("All Ansem Reports");
            return hasAllReports;
        }
        
        let report_count = 0;
        for (let i = 1; i <= 13; i++) {
            const hasReport = state.getItemCount ? state.getItemCount(`Ansem Report ${i}`) > 0 : state.hasItem(`Ansem Report ${i}`);
            if (hasReport) {
                report_count++;
            }
        }
        
        return report_count >= reports_required;
    },

    /**
     * Checks if the player has a certain number of torn pages
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: [pages_required]
     * @returns {boolean}
     */
    has_torn_pages: function(state, args) {
        const pages_required = args?.[0] || 0;
        
        let page_count = 0;
        for (const page of TORN_PAGES) {
            const hasPage = state.getItemCount ? state.getItemCount(page) > 0 : state.hasItem(page);
            if (hasPage) {
                page_count++;
            }
        }
        
        return page_count >= pages_required;
    },

    /**
     * Checks if the player has evidence
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: []
     * @returns {boolean}
     */
    has_evidence: function(state, args) {
        const hasFootprints = state.getItemCount ? state.getItemCount("Footprints") > 0 : state.hasItem("Footprints");
        const hasAntenna = state.getItemCount ? state.getItemCount("Antenna") > 0 : state.hasItem("Antenna");
        const hasClawMarks = state.getItemCount ? state.getItemCount("Claw Marks") > 0 : state.hasItem("Claw Marks");
        const hasStench = state.getItemCount ? state.getItemCount("Stench") > 0 : state.hasItem("Stench");
        return hasFootprints || hasAntenna || hasClawMarks || hasStench;
    },

    /**
     * Checks if the player can glide
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: [advanced_logic, logic_difficulty]
     * @returns {boolean}
     */
    can_glide: function(state, args) {
        const advanced_logic = args?.[0] ?? false;
        const logic_difficulty = args?.[1] ?? "Standard";
        
        if (!advanced_logic || logic_difficulty === "Standard") {
            const hasGlide = state.getItemCount ? state.getItemCount("Progressive Glide") > 0 : state.hasItem("Progressive Glide");
            const hasSuperglide = state.getItemCount ? state.getItemCount("Superglide") > 0 : state.hasItem("Superglide");
            return hasGlide || hasSuperglide;
        }
        const hasGlide2 = state.getItemCount ? state.getItemCount("Progressive Glide") >= 2 : state.hasItem("Progressive Glide", 2);
        const hasSuperglide = state.getItemCount ? state.getItemCount("Superglide") > 0 : state.hasItem("Superglide");
        return hasGlide2 || hasSuperglide;
    },

    /**
     * Checks if the player can use slides
     * @param {Object} state - The current game state
     * @param {Array} args - Arguments: []
     * @returns {boolean}
     */
    has_slides: function(state, args) {
        const hasSlide1 = state.getItemCount ? state.getItemCount("Slide 1") > 0 : state.hasItem("Slide 1");
        const hasSlide2 = state.getItemCount ? state.getItemCount("Slide 2") > 0 : state.hasItem("Slide 2");
        const hasSlide3 = state.getItemCount ? state.getItemCount("Slide 3") > 0 : state.hasItem("Slide 3");
        const hasSlide4 = state.getItemCount ? state.getItemCount("Slide 4") > 0 : state.hasItem("Slide 4");
        const hasSlide5 = state.getItemCount ? state.getItemCount("Slide 5") > 0 : state.hasItem("Slide 5");
        const hasSlide6 = state.getItemCount ? state.getItemCount("Slide 6") > 0 : state.hasItem("Slide 6");
        return hasSlide1 && hasSlide2 && hasSlide3 && hasSlide4 && hasSlide5 && hasSlide6;
    },

    /**
     * Returns the minimum of two values
     * @param {Object} state - The current game state (not used)
     * @param {Array} args - Arguments: [value1, value2]
     * @returns {number}
     */
    min: function(state, args) {
        const value1 = args?.[0] ?? Infinity;
        const value2 = args?.[1] ?? Infinity;
        return Math.min(value1, value2);
    }
};

export default kh1Logic;