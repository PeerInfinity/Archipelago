#!/usr/bin/env node
/**
 * Test that jtaGameDataLoader produces output matching gameData.js exports.
 * Run: node frontend/modules/jta-randomizer/test-game-data-loader.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { loadGameDataFromJson } from './jtaGameDataLoader.js';
import {
    ZONES, PERKS, SKILL_XP_MULT, SKILL_NAMES, PERK_NAMES, SKILLS,
    ENERGY_ITEMS, ITEM_SKILL_MODIFIERS, BOSS_UNLOCKS, ARTIFACTS,
    HASTE_MULT, MAGIC_RING_MULT, BOTTLED_LIGHTNING_MULT,
    GOTTA_GO_FAST_BASE, MANDATORY_SCHMANDATORY_MULT,
    SPITE_THE_GODS_MULT, DIVINE_KNOWLEDGE_MULT, DIVINER_KNOWLEDGE_MULT,
    getMandatoryTasks, TaskType,
} from './gameData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = join(__dirname, '../../../worlds/jta/jta_game_data.json');
const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));

const loaded = loadGameDataFromJson(jsonData);

let pass = 0;
let fail = 0;

function assert(name, condition, detail) {
    if (condition) {
        pass++;
    } else {
        fail++;
        console.error(`FAIL: ${name}${detail ? ' - ' + detail : ''}`);
    }
}

function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

// Test ZONES
assert('ZONES length', loaded.ZONES.length === ZONES.length,
    `${loaded.ZONES.length} vs ${ZONES.length}`);

for (let z = 0; z < ZONES.length; z++) {
    const orig = ZONES[z];
    const load = loaded.ZONES[z];
    assert(`ZONES[${z}] name`, orig.name === load.name, `${orig.name} vs ${load.name}`);
    assert(`ZONES[${z}] task count`, orig.tasks.length === load.tasks.length,
        `${orig.tasks.length} vs ${load.tasks.length}`);

    for (let t = 0; t < orig.tasks.length; t++) {
        const ot = orig.tasks[t];
        const lt = load.tasks[t];
        assert(`ZONES[${z}].tasks[${t}] id`, ot.id === lt.id);
        assert(`ZONES[${z}].tasks[${t}] costMult`, ot.costMult === lt.costMult,
            `${ot.costMult} vs ${lt.costMult}`);
        assert(`ZONES[${z}].tasks[${t}] perk`, ot.perk === lt.perk,
            `${ot.perk} vs ${lt.perk}`);
        assert(`ZONES[${z}].tasks[${t}] item`, ot.item === lt.item,
            `${ot.item} vs ${lt.item}`);
        assert(`ZONES[${z}].tasks[${t}] skills`,
            deepEqual(ot.skills, lt.skills),
            `${JSON.stringify(ot.skills)} vs ${JSON.stringify(lt.skills)}`);
    }
}

// Test PERKS
for (const [id, perk] of Object.entries(PERKS)) {
    const loadedPerk = loaded.PERKS[id];
    assert(`PERKS[${id}] exists`, !!loadedPerk);
    if (loadedPerk) {
        assert(`PERKS[${id}] name`, perk.name === loadedPerk.name,
            `${perk.name} vs ${loadedPerk.name}`);
        assert(`PERKS[${id}] special`, perk.special === loadedPerk.special,
            `${perk.special} vs ${loadedPerk.special}`);
        assert(`PERKS[${id}] skillModifiers`,
            deepEqual(perk.skillModifiers, loadedPerk.skillModifiers),
            `${JSON.stringify(perk.skillModifiers)} vs ${JSON.stringify(loadedPerk.skillModifiers)}`);
    }
}

// Test SKILL_XP_MULT
for (const skill of SKILLS) {
    assert(`SKILL_XP_MULT[${skill}]`,
        SKILL_XP_MULT[skill] === loaded.SKILL_XP_MULT[skill],
        `${SKILL_XP_MULT[skill]} vs ${loaded.SKILL_XP_MULT[skill]}`);
}

// Test ENERGY_ITEMS
assert('ENERGY_ITEMS', deepEqual(ENERGY_ITEMS, loaded.ENERGY_ITEMS),
    `${JSON.stringify(ENERGY_ITEMS)} vs ${JSON.stringify(loaded.ENERGY_ITEMS)}`);

// Test ITEM_SKILL_MODIFIERS
for (const [itemId, mods] of Object.entries(ITEM_SKILL_MODIFIERS)) {
    assert(`ITEM_SKILL_MODIFIERS[${itemId}]`,
        deepEqual(mods, loaded.ITEM_SKILL_MODIFIERS[itemId]),
        `${JSON.stringify(mods)} vs ${JSON.stringify(loaded.ITEM_SKILL_MODIFIERS[itemId])}`);
}

// Test BOSS_UNLOCKS
assert('BOSS_UNLOCKS', deepEqual(BOSS_UNLOCKS, loaded.BOSS_UNLOCKS),
    `${JSON.stringify(BOSS_UNLOCKS)} vs ${JSON.stringify(loaded.BOSS_UNLOCKS)}`);

// Test ARTIFACTS
assert('ARTIFACTS', deepEqual(ARTIFACTS.sort(), loaded.ARTIFACTS.sort()),
    `${JSON.stringify(ARTIFACTS)} vs ${JSON.stringify(loaded.ARTIFACTS)}`);

// Test constants
assert('HASTE_MULT', HASTE_MULT === loaded.HASTE_MULT);
assert('MAGIC_RING_MULT', MAGIC_RING_MULT === loaded.MAGIC_RING_MULT);
assert('BOTTLED_LIGHTNING_MULT', BOTTLED_LIGHTNING_MULT === loaded.BOTTLED_LIGHTNING_MULT);
assert('GOTTA_GO_FAST_BASE', GOTTA_GO_FAST_BASE === loaded.GOTTA_GO_FAST_BASE);
assert('MANDATORY_SCHMANDATORY_MULT', MANDATORY_SCHMANDATORY_MULT === loaded.MANDATORY_SCHMANDATORY_MULT);
assert('SPITE_THE_GODS_MULT', SPITE_THE_GODS_MULT === loaded.SPITE_THE_GODS_MULT);
assert('DIVINE_KNOWLEDGE_MULT', DIVINE_KNOWLEDGE_MULT === loaded.DIVINE_KNOWLEDGE_MULT);
assert('DIVINER_KNOWLEDGE_MULT', DIVINER_KNOWLEDGE_MULT === loaded.DIVINER_KNOWLEDGE_MULT);

// Test getMandatoryTasks helper
for (const zone of ZONES) {
    const origMandatory = getMandatoryTasks(zone);
    const loadedMandatory = loaded.getMandatoryTasks(zone);
    assert(`getMandatoryTasks(${zone.name})`,
        origMandatory.length === loadedMandatory.length,
        `${origMandatory.length} vs ${loadedMandatory.length}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
