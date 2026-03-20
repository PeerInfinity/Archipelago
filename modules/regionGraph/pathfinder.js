/**
 * Re-export PathFinder from shared module for backward compatibility
 *
 * The PathFinder class has been moved to frontend/modules/shared/pathfinder.js
 * to allow use by multiple modules (regionGraph, loops, tests).
 */
export { PathFinder } from '../shared/pathfinder.js';
