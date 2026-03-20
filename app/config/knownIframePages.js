// Shared known iframe pages configuration
// Used by iframeManagerPanel UI and URL parameter handling

export const knownIframePages = [
    {
        name: "Text Adventure (Standalone)",
        url: "./modules/textAdventure-remote/index-iframe.html",
        description: "Interactive text adventure running in iframe",
        shortName: "textadventure"
    },
    {
        name: "Iframe Base",
        url: "./modules/iframe-base/index.html",
        description: "Basic iframe module showing connection status and heartbeat",
        shortName: "iframebase"
    },
    {
        name: "A-Mazing-Idle",
        url: "./modules/a-mazing-idle-remote/index-iframe.html",
        description: "Incremental maze game with bot automation",
        shortName: "mazegame"
    },
    {
        name: "Journey to Ascension",
        url: "./modules/jta-remote/index-iframe.html",
        description: "Incremental RPG adventure game",
        shortName: "jta"
    }
];

/**
 * Resolve an iframe URL from a shortname or pass through a full URL.
 * @param {string} input - A shortname (e.g., "mazegame") or a URL
 * @returns {string|null} The resolved URL, or null if input is empty
 */
export function resolveIframeUrl(input) {
    if (!input) return null;

    const trimmed = input.trim();
    if (!trimmed) return null;

    // Check if input matches a known shortname (case-insensitive)
    const lowerInput = trimmed.toLowerCase();
    const match = knownIframePages.find(page => page.shortName === lowerInput);
    if (match) {
        return match.url;
    }

    // Otherwise treat as a URL passthrough
    return trimmed;
}
