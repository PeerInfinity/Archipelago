// A-Mazing-Idle integration client for Archipelago iframe adapter
// Connects the maze game to the Archipelago eventBus via IframeClient
import { IframeClient } from '../iframe-base/iframeClient.js';

const LOG_PREFIX = '[MazeGameClient]';

/**
 * Update connection status bar in UI
 * @param {string} status - Status message
 * @param {string} type - Status type ('connecting', 'connected', 'error')
 */
function updateConnectionStatus(status, type = 'connecting') {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.className = `connection-status ${type}`;
    }
}

/**
 * Click the game's manual save button to flush in-memory state to localStorage.
 * The game auto-saves every 20s, so without this, localStorage reads get stale data.
 */
function triggerManualSave() {
    const btn = document.querySelector('#manualSaveGameButton');
    if (btn) {
        btn.click();
    }
}

/**
 * Read TOTAL_MAZES_COMPLETED from the save data in localStorage.
 * Stats are stored as a serialized Map: save.stats.statsMap = "~~[[key,val],...]"
 * @returns {number}
 */
function readTotalMazesCompleted() {
    const saveData = localStorage.getItem('a-mazing-idle');
    if (!saveData) return 0;
    try {
        const save = JSON.parse(saveData);
        const statsStr = save.stats?.statsMap;
        if (!statsStr) return 0;
        const arr = JSON.parse(statsStr.replace('~~', ''));
        const entry = arr.find(e => e[0] === 'TOTAL_MAZES_COMPLETED');
        return entry ? entry[1] : 0;
    } catch {
        return 0;
    }
}

/**
 * Wait for the game to initialize (maze tbody has child rows)
 * @param {number} timeoutMs - Maximum wait time
 * @returns {Promise<void>}
 */
function waitForGameReady(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        function check() {
            const tbody = document.querySelector('#maze tbody');
            if (tbody && tbody.children.length > 0) {
                console.log(`${LOG_PREFIX} Game initialized (maze has ${tbody.children.length} rows)`);
                resolve();
                return;
            }
            if (Date.now() - startTime > timeoutMs) {
                reject(new Error('Timed out waiting for game initialization'));
                return;
            }
            setTimeout(check, 100);
        }

        check();
    });
}

/**
 * Set up MutationObserver on completion requirements panel to detect exit unlock.
 * At biome 8+, the exit is locked until keys are found. The checkmark element's
 * display changes from 'none' to 'flex' when all keys are collected.
 * @param {IframeClient} client
 */
function setupExitUnlockDetection(client) {
    const checkMark = document.querySelector('#mazeCompletionRequirementsMazeKeysCheckMark');
    if (!checkMark) {
        console.log(`${LOG_PREFIX} No completion requirements panel (biome < 8), skipping exit unlock detection`);
        return;
    }

    let wasUnlocked = checkMark.style.display === 'flex';

    const observer = new MutationObserver(() => {
        const isUnlocked = checkMark.style.display === 'flex';
        if (isUnlocked && !wasUnlocked) {
            console.log(`${LOG_PREFIX} Exit unlocked (keys found)`);
            client.publishEventBus('amazingIdle:exitUnlocked', {
                timestamp: Date.now()
            });
        }
        wasUnlocked = isUnlocked;
    });

    observer.observe(checkMark, { attributes: true, attributeFilter: ['style'] });
    console.log(`${LOG_PREFIX} Exit unlock observer active`);
}

/**
 * Set up MutationObserver on #maze to detect maze completions.
 * The game rebuilds the maze DOM on completion, producing many childList mutations.
 * @param {IframeClient} client
 */
function setupMazeCompletionDetection(client) {
    const mazeElement = document.querySelector('#maze');
    if (!mazeElement) {
        console.warn(`${LOG_PREFIX} #maze element not found, skipping completion detection`);
        return;
    }

    // Initialize baseline maze count from save data
    triggerManualSave();
    let lastMazeCount = readTotalMazesCompleted();
    let completionCount = 0;
    console.log(`${LOG_PREFIX} Baseline TOTAL_MAZES_COMPLETED: ${lastMazeCount}`);

    // Debounce: maze rebuild produces ~63 mutations at once for a 5x5 maze.
    // We batch them and fire one event per rebuild.
    let debounceTimer = null;

    const observer = new MutationObserver((mutations) => {
        const childChanges = mutations.filter(m => m.type === 'childList');
        if (childChanges.length === 0) return;

        // Debounce: wait for the batch of mutations to settle
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // Flush in-memory state and check if a real completion occurred
            triggerManualSave();
            const currentMazeCount = readTotalMazesCompleted();

            if (currentMazeCount > lastMazeCount) {
                completionCount++;
                lastMazeCount = currentMazeCount;
                console.log(`${LOG_PREFIX} Maze completed (#${completionCount}, total: ${currentMazeCount}, ${childChanges.length} DOM changes)`);

                client.publishEventBus('amazingIdle:mazeCompleted', {
                    completionCount,
                    totalMazesCompleted: currentMazeCount,
                    mutationCount: childChanges.length,
                    timestamp: Date.now()
                });
            } else {
                console.log(`${LOG_PREFIX} Maze DOM rebuild (not a completion, total still ${currentMazeCount}, ${childChanges.length} DOM changes)`);
            }
        }, 50);
    });

    observer.observe(mazeElement, { childList: true, subtree: true });
    console.log(`${LOG_PREFIX} Maze completion observer active`);
}

/**
 * Export the current game save from localStorage
 * @param {IframeClient} client
 */
function exportSave(client) {
    triggerManualSave();
    const saveData = localStorage.getItem('a-mazing-idle');
    if (saveData) {
        console.log(`${LOG_PREFIX} Exporting save (${saveData.length} chars)`);
        client.publishEventBus('amazingIdle:saveExported', {
            saveJson: saveData,
            timestamp: Date.now()
        });
    } else {
        console.warn(`${LOG_PREFIX} No save data found in localStorage`);
        client.publishEventBus('amazingIdle:saveExported', {
            saveJson: null,
            error: 'No save data found',
            timestamp: Date.now()
        });
    }
}

const DISABLE_BIOME_CHECK_KEY = 'a-mazing-idle-disable-biome-check';

/**
 * Import a save by blocking the game's setItem, writing directly, and reloading
 * @param {string} saveJson - JSON string of the save data
 */
function importSave(saveJson, disableBiomeCheck = false) {
    console.log(`${LOG_PREFIX} Importing save (${saveJson.length} chars)`);

    // Validate JSON
    try {
        JSON.parse(saveJson);
    } catch (e) {
        console.error(`${LOG_PREFIX} Invalid save JSON:`, e.message);
        return;
    }

    // Block the game's own saves during import
    const origSetItem = localStorage.setItem.bind(localStorage);
    if (disableBiomeCheck) {
        origSetItem(DISABLE_BIOME_CHECK_KEY, '1');
    }
    localStorage.setItem = function() {};

    // Write the save data directly
    origSetItem('a-mazing-idle', saveJson);

    // Reload to apply
    location.reload();
}

/**
 * Inject points into the current save and reload
 * @param {object} data - Must contain { points: number }
 */
function injectPoints(data) {
    const points = data?.points;
    if (typeof points !== 'number' || points <= 0) {
        console.error(`${LOG_PREFIX} injectPoints: invalid points value`, points);
        return;
    }

    triggerManualSave();
    const saveData = localStorage.getItem('a-mazing-idle');
    if (!saveData) {
        console.error(`${LOG_PREFIX} injectPoints: no save data in localStorage`);
        return;
    }

    let save;
    try {
        save = JSON.parse(saveData);
    } catch (e) {
        console.error(`${LOG_PREFIX} injectPoints: failed to parse save`, e.message);
        return;
    }

    // Set points
    if (!save.points) save.points = {};
    save.points.points = points;
    console.log(`${LOG_PREFIX} Injecting ${points} points`);

    const newSaveJson = JSON.stringify(save);

    // Block the game's own saves during write
    const origSetItem = localStorage.setItem.bind(localStorage);
    if (data.disableBiomeCheck) {
        origSetItem(DISABLE_BIOME_CHECK_KEY, '1');
    }
    localStorage.setItem = function() {};

    // Write modified save
    origSetItem('a-mazing-idle', newSaveJson);

    // Reload to apply
    location.reload();
}

/**
 * Set the biome in the current save and reload
 * @param {object} data - Must contain { biome: number }
 *   Optional: { upgrades: { KEY: level, ... }, disableBiomeCheck: boolean }
 */
function setBiome(data) {
    console.log(`${LOG_PREFIX} setBiome received data:`, JSON.stringify(data));
    const biome = data?.biome;
    if (typeof biome !== 'number' || biome < 0) {
        console.error(`${LOG_PREFIX} setBiome: invalid biome value`, biome);
        return;
    }

    triggerManualSave();
    const saveData = localStorage.getItem('a-mazing-idle');
    if (!saveData) {
        console.error(`${LOG_PREFIX} setBiome: no save data in localStorage`);
        return;
    }

    let save;
    try {
        save = JSON.parse(saveData);
    } catch (e) {
        console.error(`${LOG_PREFIX} setBiome: failed to parse save`, e.message);
        return;
    }

    // Set biome upgrade
    if (!save.upgrades) save.upgrades = {};
    if (!save.upgrades.upgradeMap) save.upgrades.upgradeMap = {};
    save.upgrades.upgradeMap.BIOME = biome;
    console.log(`${LOG_PREFIX} Setting biome to ${biome}`);

    // Apply additional upgrades if provided
    if (data.upgrades && typeof data.upgrades === 'object') {
        for (const [key, value] of Object.entries(data.upgrades)) {
            save.upgrades.upgradeMap[key] = value;
        }
        console.log(`${LOG_PREFIX} Applied ${Object.keys(data.upgrades).length} upgrades`);
    }

    // Store flag so biome check is disabled after reload
    const origSetItem = localStorage.setItem.bind(localStorage);
    if (data.disableBiomeCheck) {
        origSetItem(DISABLE_BIOME_CHECK_KEY, '1');
    }

    const newSaveJson = JSON.stringify(save);

    // Block the game's own saves during write
    localStorage.setItem = function() {};

    // Write modified save
    origSetItem('a-mazing-idle', newSaveJson);

    // Reload to apply
    location.reload();
}

/**
 * Zero out all biome requirements in the game's BIOME_UPGRADE_UNLOCKS map,
 * so upgrades take effect regardless of the current biome level.
 * Requires the pre-bundle hook in index-iframe.html to have captured the map.
 */
function disableBiomeCheck() {
    if (window.__biomeUpgradeUnlocks) {
        for (const key of window.__biomeUpgradeUnlocks.keys()) {
            window.__biomeUpgradeUnlocks.set(key, 0);
        }
        console.log(`${LOG_PREFIX} Biome check disabled (${window.__biomeUpgradeUnlocks.size} upgrades unlocked)`);
    } else {
        console.warn(`${LOG_PREFIX} BIOME_UPGRADE_UNLOCKS map not captured, cannot disable biome check`);
    }
}

/**
 * Set up eventBus subscriptions for save import/export
 * @param {IframeClient} client
 */
function setupSaveSubscriptions(client) {
    // Listen for save export requests from the parent
    client.subscribeEventBus('amazingIdle:exportSave', () => {
        exportSave(client);
    });

    // Listen for save import requests from the parent
    client.subscribeEventBus('amazingIdle:importSave', (data) => {
        if (data && data.saveJson) {
            importSave(data.saveJson, data.disableBiomeCheck);
        } else {
            console.warn(`${LOG_PREFIX} importSave event received without saveJson`);
        }
    });

    // Listen for point injection requests from the parent
    client.subscribeEventBus('amazingIdle:injectPoints', (data) => {
        injectPoints(data);
    });

    // Listen for biome set requests from the parent
    client.subscribeEventBus('amazingIdle:setBiome', (data) => {
        setBiome(data);
    });

    // Listen for biome check disable requests from the parent
    client.subscribeEventBus('amazingIdle:disableBiomeCheck', () => {
        disableBiomeCheck();
    });

    // Listen for new maze requests from the parent
    client.subscribeEventBus('amazingIdle:newMaze', () => {
        const btn = document.querySelector('#experimentNewMaze');
        if (btn) {
            btn.click();
            console.log(`${LOG_PREFIX} New maze triggered via #experimentNewMaze`);
        } else {
            console.warn(`${LOG_PREFIX} #experimentNewMaze button not found`);
        }
    });

    console.log(`${LOG_PREFIX} Save subscriptions active`);
}

/**
 * Main initialization flow
 */
async function initialize() {
    try {
        console.log(`${LOG_PREFIX} Starting initialization...`);

        // Hide connection status when embedded in iframe panel
        if (window.self !== window.top) {
            document.body.classList.add('iframe-embedded');
        }

        updateConnectionStatus('Waiting for game to load...');

        // 1. Wait for game DOM ready
        await waitForGameReady();

        // Disable biome check if flagged by a prior setBiome call
        if (localStorage.getItem(DISABLE_BIOME_CHECK_KEY)) {
            localStorage.removeItem(DISABLE_BIOME_CHECK_KEY);
            disableBiomeCheck();
            // Simulate SWDA keypresses to activate upgrades — the game's bot
            // doesn't pick up upgrade changes until at least one player move.
            setTimeout(() => {
                const keyCodes = [83, 87, 68, 65]; // S, W, D, A
                for (const kc of keyCodes) {
                    document.dispatchEvent(new KeyboardEvent('keydown', {
                        keyCode: kc, which: kc, bubbles: true
                    }));
                }
                console.log(`${LOG_PREFIX} Simulated SWDA keypresses to activate upgrades`);
            }, 200);
        }

        updateConnectionStatus('Connecting to Archipelago...');

        // 2. Create IframeClient and connect
        const client = new IframeClient();
        const connected = await client.connect();

        if (!connected) {
            throw new Error('Failed to establish connection with Archipelago adapter');
        }

        console.log(`${LOG_PREFIX} Connected to Archipelago adapter`);
        updateConnectionStatus('Connected', 'connected');

        // Make client available for debugging
        window.mazeGameClient = client;

        // 3. Set up maze completion detection
        setupMazeCompletionDetection(client);

        // 4. Set up exit unlock detection (biome 8+)
        setupExitUnlockDetection(client);

        // 5. Set up save import/export subscriptions
        setupSaveSubscriptions(client);

        // 6. Notify adapter that we're fully ready
        client.notifyAppReady();

        updateConnectionStatus('Ready - A-Mazing-Idle loaded', 'connected');
        console.log(`${LOG_PREFIX} Initialization complete`);

    } catch (error) {
        console.error(`${LOG_PREFIX} Initialization failed:`, error);
        updateConnectionStatus(`Error: ${error.message}`, 'error');
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
