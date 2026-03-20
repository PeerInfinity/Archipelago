/**
 * Journey to Ascension - Game Data (v0.5.0)
 * Extracted from the game source for simulation purposes
 */

// Skill types (matching game's SkillType enum)
// Note: indices 6 (REMOVED/Survival) and 10 (REMOVED2/Druid) are placeholders
export const SkillType = {
    Charisma: 0,
    Study: 1,
    Combat: 2,
    Search: 3,
    Subterfuge: 4,
    Crafting: 5,
    REMOVED: 6,     // Was Survival, removed in v0.5.0
    Travel: 7,
    Magic: 8,
    Fortitude: 9,
    REMOVED2: 10,   // Was Druid, removed in v0.5.0
    Ascension: 11,
    Count: 12,
};

// Active skills (excludes REMOVED placeholders)
export const SKILLS = [
    SkillType.Charisma,
    SkillType.Study,
    SkillType.Combat,
    SkillType.Search,
    SkillType.Subterfuge,
    SkillType.Crafting,
    SkillType.Travel,
    SkillType.Magic,
    SkillType.Fortitude,
    SkillType.Ascension,
];

export const SKILL_NAMES = [
    'Charisma', 'Study', 'Combat', 'Search', 'Subterfuge', 'Crafting',
    'REMOVED', 'Travel', 'Magic', 'Fortitude', 'REMOVED2', 'Ascension'
];

// Skill XP multipliers (higher = slower to level)
export const SKILL_XP_MULT = {
    [SkillType.Charisma]: 1,
    [SkillType.Study]: 1,
    [SkillType.Combat]: 5,
    [SkillType.Search]: 1,
    [SkillType.Subterfuge]: 1,
    [SkillType.Crafting]: 1,
    [SkillType.REMOVED]: 1,
    [SkillType.Travel]: 1,
    [SkillType.Magic]: 3,
    [SkillType.Fortitude]: 5,
    [SkillType.REMOVED2]: 1,
    [SkillType.Ascension]: 200,
};

// Task types (matching game's TaskType enum)
export const TaskType = {
    Normal: 0,
    Travel: 1,
    Mandatory: 2,
    Prestige: 3,
    Boss: 4,
};

// Perk types (matching game's PerkType enum)
export const PerkType = {
    Reading: 0,
    Writing: 1,
    VillagerGratitude: 2,
    Amulet: 3,
    EnergySpell: 4,
    ExperiencedTraveler: 5,
    UndergroundConnection: 6,
    MinorTimeCompression: 7,
    HighAltitudeClimbing: 8,
    DELETED: 9,
    VillageHero: 10,
    Attunement: 11,
    GoblinScourge: 12,
    SunkenTreasure: 13,
    LostTemple: 14,
    WalkWithoutRhythm: 15,
    ReflectionsOnTheJourney: 16,
    PurgedBureaucracy: 17,
    DeepSeaDiving: 18,
    EnergeticMemory: 19,
    TheWorm: 20,
    TowerOfBabel: 21,
    Awakening: 22,
    MajorTimeCompression: 23,
    HideInPlainSight: 24,
    DreamPrism: 25,
    DragonKillingPlan: 26,
    UnifiedTheoryOfMagic: 27,
    Headmaster: 28,
    DragonSlayer: 29,
    UnderstandingTheReset: 30,
    OvercameFearOfSkydiving: 31,
    DestroyedTheRing: 32,
    GazedBeyondTheVeil: 33,
    UndergroundForge: 34,
    UnderstandingLeviathan: 35,
    PurgedDemonicInfluences: 36,
    DefiedTheGods: 37,
    SurvivedTheVoid: 38,
    CommunedWithDamnedSouls: 39,
    DivinePower: 40,
    Count: 41,
};

export const PERK_NAMES = [
    'Reading', 'Writing', 'VillagerGratitude', 'Amulet', 'EnergySpell',
    'ExperiencedTraveler', 'UndergroundConnection', 'MinorTimeCompression',
    'HighAltitudeClimbing', 'DELETED', 'VillageHero', 'Attunement',
    'GoblinScourge', 'SunkenTreasure', 'LostTemple', 'WalkWithoutRhythm',
    'ReflectionsOnTheJourney', 'PurgedBureaucracy', 'DeepSeaDiving',
    'EnergeticMemory', 'TheWorm', 'TowerOfBabel', 'Awakening',
    'MajorTimeCompression', 'HideInPlainSight', 'DreamPrism',
    'DragonKillingPlan', 'UnifiedTheoryOfMagic', 'Headmaster', 'DragonSlayer',
    'UnderstandingTheReset', 'OvercameFearOfSkydiving', 'DestroyedTheRing',
    'GazedBeyondTheVeil', 'UndergroundForge', 'UnderstandingLeviathan',
    'PurgedDemonicInfluences', 'DefiedTheGods', 'SurvivedTheVoid',
    'CommunedWithDamnedSouls', 'DivinePower'
];

// Perk definitions with skill modifiers
export const PERKS = {
    [PerkType.Reading]: {
        name: 'How to Read',
        skillModifiers: { [SkillType.Study]: 0.5 },
        special: null,
    },
    [PerkType.Writing]: {
        name: 'How to Write',
        skillModifiers: {},
        special: 'xp_bonus_50',
    },
    [PerkType.VillagerGratitude]: {
        name: 'Villager Gratitude',
        skillModifiers: { [SkillType.Charisma]: 0.5 },
        special: null,
    },
    [PerkType.Amulet]: {
        name: 'Mysterious Amulet',
        skillModifiers: { [SkillType.Magic]: 0.5 },
        special: 'automation',
    },
    [PerkType.EnergySpell]: {
        name: 'Energetic Spell',
        skillModifiers: {},
        special: 'max_energy_50',
    },
    [PerkType.ExperiencedTraveler]: {
        name: 'Experienced Traveler',
        skillModifiers: { [SkillType.Travel]: 0.5 },
        special: null,
    },
    [PerkType.UndergroundConnection]: {
        name: 'Underground Connection',
        skillModifiers: { [SkillType.Subterfuge]: 0.4, [SkillType.Charisma]: 0.2 },
        special: null,
    },
    [PerkType.MinorTimeCompression]: {
        name: 'Minor Time Compression',
        skillModifiers: {},
        special: 'minor_time_compression',
    },
    [PerkType.HighAltitudeClimbing]: {
        name: 'High Altitude Climbing',
        skillModifiers: {},
        special: 'energy_reduction_20',
    },
    [PerkType.VillageHero]: {
        name: 'Village Hero',
        skillModifiers: { [SkillType.Charisma]: 0.4, [SkillType.Combat]: 0.2 },
        special: null,
    },
    [PerkType.Attunement]: {
        name: 'Attunement',
        skillModifiers: {},
        special: 'attunement',
    },
    [PerkType.GoblinScourge]: {
        name: 'Goblin Scourge',
        skillModifiers: { [SkillType.Combat]: 0.3, [SkillType.Fortitude]: 0.3 },
        special: null,
    },
    [PerkType.SunkenTreasure]: {
        name: 'Sunken Treasure',
        skillModifiers: { [SkillType.Search]: 0.3, [SkillType.Fortitude]: 0.3 },
        special: null,
    },
    [PerkType.LostTemple]: {
        name: 'Found Lost Temple',
        skillModifiers: { [SkillType.Magic]: 0.5 },
        special: null,
    },
    [PerkType.WalkWithoutRhythm]: {
        name: 'Walk Without Rhythm',
        skillModifiers: { [SkillType.Subterfuge]: 0.4, [SkillType.Travel]: 0.2 },
        special: null,
    },
    [PerkType.ReflectionsOnTheJourney]: {
        name: 'Reflections on the Journey',
        skillModifiers: {},
        special: 'reflections',
    },
    [PerkType.PurgedBureaucracy]: {
        name: 'Purged Bureaucracy',
        skillModifiers: { [SkillType.Charisma]: 0.3, [SkillType.Crafting]: 0.3 },
        special: null,
    },
    [PerkType.DeepSeaDiving]: {
        name: 'Deep Sea Diving',
        skillModifiers: { [SkillType.Search]: 0.3, [SkillType.Magic]: 0.3 },
        special: null,
    },
    [PerkType.EnergeticMemory]: {
        name: 'Energetic Memory',
        skillModifiers: {},
        special: 'energetic_memory',
    },
    [PerkType.TheWorm]: {
        name: 'The Worm',
        skillModifiers: { [SkillType.Charisma]: 0.5 },
        special: null,
    },
    [PerkType.TowerOfBabel]: {
        name: 'Tower of Babel',
        skillModifiers: { [SkillType.Charisma]: 0.3, [SkillType.Ascension]: 0.3 },
        special: null,
    },
    [PerkType.Awakening]: {
        name: 'Awakening',
        skillModifiers: {},
        special: 'divine_spark_bonus',
    },
    [PerkType.MajorTimeCompression]: {
        name: 'Major Time Compression',
        skillModifiers: {},
        special: 'major_time_compression',
    },
    [PerkType.HideInPlainSight]: {
        name: 'Hide in Plain Sight',
        skillModifiers: { [SkillType.Subterfuge]: 0.5 },
        special: null,
    },
    [PerkType.DreamPrism]: {
        name: 'Dream Prism',
        skillModifiers: { [SkillType.Magic]: 0.3, [SkillType.Travel]: 0.3 },
        special: null,
    },
    [PerkType.DragonKillingPlan]: {
        name: 'Dragon Killing Plan',
        skillModifiers: { [SkillType.Combat]: 0.5 },
        special: null,
    },
    [PerkType.UnifiedTheoryOfMagic]: {
        name: 'Unified Theory of Magic',
        skillModifiers: {},
        special: 'unified_theory',
    },
    [PerkType.Headmaster]: {
        name: 'Headmaster',
        skillModifiers: { [SkillType.Magic]: 0.3, [SkillType.Study]: 0.3 },
        special: null,
    },
    [PerkType.DragonSlayer]: {
        name: 'Dragon Slayer',
        skillModifiers: { [SkillType.Combat]: 0.3, [SkillType.Charisma]: 0.3 },
        special: null,
    },
    [PerkType.UnderstandingTheReset]: {
        name: 'Understanding of the Reset',
        skillModifiers: {},
        special: 'understanding_reset',
    },
    [PerkType.OvercameFearOfSkydiving]: {
        name: 'Overcame Fear of Skydiving',
        skillModifiers: { [SkillType.Combat]: 0.3, [SkillType.Fortitude]: 0.3 },
        special: null,
    },
    [PerkType.DestroyedTheRing]: {
        name: 'Destroyed the Ring',
        skillModifiers: { [SkillType.Ascension]: 1.0, [SkillType.Charisma]: 0.5 },
        special: null,
    },
    [PerkType.GazedBeyondTheVeil]: {
        name: 'Gazed Beyond the Veil',
        skillModifiers: {},
        special: 'xp_bonus_100',
    },
    [PerkType.UndergroundForge]: {
        name: 'Studied Underground Forge',
        skillModifiers: { [SkillType.Crafting]: 0.5 },
        special: null,
    },
    [PerkType.UnderstandingLeviathan]: {
        name: 'Understanding Leviathan',
        skillModifiers: { [SkillType.Study]: 0.3, [SkillType.Combat]: 0.3 },
        special: null,
    },
    [PerkType.PurgedDemonicInfluences]: {
        name: 'Purged Demonic Influences',
        skillModifiers: { [SkillType.Charisma]: 0.3, [SkillType.Fortitude]: 0.3 },
        special: null,
    },
    [PerkType.DefiedTheGods]: {
        name: 'Defied the Gods',
        skillModifiers: { [SkillType.Ascension]: 1.0 },
        special: 'divine_spark_bonus_25',
    },
    [PerkType.SurvivedTheVoid]: {
        name: 'Survived the Void',
        skillModifiers: { [SkillType.Ascension]: 0.3, [SkillType.Fortitude]: 0.3 },
        special: null,
    },
    [PerkType.CommunedWithDamnedSouls]: {
        name: 'Communed with Damned Souls',
        skillModifiers: {},
        special: 'double_attunement',
    },
    [PerkType.DivinePower]: {
        name: 'Divine Power',
        skillModifiers: { [SkillType.Ascension]: 0.25, [SkillType.Combat]: 0.25, [SkillType.Magic]: 0.25, [SkillType.Study]: 0.25 },
        special: null,
    },
};

// Item types - full list from the game (v0.5.0)
export const ItemType = {
    Food: 0,
    Arrow: 1,
    Coin: 2,
    Mushroom: 3,
    GoblinSupplies: 4,
    TravelEquipment: 5,
    Book: 6,
    ScrollOfHaste: 7,
    GoblinWaraxe: 8,
    CampingEquipment: 9,    // Renamed from FiremakingKit
    Reagents: 10,
    MagicalRoots: 11,
    GoblinTreasure: 12,
    Fish: 13,
    BanditWeapons: 14,
    Cactus: 15,
    CityChain: 16,
    WerewolfFur: 17,
    OasisWater: 18,
    Calamari: 19,
    MysticIncense: 20,
    OracleBones: 21,
    WormHideCoat: 22,
    DjinnLamp: 23,
    Dreamcatcher: 24,
    MagicEssence: 25,
    CraftingRecipe: 26,
    KnightlyBoots: 27,
    DragonScale: 28,
    CaveInsects: 29,
    MagicalVessel: 30,
    MagicRing: 31,
    BottledLightning: 32,
    HeatEssence: 33,
    DivineNotes: 34,
    GriffinQuill: 35,
    WingsOfShadow: 36,
    RitualSymbol: 37,
    Glasses: 38,
    Light: 39,
    MadContraption: 40,
    Count: 41,
};

// Artifact constants
export const HASTE_MULT = 5;  // ScrollOfHaste makes next task 5x faster
export const MAGIC_RING_MULT = 5;  // MagicRing gives 5x XP (was 3 in v0.2)
export const BOTTLED_LIGHTNING_MULT = 2;  // BottledLightning makes next boss 2x faster

// Artifacts - special single-use items with powerful effects
export const ARTIFACTS = [ItemType.ScrollOfHaste, ItemType.Dreamcatcher, ItemType.MagicRing, ItemType.BottledLightning];

// Energy-giving items (consumable for energy)
export const ENERGY_ITEMS = {
    [ItemType.Food]: 5,
    [ItemType.Fish]: 10,
    [ItemType.Calamari]: 50,
    [ItemType.CaveInsects]: 5,
};

// Item skill modifiers - bonus to skill progress when consumed
// Format: { [skill]: multiplier } where multiplier is added to skill progress
export const ITEM_SKILL_MODIFIERS = {
    [ItemType.Arrow]: { [SkillType.Combat]: 0.15 },
    [ItemType.Coin]: { [SkillType.Charisma]: 0.2 },
    [ItemType.Mushroom]: { [SkillType.Magic]: 0.2, [SkillType.Search]: 0.2 },
    [ItemType.GoblinSupplies]: { [SkillType.Subterfuge]: 0.15, [SkillType.Combat]: 0.1, [SkillType.Fortitude]: 0.1 },
    [ItemType.TravelEquipment]: { [SkillType.Travel]: 0.1, [SkillType.Fortitude]: 0.1 },
    [ItemType.Book]: { [SkillType.Study]: 0.1, [SkillType.Magic]: 0.1 },
    [ItemType.GoblinWaraxe]: { [SkillType.Combat]: 1 },
    [ItemType.CampingEquipment]: { [SkillType.Fortitude]: 0.15 },
    [ItemType.Reagents]: { [SkillType.Magic]: 0.2, [SkillType.Crafting]: 0.1 },
    [ItemType.MagicalRoots]: { [SkillType.Fortitude]: 0.2, [SkillType.Magic]: 0.1 },
    [ItemType.GoblinTreasure]: { [SkillType.Subterfuge]: 0.5, [SkillType.Magic]: 0.5 },
    [ItemType.BanditWeapons]: { [SkillType.Subterfuge]: 0.1, [SkillType.Combat]: 0.2 },
    [ItemType.Cactus]: { [SkillType.Fortitude]: 0.15 },
    [ItemType.CityChain]: { [SkillType.Charisma]: 0.5, [SkillType.Subterfuge]: 0.5 },
    [ItemType.WerewolfFur]: { [SkillType.Charisma]: 0.2, [SkillType.Fortitude]: 0.2 },
    [ItemType.OasisWater]: { [SkillType.Magic]: 0.2, [SkillType.Fortitude]: 0.1 },
    [ItemType.MysticIncense]: { [SkillType.Ascension]: 0.1 },
    [ItemType.OracleBones]: { [SkillType.Search]: 0.2, [SkillType.Magic]: 0.2, [SkillType.Ascension]: 0.1, [SkillType.Travel]: 0.1 },
    [ItemType.WormHideCoat]: { [SkillType.Fortitude]: 1 },
    [ItemType.DjinnLamp]: { [SkillType.Ascension]: 0.3, [SkillType.Magic]: 0.3 },
    [ItemType.MagicEssence]: { [SkillType.Magic]: 4 },
    [ItemType.CraftingRecipe]: { [SkillType.Crafting]: 0.3 },
    [ItemType.KnightlyBoots]: { [SkillType.Combat]: 0.2, [SkillType.Fortitude]: 0.2 },
    [ItemType.DragonScale]: { [SkillType.Combat]: 0.5, [SkillType.Fortitude]: 0.5 },
    [ItemType.MagicalVessel]: { [SkillType.Ascension]: 0.3 },
    [ItemType.HeatEssence]: { [SkillType.Charisma]: 1.0 },
    [ItemType.DivineNotes]: { [SkillType.Study]: 0.3, [SkillType.Search]: 0.3, [SkillType.Travel]: 0.1 },
    [ItemType.GriffinQuill]: { [SkillType.Study]: 1.0 },
    [ItemType.WingsOfShadow]: { [SkillType.Ascension]: 5.0, [SkillType.Travel]: 1.0 },
    [ItemType.RitualSymbol]: { [SkillType.Ascension]: 1.0 },
    [ItemType.Glasses]: { [SkillType.Search]: 1.0 },
    [ItemType.Light]: { [SkillType.Search]: 0.5, [SkillType.Travel]: 0.5, [SkillType.Fortitude]: 0.5 },
    [ItemType.MadContraption]: { [SkillType.Study]: 1, [SkillType.Crafting]: 1, [SkillType.Combat]: 1 },
};

// Boss unlock map - which hidden task each boss unlocks
export const BOSS_UNLOCKS = {
    36: 37,   // Goblin Warlord -> Save the Village
    47: 48,   // Angry Ent -> Gather Magical Roots
    57: 58,   // Goblin Chieftain -> Wipe Out Goblins
    67: 68,   // Bandits -> Loot Bandit Camp
    87: 89,   // Corrupt Mayor -> Purge Corrupt Bureaucracy
    98: 99,   // Werewolf -> Gather Shed Fur from Lair
    117: 118, // Kraken -> Explore Kraken's Lair
    127: 128, // Horde of Lizardfolk -> Steal Their Oracle Bones
    137: 138, // Giant Sandworm -> Learn to Dance the Worm
    147: 148, // Sleepy Djinn -> Find More Lamps
    167: 168, // The Weaver of Dreams -> Contain the Dream
    177: 178, // Mage's Guild Headmaster -> Become Honorary Headmaster
    187: 188, // Dragon Spawn -> Gather Dragon Scales
    197: 198, // Dragon -> Hunt Down the Dragon's Spawn
    217: 218, // Griffin -> Collect Quills
    227: 228, // Winged Demon -> Purge Demonic Influence
    237: 238, // Floating Ball of Eyes -> Steal Glasses
    247: 248, // Half-Kraken -> Commune with Damned Souls
    267: 268, // PLACEHOLDER (Void boss) -> PLACEHOLDER
    277: 278, // PLACEHOLDER (Return boss) -> PLACEHOLDER
};

// Prestige unlock types (matching game's PrestigeUnlockType enum)
export const PrestigeUnlockType = {
    PermanentAutomation: 0,
    DivineInspiration: 1,
    LookInTheMirror: 2,
    FullyAttuned: 3,
    TranscendantMemory: 4,
    DivineSpeed: 5,
    MasteryOfTime: 6,
    SeeBeyondTheVeil: 7,
    Perky: 8,
    CompulsiveNotetaking: 9,
    CraftingBreakthrough: 10,
    DivinePlaceholder4: 11,
    Count: 12,
};

// Prestige repeatable types (matching game's PrestigeRepeatableType enum)
export const PrestigeRepeatableType = {
    DivineKnowledge: 0,
    UnlimitedPower: 1,
    DivineAppetite: 2,
    GottaGoFast: 3,
    DivineLightning: 4,
    TranscendantAptitude: 5,
    Energized: 6,
    Deenergized: 7,
    MandatorySchmandatory: 8,
    DivineAttunement: 9,
    SpiteTheGods: 10,
    DivinerKnowledge: 11,
    Count: 12,
};

// Prestige constants
export const GOTTA_GO_FAST_BASE = 1.1;
export const PERKY_BASE = 1.01;
export const MANDATORY_SCHMANDATORY_MULT = 0.2;
export const SPITE_THE_GODS_MULT = 0.25;
export const DIVINE_KNOWLEDGE_MULT = 0.5;
export const DIVINER_KNOWLEDGE_MULT = 1;
export const DEENERGIZED_BASE = 0.9;

// Zone data extracted from zones.ts (v0.5.0)
// Changes from v0.2: Survival->Fortitude/Search/Crafting, Druid->Magic,
// many cost/xpMult changes, new tasks/perks, boss costs use exponent 4
export const ZONES = [
    {
        id: 0,
        name: "The Village",
        tasks: [
            { id: 10, name: "Join the Watch", type: TaskType.Travel, costMult: 4, skills: [SkillType.Charisma], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 11, name: "Read Noticeboard", type: TaskType.Mandatory, costMult: 3, skills: [SkillType.Study], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 12, name: "Train with Weapons", type: TaskType.Mandatory, costMult: 1, skills: [SkillType.Combat], xpMult: 3, maxReps: 3, perk: null, item: null },
            { id: 13, name: "Learn How to Read", type: TaskType.Normal, costMult: 8, skills: [SkillType.Study], xpMult: 0.5, maxReps: 1, perk: PerkType.Reading, item: null },
            { id: 14, name: "Beg for Food", type: TaskType.Normal, costMult: 1, skills: [SkillType.Charisma], xpMult: 2, maxReps: 10, perk: null, item: ItemType.Food },
            { id: 15, name: "Hide and Seek", type: TaskType.Normal, costMult: 2, skills: [SkillType.Search, SkillType.Subterfuge], xpMult: 1.5, maxReps: 3, perk: null, item: null },
            { id: 16, name: "Observe Surroundings", type: TaskType.Normal, costMult: 1, skills: [SkillType.Study], xpMult: 3, maxReps: 5, perk: null, item: null },
        ],
    },
    {
        id: 1,
        name: "The Village Watch",
        tasks: [
            { id: 20, name: "Notice Smoke in the Distance", type: TaskType.Travel, costMult: 3, skills: [SkillType.Search], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 21, name: "Learn Routines", type: TaskType.Mandatory, costMult: 1.3, skills: [SkillType.Study], xpMult: 1, maxReps: 4, perk: null, item: null },
            { id: 22, name: "Deal with Drunkards", type: TaskType.Mandatory, costMult: 1.6, skills: [SkillType.Charisma], xpMult: 1, maxReps: 2, perk: null, item: null },
            { id: 25, name: "Fletch Arrows", type: TaskType.Normal, costMult: 0.4, skills: [SkillType.Crafting], xpMult: 1, maxReps: 5, perk: null, item: ItemType.Arrow },
            { id: 27, name: "Learn How to Write", type: TaskType.Normal, costMult: 16, skills: [SkillType.Study], xpMult: 0.2, maxReps: 1, perk: PerkType.Writing, item: null },
            { id: 23, name: "Chit-chat", type: TaskType.Normal, costMult: 1, skills: [SkillType.Charisma], xpMult: 3, maxReps: 3, perk: null, item: null },
            { id: 24, name: "Sparring", type: TaskType.Normal, costMult: 1.5, skills: [SkillType.Combat], xpMult: 5, maxReps: 4, perk: null, item: null },
            { id: 26, name: "Daydream About Leaving", type: TaskType.Normal, costMult: 1, skills: [SkillType.Travel, SkillType.Search], xpMult: 3, maxReps: 6, perk: null, item: null },
        ],
    },
    {
        id: 2,
        name: "The Raid",
        tasks: [
            { id: 30, name: "Enter the Wilderness", type: TaskType.Travel, costMult: 2, skills: [SkillType.Travel], xpMult: 0.5, maxReps: 1, perk: null, item: null },
            { id: 31, name: "Fight a Goblin", type: TaskType.Mandatory, costMult: 3, skills: [SkillType.Combat], xpMult: 3, maxReps: 1, perk: null, item: null },
            { id: 32, name: "Warn Villagers", type: TaskType.Mandatory, costMult: 3, skills: [SkillType.Charisma], xpMult: 1, maxReps: 3, perk: null, item: null },
            { id: 33, name: "Loot the Fallen", type: TaskType.Normal, costMult: 0.4, skills: [SkillType.Search], xpMult: 1, maxReps: 4, perk: null, item: ItemType.Coin },
            { id: 34, name: "Rescue Villager", type: TaskType.Normal, costMult: 1.2, skills: [SkillType.Subterfuge, SkillType.Search], xpMult: 1.5, maxReps: 3, perk: PerkType.VillagerGratitude, item: null },
            { id: 35, name: "Treat Villager Wounds", type: TaskType.Normal, costMult: 1.5, skills: [SkillType.Crafting], xpMult: 3, maxReps: 3, perk: null, item: null },
            { id: 36, name: "Goblin Warlord", type: TaskType.Boss, costMult: 400, skills: [SkillType.Combat], xpMult: 1, maxReps: 1, perk: null, item: ItemType.GoblinWaraxe },
            { id: 37, name: "Save the Village", type: TaskType.Normal, costMult: 1300, skills: [SkillType.Combat, SkillType.Magic], xpMult: 1, maxReps: 1, perk: PerkType.VillageHero, item: null, hidden: true },
        ],
    },
    {
        id: 3,
        name: "The Wilderness",
        tasks: [
            { id: 40, name: "Find Cave Entrance", type: TaskType.Travel, costMult: 2, skills: [SkillType.Travel, SkillType.Search], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 41, name: "Look for Tracks", type: TaskType.Mandatory, costMult: 0.5, skills: [SkillType.Search, SkillType.Subterfuge], xpMult: 1, maxReps: 3, perk: null, item: null },
            { id: 42, name: "Survive the Night", type: TaskType.Mandatory, costMult: 1, skills: [SkillType.Fortitude, SkillType.Crafting], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 43, name: "Find an Amulet", type: TaskType.Mandatory, costMult: 2.5, skills: [SkillType.Search, SkillType.Magic], xpMult: 0.1, maxReps: 1, perk: PerkType.Amulet, item: null },
            { id: 45, name: "Forage for Mushrooms", type: TaskType.Normal, costMult: 0.25, skills: [SkillType.Search, SkillType.Fortitude], xpMult: 2, maxReps: 5, perk: null, item: ItemType.Mushroom },
            { id: 44, name: "Build a Fire", type: TaskType.Normal, costMult: 2, skills: [SkillType.Crafting], xpMult: 5, maxReps: 1, perk: null, item: null },
            { id: 46, name: "Befriend a Deer", type: TaskType.Normal, costMult: 10, skills: [SkillType.Charisma], xpMult: 3, maxReps: 1, perk: null, item: null },
            { id: 47, name: "Angry Ent", type: TaskType.Boss, costMult: 1000, skills: [SkillType.Combat], xpMult: 1, maxReps: 1, perk: null, item: ItemType.MagicalRoots },
            { id: 48, name: "Gather Magical Roots", type: TaskType.Normal, costMult: 15, skills: [SkillType.Search], xpMult: 1, maxReps: 3, perk: null, item: ItemType.MagicalRoots, hidden: true },
        ],
    },
    {
        id: 4,
        name: "The Cave System",
        tasks: [
            { id: 50, name: "Leave Via Back Entrance", type: TaskType.Travel, costMult: 2, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 51, name: "Find a Way Through", type: TaskType.Mandatory, costMult: 2, skills: [SkillType.Search], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 52, name: "Rescue Captives", type: TaskType.Mandatory, costMult: 1.5, skills: [SkillType.Charisma, SkillType.Subterfuge], xpMult: 1, maxReps: 3, perk: null, item: null },
            { id: 53, name: "Steal Supplies", type: TaskType.Normal, costMult: 0.3, skills: [SkillType.Subterfuge], xpMult: 1, maxReps: 5, perk: null, item: ItemType.GoblinSupplies },
            { id: 54, name: "Try Casting a Spell", type: TaskType.Normal, costMult: 2, skills: [SkillType.Magic, SkillType.Study], xpMult: 1, maxReps: 6, perk: PerkType.EnergySpell, item: null },
            { id: 55, name: "Inspect Wall Paintings", type: TaskType.Normal, costMult: 2, skills: [SkillType.Study], xpMult: 4, maxReps: 1, perk: null, item: null },
            { id: 56, name: "Scout the Cave", type: TaskType.Normal, costMult: 0.5, skills: [SkillType.Search], xpMult: 3, maxReps: 3, perk: null, item: null },
            { id: 57, name: "Goblin Chieftain", type: TaskType.Boss, costMult: 1000, skills: [SkillType.Combat], xpMult: 1, maxReps: 1, perk: null, item: ItemType.GoblinTreasure },
            { id: 58, name: "Wipe Out Goblins", type: TaskType.Normal, costMult: 10000, skills: [SkillType.Combat], xpMult: 0.3, maxReps: 1, perk: PerkType.GoblinScourge, item: null, hidden: true },
        ],
    },
    {
        id: 5,
        name: "The Road to the City",
        tasks: [
            { id: 60, name: "Get to the City", type: TaskType.Travel, costMult: 3, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 61, name: "Join a Caravan", type: TaskType.Mandatory, costMult: 4, skills: [SkillType.Charisma], xpMult: 0.5, maxReps: 1, perk: null, item: null },
            { id: 62, name: "Scout the Road Ahead", type: TaskType.Mandatory, costMult: 1.3, skills: [SkillType.Study, SkillType.Search], xpMult: 1, maxReps: 3, perk: null, item: null },
            { id: 63, name: "Make Travel Equipment", type: TaskType.Normal, costMult: 0.5, skills: [SkillType.Crafting], xpMult: 1, maxReps: 4, perk: null, item: ItemType.TravelEquipment },
            { id: 64, name: "Get Used to Traveling", type: TaskType.Normal, costMult: 1, skills: [SkillType.Travel, SkillType.Fortitude], xpMult: 3, maxReps: 3, perk: PerkType.ExperiencedTraveler, item: null },
            { id: 69, name: "Study the Amulet", type: TaskType.Normal, costMult: 5, skills: [SkillType.Study], xpMult: 0.5, maxReps: 1, perk: PerkType.UnderstandingTheReset, item: null },
            { id: 65, name: "Chat with Travelers", type: TaskType.Normal, costMult: 1, skills: [SkillType.Charisma], xpMult: 3, maxReps: 4, perk: null, item: null },
            { id: 66, name: "Practice Traveling Unnoticed", type: TaskType.Normal, costMult: 2, skills: [SkillType.Subterfuge], xpMult: 5, maxReps: 1, perk: null, item: null },
            { id: 67, name: "Bandits", type: TaskType.Boss, costMult: 500, skills: [SkillType.Combat], xpMult: 1, maxReps: 1, perk: null, item: ItemType.BanditWeapons },
            { id: 68, name: "Loot Bandit Camp", type: TaskType.Normal, costMult: 35, skills: [SkillType.Subterfuge, SkillType.Search], xpMult: 3, maxReps: 4, perk: null, item: ItemType.BanditWeapons, hidden: true },
        ],
    },
    {
        id: 6,
        name: "The City Outskirts",
        tasks: [
            { id: 70, name: "Enter the City", type: TaskType.Travel, costMult: 1.5, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 71, name: "Bribe the City Guards", type: TaskType.Mandatory, costMult: 4, skills: [SkillType.Charisma], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 72, name: "Survive a Mugging", type: TaskType.Mandatory, costMult: 2.5, skills: [SkillType.Combat, SkillType.Fortitude], xpMult: 0.75, maxReps: 1, perk: null, item: null },
            { id: 73, name: "Buy a Book", type: TaskType.Normal, costMult: 1, skills: [SkillType.Charisma], xpMult: 1, maxReps: 5, perk: null, item: ItemType.Book },
            { id: 74, name: "Negotiate with a Rogue Guard", type: TaskType.Normal, costMult: 12, skills: [SkillType.Charisma, SkillType.Subterfuge], xpMult: 0.3, maxReps: 1, perk: PerkType.UndergroundConnection, item: null },
            { id: 75, name: "Spar with the Guards", type: TaskType.Normal, costMult: 0.75, skills: [SkillType.Combat], xpMult: 2, maxReps: 4, perk: null, item: null },
            { id: 76, name: "Fend for Yourself", type: TaskType.Normal, costMult: 0.5, skills: [SkillType.Fortitude], xpMult: 5, maxReps: 1, perk: null, item: null },
            { id: 77, name: "Skulk About", type: TaskType.Normal, costMult: 2, skills: [SkillType.Subterfuge], xpMult: 5, maxReps: 1, perk: null, item: null },
        ],
    },
    {
        id: 7,
        name: "The City",
        tasks: [
            { id: 80, name: "Embark on a Quest", type: TaskType.Travel, costMult: 4, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 81, name: "Investigate Rumors of a Magician", type: TaskType.Mandatory, costMult: 1.5, skills: [SkillType.Charisma, SkillType.Search], xpMult: 1, maxReps: 4, perk: null, item: null },
            { id: 82, name: "Search the Archives for Magic", type: TaskType.Mandatory, costMult: 1.2, skills: [SkillType.Study, SkillType.Search], xpMult: 1, maxReps: 5, perk: null, item: null },
            { id: 83, name: "Scribe Scroll of Haste", type: TaskType.Normal, costMult: 2, skills: [SkillType.Crafting, SkillType.Magic], xpMult: 1, maxReps: 1, perk: null, item: ItemType.ScrollOfHaste },
            { id: 84, name: "Cast a Spell", type: TaskType.Normal, costMult: 1, skills: [SkillType.Magic], xpMult: 0.2, maxReps: 6, perk: PerkType.MinorTimeCompression, item: null },
            { id: 85, name: "Study at the Mage's Guild", type: TaskType.Normal, costMult: 2, skills: [SkillType.Study, SkillType.Magic], xpMult: 2, maxReps: 1, perk: null, item: null },
            { id: 86, name: "Train for Your Quest", type: TaskType.Normal, costMult: 1, skills: [SkillType.Search, SkillType.Fortitude], xpMult: 3, maxReps: 3, perk: null, item: null },
            { id: 87, name: "Corrupt Mayor", type: TaskType.Boss, costMult: 150, skills: [SkillType.Combat], xpMult: 1, maxReps: 1, perk: null, item: ItemType.CityChain },
            { id: 89, name: "Purge Corrupt Bureaucracy", type: TaskType.Normal, costMult: 100000, skills: [SkillType.Study, SkillType.Subterfuge], xpMult: 0.02, maxReps: 1, perk: PerkType.PurgedBureaucracy, item: null, hidden: true },
        ],
    },
    {
        id: 8,
        name: "The Forest",
        tasks: [
            { id: 90, name: "Scale the Mountain", type: TaskType.Travel, costMult: 6, skills: [SkillType.Travel, SkillType.Fortitude], xpMult: 1, maxReps: 1, perk: PerkType.HighAltitudeClimbing, item: null },
            { id: 91, name: "Locate the Mountain", type: TaskType.Mandatory, costMult: 2, skills: [SkillType.Search], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 92, name: "Make Climbing Gear", type: TaskType.Mandatory, costMult: 0.3, skills: [SkillType.Crafting], xpMult: 1, maxReps: 3, perk: null, item: null },
            { id: 93, name: "Make Camping Equipment", type: TaskType.Normal, costMult: 0.15, skills: [SkillType.Crafting], xpMult: 1, maxReps: 3, perk: null, item: ItemType.CampingEquipment },
            { id: 94, name: "Prepare to Scale the Mountain", type: TaskType.Normal, costMult: 1, skills: [SkillType.Study, SkillType.Fortitude], xpMult: 4, maxReps: 3, perk: null, item: null },
            { id: 95, name: "Build a Hut", type: TaskType.Normal, costMult: 0.3, skills: [SkillType.Crafting], xpMult: 3, maxReps: 1, perk: null, item: null },
            { id: 96, name: "Go Sightseeing", type: TaskType.Normal, costMult: 0.5, skills: [SkillType.Search, SkillType.Travel], xpMult: 3, maxReps: 3, perk: null, item: null },
            { id: 97, name: "Meet a Magical Creature", type: TaskType.Normal, costMult: 2, skills: [SkillType.Magic, SkillType.Charisma], xpMult: 3, maxReps: 1, perk: null, item: null },
            { id: 98, name: "Werewolf", type: TaskType.Boss, costMult: 170, skills: [SkillType.Combat], xpMult: 1, maxReps: 1, perk: null, item: ItemType.WerewolfFur },
            { id: 99, name: "Gather Shed Fur from Lair", type: TaskType.Normal, costMult: 8, skills: [SkillType.Subterfuge], xpMult: 1, maxReps: 3, perk: null, item: ItemType.WerewolfFur, hidden: true },
        ],
    },
    {
        id: 9,
        name: "The Magician",
        tasks: [
            { id: 100, name: "Hunt for the First Reagent", type: TaskType.Travel, costMult: 5, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 101, name: "Convince the Magician", type: TaskType.Mandatory, costMult: 6, skills: [SkillType.Charisma], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 102, name: "Do a Favor", type: TaskType.Mandatory, costMult: 1, skills: [SkillType.Crafting, SkillType.Subterfuge], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 103, name: "Steal Some Reagents", type: TaskType.Normal, costMult: 0.15, skills: [SkillType.Subterfuge], xpMult: 1, maxReps: 4, perk: null, item: ItemType.Reagents },
            { id: 104, name: "Figure Out How to Attune", type: TaskType.Normal, costMult: 60, skills: [SkillType.Study, SkillType.Magic], xpMult: 0.1, maxReps: 1, perk: PerkType.Attunement, item: null },
            { id: 105, name: "Give Yourself a Pep Talk", type: TaskType.Normal, costMult: 2, skills: [SkillType.Charisma], xpMult: 4, maxReps: 1, perk: null, item: null },
            { id: 106, name: "Try to Transform Into an Eagle", type: TaskType.Normal, costMult: 1, skills: [SkillType.Magic], xpMult: 10, maxReps: 1, perk: null, item: null },
            { id: 107, name: "Low-oxygen Exercise", type: TaskType.Normal, costMult: 0.5, skills: [SkillType.Fortitude], xpMult: 4, maxReps: 5, perk: null, item: null },
        ],
    },
    {
        id: 10,
        name: "The Ocean",
        tasks: [
            { id: 110, name: "Land on Island", type: TaskType.Travel, costMult: 3, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 111, name: "Weather a Storm", type: TaskType.Mandatory, costMult: 2, skills: [SkillType.Fortitude], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 112, name: "Find the Island", type: TaskType.Mandatory, costMult: 2, skills: [SkillType.Search], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 113, name: "Catch Fish", type: TaskType.Normal, costMult: 0.4, skills: [SkillType.Crafting, SkillType.Search], xpMult: 4, maxReps: 5, perk: null, item: ItemType.Fish },
            { id: 114, name: "Dive as a Squid", type: TaskType.Normal, costMult: 8, skills: [SkillType.Magic, SkillType.Search], xpMult: 0.5, maxReps: 3, perk: PerkType.SunkenTreasure, item: null },
            { id: 115, name: "Look for Land", type: TaskType.Normal, costMult: 0.5, skills: [SkillType.Search], xpMult: 8, maxReps: 3, perk: null, item: null },
            { id: 116, name: "Practice Transforming", type: TaskType.Normal, costMult: 3, skills: [SkillType.Magic], xpMult: 5, maxReps: 1, perk: null, item: null },
            { id: 117, name: "Kraken", type: TaskType.Boss, costMult: 40, skills: [SkillType.Combat], xpMult: 0.5, maxReps: 1, perk: null, item: ItemType.Calamari },
            { id: 118, name: "Explore Kraken's Lair", type: TaskType.Normal, costMult: 15000, skills: [SkillType.Search, SkillType.Magic], xpMult: 0.6, maxReps: 1, perk: PerkType.DeepSeaDiving, item: null, hidden: true },
        ],
    },
    {
        id: 11,
        name: "The Island",
        tasks: [
            { id: 120, name: "Hunt for the Second Reagent", type: TaskType.Travel, costMult: 8, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 121, name: "Gather Reagent", type: TaskType.Mandatory, costMult: 4, skills: [SkillType.Search, SkillType.Magic], xpMult: 1, maxReps: 3, perk: null, item: null },
            { id: 122, name: "Repair Ship", type: TaskType.Mandatory, costMult: 1.4, skills: [SkillType.Crafting], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 123, name: "Catch More Fish", type: TaskType.Normal, costMult: 1, skills: [SkillType.Crafting, SkillType.Search], xpMult: 1, maxReps: 4, perk: null, item: ItemType.Fish },
            { id: 124, name: "Explore the Jungle", type: TaskType.Normal, costMult: 6, skills: [SkillType.Search, SkillType.Travel, SkillType.Fortitude], xpMult: 1, maxReps: 6, perk: PerkType.LostTemple, item: null },
            { id: 125, name: "Build Another Hut", type: TaskType.Normal, costMult: 2, skills: [SkillType.Crafting], xpMult: 5, maxReps: 1, perk: null, item: null },
            { id: 126, name: "Talk to the Local Wildlife", type: TaskType.Normal, costMult: 2, skills: [SkillType.Magic, SkillType.Charisma], xpMult: 2, maxReps: 3, perk: null, item: null },
            { id: 127, name: "Horde of Lizardfolk", type: TaskType.Boss, costMult: 210, skills: [SkillType.Combat], xpMult: 0.5, maxReps: 1, perk: null, item: ItemType.OracleBones },
            { id: 128, name: "Steal Their Oracle Bones", type: TaskType.Normal, costMult: 8, skills: [SkillType.Subterfuge, SkillType.Search], xpMult: 1, maxReps: 4, perk: null, item: ItemType.OracleBones, hidden: true },
        ],
    },
    {
        id: 12,
        name: "The Desert",
        tasks: [
            { id: 130, name: "Enter the Oasis", type: TaskType.Travel, costMult: 7, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 131, name: "Overcome Mirage", type: TaskType.Mandatory, costMult: 6, skills: [SkillType.Fortitude], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 132, name: "Find the Oasis", type: TaskType.Mandatory, costMult: 1, skills: [SkillType.Search], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 133, name: "Harvest Cactus", type: TaskType.Normal, costMult: 0.2, skills: [SkillType.Crafting], xpMult: 1, maxReps: 3, perk: null, item: ItemType.Cactus },
            { id: 134, name: "Avoid Notice by the Sandworm", type: TaskType.Normal, costMult: 1, skills: [SkillType.Subterfuge], xpMult: 1, maxReps: 4, perk: PerkType.WalkWithoutRhythm, item: null },
            { id: 135, name: "Work on Your Tan", type: TaskType.Normal, costMult: 1, skills: [SkillType.Fortitude], xpMult: 15, maxReps: 3, perk: null, item: null },
            { id: 136, name: "Comb the Desert", type: TaskType.Normal, costMult: 2, skills: [SkillType.Search], xpMult: 10, maxReps: 3, perk: null, item: null },
            { id: 137, name: "Giant Sandworm", type: TaskType.Boss, costMult: 460, skills: [SkillType.Combat], xpMult: 0.4, maxReps: 1, perk: null, item: ItemType.WormHideCoat },
            { id: 138, name: "Learn to Dance the Worm", type: TaskType.Normal, costMult: 600000, skills: [SkillType.Study, SkillType.Charisma], xpMult: 0.1, maxReps: 1, perk: PerkType.TheWorm, item: null, hidden: true },
        ],
    },
    {
        id: 13,
        name: "The Oasis",
        tasks: [
            { id: 140, name: "Return to the Magician", type: TaskType.Travel, costMult: 8, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 141, name: "Banish Evil Spirit", type: TaskType.Mandatory, costMult: 100, skills: [SkillType.Magic], xpMult: 1, maxReps: 3, perk: null, item: null },
            { id: 142, name: "Gather Second Reagent", type: TaskType.Mandatory, costMult: 0.75, skills: [SkillType.Search], xpMult: 1, maxReps: 5, perk: null, item: null },
            { id: 143, name: "Bottle Oasis Water", type: TaskType.Normal, costMult: 0.2, skills: [SkillType.Crafting], xpMult: 1, maxReps: 4, perk: null, item: ItemType.OasisWater },
            { id: 144, name: "Reflect on the Journey", type: TaskType.Normal, costMult: 25, skills: [SkillType.Study], xpMult: 1, maxReps: 4, perk: PerkType.ReflectionsOnTheJourney, item: null },
            { id: 145, name: "Prepare for the Journey Ahead", type: TaskType.Normal, costMult: 2.5, skills: [SkillType.Travel, SkillType.Combat], xpMult: 2, maxReps: 3, perk: null, item: null },
            { id: 146, name: "Talk to the Djinn", type: TaskType.Normal, costMult: 30, skills: [SkillType.Charisma], xpMult: 20, maxReps: 1, perk: null, item: null },
            { id: 147, name: "Sleepy Djinn", type: TaskType.Boss, costMult: 840, skills: [SkillType.Combat], xpMult: 0.3, maxReps: 1, perk: null, item: ItemType.DjinnLamp },
            { id: 148, name: "Find More Lamps", type: TaskType.Normal, costMult: 30, skills: [SkillType.Search, SkillType.Subterfuge], xpMult: 1, maxReps: 3, perk: null, item: ItemType.DjinnLamp, hidden: true },
        ],
    },
    {
        id: 14,
        name: "The Ritual",
        tasks: [
            { id: 150, name: "Begin Search for the Next Ritual", type: TaskType.Travel, costMult: 50, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 151, name: "Apologize for Stealing Reagents", type: TaskType.Mandatory, costMult: 40, skills: [SkillType.Charisma], xpMult: 0.25, maxReps: 3, perk: null, item: null },
            { id: 152, name: "Rest for a While", type: TaskType.Mandatory, costMult: 1000, skills: [SkillType.Fortitude], xpMult: 1.25, maxReps: 5, perk: null, item: null },
            { id: 153, name: "Touch the Divine", type: TaskType.Prestige, costMult: 0.025, skills: [SkillType.Ascension], xpMult: 1, maxReps: 1, perk: null, item: null, prestige: true },
            { id: 154, name: "Infuse Mystic Incense", type: TaskType.Normal, costMult: 75, skills: [SkillType.Magic], xpMult: 1, maxReps: 9, perk: null, item: ItemType.MysticIncense },
            { id: 155, name: "Practice Memorization", type: TaskType.Normal, costMult: 1200, skills: [SkillType.Study, SkillType.Magic], xpMult: 0.5, maxReps: 4, perk: PerkType.EnergeticMemory, item: null },
            { id: 156, name: "Guided Spellcasting", type: TaskType.Normal, costMult: 100, skills: [SkillType.Magic], xpMult: 10, maxReps: 3, perk: null, item: null },
            { id: 157, name: "Go for a Walk", type: TaskType.Normal, costMult: 4, skills: [SkillType.Search, SkillType.Travel], xpMult: 8, maxReps: 1, perk: null, item: null },
            { id: 158, name: "Write Down Some Learnings", type: TaskType.Normal, costMult: 500000, skills: [SkillType.Magic, SkillType.Study], xpMult: 1, maxReps: 5, perk: null, item: ItemType.DivineNotes, hidden: true },
        ],
    },
    {
        id: 15,
        name: "The Dream",
        tasks: [
            { id: 160, name: "Wake Up", type: TaskType.Travel, costMult: 350000, skills: [SkillType.Magic], xpMult: 0.25, maxReps: 1, perk: PerkType.Awakening, item: null },
            { id: 161, name: "Notice Signs You're in a Dream", type: TaskType.Mandatory, costMult: 2000, skills: [SkillType.Study, SkillType.Search], xpMult: 0.2, maxReps: 3, perk: null, item: null },
            { id: 162, name: "Placate the Voices in Your Head", type: TaskType.Mandatory, costMult: 1500, skills: [SkillType.Charisma], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 163, name: "Gather Essence", type: TaskType.Normal, costMult: 20000, skills: [SkillType.Magic], xpMult: 1, maxReps: 2, perk: null, item: ItemType.MagicEssence },
            { id: 164, name: "Build Giant Tower", type: TaskType.Normal, costMult: 60, skills: [SkillType.Crafting], xpMult: 0.25, maxReps: 2, perk: PerkType.TowerOfBabel, item: null },
            { id: 165, name: "Talk to Mysterious Being", type: TaskType.Normal, costMult: 100, skills: [SkillType.Charisma], xpMult: 10, maxReps: 5, perk: null, item: null },
            { id: 166, name: "Travel the Plains", type: TaskType.Normal, costMult: 200, skills: [SkillType.Travel, SkillType.Fortitude], xpMult: 2, maxReps: 3, perk: null, item: null },
            { id: 167, name: "The Weaver of Dreams", type: TaskType.Boss, costMult: 13000, skills: [SkillType.Combat], xpMult: 0.15, maxReps: 1, perk: null, item: ItemType.Dreamcatcher },
            { id: 168, name: "Contain the Dream", type: TaskType.Normal, costMult: 200000000, skills: [SkillType.Magic], xpMult: 0.05, maxReps: 1, perk: PerkType.DreamPrism, item: null, hidden: true },
        ],
    },
    {
        id: 16,
        name: "The Metropolis",
        tasks: [
            { id: 170, name: "Search for the Dragon's Hoard", type: TaskType.Travel, costMult: 100, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: PerkType.Awakening, item: null },
            { id: 171, name: "Figure Out the Next Ritual", type: TaskType.Mandatory, costMult: 1000000, skills: [SkillType.Magic, SkillType.Charisma], xpMult: 0.05, maxReps: 3, perk: null, item: null },
            { id: 172, name: "Figure Out Where to Go Next", type: TaskType.Mandatory, costMult: 100000, skills: [SkillType.Study], xpMult: 0.2, maxReps: 1, perk: null, item: null },
            { id: 173, name: "Write Down Crafting Recipes", type: TaskType.Normal, costMult: 5, skills: [SkillType.Crafting], xpMult: 1, maxReps: 5, perk: null, item: ItemType.CraftingRecipe },
            { id: 174, name: "Improve Your Time Compression", type: TaskType.Normal, costMult: 1000000, skills: [SkillType.Magic, SkillType.Study], xpMult: 0.03, maxReps: 3, perk: PerkType.MajorTimeCompression, item: null },
            { id: 175, name: "Study at the Artificer Guild", type: TaskType.Normal, costMult: 10000, skills: [SkillType.Study, SkillType.Crafting], xpMult: 1, maxReps: 5, perk: null, item: null },
            { id: 176, name: "Practice in the Fighting Pits", type: TaskType.Normal, costMult: 250000, skills: [SkillType.Combat, SkillType.Subterfuge], xpMult: 0.02, maxReps: 3, perk: null, item: null },
            { id: 177, name: "Mage's Guild Headmaster", type: TaskType.Boss, costMult: 750000, skills: [SkillType.Combat], xpMult: 0.125, maxReps: 1, perk: null, item: ItemType.MagicRing },
            { id: 178, name: "Become Honorary Headmaster", type: TaskType.Normal, costMult: 65000000000, skills: [SkillType.Magic, SkillType.Charisma], xpMult: 0.01, maxReps: 5, perk: PerkType.Headmaster, item: null, hidden: true },
        ],
    },
    {
        id: 17,
        name: "The Foothills",
        tasks: [
            { id: 180, name: "Enter the Dragon's Lair", type: TaskType.Travel, costMult: 100, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 181, name: "Find the Hidden Entrance", type: TaskType.Mandatory, costMult: 30000, skills: [SkillType.Search], xpMult: 0.05, maxReps: 1, perk: null, item: null },
            { id: 182, name: "Evade the Dragon", type: TaskType.Mandatory, costMult: 100, skills: [SkillType.Subterfuge], xpMult: 0.2, maxReps: 5, perk: null, item: null },
            { id: 183, name: "Loot Dragon's Victims", type: TaskType.Normal, costMult: 700, skills: [SkillType.Search], xpMult: 0.5, maxReps: 4, perk: null, item: ItemType.KnightlyBoots },
            { id: 184, name: "Hide from the Dragon", type: TaskType.Normal, costMult: 1000, skills: [SkillType.Subterfuge], xpMult: 0.1, maxReps: 3, perk: PerkType.HideInPlainSight, item: null },
            { id: 185, name: "Go on a Long Trek", type: TaskType.Normal, costMult: 20000, skills: [SkillType.Travel, SkillType.Fortitude], xpMult: 0.01, maxReps: 5, perk: null, item: null },
            { id: 186, name: "Try to Turn into a Dragon", type: TaskType.Normal, costMult: 10000, skills: [SkillType.Magic], xpMult: 2, maxReps: 3, perk: null, item: null },
            { id: 187, name: "Dragon Spawn", type: TaskType.Boss, costMult: 2000000, skills: [SkillType.Combat], xpMult: 0.05, maxReps: 1, perk: null, item: ItemType.DragonScale },
            { id: 188, name: "Gather Dragon Scales", type: TaskType.Normal, costMult: 1000000, skills: [SkillType.Search], xpMult: 0.1, maxReps: 3, perk: null, item: ItemType.DragonScale, hidden: true },
        ],
    },
    {
        id: 18,
        name: "The Dragon's Lair",
        tasks: [
            { id: 190, name: "Go to a Place of Power", type: TaskType.Travel, costMult: 300, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 191, name: "Grab the Reagent You Need", type: TaskType.Mandatory, costMult: 2750000, skills: [SkillType.Search, SkillType.Subterfuge], xpMult: 0.001, maxReps: 3, perk: null, item: null },
            { id: 192, name: "Build a Hang Glider", type: TaskType.Mandatory, costMult: 1000, skills: [SkillType.Crafting], xpMult: 0.2, maxReps: 1, perk: null, item: null },
            { id: 193, name: "Catch Some Insects for Later", type: TaskType.Normal, costMult: 2000, skills: [SkillType.Search], xpMult: 1, maxReps: 9, perk: null, item: ItemType.CaveInsects },
            { id: 194, name: "Plan How to Kill the Dragon", type: TaskType.Normal, costMult: 1000000, skills: [SkillType.Study], xpMult: 0.1, maxReps: 3, perk: PerkType.DragonKillingPlan, item: null },
            { id: 195, name: "Hide from the Dragon Some More", type: TaskType.Normal, costMult: 5000, skills: [SkillType.Subterfuge], xpMult: 5, maxReps: 3, perk: null, item: null },
            { id: 196, name: "Practice Magic Under Pressure", type: TaskType.Normal, costMult: 5000000, skills: [SkillType.Magic], xpMult: 1.5, maxReps: 3, perk: null, item: null },
            { id: 197, name: "Dragon", type: TaskType.Boss, costMult: 21000000, skills: [SkillType.Combat], xpMult: 0.01, maxReps: 1, perk: null, item: ItemType.DragonScale },
            { id: 198, name: "Hunt Down the Dragon's Spawn", type: TaskType.Normal, costMult: 300000000000000, skills: [SkillType.Combat, SkillType.Search], xpMult: 0.000001, maxReps: 1, perk: PerkType.DragonSlayer, item: null, hidden: true },
        ],
    },
    {
        id: 19,
        name: "The Place of Power",
        tasks: [
            { id: 200, name: "Venture Forth", type: TaskType.Travel, costMult: 10000, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 201, name: "Design Next Ritual", type: TaskType.Mandatory, costMult: 5000000, skills: [SkillType.Study], xpMult: 0.01, maxReps: 5, perk: null, item: null },
            { id: 202, name: "Apotheosize", type: TaskType.Mandatory, costMult: 20000000, skills: [SkillType.Ascension, SkillType.Fortitude], xpMult: 0, maxReps: 1, perk: null, item: null },
            { id: 208, name: "Build Airship", type: TaskType.Mandatory, costMult: 20000, skills: [SkillType.Crafting], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 203, name: "Transcend Humanity", type: TaskType.Prestige, costMult: 2, skills: [SkillType.Ascension], xpMult: 0.25, maxReps: 3, perk: null, item: null, prestige: true },
            { id: 204, name: "Imbue Magical Vessel", type: TaskType.Normal, costMult: 10000000, skills: [SkillType.Magic, SkillType.Crafting], xpMult: 0.001, maxReps: 9, perk: null, item: ItemType.MagicalVessel },
            { id: 205, name: "Invent a New Spell", type: TaskType.Normal, costMult: 300000000, skills: [SkillType.Magic], xpMult: 0.01, maxReps: 3, perk: PerkType.UnifiedTheoryOfMagic, item: null },
            { id: 206, name: "Reflect on Past Obstacles", type: TaskType.Normal, costMult: 300000, skills: [SkillType.Subterfuge, SkillType.Study], xpMult: 1, maxReps: 5, perk: null, item: null },
            { id: 207, name: "Prepare for a Greater Journey", type: TaskType.Normal, costMult: 1000000, skills: [SkillType.Travel, SkillType.Fortitude], xpMult: 0.01, maxReps: 1, perk: null, item: null },
            { id: 209, name: "Gaze Beyond the Veil", type: TaskType.Normal, costMult: 200, skills: [SkillType.Ascension], xpMult: 0.02, maxReps: 3, perk: PerkType.GazedBeyondTheVeil, item: null, hidden: true },
        ],
    },
    {
        id: 20,
        name: "The Sky",
        tasks: [
            { id: 210, name: "Fly to the Volcano", type: TaskType.Travel, costMult: 5000, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 211, name: "Plot the Course", type: TaskType.Mandatory, costMult: 500000000, skills: [SkillType.Search, SkillType.Study], xpMult: 0.02, maxReps: 2, perk: null, item: null },
            { id: 212, name: "Conduct Emergency Repairs", type: TaskType.Mandatory, costMult: 1200, skills: [SkillType.Crafting], xpMult: 1, maxReps: 3, perk: null, item: null },
            { id: 213, name: "Harness Lightning", type: TaskType.Normal, costMult: 5000000000, skills: [SkillType.Magic], xpMult: 0.01, maxReps: 1, perk: null, item: ItemType.BottledLightning },
            { id: 214, name: "Go Skydiving", type: TaskType.Normal, costMult: 3000000000, skills: [SkillType.Fortitude], xpMult: 0.00002, maxReps: 3, perk: PerkType.OvercameFearOfSkydiving, item: null },
            { id: 215, name: "Watch the Clouds Go By", type: TaskType.Normal, costMult: 10000000, skills: [SkillType.Study], xpMult: 1, maxReps: 3, perk: null, item: null },
            { id: 216, name: "Chat with the Crew", type: TaskType.Normal, costMult: 100000, skills: [SkillType.Charisma], xpMult: 200, maxReps: 4, perk: null, item: null },
            { id: 217, name: "Griffin", type: TaskType.Boss, costMult: 130000000, skills: [SkillType.Combat], xpMult: 0.001, maxReps: 1, perk: null, item: ItemType.GriffinQuill },
            { id: 218, name: "Collect Quills", type: TaskType.Normal, costMult: 50000000, skills: [SkillType.Search], xpMult: 0.1, maxReps: 3, perk: null, item: ItemType.GriffinQuill, hidden: true },
        ],
    },
    {
        id: 21,
        name: "The Volcano",
        tasks: [
            { id: 220, name: "Enter Crevice", type: TaskType.Travel, costMult: 5000, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 221, name: "Bottle Lava for the Ritual", type: TaskType.Mandatory, costMult: 2500000000, skills: [SkillType.Fortitude], xpMult: 0.0001, maxReps: 3, perk: null, item: null },
            { id: 222, name: "Sneak Past Beings of Pure Heat", type: TaskType.Mandatory, costMult: 500000, skills: [SkillType.Subterfuge], xpMult: 3, maxReps: 1, perk: null, item: null },
            { id: 223, name: "Harness Heat", type: TaskType.Normal, costMult: 1000000000, skills: [SkillType.Magic], xpMult: 0.01, maxReps: 3, perk: null, item: ItemType.HeatEssence },
            { id: 224, name: "Cast the Ring into the Fire", type: TaskType.Normal, costMult: 3000000000, skills: [SkillType.Charisma], xpMult: 0.002, maxReps: 1, perk: PerkType.DestroyedTheRing, item: null, useItem: ItemType.MagicRing },
            { id: 225, name: "Get Used to the Heat", type: TaskType.Normal, costMult: 500000000, skills: [SkillType.Fortitude], xpMult: 0.002, maxReps: 3, perk: null, item: null },
            { id: 226, name: "Try to Use Lava for Forging", type: TaskType.Normal, costMult: 10000, skills: [SkillType.Crafting], xpMult: 20, maxReps: 4, perk: null, item: null },
            { id: 227, name: "Winged Demon", type: TaskType.Boss, costMult: 5000000000, skills: [SkillType.Combat], xpMult: 0.0002, maxReps: 1, perk: null, item: ItemType.WingsOfShadow },
            { id: 228, name: "Purge Demonic Influence", type: TaskType.Normal, costMult: 3000000000000, skills: [SkillType.Magic], xpMult: 0.0001, maxReps: 1, perk: PerkType.PurgedDemonicInfluences, item: null, hidden: true },
        ],
    },
    {
        id: 22,
        name: "The Underworld",
        tasks: [
            { id: 230, name: "Exit Through a Moonpool", type: TaskType.Travel, costMult: 5000, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 231, name: "Cast underwater Breathing Spell", type: TaskType.Mandatory, costMult: 10000000000, skills: [SkillType.Magic], xpMult: 0.005, maxReps: 1, perk: null, item: null },
            { id: 232, name: "Find Rare Mushroom Reagent", type: TaskType.Mandatory, costMult: 1000000000, skills: [SkillType.Search], xpMult: 0.05, maxReps: 5, perk: null, item: null },
            { id: 233, name: "Steal Farmed Cave Insects", type: TaskType.Normal, costMult: 4000, skills: [SkillType.Subterfuge], xpMult: 100, maxReps: 7, perk: null, item: ItemType.CaveInsects },
            { id: 234, name: "Study Underground Forge", type: TaskType.Normal, costMult: 1000000000, skills: [SkillType.Study, SkillType.Crafting], xpMult: 0.0001, maxReps: 2, perk: PerkType.UndergroundForge, item: null },
            { id: 235, name: "Practice the Local Dialect", type: TaskType.Normal, costMult: 5000000000, skills: [SkillType.Study, SkillType.Charisma], xpMult: 0.005, maxReps: 8, perk: null, item: null },
            { id: 236, name: "Join Underground Fight Club", type: TaskType.Normal, costMult: 10000000000, skills: [SkillType.Combat], xpMult: 0.005, maxReps: 4, perk: null, item: null },
            { id: 237, name: "Floating Ball of Eyes", type: TaskType.Boss, costMult: 50000000000, skills: [SkillType.Combat], xpMult: 0.0001, maxReps: 1, perk: null, item: ItemType.Glasses },
            { id: 238, name: "Steal Glasses", type: TaskType.Normal, costMult: 250000, skills: [SkillType.Subterfuge], xpMult: 20, maxReps: 3, perk: null, item: ItemType.Glasses, hidden: true },
        ],
    },
    {
        id: 23,
        name: "The Depths of the Sea",
        tasks: [
            { id: 240, name: "Journey Into the Depths", type: TaskType.Travel, costMult: 40000, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 241, name: "Determine Deepest Point", type: TaskType.Mandatory, costMult: 200000000000, skills: [SkillType.Search, SkillType.Study], xpMult: 0.0001, maxReps: 1, perk: null, item: null },
            { id: 242, name: "Prepare for the Pressure", type: TaskType.Mandatory, costMult: 100000000000, skills: [SkillType.Fortitude], xpMult: 0.000001, maxReps: 3, perk: null, item: null },
            { id: 243, name: "Catch Passing Fish", type: TaskType.Normal, costMult: 200000000000, skills: [SkillType.Combat], xpMult: 0.002, maxReps: 5, perk: null, item: ItemType.Fish },
            { id: 244, name: "Inspect Leviathan", type: TaskType.Normal, costMult: 100000000000, skills: [SkillType.Subterfuge, SkillType.Study], xpMult: 0.0001, maxReps: 1, perk: PerkType.UnderstandingLeviathan, item: null },
            { id: 245, name: "Deep-water Swimming", type: TaskType.Normal, costMult: 50000000000, skills: [SkillType.Fortitude, SkillType.Travel], xpMult: 0.000001, maxReps: 3, perk: null, item: null },
            { id: 246, name: "Go to Crab Rave", type: TaskType.Normal, costMult: 1000000, skills: [SkillType.Charisma], xpMult: 50, maxReps: 4, perk: null, item: null },
            { id: 247, name: "Half-Kraken", type: TaskType.Boss, costMult: 1000000000000, skills: [SkillType.Combat], xpMult: 0.00001, maxReps: 1, perk: null, item: ItemType.Calamari },
            { id: 248, name: "Commune with Damned Souls", type: TaskType.Normal, costMult: 20000000000, skills: [SkillType.Charisma], xpMult: 0.1, maxReps: 1, perk: PerkType.CommunedWithDamnedSouls, item: null, hidden: true },
        ],
    },
    {
        id: 24,
        name: "The Deepest Deep",
        tasks: [
            { id: 250, name: "Attempt to Enter Hell", type: TaskType.Travel, costMult: 300000, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 251, name: "Dare the Gods to Intervene", type: TaskType.Mandatory, costMult: 800000000, skills: [SkillType.Charisma], xpMult: 0.15, maxReps: 1, perk: null, item: null },
            { id: 252, name: "Dig a Tunnel", type: TaskType.Mandatory, costMult: 20000000, skills: [SkillType.Crafting], xpMult: 0.002, maxReps: 5, perk: null, item: null },
            { id: 253, name: "Embrace Divinity", type: TaskType.Prestige, costMult: 27000, skills: [SkillType.Ascension], xpMult: 0.015, maxReps: 4, perk: null, item: null, prestige: true },
            { id: 254, name: "Etch Ritual Symbols", type: TaskType.Normal, costMult: 30000000000, skills: [SkillType.Magic], xpMult: 0.03, maxReps: 7, perk: null, item: ItemType.RitualSymbol },
            { id: 255, name: "Defy the Gods", type: TaskType.Normal, costMult: 25000000000000, skills: [SkillType.Fortitude, SkillType.Ascension], xpMult: 0, maxReps: 1, perk: PerkType.DefiedTheGods, item: null },
            { id: 256, name: "Study Divinity", type: TaskType.Normal, costMult: 20000000000, skills: [SkillType.Study], xpMult: 0.05, maxReps: 8, perk: null, item: null },
            { id: 257, name: "Prepare to Face the Gods", type: TaskType.Normal, costMult: 1000000000000000, skills: [SkillType.Combat], xpMult: 0.00005, maxReps: 4, perk: null, item: null },
        ],
    },
    {
        id: 25,
        name: "The Void",
        tasks: [
            { id: 260, name: "Exit the Void", type: TaskType.Travel, costMult: 500000, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 261, name: "Avoid Alerting the Gods", type: TaskType.Mandatory, costMult: 8000000, skills: [SkillType.Subterfuge], xpMult: 0.3, maxReps: 1, perk: null, item: null },
            { id: 262, name: "Figure Out How to Leave", type: TaskType.Mandatory, costMult: 2000000000000, skills: [SkillType.Study, SkillType.Search], xpMult: 0.0001, maxReps: 2, perk: null, item: null },
            { id: 263, name: "Create Light", type: TaskType.Normal, costMult: 20000000000, skills: [SkillType.Magic], xpMult: 0.05, maxReps: 6, perk: null, item: ItemType.Light },
            { id: 264, name: "Avoid Going Insane", type: TaskType.Normal, costMult: 5000000000000, skills: [SkillType.Fortitude], xpMult: 0.0000002, maxReps: 2, perk: PerkType.SurvivedTheVoid, item: null },
            { id: 265, name: "Talk to Yourself", type: TaskType.Normal, costMult: 200000000, skills: [SkillType.Charisma], xpMult: 2, maxReps: 3, perk: null, item: null },
            { id: 266, name: "Search the Void", type: TaskType.Normal, costMult: 50000000000, skills: [SkillType.Travel, SkillType.Search], xpMult: 0.00001, maxReps: 5, perk: null, item: null },
            { id: 267, name: "PLACEHOLDER", type: TaskType.Boss, costMult: 1000000000000, skills: [SkillType.Combat], xpMult: 0.00001, maxReps: 1, perk: null, item: ItemType.Calamari },
            { id: 268, name: "PLACEHOLDER", type: TaskType.Normal, costMult: 3000000000000, skills: [SkillType.Combat, SkillType.Search], xpMult: 0.0001, maxReps: 1, perk: PerkType.DragonSlayer, item: null, hidden: true },
        ],
    },
    {
        id: 26,
        name: "The Return",
        tasks: [
            { id: 270, name: "Go Spread Your Word", type: TaskType.Travel, costMult: 600000, skills: [SkillType.Travel], xpMult: 1, maxReps: 1, perk: null, item: null },
            { id: 271, name: "Lick Your Wounds", type: TaskType.Mandatory, costMult: 5000000000000, skills: [SkillType.Fortitude], xpMult: 0.000001, maxReps: 8, perk: null, item: null },
            { id: 272, name: "Plot Your Revenge", type: TaskType.Mandatory, costMult: 40000000000000, skills: [SkillType.Study, SkillType.Subterfuge], xpMult: 0.00001, maxReps: 4, perk: null, item: null },
            { id: 273, name: "Build Void-inspired Contraption", type: TaskType.Normal, costMult: 200000000, skills: [SkillType.Crafting], xpMult: 0.01, maxReps: 4, perk: null, item: ItemType.MadContraption },
            { id: 274, name: "Demonstrate New Powers", type: TaskType.Normal, costMult: 7000000000000, skills: [SkillType.Magic], xpMult: 0.001, maxReps: 5, perk: PerkType.DivinePower, item: null },
            { id: 275, name: "Whine About the Void", type: TaskType.Normal, costMult: 200000000, skills: [SkillType.Charisma], xpMult: 2, maxReps: 3, perk: null, item: null },
            { id: 276, name: "Ponder Your Exile", type: TaskType.Normal, costMult: 60000000000000, skills: [SkillType.Study, SkillType.Magic], xpMult: 0.0002, maxReps: 9, perk: null, item: null },
            { id: 277, name: "PLACEHOLDER", type: TaskType.Boss, costMult: 1000000000000, skills: [SkillType.Combat], xpMult: 0.00001, maxReps: 1, perk: null, item: ItemType.Calamari },
            { id: 278, name: "PLACEHOLDER", type: TaskType.Normal, costMult: 3000000000000, skills: [SkillType.Combat, SkillType.Search], xpMult: 0.0001, maxReps: 1, perk: PerkType.DragonSlayer, item: null, hidden: true },
        ],
    },
];

// Helper to get tasks that grant perks
export function getPerkTasks() {
    const perkTasks = [];
    for (const zone of ZONES) {
        for (const task of zone.tasks) {
            if (task.perk !== null && !task.hidden) {
                perkTasks.push({ ...task, zoneId: zone.id, zoneName: zone.name });
            }
        }
    }
    return perkTasks;
}

// Get mandatory + travel tasks for a zone (minimum required to progress)
export function getMandatoryTasks(zone) {
    return zone.tasks.filter(t =>
        t.type === TaskType.Mandatory || t.type === TaskType.Travel
    );
}
