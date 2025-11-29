/**
 * Yacht Dice game-specific helper functions
 *
 * This implements the scoring simulation logic for Yacht Dice to determine
 * if a player can reach a specific score based on their collected items.
 */

// Import yacht_weights data synchronously
import { yachtWeightsData } from './yacht_weights.js';

// Parse yacht_weights data into a usable format (loaded synchronously at module initialization)
let yachtWeights = {};
let yachtWeightsLoaded = false;

// Initialize yacht_weights synchronously
function initializeYachtWeights() {
    if (yachtWeightsLoaded) {
        return;
    }

    try {
        // Parse yacht_weights data into a usable format
        // Keys are "CategoryName,numDice,numRolls", values are score distributions
        for (const [key, distribution] of Object.entries(yachtWeightsData)) {
            const [categoryName, numDiceStr, numRollsStr] = key.split(',');
            const numDice = parseInt(numDiceStr);
            const numRolls = parseInt(numRollsStr);

            // Create nested structure for easy lookup
            if (!yachtWeights[categoryName]) {
                yachtWeights[categoryName] = {};
            }
            if (!yachtWeights[categoryName][numDice]) {
                yachtWeights[categoryName][numDice] = {};
            }

            // Convert string keys back to integers
            const parsedDistribution = {};
            for (const [score, probability] of Object.entries(distribution)) {
                parsedDistribution[parseInt(score)] = parseInt(probability);
            }

            yachtWeights[categoryName][numDice][numRolls] = parsedDistribution;
        }

        yachtWeightsLoaded = true;
    } catch (error) {
        console.error('[YachtDice] Failed to initialize yacht_weights:', error);
        throw error;
    }
}

// Initialize immediately (synchronous)
initializeYachtWeights();

/**
 * Calculate the maximum achievable score based on current state
 *
 * This is the JavaScript implementation of the dice_simulation_state_change function
 * from worlds/yachtdice/Rules.py
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data (includes frags_per_dice, frags_per_roll, allowed_categories, difficulty)
 * @param {number} fragsPerDice - Number of fragments needed per dice (from args[0])
 * @param {number} fragsPerRoll - Number of fragments needed per roll (from args[1])
 * @param {Array<string>} allowedCategories - List of allowed category names (from args[2])
 * @param {number} difficulty - Game difficulty level 1-4 (from args[3])
 * @returns {number} The maximum achievable score
 */
export function dice_simulation_state_change(snapshot, staticData, fragsPerDice, fragsPerRoll, allowedCategories, difficulty) {
    // Create a cache key based on the current inventory state
    // BUGFIX: Use snapshot.inventory (which exists) instead of snapshot.items (which doesn't)
    const inventory = snapshot?.items || snapshot?.inventory || {};
    const inventoryKey = JSON.stringify(inventory);
    const cacheKey = `${inventoryKey}_${fragsPerDice}_${fragsPerRoll}_${difficulty}`;

    // Check cache (but create it if doesn't exist)
    if (!snapshot.__yachtDiceScoreCache) {
        snapshot.__yachtDiceScoreCache = {};
    }

    if (snapshot.__yachtDiceScoreCache[cacheKey] !== undefined) {
        return snapshot.__yachtDiceScoreCache[cacheKey];
    }

    // Extract progression from current state
    const progression = extractProgression(snapshot, fragsPerDice, fragsPerRoll, allowedCategories);
    const {categories, numDice, numRolls, fixedMult, stepMult, extraPoints} = progression;

    // Calculate the simulated score
    const simulatedScore = diceSimulationStrings(
        categories, numDice, numRolls, fixedMult, stepMult, difficulty
    );

    const maxScore = simulatedScore + extraPoints;

    // Cache the result with proper key
    snapshot.__yachtDiceScoreCache[cacheKey] = maxScore;

    return maxScore;
}

/**
 * Extract progression items from the current state
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {number} fragsPerDice - Fragments per dice
 * @param {number} fragsPerRoll - Fragments per roll
 * @param {Array<string>} allowedCategories - Allowed categories
 * @returns {Object} Progression data
 */
function extractProgression(snapshot, fragsPerDice, fragsPerRoll, allowedCategories) {
    // Try multiple possible locations for items in the snapshot
    // Different games structure their snapshots differently
    const items = snapshot?.items || snapshot?.inventory || snapshot || {};

    // Count dice and rolls (including fragments)
    const diceFrags = (items["Dice Fragment"] || 0);
    const rollFrags = (items["Roll Fragment"] || 0);
    const numDice = (items["Dice"] || 0) + Math.floor(diceFrags / fragsPerDice);
    const numRolls = (items["Roll"] || 0) + Math.floor(rollFrags / fragsPerRoll);

    // Count multipliers
    const numFixedMults = items["Fixed Score Multiplier"] || 0;
    const numStepMults = items["Step Score Multiplier"] || 0;

    // Extract categories with their quantities
    const categories = [];
    for (const categoryName of allowedCategories) {
        const count = items[categoryName] || 0;
        if (count > 0) {
            categories.push({
                name: categoryName,
                quantity: count
            });
        }
    }

    // Count extra points
    let extraPoints = 0;
    extraPoints += (items["1 Point"] || 0) * 1;
    extraPoints += (items["10 Points"] || 0) * 10;
    extraPoints += (items["100 Points"] || 0) * 100;

    return {
        categories,
        numDice,
        numRolls,
        fixedMult: numFixedMults * 0.1,
        stepMult: numStepMults * 0.01,
        extraPoints
    };
}

/**
 * Add two probability distributions (Python's add_distributions)
 * @param {Object} dist1 - First distribution {value: probability}
 * @param {Object} dist2 - Second distribution {value: probability}
 * @returns {Object} Combined distribution
 */
function addDistributions(dist1, dist2) {
    const combinedDist = {};
    for (const [val2Str, prob2] of Object.entries(dist2)) {
        const val2 = Number(val2Str);
        for (const [val1Str, prob1] of Object.entries(dist1)) {
            const val1 = Number(val1Str);
            const newVal = val1 + val2;
            if (combinedDist[newVal] === undefined) {
                combinedDist[newVal] = 0;
            }
            combinedDist[newVal] += prob1 * prob2;
        }
    }
    return combinedDist;
}

/**
 * Take the maximum of multiple tries with different multipliers (Python's max_dist)
 * @param {Object} dist1 - Base distribution {value: probability}
 * @param {Array<number>} mults - Array of multipliers to try
 * @returns {Object} Distribution of maximum values
 */
function maxDist(dist1, mults) {
    let newDist = {0: 1};
    for (const mult of mults) {
        const tempDist = {};
        for (const [val1Str, prob1] of Object.entries(newDist)) {
            const val1 = Number(val1Str);
            for (const [val2Str, prob2] of Object.entries(dist1)) {
                const val2 = Number(val2Str);
                const newVal = Math.floor(Math.max(val1, val2 * mult));
                const newProb = prob1 * prob2;

                if (tempDist[newVal] === undefined) {
                    tempDist[newVal] = 0;
                }
                tempDist[newVal] += newProb;
            }
        }
        newDist = tempDist;
    }
    return newDist;
}

/**
 * Simulate dice rolling to calculate expected score
 *
 * This matches the Python implementation in worlds/yachtdice/Rules.py
 *
 * @param {Array<Object>} categories - Categories with their quantities
 * @param {number} numDice - Number of dice
 * @param {number} numRolls - Number of rolls
 * @param {number} fixedMult - Fixed multiplier bonus
 * @param {number} stepMult - Step multiplier bonus
 * @param {number} difficulty - Difficulty level
 * @returns {number} Estimated score
 */
function diceSimulationStrings(categories, numDice, numRolls, fixedMult, stepMult, difficulty) {
    if (numDice <= 0 || numRolls <= 0) {
        return 0;
    }

    // Get percentile return values based on difficulty
    // perc_return determines what percentiles to average
    const percReturn = [[0], [0.1, 0.5], [0.3, 0.7], [0.55, 0.85], [0.85, 0.95]][difficulty];
    const diffDivide = [0, 9, 7, 3, 2][difficulty];

    // Sort categories by mean score (using 4 rolls as in Python implementation)
    // Note: Python uses 4 rolls for sorting to avoid errors with order changing when obtaining rolls
    categories.sort((a, b) => {
        const distA = getScoreDistribution(a.name, numDice, 4);
        const distB = getScoreDistribution(b.name, numDice, 4);

        const scoreA = distA ? getMeanFromDistribution(distA) : fallbackEstimateMeanScore(a.name, numDice, 4);
        const scoreB = distB ? getMeanFromDistribution(distB) : fallbackEstimateMeanScore(b.name, numDice, 4);

        return scoreA - scoreB;
    });

    // Calculate total distribution (matching Python algorithm)
    let totalDist = {0: 1};

    for (let j = 0; j < categories.length; j++) {
        const category = categories[j];

        // Get the distribution for this category
        let dist = getScoreDistribution(category.name, numDice, numRolls);

        // Use fallback if distribution not available
        if (!dist) {
            // In Python this would use {0: 100000}
            dist = {0: 100000};
        }

        // Normalize the distribution (divide by 100000 to get probabilities)
        const normalizedDist = {};
        for (const [scoreStr, probability] of Object.entries(dist)) {
            normalizedDist[scoreStr] = probability / 100000;
        }

        // Calculate category multiplier for multiple copies
        const catMult = Math.pow(2, category.quantity - 1);

        // For higher difficulties, simulation gets multiple tries
        const maxTries = Math.floor(j / diffDivide);

        // Build array of multipliers to try
        const mults = [];
        for (let ii = Math.max(0, j - maxTries); ii <= j; ii++) {
            mults.push((1 + fixedMult + stepMult * ii) * catMult);
        }

        // Apply max_dist to get the best score across tries
        const distWithMults = maxDist(normalizedDist, mults);

        // Add this category's distribution to the total
        totalDist = addDistributions(totalDist, distWithMults);
    }

    // Calculate percentiles on the combined distribution
    const percentileValues = percReturn.map(perc => percentileDistribution(totalDist, perc));

    // Average the percentile values
    const outcome = percentileValues.reduce((sum, val) => sum + val, 0) / percentileValues.length;

    // Ensure minimum score of 5
    return Math.max(5, Math.floor(outcome));
}

/**
 * Calculate mean from a probability distribution
 */
function getMeanFromDistribution(distribution) {
    let mean = 0;
    for (const [score, probability] of Object.entries(distribution)) {
        mean += parseInt(score) * (probability / 100000);
    }
    return mean;
}

/**
 * Get score distribution for a category using actual probability data
 *
 * @param {string} categoryName - Name of the category
 * @param {number} numDice - Number of dice
 * @param {number} numRolls - Number of rolls
 * @returns {Object} Score distribution {score: probability}
 */
function getScoreDistribution(categoryName, numDice, numRolls) {
    // Limit dice and rolls to maximum of 8 (data availability)
    const originalDice = numDice;
    const originalRolls = numRolls;
    numDice = Math.min(8, Math.max(0, numDice));
    numRolls = Math.min(8, Math.max(0, numRolls));

    if (numDice <= 0 || numRolls <= 0) {
        return {0: 100000};
    }

    // If data not loaded yet, return empty distribution
    if (!yachtWeightsLoaded) {
        return null;
    }

    // Look up the probability distribution
    const distribution = yachtWeights[categoryName]?.[numDice]?.[numRolls];

    return distribution || null;
}

/**
 * Calculate percentile value from a probability distribution
 *
 * @param {Object} distribution - Score distribution {score: probability (0-1)}
 * @param {number} percentile - Percentile to calculate (0.0 to 1.0)
 * @returns {number} Score at the given percentile
 */
function percentileDistribution(distribution, percentile) {
    const sortedScores = Object.keys(distribution).map(Number).sort((a, b) => a - b);
    let cumulativeProb = 0;

    for (const score of sortedScores) {
        // Distribution values are already probabilities (0-1), not raw counts
        cumulativeProb += distribution[score];
        if (cumulativeProb >= percentile) {
            return score;
        }
    }

    // Return the last value if percentile is higher than all probabilities
    return sortedScores[sortedScores.length - 1] || 0;
}

/**
 * Fallback estimation when yacht_weights data is not available
 */
function fallbackEstimateMeanScore(categoryName, numDice, numRolls) {
    const baseFactor = Math.pow(numDice, 0.6) * Math.pow(numRolls, 0.3);

    if (categoryName.includes("Choice") || categoryName.includes("Inverse")) {
        return baseFactor * 2.0;
    } else if (categoryName.includes("Ones") || categoryName.includes("Twos")) {
        return baseFactor * 0.6;
    } else if (categoryName.includes("Threes") || categoryName.includes("Fours")) {
        return baseFactor * 0.8;
    } else if (categoryName.includes("Fives") || categoryName.includes("Sixes")) {
        return baseFactor * 1.0;
    } else if (categoryName.includes("Straight")) {
        return baseFactor * 1.2;
    } else if (categoryName.includes("Full House") || categoryName.includes("Yacht")) {
        return baseFactor * 1.5;
    } else if (categoryName.includes("Kind")) {
        return baseFactor * 1.0;
    } else {
        return baseFactor * 0.8;
    }
}

export default {
    dice_simulation_state_change
};
