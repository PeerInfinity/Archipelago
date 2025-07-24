import { PlayerStatePanelUI } from './playerStatePanelUI.js';

export async function register(registrationApi) {
    // Register the panel component
    registrationApi.registerPanelComponent('playerStatePanel', PlayerStatePanelUI);
}