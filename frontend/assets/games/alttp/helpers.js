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
        this.debug?.log('Starting can_use_bombs() evaluation');
        
        // Get bombless_start flag state
        const bombless = this.state.hasFlag('bombless_start');
        this.debug?.log(`bombless_start flag: ${bombless}`);
        
        // Calculate base bombs
        let bombs = bombless ? 0 : 10;
        this.debug?.log(`Base bombs after bombless check: ${bombs}`);
        
        // Count upgrades
        const plus5Count = this.inventory.count('Bomb Upgrade (+5)');
        const plus10Count = this.inventory.count('Bomb Upgrade (+10)');
        const plus50Count = this.inventory.count('Bomb Upgrade (50)');
        
        this.debug?.log(`Upgrade counts:
            +5: ${plus5Count}
            +10: ${plus10Count}
            +50: ${plus50Count}`);
        
        // Add bombs from basic upgrades
        bombs += (plus5Count * 5);
        bombs += (plus10Count * 10);
        bombs += (plus50Count * 50);
        
        this.debug?.log(`Bombs after basic upgrades: ${bombs}`);
        
        // Add bonus bombs from extra +5 upgrades
        if (plus5Count > 6) {
            const bonusBombs = (plus5Count - 6) * 10;
            bombs += bonusBombs;
            this.debug?.log(`Added ${bonusBombs} bonus bombs from ${plus5Count - 6} extra +5 upgrades`);
        }
        
        const finalResult = bombs >= Math.min(count, 50);
        this.debug?.log(`Final result: ${finalResult} (have ${bombs} bombs, need ${count})`);
        
        return finalResult;
    }
    
    can_kill_most_things(count = 5) {
        return (
            this.has_melee_weapon() ||
            this.inventory.has('Cane of Somaria') ||
            (this.inventory.has('Cane of Byrna') && (count < 6 || this.can_extend_magic())) ||
            this.can_shoot_arrows() ||
            this.inventory.has('Fire Rod') ||
            this.can_use_bombs(count * 4)
        );
    }
    
    can_bomb_or_bonk() {
        return this.inventory.has('Pegasus Boots') || this.can_use_bombs();
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