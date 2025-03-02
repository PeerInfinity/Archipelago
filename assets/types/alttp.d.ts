// Type definitions for ALTTP game data structures
// @ts-check

/**
 * The complete rules data structure exported from Python
 */
export interface ALTTPRulesData {
  /** Version of the rules format */
  version: number;
  /** Complete region graph by player */
  regions: Record<string, Record<string, RegionData>>;
  /** Item data by player */
  items: Record<string, Record<string, ItemData>>;
  /** Item groups by player */
  item_groups: Record<string, string[]>;
  /** Progressive item mapping data */
  progression_mapping: Record<string, Record<string, ProgressionData>>;
  /** Game mode by player */
  mode: Record<string, GameMode>;
  /** Game settings by player */
  settings: Record<string, GameSettings>;
  /** Start region information by player */
  start_regions: Record<string, StartRegionData>;
}

/**
 * Complete data for a single region
 */
export interface RegionData {
  /** Region name */
  name: string;
  /** Region type (e.g., "Region", "Dungeon", "Shop") */
  type: string;
  /** Player this region belongs to */
  player: number;
  /** Whether region is in light world */
  is_light_world: boolean;
  /** Whether region is in dark world */
  is_dark_world: boolean;
  /** Incoming connections to this region */
  entrances: EntranceData[];
  /** Outgoing connections from this region */
  exits: ExitData[];
  /** Locations in this region */
  locations: LocationData[];
  /** Dungeon data if this is a dungeon region */
  dungeon: DungeonData | null;
  /** Shop data if this is a shop region */
  shop: ShopData | null;
  /** Whether time passes in this region */
  time_passes: boolean;
  /** Whether this region counts towards chest totals */
  provides_chest_count: boolean;
  /** Additional rules specific to this region */
  region_rules: Rule[];
}

/**
 * Data for an entrance (incoming connection)
 */
export interface EntranceData {
  /** Entrance name */
  name: string;
  /** Name of region this entrance is in */
  parent_region: string;
  /** Rule that must be satisfied to use this entrance */
  access_rule: Rule | null;
  /** Region this entrance connects to */
  connected_region: string | null;
  /** Reverse entrance if bidirectional */
  reverse: string | null;
  /** Whether this entrance is assumed available */
  assumed: boolean;
  /** Entrance type */
  type: string;
  /** Memory addresses for this entrance */
  addresses: number[] | null;
}

/**
 * Data for an exit (outgoing connection)
 */
export interface ExitData {
  /** Exit name */
  name: string;
  /** Region this exit connects to */
  connected_region: string | null;
  /** Rule that must be satisfied to use this exit */
  access_rule: Rule | null;
  /** Exit type */
  type: string;
}

/**
 * Data for a location
 */
export interface LocationData {
  /** Location name */
  name: string;
  /** Memory address if applicable */
  address: number | null;
  /** Crystal number if applicable */
  crystal: number | null;
  /** Rule that must be satisfied to access this location */
  access_rule: Rule | null;
  /** Rule that must be satisfied by items placed here */
  item_rule: Rule | null;
  /** Progress type (e.g., "priority", "advancement", "useful") */
  progress_type: string | null;
  /** Whether this is an event location */
  event: boolean;
  /** Whether this location is locked */
  locked: boolean;
  /** Item placed at this location */
  item: PlacedItemData | null;
}

/**
 * Data for a dungeon
 */
export interface DungeonData {
  /** Dungeon name */
  name: string;
  /** Regions that are part of this dungeon */
  regions: string[];
  /** Boss data if applicable */
  boss: {
    /** Boss name */
    name: string;
    /** Rule for defeating this boss */
    defeat_rule: Rule | null;
  } | null;
  /** Rule for medallion check if applicable */
  medallion_check: Rule | null;
}

/**
 * Data for a shop
 */
export interface ShopData {
  /** Shop type */
  type: string;
  /** Items available in shop */
  inventory: ShopItemData[];
  /** Whether shop is locked */
  locked: boolean;
  /** Region containing shop */
  region_name: string;
  /** Location containing shop */
  location_name: string;
}

/**
 * Data for a shop item
 */
export interface ShopItemData {
  /** Item name */
  item: string;
  /** Item price */
  price: number;
  /** Maximum quantity available */
  max: number;
  /** Replacement item name */
  replacement: string | null;
  /** Replacement item price */
  replacement_price: number | null;
}

/**
 * Data for a placed item
 */
export interface PlacedItemData {
  /** Item name */
  name: string;
  /** Player this item belongs to */
  player: number;
  /** Whether item is progression */
  advancement: boolean;
  /** Whether item is priority */
  priority: boolean;
  /** Item type */
  type: string;
  /** Item code if applicable */
  code: number | null;
}

/**
 * Data for an item
 */
export interface ItemData {
  /** Item name */
  name: string;
  /** Item ID if applicable */
  id: number | null;
  /** Groups this item belongs to */
  groups: string[];
  /** Whether item is progression */
  advancement: boolean;
  /** Whether item is priority */
  priority: boolean;
  /** Whether item is useful */
  useful: boolean;
  /** Whether item is a trap */
  trap: boolean;
}

/**
 * Data for progressive items
 */
export interface ProgressionData {
  /** List of items in progression */
  items: {
    /** Item name */
    name: string;
    /** Level in progression */
    level: number;
  }[];
  /** Base item name */
  base_item: string;
}

/**
 * Game settings
 */
export interface GameSettings {
  /** Dark room logic setting */
  dark_room_logic: string;
  /** Whether damage can be taken */
  can_take_damage: boolean;
  /** Whether retro bow is enabled */
  retro_bow: boolean;
  /** Whether swordless mode is enabled */
  swordless: boolean;
  /** Whether enemy shuffle is enabled */
  enemy_shuffle: boolean;
  /** Enemy health setting */
  enemy_health: string;
  /** Enemy damage setting */
  enemy_damage: string;
  /** Whether pot shuffle is enabled */
  pot_shuffle: boolean;
  /** Dungeon counter settings */
  dungeon_counters: string;
  /** Whether glitch boots are enabled */
  glitch_boots: boolean;
  /** Glitches required setting */
  glitches_required: string;
  /** Accessibility setting */
  accessibility: string;
  /** Placement file if applicable */
  placement_file: string | null;
}

/**
 * Data about available start regions
 */
export interface StartRegionData {
  /** Default start regions */
  default: string[];
  /** All available start regions */
  available: {
    /** Region name */
    name: string;
    /** Region type */
    type: string;
    /** Dungeon name if applicable */
    dungeon: string | null;
    /** Whether in light world */
    is_light_world: boolean;
    /** Whether in dark world */
    is_dark_world: boolean;
  }[];
}

/**
 * Game mode type
 */
export type GameMode = 'standard' | 'open' | 'inverted';

/**
 * Base rule interface - all rules extend this
 */
export interface Rule {
  /** Rule type */
  type: string;
}

/**
 * Item check rule
 */
export interface ItemCheckRule extends Rule {
  type: 'item_check';
  /** Item being checked */
  item: string;
}

/**
 * Count check rule
 */
export interface CountCheckRule extends Rule {
  type: 'count_check';
  /** Item being counted */
  item: string;
  /** Required count */
  count: number;
}

/**
 * Group check rule
 */
export interface GroupCheckRule extends Rule {
  type: 'group_check';
  /** Group being checked */
  group: string;
}

/**
 * Helper function rule
 */
export interface HelperRule extends Rule {
  type: 'helper';
  /** Helper function name */
  name: string;
  /** Helper function arguments */
  args: any[];
}

/**
 * AND rule
 */
export interface AndRule extends Rule {
  type: 'and';
  /** Rules that must all be satisfied */
  conditions: Rule[];
}

/**
 * OR rule
 */
export interface OrRule extends Rule {
  type: 'or';
  /** Rules where at least one must be satisfied */
  conditions: Rule[];
}

/**
 * State method rule
 */
export interface StateMethodRule extends Rule {
  type: 'state_method';
  /** Method name */
  method: string;
  /** Method arguments */
  args: any[];
}

/**
 * Constant rule
 */
export interface ConstantRule extends Rule {
  type: 'constant';
  /** Constant value */
  value: boolean;
}
