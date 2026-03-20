// Shared known metagame configurations
// Used by metaGamePanel UI and URL parameter handling

export const knownMetaGames = [
    {
        name: 'Progress Bar Test',
        path: './configs/progressBarTest.js',
        shortName: 'progressbar'
    },
    {
        name: 'Maze Game',
        path: './configs/mazeGame.js',
        shortName: 'mazegame'
    },
    {
        name: 'Maze Game (Loops)',
        path: './configs/mazeGameLoops.js',
        shortName: 'mazegameloops'
    }
];

/**
 * Resolve a metagame config path from a shortname.
 * @param {string} input - A shortname (e.g., "mazegame")
 * @returns {string|null} The resolved config path, or null if not found
 */
export function resolveMetaGamePath(input) {
    if (!input) return null;

    const trimmed = input.trim();
    if (!trimmed) return null;

    // Match against known shortnames (case-insensitive)
    const lowerInput = trimmed.toLowerCase();
    const match = knownMetaGames.find(mg => mg.shortName === lowerInput);
    if (match) {
        return match.path;
    }

    return null;
}
