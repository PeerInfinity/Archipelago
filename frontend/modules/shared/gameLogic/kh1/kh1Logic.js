/**
 * Kingdom Hearts 1 game-specific logic
 */

const WORLDS = ["Wonderland", "Olympus Coliseum", "Deep Jungle", "Agrabah", "Monstro", "Atlantica", "Halloween Town", "Neverland", "Hollow Bastion", "End of the World"];
const KEYBLADES = ["Lady Luck", "Olympia", "Jungle King", "Three Wishes", "Wishing Star", "Crabclaw", "Pumpkinhead", "Fairy Harp", "Divine Rose", "Oblivion"];
const TORN_PAGES = ["Torn Page 1", "Torn Page 2", "Torn Page 3", "Torn Page 4", "Torn Page 5"];

/**
 * Generic helper functions for KH1
 */
export const kh1Logic = {
    /**
     * Check if the player has an item
     * @param {Object} snapshot - Game state snapshot
     * @param {Object} staticData - Static game data
     * @param {string} itemName - Name of the item to check
     * @returns {boolean} True if player has the item
     */
    has(snapshot, staticData, itemName) {
        return !!(snapshot?.inventory && snapshot.inventory[itemName] > 0);
    },

    /**
     * Count how many of an item the player has
     * @param {Object} snapshot - Game state snapshot
     * @param {Object} staticData - Static game data
     * @param {string} itemName - Name of the item to count
     * @returns {number} Count of the item
     */
    count(snapshot, staticData, itemName) {
        return snapshot?.inventory?.[itemName] || 0;
    },

    /**
     * Checks if the player has access to a certain number of worlds
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @param {number} num_of_worlds - Required number of worlds
     * @param {boolean} keyblades_unlock_chests - Whether keyblades are needed
     * @returns {boolean}
     */
    has_x_worlds(snapshot, staticData, num_of_worlds, keyblades_unlock_chests) {
        num_of_worlds = num_of_worlds || 0;
        keyblades_unlock_chests = keyblades_unlock_chests ?? false;

        let worlds_acquired = 0.0;
        for (let i = 0; i < WORLDS.length; i++) {
            const hasWorld = snapshot?.inventory?.[WORLDS[i]] > 0;
            if (hasWorld) {
                worlds_acquired += 0.5;
            }
            // Check if we have the world AND either keyblades don't unlock chests OR we have the keyblade
            // OR it's Atlantica (special case)
            const hasKeyblade = snapshot?.inventory?.[KEYBLADES[i]] > 0;
            if ((hasWorld && (!keyblades_unlock_chests || hasKeyblade)) ||
                (hasWorld && WORLDS[i] === "Atlantica")) {
                worlds_acquired += 0.5;
            }
        }
        return worlds_acquired >= num_of_worlds;
    },

    /**
     * Checks if the player has all emblem pieces
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @param {boolean} keyblades_unlock_chests - Whether keyblades are needed
     * @returns {boolean}
     */
    has_emblems(snapshot, staticData, keyblades_unlock_chests) {
        keyblades_unlock_chests = keyblades_unlock_chests ?? false;

        const emblem_pieces = [
            "Emblem Piece (Flame)",
            "Emblem Piece (Chest)",
            "Emblem Piece (Statue)",
            "Emblem Piece (Fountain)",
            "Hollow Bastion"
        ];

        // Check if we have all emblem pieces
        for (const piece of emblem_pieces) {
            const hasPiece = snapshot?.inventory?.[piece] > 0;
            if (!hasPiece) {
                return false;
            }
        }

        // Also need 5 worlds
        return this.has_x_worlds(snapshot, staticData, 5, keyblades_unlock_chests);
    },

    /**
     * Checks if the player has all puppies
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @returns {boolean}
     */
    has_puppies_all(snapshot, staticData) {
        const hasAllPuppies = snapshot?.inventory?.["All Puppies"] > 0;
        return hasAllPuppies;
    },

    /**
     * Checks if the player has a certain number of puppies
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @param {number} puppies_required - Number of puppies required
     * @returns {boolean}
     */
    has_puppies(snapshot, staticData, puppies_required) {
        puppies_required = puppies_required || 0;

        if (puppies_required > 99) {
            return this.has_puppies_all(snapshot, staticData);
        }

        let count = snapshot?.inventory?.["Puppy"] || 0;
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
            const hasPuppyGroup = snapshot?.inventory?.[puppy_group] > 0;
            if (hasPuppyGroup) {
                count += 3;
            }
        }

        return count >= puppies_required;
    },

    /**
     * Checks if the player has defensive tools
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @returns {boolean}
     */
    has_defensive_tools(snapshot, staticData) {
        // Must have all of: Progressive Cure 2+, Leaf Bracer 1+, Dodge Roll 1+
        const hasCure2 = (snapshot?.inventory?.["Progressive Cure"] || 0) >= 2;
        const hasLeafBracer = (snapshot?.inventory?.["Leaf Bracer"] || 0) >= 1;
        const hasDodgeRoll = (snapshot?.inventory?.["Dodge Roll"] || 0) >= 1;

        // Must have at least one of: Second Chance 1+, MP Rage 1+, Progressive Aero 2+
        const hasSecondChance = (snapshot?.inventory?.["Second Chance"] || 0) >= 1;
        const hasMPRage = (snapshot?.inventory?.["MP Rage"] || 0) >= 1;
        const hasAero2 = (snapshot?.inventory?.["Progressive Aero"] || 0) >= 2;

        return hasCure2 && hasLeafBracer && hasDodgeRoll && (hasSecondChance || hasMPRage || hasAero2);
    },

    /**
     * Checks if the player has offensive magic
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @returns {boolean}
     */
    has_offensive_magic(snapshot, staticData) {
        const hasFire = (snapshot?.inventory?.["Progressive Fire"] || 0) > 0;
        const hasBlizzard = (snapshot?.inventory?.["Progressive Blizzard"] || 0) > 0;
        const hasThunder = (snapshot?.inventory?.["Progressive Thunder"] || 0) > 0;
        const hasGravity = (snapshot?.inventory?.["Progressive Gravity"] || 0) > 0;
        const hasStop = (snapshot?.inventory?.["Progressive Stop"] || 0) > 0;
        return hasFire || hasBlizzard || hasThunder || hasGravity || hasStop;
    },

    /**
     * Checks if the player has a certain number of reports
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @param {number} reports_required - Number of reports required
     * @returns {boolean}
     */
    has_reports(snapshot, staticData, reports_required) {
        reports_required = reports_required || 0;

        if (reports_required > 13) {
            const hasAllReports = (snapshot?.inventory?.["All Ansem Reports"] || 0) > 0;
            return hasAllReports;
        }

        let report_count = 0;
        for (let i = 1; i <= 13; i++) {
            const hasReport = (snapshot?.inventory?.[`Ansem Report ${i}`] || 0) > 0;
            if (hasReport) {
                report_count++;
            }
        }

        return report_count >= reports_required;
    },

    /**
     * Checks if the player has a certain number of torn pages
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @param {number} pages_required - Number of pages required
     * @returns {boolean}
     */
    has_torn_pages(snapshot, staticData, pages_required) {
        pages_required = pages_required || 0;

        let page_count = 0;
        for (const page of TORN_PAGES) {
            const hasPage = (snapshot?.inventory?.[page] || 0) > 0;
            if (hasPage) {
                page_count++;
            }
        }

        return page_count >= pages_required;
    },

    /**
     * Checks if the player has evidence
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @returns {boolean}
     */
    has_evidence(snapshot, staticData) {
        const hasFootprints = (snapshot?.inventory?.["Footprints"] || 0) > 0;
        const hasAntenna = (snapshot?.inventory?.["Antenna"] || 0) > 0;
        const hasClawMarks = (snapshot?.inventory?.["Claw Marks"] || 0) > 0;
        const hasStench = (snapshot?.inventory?.["Stench"] || 0) > 0;
        return hasFootprints || hasAntenna || hasClawMarks || hasStench;
    },

    /**
     * Checks if the player can glide
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @param {boolean} advanced_logic - Whether advanced logic is enabled
     * @param {string} logic_difficulty - Logic difficulty setting
     * @returns {boolean}
     */
    can_glide(snapshot, staticData, advanced_logic, logic_difficulty) {
        advanced_logic = advanced_logic ?? false;
        logic_difficulty = logic_difficulty ?? "Standard";

        if (!advanced_logic || logic_difficulty === "Standard") {
            const hasGlide = (snapshot?.inventory?.["Progressive Glide"] || 0) > 0;
            const hasSuperglide = (snapshot?.inventory?.["Superglide"] || 0) > 0;
            return hasGlide || hasSuperglide;
        }
        const hasGlide2 = (snapshot?.inventory?.["Progressive Glide"] || 0) >= 2;
        const hasSuperglide = (snapshot?.inventory?.["Superglide"] || 0) > 0;
        return hasGlide2 || hasSuperglide;
    },

    /**
     * Checks if the player can use slides
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @returns {boolean}
     */
    has_slides(snapshot, staticData) {
        const hasSlide1 = (snapshot?.inventory?.["Slide 1"] || 0) > 0;
        const hasSlide2 = (snapshot?.inventory?.["Slide 2"] || 0) > 0;
        const hasSlide3 = (snapshot?.inventory?.["Slide 3"] || 0) > 0;
        const hasSlide4 = (snapshot?.inventory?.["Slide 4"] || 0) > 0;
        const hasSlide5 = (snapshot?.inventory?.["Slide 5"] || 0) > 0;
        const hasSlide6 = (snapshot?.inventory?.["Slide 6"] || 0) > 0;
        return hasSlide1 && hasSlide2 && hasSlide3 && hasSlide4 && hasSlide5 && hasSlide6;
    },

    /**
     * Returns the minimum of two values
     * @param {Object} snapshot - The current game state (not used)
     * @param {Object} staticData - Static game data (not used)
     * @param {number} value1 - First value
     * @param {number} value2 - Second value
     * @returns {number}
     */
    min(snapshot, staticData, value1, value2) {
        value1 = value1 ?? Infinity;
        value2 = value2 ?? Infinity;
        return Math.min(value1, value2);
    },

    /**
     * Returns the ceiling of a number
     * @param {Object} snapshot - The current game state (not used)
     * @param {Object} staticData - Static game data (not used)
     * @param {number} value - Value to ceil
     * @returns {number}
     */
    ceil(snapshot, staticData, value) {
        return Math.ceil(value);
    },

    /**
     * Checks if the player has at least count unique items from a list
     * Returns True if the state contains at least `count` items matching any of the item names from a list.
     * Ignores duplicates of the same item.
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data (not used)
     * @param {Array} items - List of item names to check
     * @param {number} count - Minimum number of unique items required
     * @returns {boolean}
     */
    has_from_list_unique(snapshot, staticData, items, count) {
        let found = 0;
        for (const itemName of items) {
            if (snapshot?.inventory?.[itemName] > 0) {
                found++;
                if (found >= count) {
                    return true;
                }
            }
        }
        return false;
    },

    /**
     * Checks if the player can access Oogie's Manor
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @param {boolean} advanced_logic - Whether advanced logic is enabled
     * @returns {boolean}
     */
    has_oogie_manor(snapshot, staticData, advanced_logic) {
        advanced_logic = advanced_logic ?? false;

        const hasFire = (snapshot?.inventory?.["Progressive Fire"] || 0) > 0;
        const hasHighJump = (snapshot?.inventory?.["High Jump"] || 0);
        const hasGlide = (snapshot?.inventory?.["Progressive Glide"] || 0) > 0;

        // Convert to boolean to avoid returning 0 instead of false
        return !!(
            hasFire ||
            (advanced_logic && hasHighJump >= 2) ||
            (advanced_logic && hasHighJump > 0 && hasGlide)
        );
    },

    /**
     * Checks if the player can perform the Dumbo skip
     * Requires Dumbo summon and at least one Magic item
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @returns {boolean}
     */
    can_dumbo_skip(snapshot, staticData) {
        const hasDumbo = (snapshot?.inventory?.["Dumbo"] || 0) > 0;

        // Check if player has any Magic item
        // Magic group includes: Progressive Fire, Progressive Blizzard, Progressive Thunder, Progressive Cure, Progressive Gravity, Progressive Stop, Progressive Aero
        const magicItems = [
            "Progressive Fire",
            "Progressive Blizzard",
            "Progressive Thunder",
            "Progressive Cure",
            "Progressive Gravity",
            "Progressive Stop",
            "Progressive Aero"
        ];

        const hasMagic = magicItems.some(item => (snapshot?.inventory?.[item] || 0) > 0);

        return hasDumbo && hasMagic;
    },

    /**
     * Checks if the player has all magic types at a certain level
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @param {number} level - Required level for each magic type
     * @returns {boolean}
     */
    has_all_magic_lvx(snapshot, staticData, level) {
        level = level || 1;

        const magicTypes = [
            "Progressive Fire",
            "Progressive Blizzard",
            "Progressive Thunder",
            "Progressive Cure",
            "Progressive Gravity",
            "Progressive Aero",
            "Progressive Stop"
        ];

        for (const magicType of magicTypes) {
            const count = snapshot?.inventory?.[magicType] || 0;
            if (count < level) {
                return false;
            }
        }

        return true;
    },

    /**
     * Extract puppies_required from location names like "Return X Puppies"
     * @param {string} locationName - The location name to parse
     * @returns {number|null} Number of puppies required, or null if not a puppy location
     */
    extractPuppiesRequired(locationName) {
        const match = locationName.match(/Return (\d+) Puppies/);
        if (match) {
            return parseInt(match[1], 10);
        }
        return null;
    },

    /**
     * Checks if the player meets the Final Rest door requirement
     * @param {Object} snapshot - The current game state
     * @param {Object} staticData - Static game data
     * @param {string} final_rest_door_requirement - Type of requirement (reports/puppies/postcards/superbosses)
     * @param {number} final_rest_door_required_reports - Number of reports required
     * @param {boolean} keyblades_unlock_chests - Whether keyblades are needed for chests
     * @param {string} puppies_choice - Puppy collection mode (individual/triplets/full)
     * @returns {boolean}
     */
    has_final_rest_door(snapshot, staticData, final_rest_door_requirement, final_rest_door_required_reports, keyblades_unlock_chests, puppies_choice) {
        final_rest_door_requirement = final_rest_door_requirement || "reports";
        final_rest_door_required_reports = final_rest_door_required_reports || 0;
        keyblades_unlock_chests = keyblades_unlock_chests ?? false;
        puppies_choice = puppies_choice || "triplets";

        if (final_rest_door_requirement === "reports") {
            return this.has_reports(snapshot, staticData, final_rest_door_required_reports);
        }
        if (final_rest_door_requirement === "puppies") {
            return this.has_puppies(snapshot, staticData, 99);
        }
        if (final_rest_door_requirement === "postcards") {
            const postcardCount = snapshot?.inventory?.["Postcard"] || 0;
            return postcardCount >= 10;
        }
        if (final_rest_door_requirement === "superbosses") {
            const requiredItems = [
                "Olympus Coliseum",
                "Neverland",
                "Agrabah",
                "Hollow Bastion",
                "Green Trinity",
                "Phil Cup",
                "Pegasus Cup",
                "Hercules Cup",
                "Entry Pass"
            ];

            for (const item of requiredItems) {
                if (!snapshot?.inventory?.[item] || snapshot.inventory[item] <= 0) {
                    return false;
                }
            }

            return (
                this.has_emblems(snapshot, staticData, keyblades_unlock_chests) &&
                this.has_all_magic_lvx(snapshot, staticData, 2) &&
                this.has_defensive_tools(snapshot, staticData) &&
                this.has_x_worlds(snapshot, staticData, 7, keyblades_unlock_chests)
            );
        }

        return false;
    }
};

export default kh1Logic;
