// Shared known window pages configuration
// Used by windowManagerPanel UI and URL parameter handling

export const knownWindowPages = [
    {
        name: "Text Adventure (Standalone)",
        url: "./modules/textAdventure-remote/index-iframe.html",
        description: "Interactive text adventure in separate window",
        shortName: "textadventure"
    },
    {
        name: "Window Base",
        url: "./modules/window-base/index.html",
        description: "Basic window module showing connection status and heartbeat",
        shortName: "windowbase"
    },
    {
        name: "A-Mazing-Idle",
        url: "./modules/a-mazing-idle-remote/index-iframe.html",
        description: "Incremental maze game in separate window",
        shortName: "mazegame"
    },
    {
        name: "Journey to Ascension",
        url: "./modules/jta-remote/index-iframe.html",
        description: "Incremental RPG adventure in separate window",
        shortName: "jta"
    }
];

/**
 * Resolve a window URL from a shortname or pass through a full URL.
 * @param {string} input - A shortname (e.g., "mazegame") or a URL
 * @returns {string|null} The resolved URL, or null if input is empty
 */
export function resolveWindowUrl(input) {
    if (!input) return null;

    const trimmed = input.trim();
    if (!trimmed) return null;

    // Check if input matches a known shortname (case-insensitive)
    const lowerInput = trimmed.toLowerCase();
    const match = knownWindowPages.find(page => page.shortName === lowerInput);
    if (match) {
        return match.url;
    }

    // Otherwise treat as a URL passthrough
    return trimmed;
}
