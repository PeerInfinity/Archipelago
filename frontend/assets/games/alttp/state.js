// frontend/assets/games/alttp/state.js

import { GameState } from '../../helpers/index.js';

export class ALTTPState extends GameState {
    constructor(logger = null) {
        super(logger);
        // Initialize with the flags we know we need
        if (logger) {
            this.log('Initializing ALTTPState');
        }
        this.setFlag('bombless_start'); // Default in current test setup
    }
}