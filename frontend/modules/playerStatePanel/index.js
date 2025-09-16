import { PlayerStatePanelUI } from './playerStatePanelUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'playerStatePanel',
  title: 'Player State',
  componentType: 'playerStatePanel',
  icon: '👤',
  column: 2, // Middle column
  description: 'Player State display panel.',
};

export async function register(registrationApi) {
    // Register the panel component
    registrationApi.registerPanelComponent('playerStatePanel', PlayerStatePanelUI);
}