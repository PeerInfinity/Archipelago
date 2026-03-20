// mazeGameLoops.js - Loop-compatible MetaGame Configuration for Maze Game Challenges
//
// Unlike mazeGame.js, this config does NOT override discovery settings.
// Loop mode already configures discovery appropriately (onExitDiscovered,
// no auto-discover). This config only adds maze challenges as gates
// for region moves and location checks.

import discoveryStateSingleton from '../../discovery/singleton.js';
import { stateManagerProxySingleton as stateManager } from '../../stateManager/index.js';
import { resolveIframeUrl } from '../../../app/config/knownIframePages.js';

export async function initializeMetaGame({ eventBus, dispatcher, logger, progressBarAPI, initializationApi }) {
  logger.info('mazeGameLoops', 'Initializing loop-compatible maze game metagame configuration...');

  try {
    // Register publishers for maze game events
    eventBus.registerPublisher('ui:activatePanel');
    eventBus.registerPublisher('amazingIdle:mazeCompleted');
    eventBus.registerPublisher('amazingIdle:setBiome');

    // Check if ?useWindow=1 is set — load into window adapter instead of iframe
    const useWindow = new URLSearchParams(window.location.search).get('useWindow');
    const loadEvent = useWindow ? 'window:loadUrl' : 'iframe:loadUrl';
    eventBus.registerPublisher(loadEvent);

    // Load the maze game into the iframe at startup (window mode defers until challenge starts)
    if (!useWindow) {
      const mazeUrl = resolveIframeUrl('mazegame');
      if (mazeUrl) {
        eventBus.publish(loadEvent, { url: mazeUrl });
        logger.info('mazeGameLoops', `Loading maze game via ${loadEvent}: ${mazeUrl}`);
      } else {
        logger.warn('mazeGameLoops', 'Could not resolve maze game URL');
      }
    } else {
      logger.info('mazeGameLoops', 'Window mode: deferring maze game load until challenge starts');
    }

    // Do NOT change discovery settings — loop mode manages them.
    // Enable loop mode automatically so ?mode=loops is not needed.
    eventBus.registerPublisher('loops:setLoopMode');
    eventBus.publish('loops:setLoopMode', { action: 'enable' });
    logger.info('mazeGameLoops', 'Loop mode enabled, discovery settings managed by loop mode');

    logger.info('mazeGameLoops', 'Loop-compatible maze game configuration initialized successfully');

  } catch (error) {
    logger.error('mazeGameLoops', 'Failed to initialize maze game configuration:', error);
    throw error;
  }
}

// Upgrades to apply with every maze challenge
const mazeUpgrades = {
  AUTO_MOVE: 1,
  BOT_MOVEMENT_SPEED: 5,
  AVOID_REVISIT_LAST_POSITION: 1,
  PRIORITIZE_UNVISITED: 1,
  AUTO_EXIT_MAZE: 5,
  BOT_REMEMBER_DEADEND_TILES: 5,
  PLAYER_MOVE_INDEPENDENTLY: 1,
  CLICK_TO_MOVE_UPGRADE: 1,
  CLICK_TO_MOVE_SPEED_MULTIPLIER_UPGRADE: 5,
};

export const metaGameConfiguration = {
  eventDispatcher: {
    'user:regionMove': {
      condition: (eventData) => {
        const target = eventData.targetRegion || eventData.region;
        return target && !discoveryStateSingleton.isRegionDiscovered(target);
      },
      actions: [
        {
          type: 'startMazeChallenge',
          challengeId: 'regionMoveMaze',
          config: {
            biome: 0,
            disableBiomeCheck: true,
            preserveScore: true,
            upgrades: mazeUpgrades,
            completionActions: [
              { type: 'forwardEvent', eventName: 'user:regionMove', direction: 'up' }
            ]
          }
        }
      ],
      stopPropagation: true
    },

    'user:locationCheck': {
      actions: [
        {
          type: 'startMazeChallenge',
          challengeId: 'locationCheckMaze',
          config: {
            biome: 0,
            disableBiomeCheck: true,
            preserveScore: true,
            upgrades: mazeUpgrades,
            completionActions: [
              { type: 'forwardEvent', eventName: 'user:locationCheck', direction: 'up' }
            ]
          }
        }
      ],
      stopPropagation: true
    },

    // Gate explore actions with a maze challenge. Each explore discovers one
    // location or exit, so completing a maze is required for each discovery.
    // Only trigger if the region has undiscovered locations or exits.
    'loop:exploreCompleted': {
      condition: (eventData) => {
        const regionName = eventData.regionName;
        if (!regionName) return false;
        const staticData = stateManager.getStaticData();
        const region = staticData?.regions?.get(regionName);
        if (!region) return false;
        const hasUndiscoveredLocation = (region.locations || []).some(
          loc => !discoveryStateSingleton.isLocationDiscovered(loc.name)
        );
        const hasUndiscoveredExit = (region.exits || []).some(
          exit => !discoveryStateSingleton.isExitDiscovered(regionName, exit.name)
        );
        return hasUndiscoveredLocation || hasUndiscoveredExit;
      },
      actions: [
        {
          type: 'startMazeChallenge',
          challengeId: 'exploreMaze',
          config: {
            biome: 0,
            disableBiomeCheck: true,
            preserveScore: true,
            upgrades: mazeUpgrades,
            completionActions: [
              { type: 'forwardEvent', eventName: 'loop:exploreCompleted', direction: 'up' }
            ]
          }
        }
      ],
      stopPropagation: true
    }
  },

  eventBus: {
    // No eventBus configuration needed
  }
};
