import { GameHelpers } from '../../helpers/index.js';

export class ALTTPHelpers extends GameHelpers {
    has_sword() {
        return (
            this.inventory.has('Fighter Sword') ||
            this.inventory.has('Master Sword') ||
            this.inventory.has('Tempered Sword') ||
            this.inventory.has('Golden Sword')
        );
    }

    has_beam_sword() {
        return (
            this.inventory.has('Master Sword') ||
            this.inventory.has('Tempered Sword') ||
            this.inventory.has('Golden Sword')
        );
    }

    has_melee_weapon() {
        return this.has_sword() || this.inventory.has('Hammer');
    }

    can_lift_rocks() {
        return (
            this.inventory.has('Power Glove') || 
            this.inventory.has('Titans Mitts')
        );
    }
    
    can_use_bombs(count = 1) {
        let bombs = 0;
        // bombless_start means you need bombs to get bombs
        if (!this.state.hasFlag('bombless_start')) {
            bombs += 10;
        }

        bombs += (this.inventory.count('Bomb Upgrade (+5)') * 5);
        bombs += (this.inventory.count('Bomb Upgrade (+10)') * 10);
        bombs += (this.inventory.count('Bomb Upgrade (50)') * 50);

        // Handle upgrade calculation 
        const bonusBombs = Math.max(0, ((this.inventory.count('Bomb Upgrade (+5)') - 6) * 10));
        bombs += bonusBombs;

        // Check if we have enough
        return bombs >= Math.min(count, 50);
    }

    can_bomb_or_bonk() {
        return this.inventory.has('Pegasus Boots') || this.can_use_bombs();
    }

    can_lift_rocks() {
        return this.inventory.has('Power Glove') || this.inventory.has('Titans Mitts');
    }

    can_lift_heavy_rocks() {
        return this.inventory.has('Titans Mitts');
    }

    has_fire_source() {
        return this.inventory.has('Fire Rod') || this.inventory.has('Lamp');
    }

    can_shoot_arrows() {
        const hasBow = this.inventory.has('Bow') || this.inventory.has('Silver Bow');
        // Using same logic as StateHelpers.py
        if (this.state.hasFlag('retro_bow')) {
            return hasBow && this.inventory.has('Single Arrow');
        }
        return hasBow;
    }
}