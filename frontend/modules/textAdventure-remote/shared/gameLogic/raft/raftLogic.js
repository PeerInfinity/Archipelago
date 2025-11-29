/**
 * Raft state management module.
 */
export const raftStateModule = {
  initializeState() {
    return {
      flags: [],
      events: [],
    };
  },

  loadSettings(gameState, settings) {
    return { ...gameState };
  },

  processEventItem(gameState, itemName) {
    return null;
  },

  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * Helper functions for Raft game logic.
 * These correspond to the helper functions defined in worlds/raft/Rules.py
 */
export const helperFunctions = {
  /**
   * Check if the player has an item (handles progressive items)
   */
  has(snapshot, staticData, itemName) {
    // First check if the item is directly in the inventory
    if (snapshot?.inventory && snapshot.inventory[itemName] > 0) {
      return true;
    }

    // Check if this item is part of a progressive item chain
    const progressionMapping = staticData?.progressionMapping;
    if (progressionMapping) {
      // Look through all progressive items to see if any contain this item
      for (const [progressiveName, progressionData] of Object.entries(progressionMapping)) {
        if (progressionData?.items) {
          // Find this item in the progression chain
          const itemEntry = progressionData.items.find(item => item.name === itemName);
          if (itemEntry) {
            // This item is part of a progressive chain
            // Check if the player has enough of the progressive item to reach this level
            const progressiveCount = snapshot?.inventory?.[progressiveName] || 0;
            if (progressiveCount >= itemEntry.level) {
              return true;
            }
          }
        }
      }
    }

    return false;
  },

  /**
   * Count how many of an item the player has
   */
  count(snapshot, staticData, itemName) {
    return snapshot?.inventory?.[itemName] || 0;
  },

  /**
   * Get the item placed at a specific location
   */
  location_item_name(snapshot, staticData, locationName) {
    const locations = staticData?.locations || [];
    let location;
    if (Array.isArray(locations)) {
      location = locations.find(loc => loc?.name === locationName);
    } else if (typeof locations === 'object') {
      location = locations[locationName];
    }

    if (!location || !location.item) {
      return null;
    }

    return [location.item.name, location.item.player];
  },

  // Item check helpers - these check if you can ACCESS/OBTAIN these items
  // Basic materials that are always available
  raft_itemcheck_Plank: () => true,
  raft_itemcheck_Plastic: () => true,
  raft_itemcheck_Clay: () => true,
  raft_itemcheck_Stone: () => true,
  raft_itemcheck_Rope: () => true,
  raft_itemcheck_Nail: () => true,
  raft_itemcheck_Scrap: () => true,
  raft_itemcheck_SeaVine: () => true,
  raft_itemcheck_Brick_Dry: () => true,
  raft_itemcheck_Thatch: () => true, // Palm Leaf
  raft_itemcheck_Placeable_GiantClam: () => true,

  // Materials from big islands
  raft_itemcheck_Leather(snapshot, staticData) {
    return helperFunctions.raft_big_islands_available(snapshot, staticData);
  },

  raft_itemcheck_Feather(snapshot, staticData) {
    return helperFunctions.raft_big_islands_available(snapshot, staticData) ||
           helperFunctions.raft_can_craft_birdNest(snapshot, staticData);
  },

  // Smelted items
  raft_itemcheck_MetalIngot(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData);
  },

  raft_itemcheck_CopperIngot(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData);
  },

  raft_itemcheck_VineGoo(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData);
  },

  raft_itemcheck_ExplosivePowder(snapshot, staticData) {
    return helperFunctions.raft_big_islands_available(snapshot, staticData) &&
           helperFunctions.raft_can_smelt_items(snapshot, staticData);
  },

  raft_itemcheck_Glass(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData);
  },

  // Crafted items
  raft_itemcheck_Bolt(snapshot, staticData) {
    return helperFunctions.raft_can_craft_bolt(snapshot, staticData);
  },

  raft_itemcheck_Hinge(snapshot, staticData) {
    return helperFunctions.raft_can_craft_hinge(snapshot, staticData);
  },

  raft_itemcheck_CircuitBoard(snapshot, staticData) {
    return helperFunctions.raft_can_craft_circuitBoard(snapshot, staticData);
  },

  raft_itemcheck_PlasticBottle_Empty(snapshot, staticData) {
    return helperFunctions.raft_can_craft_plasticBottle(snapshot, staticData);
  },

  raft_itemcheck_Wool(snapshot, staticData) {
    return helperFunctions.raft_can_capture_animals(snapshot, staticData) &&
           helperFunctions.raft_can_craft_shears(snapshot, staticData);
  },

  raft_itemcheck_HoneyComb(snapshot, staticData) {
    return helperFunctions.raft_can_access_balboa_island(snapshot, staticData);
  },

  raft_itemcheck_Jar_Bee(snapshot, staticData) {
    return helperFunctions.raft_can_access_balboa_island(snapshot, staticData) &&
           helperFunctions.raft_can_smelt_items(snapshot, staticData);
  },

  raft_itemcheck_Dirt(snapshot, staticData) {
    return helperFunctions.raft_can_get_dirt(snapshot, staticData);
  },

  raft_itemcheck_Egg(snapshot, staticData) {
    return helperFunctions.raft_can_capture_animals(snapshot, staticData);
  },

  raft_itemcheck_TitaniumIngot(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.raft_can_find_titanium(snapshot, staticData);
  },

  raft_itemcheck_Machete(snapshot, staticData) {
    return helperFunctions.raft_can_craft_machete(snapshot, staticData);
  },

  raft_itemcheck_Zipline_tool(snapshot, staticData) {
    return helperFunctions.raft_can_craft_ziplineTool(snapshot, staticData);
  },

  // Option-based helpers
  raft_paddleboard_mode_enabled(snapshot, staticData) {
    // Check if paddleboard mode is enabled in settings
    return staticData?.settings?.paddleboard_mode === true ||
           staticData?.settings?.paddleboard_mode === 1;
  },

  raft_big_islands_available(snapshot, staticData) {
    const bigIslandEarlyCrafting = staticData?.settings?.big_island_early_crafting === true ||
                                    staticData?.settings?.big_island_early_crafting === 1;
    return bigIslandEarlyCrafting ||
           helperFunctions.raft_can_access_radio_tower(snapshot, staticData);
  },

  // Smelting and crafting helpers
  raft_can_smelt_items(snapshot, staticData) {
    return helperFunctions.has(snapshot, staticData, "Smelter");
  },

  raft_can_craft_bolt(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Bolt");
  },

  raft_can_craft_hinge(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Hinge");
  },

  raft_can_craft_battery(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Battery");
  },

  raft_can_craft_circuitBoard(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Circuit board");
  },

  raft_can_craft_shovel(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Shovel") &&
           helperFunctions.raft_can_craft_bolt(snapshot, staticData);
  },

  raft_can_craft_reciever(snapshot, staticData) {
    return helperFunctions.raft_can_craft_circuitBoard(snapshot, staticData) &&
           helperFunctions.raft_can_craft_hinge(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Receiver");
  },

  raft_can_craft_antenna(snapshot, staticData) {
    return helperFunctions.raft_can_craft_circuitBoard(snapshot, staticData) &&
           helperFunctions.raft_can_craft_bolt(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Antenna");
  },

  raft_can_find_titanium(snapshot, staticData) {
    return helperFunctions.has(snapshot, staticData, "Metal detector") &&
           helperFunctions.raft_can_craft_battery(snapshot, staticData) &&
           helperFunctions.raft_can_craft_shovel(snapshot, staticData);
  },

  raft_can_craft_plasticBottle(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Empty bottle");
  },

  raft_can_fire_bow(snapshot, staticData) {
    return helperFunctions.has(snapshot, staticData, "Basic bow") &&
           helperFunctions.has(snapshot, staticData, "Stone arrow");
  },

  raft_can_craft_shears(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.raft_can_craft_hinge(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Shear");
  },

  raft_can_craft_birdNest(snapshot, staticData) {
    return helperFunctions.has(snapshot, staticData, "Birds nest");
  },

  raft_can_craft_engine(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.raft_can_craft_circuitBoard(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Engine");
  },

  raft_can_craft_steeringWheel(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.raft_can_craft_bolt(snapshot, staticData) &&
           helperFunctions.raft_can_craft_hinge(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Steering Wheel");
  },

  raft_can_craft_machete(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.raft_can_craft_bolt(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Machete");
  },

  raft_can_craft_ziplineTool(snapshot, staticData) {
    return helperFunctions.raft_can_craft_hinge(snapshot, staticData) &&
           helperFunctions.raft_can_craft_bolt(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Zipline tool");
  },

  raft_can_get_dirt(snapshot, staticData) {
    return helperFunctions.raft_can_craft_shovel(snapshot, staticData) &&
           helperFunctions.raft_big_islands_available(snapshot, staticData);
  },

  raft_can_craft_grassPlot(snapshot, staticData) {
    return helperFunctions.raft_can_get_dirt(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Grass plot");
  },

  raft_can_craft_netLauncher(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.raft_can_craft_bolt(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Net launcher");
  },

  raft_can_craft_netCanister(snapshot, staticData) {
    return helperFunctions.raft_can_smelt_items(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Net canister");
  },

  raft_can_capture_animals(snapshot, staticData) {
    return helperFunctions.raft_can_craft_netLauncher(snapshot, staticData) &&
           helperFunctions.raft_can_craft_netCanister(snapshot, staticData) &&
           helperFunctions.raft_can_craft_grassPlot(snapshot, staticData);
  },

  // Navigation and driving
  raft_can_navigate(snapshot, staticData) {
    // Sail is added by default and not considered in Archipelago
    return helperFunctions.raft_can_craft_battery(snapshot, staticData) &&
           helperFunctions.raft_can_craft_reciever(snapshot, staticData) &&
           helperFunctions.raft_can_craft_antenna(snapshot, staticData);
  },

  raft_can_drive(snapshot, staticData) {
    // The player can go wherever they want with the engine
    return (helperFunctions.raft_can_craft_engine(snapshot, staticData) &&
            helperFunctions.raft_can_craft_steeringWheel(snapshot, staticData)) ||
           helperFunctions.raft_paddleboard_mode_enabled(snapshot, staticData);
  },

  // Region access helpers
  raft_can_access_radio_tower(snapshot, staticData) {
    return helperFunctions.raft_can_navigate(snapshot, staticData);
  },

  raft_can_complete_radio_tower(snapshot, staticData) {
    return helperFunctions.raft_can_access_radio_tower(snapshot, staticData);
  },

  raft_can_access_vasagatan(snapshot, staticData) {
    return helperFunctions.raft_can_navigate(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Vasagatan Frequency");
  },

  raft_can_complete_vasagatan(snapshot, staticData) {
    return helperFunctions.raft_can_access_vasagatan(snapshot, staticData);
  },

  raft_can_access_balboa_island(snapshot, staticData) {
    return helperFunctions.raft_can_navigate(snapshot, staticData) &&
           helperFunctions.raft_can_drive(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Balboa Island Frequency");
  },

  raft_can_complete_balboa_island(snapshot, staticData) {
    return helperFunctions.raft_can_access_balboa_island(snapshot, staticData) &&
           helperFunctions.raft_can_craft_machete(snapshot, staticData);
  },

  raft_can_access_caravan_island(snapshot, staticData) {
    return helperFunctions.raft_can_navigate(snapshot, staticData) &&
           helperFunctions.raft_can_drive(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Caravan Island Frequency");
  },

  raft_can_complete_caravan_island(snapshot, staticData) {
    return helperFunctions.raft_can_access_caravan_island(snapshot, staticData) &&
           helperFunctions.raft_can_craft_ziplineTool(snapshot, staticData);
  },

  raft_can_access_tangaroa(snapshot, staticData) {
    return helperFunctions.raft_can_navigate(snapshot, staticData) &&
           helperFunctions.raft_can_drive(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Tangaroa Frequency");
  },

  raft_can_complete_tangaroa(snapshot, staticData) {
    return helperFunctions.raft_can_access_tangaroa(snapshot, staticData) &&
           helperFunctions.raft_can_craft_ziplineTool(snapshot, staticData);
  },

  raft_can_access_varuna_point(snapshot, staticData) {
    return helperFunctions.raft_can_navigate(snapshot, staticData) &&
           helperFunctions.raft_can_drive(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Varuna Point Frequency");
  },

  raft_can_complete_varuna_point(snapshot, staticData) {
    return helperFunctions.raft_can_access_varuna_point(snapshot, staticData) &&
           helperFunctions.raft_can_craft_ziplineTool(snapshot, staticData);
  },

  raft_can_access_temperance(snapshot, staticData) {
    return helperFunctions.raft_can_navigate(snapshot, staticData) &&
           helperFunctions.raft_can_drive(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Temperance Frequency");
  },

  raft_can_complete_temperance(snapshot, staticData) {
    return helperFunctions.raft_can_access_temperance(snapshot, staticData);
    // No zipline required on Temperance
  },

  raft_can_access_utopia(snapshot, staticData) {
    return helperFunctions.raft_can_navigate(snapshot, staticData) &&
           helperFunctions.raft_can_drive(snapshot, staticData) &&
           // Access checks are to prevent frequencies for other
           // islands from appearing in Utopia
           helperFunctions.raft_can_access_radio_tower(snapshot, staticData) &&
           helperFunctions.raft_can_access_vasagatan(snapshot, staticData) &&
           helperFunctions.raft_can_access_balboa_island(snapshot, staticData) &&
           helperFunctions.raft_can_access_caravan_island(snapshot, staticData) &&
           helperFunctions.raft_can_access_tangaroa(snapshot, staticData) &&
           helperFunctions.raft_can_access_varuna_point(snapshot, staticData) &&
           helperFunctions.raft_can_access_temperance(snapshot, staticData) &&
           helperFunctions.has(snapshot, staticData, "Utopia Frequency") &&
           // Shovels are available but we don't want to softlock players
           helperFunctions.raft_can_craft_shovel(snapshot, staticData);
  },

  raft_can_complete_utopia(snapshot, staticData) {
    return helperFunctions.raft_can_access_utopia(snapshot, staticData) &&
           helperFunctions.raft_can_craft_ziplineTool(snapshot, staticData);
  },
};
