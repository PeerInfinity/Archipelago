/**
 * shapez game logic
 */

import * as helpers from './helpers.js';

// Export helpers for the game logic registry
export { helpers };

/**
 * OPTIONS constants from worlds/shapez/data/strings.py
 * These are used in access rules for logic progression
 */
export const OPTIONS = {
    logic_vanilla: 'vanilla',
    logic_stretched: 'stretched',
    logic_quick: 'quick',
    logic_random_steps: 'random_steps',
    logic_hardcore: 'hardcore',
    logic_dopamine: 'dopamine',
    logic_dopamine_overflow: 'dopamine_overflow',
    logic_vanilla_like: 'vanilla_like',
    logic_linear: 'linear',
    logic_category: 'category',
    logic_category_random: 'category_random',
    logic_shuffled: 'shuffled',
    sphere_1: 'sphere_1',
    buildings_3: '3_buildings',
    buildings_5: '5_buildings',
};

export default {
    gameName: 'shapez',
    gameDirectory: 'shapez',
    helpers: helpers,
    constants: { OPTIONS }
};
