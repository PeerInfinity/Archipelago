import { ZONES, PERKS } from './gameData.js';

console.log('Zone 2 tasks and their effects:');
const zone = ZONES[2];
for (const task of zone.tasks) {
    console.log(`\n${task.name}:`);
    console.log(`  Skills: ${task.skills.join(', ')}`);
    console.log(`  Reps: ${task.maxReps}`);
    if (task.perk !== null) {
        const perk = PERKS[task.perk];
        console.log(`  Perk: ${perk?.name || task.perk}`);
    }
    if (task.item !== null) {
        console.log(`  Item: ${task.item}`);
    }
}

console.log('\n\nPerk effects for Zone 2 perks (2, 10):');
[2, 10].forEach(perkId => {
    const perk = PERKS[perkId];
    console.log(`\nPerk ${perkId} (${perk?.name}):`);
    console.log(`  Skill modifiers: ${JSON.stringify(perk?.skillModifiers)}`);
});
