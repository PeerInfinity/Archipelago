#!/usr/bin/env node
/**
 * JTA Cost Debugger CLI
 *
 * Generates costs via simulated playthrough and outputs a detailed
 * step-by-step report. Each step = one action queue (one energy budget).
 *
 * Usage:
 *   node scripts/jta/cost-debugger.js \
 *     --gamedata frontend/presets/jta/AP_SEED/AP_SEED_P1_Player1_gamedata.json \
 *     --spherelog frontend/presets/jta/AP_SEED/AP_SEED_sphere_log.jsonl \
 *     --output jta_cost_debug_report.json \
 *     --normal-attempts 1 --perk-attempts 5 --boss-attempts 5 \
 *     --player 1
 */

import { readFileSync, writeFileSync } from 'fs';
import { JTACostPlanner } from '../../frontend/modules/jtaCostDebugger/jtaCostPlanner.js';

function parseArgs(argv) {
    const args = { verbose: 0 };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--gamedata' || arg === '-g') {
            args.gamedata = argv[++i];
        } else if (arg === '--spherelog' || arg === '-s') {
            args.spherelog = argv[++i];
        } else if (arg === '--output' || arg === '-o') {
            args.output = argv[++i];
        } else if (arg === '--normal-attempts') {
            args.normalAttempts = parseInt(argv[++i]);
        } else if (arg === '--perk-attempts') {
            args.perkAttempts = parseInt(argv[++i]);
        } else if (arg === '--boss-attempts') {
            args.bossAttempts = parseInt(argv[++i]);
        } else if (arg === '--player' || arg === '-p') {
            args.player = parseInt(argv[++i]);
        } else if (arg === '--traversal-attempts') {
            args.traversalAttempts = parseInt(argv[++i]);
        } else if (arg === '--traversal-cost-scale') {
            args.traversalCostScale = parseFloat(argv[++i]);
        } else if (arg === '--adjust-xp') {
            args.adjustXpMult = true;
        } else if (arg === '--two-pass') {
            args.twoPass = true;
            args.adjustXpMult = true; // first pass needs xp adjustment
        } else if (arg === '-v' || arg === '--verbose') {
            args.verbose++;
        } else if (arg === '-vv') {
            args.verbose = 2;
        } else if (arg === '--debug-solver') {
            args.debugSolver = true;
        } else if (arg === '--debug-solver-step') {
            args.debugSolverStep = parseInt(argv[++i]);
            args.debugSolver = true;
        } else if (arg === '--debug-solver-iter') {
            args.debugSolverIter = parseInt(argv[++i]);
        } else if (arg === '--queue-all') {
            args.queueAll = true;
        } else if (arg === '--help' || arg === '-h') {
            args.help = true;
        }
    }
    return args;
}

function printUsage() {
    console.log(`
JTA Cost Debugger - Simulated Playthrough Cost Generator

Usage:
  node scripts/jta/cost-debugger.js [options]

Options:
  -g, --gamedata <path>         Randomized game data JSON (required)
  -s, --spherelog <path>        Sphere log JSONL (required)
  -o, --output <path>           Output path for report JSON (default: stdout summary only)
  --normal-attempts <n>         Attempts for regular tasks (default: 2)
  --perk-attempts <n>           Attempts for perk tasks (default: 5)
  --boss-attempts <n>           Attempts for boss tasks (default: 5)
  -p, --player <n>              Player number in sphere log (default: 1)
  --adjust-xp                   Adjust xpMult on grinding tasks to hit exact attempt counts
  --two-pass                    Two-pass mode: first pass with xpMult adjustment, second pass
                                  uses the xpMult values from the first pass (implies --adjust-xp)
  -h, --help                    Show this help

Verbosity:
  -v, --verbose                 Level 1: formula, notes, cost scale, queue on cost-assignment steps
  -vv                           Level 2: state snapshots, XP per queue entry, all grinding tables
  --queue-all                   Show queue breakdown for every step (not just cost-assignment steps)
  --debug-solver                Show binary search convergence data for cost solving
  --debug-solver-step <n>       Show solver debug only for step N (implies --debug-solver)
  --debug-solver-iter <n>       Expand inner simulation for iteration N (requires --debug-solver-step)

Example:
  node scripts/jta/cost-debugger.js \\
    -g frontend/presets/jta/AP_14089154938208861744/AP_14089154938208861744_P1_Player1_gamedata.json \\
    -s frontend/presets/jta/AP_14089154938208861744/AP_14089154938208861744_sphere_log.jsonl \\
    -o jta_cost_debug_report.json
`);
}

// ============================================================================
// Verbose output helpers
// ============================================================================

function printStepVerbose(step, verbose, queueAll) {
    const showQueue = queueAll || !!step.costAssignment;
    if (!showQueue && verbose < 2) return;

    // Cost assignment details
    if (step.costAssignment) {
        const ca = step.costAssignment;
        console.log(`    Formula: ${ca.formula}`);
        if (ca.costScale !== undefined && ca.costScale !== 1) {
            console.log(`    Cost scale: ${ca.costScale.toFixed(2)} (${ca.category}), preSolved=${ca.preSolvedCostMult?.toFixed(6) ?? '-'}, final=${ca.costMult.toFixed(6)}`);
        }
        if (ca.xpAdjustments && ca.xpAdjustments.length > 0) {
            const mult = ca.xpAdjustments[0].multiplier;
            const dir = mult > 1 ? 'increased' : 'reduced';
            console.log(`    XP adjustment: ${ca.xpAdjustments.length} tasks ${dir} by x${mult.toFixed(4)}`);
            if (verbose >= 2) {
                for (const adj of ca.xpAdjustments.slice(0, 10)) {
                    console.log(`      ${adj.taskName.padEnd(36)} xpMult: ${adj.origXpMult.toFixed(4)} -> ${adj.newXpMult.toFixed(4)}`);
                }
                if (ca.xpAdjustments.length > 10) {
                    console.log(`      ... and ${ca.xpAdjustments.length - 10} more`);
                }
            }
        }
    }

    // Notes
    if (step.notes && step.notes.length > 0) {
        for (const note of step.notes) {
            console.log(`    Note: ${note}`);
        }
    }

    // Queue breakdown
    if (showQueue && step.queue && step.queue.length > 0) {
        const showXp = verbose >= 2;
        const xpHeader = showXp ? '     XP' : '';
        const xpSep = showXp ? '-------' : '';
        console.log(`    Queue (${step.queue.length} entries):`);
        console.log(`      ${'Task'.padEnd(32)} ${'Type'.padEnd(10)} ${'Status'.padEnd(16)} ${'E.Before'.padStart(8)} ${'Cost'.padStart(7)} ${'E.After'.padStart(8)}${xpHeader}`);
        console.log(`      ${'-'.repeat(32)} ${'-'.repeat(10)} ${'-'.repeat(16)} ${'-'.repeat(8)} ${'-'.repeat(7)} ${'-'.repeat(8)} ${xpSep}`);
        for (const entry of step.queue) {
            const name = entry.taskName.length > 32 ? entry.taskName.substring(0, 31) + '\u2026' : entry.taskName;
            const xpCol = showXp ? `${(entry.xpGained?.toFixed(0) ?? '-').padStart(7)}` : '';
            console.log(
                `      ${name.padEnd(32)} ${(entry.type || '').padEnd(10)} ${entry.status.padEnd(16)} ` +
                `${(entry.energyBefore?.toFixed(1) ?? '-').padStart(8)} ${(entry.energyCost?.toFixed(1) ?? '-').padStart(7)} ` +
                `${(entry.energyAfter?.toFixed(1) ?? '-').padStart(8)} ${xpCol}`
            );
        }
    }

    // State snapshots (level 2)
    if (verbose >= 2) {
        printStateSnapshot(step.stateBefore, 'Before');
        printStateSnapshot(step.stateAfter, 'After');
    }
}

function printStateSnapshot(state, label) {
    if (!state) return;
    const skills = Object.entries(state.skillLevels || {})
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
    const perks = Array.isArray(state.perks) ? state.perks.length : 0;
    console.log(`    ${label}: maxE=${state.maxEnergy?.toFixed(1)} highestZone=${state.highestZone ?? '?'} perks=${perks} skills={${skills || 'none'}}`);
}

function printGrindingTable(step) {
    const gp = step.grindPlan;
    if (!gp || gp.tasks.length === 0) return;
    console.log(`\n--- XP Grinding Efficiency (Step ${step.stepIndex}: "${step.targetTask}") ---\n`);
    console.log(`  Target skills: ${gp.targetSkills?.join(', ') || 'none'}`);
    console.log('  Task                                Zone                 Skills          Cost      XP    XP/E   Eff  Rel Sel');
    console.log('  ' + '-'.repeat(115));
    for (const gt of gp.tasks) {
        console.log(
            `  ${gt.taskName.padEnd(36)} ${(gt.zoneName || '').padEnd(20)} ` +
            `${gt.skills.join(',').padEnd(14)} ` +
            `${gt.cost.toFixed(1).padStart(6)} ${gt.xp.toFixed(0).padStart(7)} ` +
            `${gt.xpPerEnergy.toFixed(1).padStart(7)} ` +
            `${(gt.effectiveXpPerEnergy?.toFixed(1) || '-').padStart(5)}  ` +
            `${gt.trainsTargetSkill ? 'Y' : ' '}   ${gt.selected ? 'Y' : ''}`
        );
    }
    console.log(`  Budget: ${gp.budget.toFixed(1)} | Selected: ${gp.tasksSelected}/${gp.candidatesConsidered}${gp.targetAffordable ? ' (target affordable, grinding skipped)' : ''}`);
}

function printSolverDebug(step) {
    const sd = step.costAssignment?.solverDebug;
    if (!sd || sd.length === 0) return;

    console.log(`\n    --- Solver Debug (Step ${step.stepIndex}: "${step.costAssignment.taskName}") ---`);

    // Energy solver entries
    const energyEntries = sd.filter(e => e.type?.startsWith('energy_'));
    if (energyEntries.length > 0) {
        const approx = energyEntries.find(e => e.type === 'energy_initial_approx');
        const result = energyEntries.find(e => e.type === 'energy_result');
        const iters = energyEntries.filter(e => e.type === 'energy_iteration');

        console.log('    Energy solver (solveCostMultForEnergy):');
        if (approx) {
            console.log(`      Initial approx: costMult=${approx.approxCostMult.toFixed(6)}, actualCost=${approx.actualCost.toFixed(2)}, target=${approx.target.toFixed(2)}`);
            console.log(`      Parameters: targetEnergy=${approx.targetEnergy.toFixed(2)}, margin=${approx.margin}, progress=${approx.progress.toFixed(4)}, drain=${approx.drain.toFixed(4)}, maxReps=${approx.maxReps}`);
        }
        if (iters.length > 0) {
            console.log(`      ${'Iter'.padStart(6)} ${'lo'.padStart(12)} ${'hi'.padStart(12)} ${'mid'.padStart(12)} ${'actualCost'.padStart(12)} ${'target'.padStart(12)} ${'decision'.padEnd(8)}`);
            console.log(`      ${'-'.repeat(6)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(8)}`);
            for (const e of iters) {
                console.log(
                    `      ${String(e.iteration).padStart(6)} ${e.lo.toFixed(6).padStart(12)} ${e.hi.toFixed(6).padStart(12)} ` +
                    `${e.mid.toFixed(6).padStart(12)} ${e.actualCost.toFixed(4).padStart(12)} ${e.target.toFixed(4).padStart(12)} ${e.decision}`
                );
            }
        }
        if (result) {
            console.log(`      Result: costMult=${result.finalCostMult.toFixed(6)} (${result.totalIterations} iterations)`);
        }
    }

    // Phase 1: attempts solver
    const phase1 = sd.filter(e => e.type === 'attempts_phase1');
    const phase1Result = sd.find(e => e.type === 'attempts_phase1_result');
    if (phase1.length > 0) {
        console.log(`    Phase 1: Binary search costMult for ${phase1Result?.targetAttempts ?? '?'} attempts`);
        console.log(`      ${'Iter'.padStart(6)} ${'costMult'.padStart(12)} ${'attempts'.padStart(10)} ${'best'.padStart(12)} ${'bestAttempts'.padStart(13)} ${'decision'.padEnd(8)}`);
        console.log(`      ${'-'.repeat(6)} ${'-'.repeat(12)} ${'-'.repeat(10)} ${'-'.repeat(12)} ${'-'.repeat(13)} ${'-'.repeat(8)}`);
        for (const e of phase1) {
            console.log(
                `      ${String(e.iteration).padStart(6)} ${e.candidateCost.toFixed(4).padStart(12)} ` +
                `${String(e.attempts).padStart(10)} ${(e.bestCost?.toFixed(4) ?? '-').padStart(12)} ` +
                `${String(e.bestAttempts).padStart(13)} ${e.decision}`
            );
        }
        if (phase1Result) {
            console.log(`      Result: costMult=${phase1Result.finalCostMult.toFixed(6)}, bestAttempts=${phase1Result.bestAttempts}/${phase1Result.targetAttempts}`);
        }
    }

    // Phase 2/3: xpMult solver
    const separator = sd.find(e => e.type === 'phase_separator');
    const phase2 = sd.filter(e => e.type === 'attempts_phase2');
    const phase3 = sd.filter(e => e.type === 'attempts_phase3');
    const xpPhaseEntries = phase3.length > 0 ? phase3 : phase2;
    if (xpPhaseEntries.length > 0) {
        const phaseNum = phase3.length > 0 ? 3 : 2;
        const direction = phase3.length > 0 ? 'increase XP to reduce attempts' : 'reduce XP to increase attempts';
        const extra = separator?.attemptsAtFloor !== undefined ? `, attempts at floor=${separator.attemptsAtFloor}` : '';
        console.log(`    Phase ${phaseNum}: xpMult binary search — ${direction} (${separator?.taskCount ?? '?'} tasks${extra})`);
        console.log(`      ${'Iter'.padStart(6)} ${'xpMult'.padStart(12)} ${'attempts'.padStart(10)} ${'bestXpMult'.padStart(12)} ${'decision'.padEnd(8)}`);
        console.log(`      ${'-'.repeat(6)} ${'-'.repeat(12)} ${'-'.repeat(10)} ${'-'.repeat(12)} ${'-'.repeat(8)}`);
        for (const e of xpPhaseEntries) {
            console.log(
                `      ${String(e.iteration).padStart(6)} ${e.xpMultiplier.toFixed(6).padStart(12)} ` +
                `${String(e.attempts).padStart(10)} ${(e.bestXpMult?.toFixed(6) ?? '-').padStart(12)} ${e.decision}`
            );
        }
    }

    console.log('');
}

// ============================================================================
// Main
// ============================================================================

const args = parseArgs(process.argv);
const verbose = args.verbose;

if (args.help) {
    printUsage();
    process.exit(0);
}

if (!args.gamedata || !args.spherelog) {
    console.error('Error: --gamedata and --spherelog are required');
    printUsage();
    process.exit(1);
}

// Load inputs
const gameDataJson = JSON.parse(readFileSync(args.gamedata, 'utf-8'));
const sphereLogContent = readFileSync(args.spherelog, 'utf-8');

const settings = {
    normalAttempts: args.normalAttempts ?? 2,
    perkAttempts: args.perkAttempts ?? 5,
    bossAttempts: args.bossAttempts ?? 5,
    traversalAttempts: args.traversalAttempts ?? 5,
    traversalCostScale: args.traversalCostScale ?? 0.5,
    playerNumber: args.player ?? 1,
    adjustXpMult: args.adjustXpMult ?? false,
};

// Map debug flags to planner settings
if (args.debugSolver) {
    settings.captureSolverDebug = true;
    if (args.debugSolverStep !== undefined) {
        settings.solverDebugSteps = [args.debugSolverStep];
    }
}

console.log(`Loading game data from: ${args.gamedata}`);
console.log(`Loading sphere log from: ${args.spherelog}`);
console.log(`Settings: normal=${settings.normalAttempts}, perk=${settings.perkAttempts}, boss=${settings.bossAttempts}, player=${settings.playerNumber}`);
if (verbose > 0) console.log(`Verbosity: level ${verbose}${args.debugSolver ? `, debug-solver${args.debugSolverStep !== undefined ? ` (step ${args.debugSolverStep})` : ''}` : ''}${args.queueAll ? ', queue-all' : ''}`);
console.log('');

// Run cost debugger
const startTime = Date.now();
let planner = new JTACostPlanner();
const useExpansion = args.debugSolverStep !== undefined && args.debugSolverIter !== undefined;

// Progress callback for CLI
let lastProgressTime = Date.now();
const cliProgress = ({ sphereNum, totalSpheres, stepsGenerated, tasksCosted }) => {
    const now = Date.now();
    if (now - lastProgressTime > 1000) {
        lastProgressTime = now;
        process.stdout.write(`\r  Sphere ${sphereNum}/${totalSpheres}, ${stepsGenerated} steps, ${tasksCosted} tasks...`);
    }
};

let result = useExpansion
    ? planner.planCostsWithExpansion(gameDataJson, sphereLogContent, settings, args.debugSolverStep, args.debugSolverIter)
    : planner.planCosts(gameDataJson, sphereLogContent, { ...settings, onProgress: cliProgress });
if (lastProgressTime > startTime + 1000) process.stdout.write('\r' + ' '.repeat(60) + '\r'); // clear progress line
let verifyGameData = gameDataJson;

// Two-pass mode: collect xpMult adjustments from pass 1, bake them into
// the game data, then re-run without adjustXpMult.
if (args.twoPass) {
    const pass1Elapsed = Date.now() - startTime;
    const xpMultOverrides = new Map();

    // Collect all xpMult adjustments from pass 1 cost assignments
    for (const step of result.steps) {
        const xa = step.costAssignment?.xpAdjustments;
        if (!xa) continue;
        for (const adj of xa) {
            // Later adjustments override earlier ones (more context available)
            xpMultOverrides.set(adj.taskName, adj.newXpMult);
        }
    }

    if (xpMultOverrides.size > 0) {
        console.log(`Pass 1 complete in ${pass1Elapsed}ms — ${xpMultOverrides.size} tasks with xpMult adjustments`);

        // Apply xpMult overrides to a fresh copy of game data
        const pass2GameData = JSON.parse(JSON.stringify(gameDataJson));
        for (const zone of pass2GameData.zones) {
            for (const task of zone.tasks) {
                if (xpMultOverrides.has(task.name)) {
                    task.xpMult = xpMultOverrides.get(task.name);
                }
            }
        }

        // Re-run without adjustXpMult, using the baked-in xpMult values
        const pass2Settings = { ...settings, adjustXpMult: false };
        planner = new JTACostPlanner();
        lastProgressTime = Date.now();
        result = planner.planCosts(pass2GameData, sphereLogContent, { ...pass2Settings, onProgress: cliProgress });
        if (lastProgressTime > Date.now() - 5000) process.stdout.write('\r' + ' '.repeat(60) + '\r');
        verifyGameData = pass2GameData;
        console.log('Pass 2 complete — re-solved with baked xpMult values');
    } else {
        console.log(`Pass 1 complete in ${pass1Elapsed}ms — no xpMult adjustments needed`);
    }
}

const elapsed = Date.now() - startTime;

// Summary
const { steps, assignedCosts, costData } = result;
const spheres = new Set(steps.map(s => s.sphereIndex));
const costAssignmentSteps = steps.filter(s => s.costAssignment);
const completedSteps = steps.filter(s => s.targetCompleted);
const failedSteps = steps.filter(s => !s.targetCompleted);
const grindingSteps = steps.filter(s => s.attemptNumber === 0);

console.log(`Cost generation complete in ${elapsed}ms`);
console.log(`Total steps: ${steps.length}`);
console.log(`Spheres: ${spheres.size}`);
console.log(`Tasks costed: ${assignedCosts.size}`);
console.log(`Cost assignments: ${costAssignmentSteps.length}`);
console.log(`Completed: ${completedSteps.length}, Failed/grinding: ${failedSteps.length}`);
if (grindingSteps.length > 0) {
    console.log(`Grinding steps (focus unreachable): ${grindingSteps.length}`);
}

// Print step-by-step summary
console.log('\n--- Step Summary ---\n');
for (const step of steps) {
    const status = step.targetCompleted ? 'OK' : step.attemptNumber === 0 ? 'GRIND' : 'FAIL';
    const costInfo = step.costAssignment
        ? ` [COST: ${step.costAssignment.taskName} costMult=${step.costAssignment.costMult.toFixed(4)}]`
        : '';
    const attempt = step.attemptNumber === 0
        ? 'grind'
        : `${step.attemptNumber}/${step.targetAttempts}`;
    const stepNum = step.displayIndex ?? String(step.stepIndex);
    const substepSuffix = step.substep
        ? ` (solver iter ${step.substepIteration}, inner ${step.substepNumber})`
        : '';
    console.log(
        `  Step ${String(stepNum).padStart(7)} | S${step.sphereIndex} | ` +
        `${status.padEnd(5)} | ${attempt.padEnd(5)} | ` +
        `E: ${step.energyBudget.toFixed(0)}->${step.energyRemaining.toFixed(1).padStart(5)} | ` +
        `${step.targetTask}${costInfo}${substepSuffix}`
    );

    // Verbose step details
    if (verbose >= 1) {
        printStepVerbose(step, verbose, args.queueAll);
    }

    // Solver debug
    if (args.debugSolver && step.costAssignment?.solverDebug) {
        printSolverDebug(step);
    }
}

// Print grinding efficiency tables
if (verbose >= 2) {
    // Level 2: show all grinding tables
    const grindSteps = steps.filter(s => s.grindPlan && s.grindPlan.tasks.length > 0);
    for (const step of grindSteps) {
        printGrindingTable(step);
    }
} else {
    // Level 0-1: first grinding step only
    const firstGrindStep = steps.find(s => s.grindPlan && s.grindPlan.tasks.length > 0);
    if (firstGrindStep) {
        printGrindingTable(firstGrindStep);
    }
}

// Report tasks that took more than expected attempts
const taskAttemptCounts = new Map();
for (const step of steps) {
    if (step.attemptNumber === 0) continue; // skip grinding steps
    const key = `${step.stepIndex - step.attemptNumber + 1}:${step.targetTask}`;
    if (!taskAttemptCounts.has(key)) {
        taskAttemptCounts.set(key, { taskName: step.targetTask, targetAttempts: step.targetAttempts, actualAttempts: 0, completed: false, startStep: step.stepIndex });
    }
    const entry = taskAttemptCounts.get(key);
    entry.actualAttempts = step.attemptNumber;
    if (step.targetCompleted) entry.completed = true;
}
const overTarget = [...taskAttemptCounts.values()].filter(e => e.actualAttempts > e.targetAttempts);
if (overTarget.length > 0) {
    console.log(`\n--- Tasks Over Target Attempts (${overTarget.length}) ---\n`);
    console.log('  Task                                    Target  Actual  Delta  Step');
    console.log('  ' + '-'.repeat(70));
    for (const e of overTarget) {
        console.log(
            `  ${e.taskName.padEnd(40)} ${String(e.targetAttempts).padStart(6)}  ${String(e.actualAttempts).padStart(6)}  ` +
            `${(`+${e.actualAttempts - e.targetAttempts}`).padStart(5)}  ${e.startStep}`
        );
    }
} else {
    console.log('\nAll tasks completed within target attempts.');
}

// Print cost assignments table
console.log('\n--- Cost Assignments ---\n');
console.log('  Task                                    Zone                   Cat    costMult     xpMult  Attempts  Energy');
console.log('  ' + '-'.repeat(110));
for (const [taskName, info] of assignedCosts) {
    console.log(
        `  ${taskName.padEnd(40)} ${(info.zoneId !== undefined ? `Zone ${info.zoneId}` : '?').padEnd(22)} ` +
        `${(info.category || '?').padEnd(6)} ${info.costMult.toFixed(6).padStart(10)} ` +
        `${info.xpMult.toFixed(4).padStart(9)}  ${String(info.targetAttempts).padStart(8)}  ` +
        `${(info.energyAtAssignment !== undefined ? info.energyAtAssignment.toFixed(1) : '?').padStart(6)}`
    );
}

// Run verification
console.log('\n--- Verification ---\n');
const verifyStart = Date.now();
const verifyResult = planner.verifyCosts(verifyGameData, sphereLogContent, assignedCosts, settings);
const verifyElapsed = Date.now() - verifyStart;

const { comparison, verifySteps } = verifyResult;
const matched = comparison.filter(c => c.match).length;
const close = comparison.filter(c => !c.match && Math.abs(c.delta) <= 1).length;
const far = comparison.filter(c => !c.match && Math.abs(c.delta) > 1).length;

console.log(`Verification complete in ${verifyElapsed}ms (${verifySteps.length} steps)`);
console.log(`  Exact match: ${matched}/${comparison.length}`);
if (close > 0) console.log(`  Off by 1: ${close}`);
if (far > 0) console.log(`  Off by 2+: ${far}`);

const mismatches = comparison.filter(c => !c.match);
if (mismatches.length > 0) {
    console.log('\n  Mismatches:');
    for (const c of mismatches) {
        const delta = c.delta > 0 ? `+${c.delta}` : `${c.delta}`;
        console.log(`    ${c.taskName.padEnd(40)} planned=${c.plannedAttempts} actual=${c.actualAttempts} (${delta})`);
    }
}

// Write full report to file
if (args.output) {
    // Convert Maps to plain objects for JSON serialization
    const serializableResult = {
        ...costData,
        settings,
        elapsed,
        steps: steps.map(s => ({
            ...s,
            // Ensure Maps/Sets are serializable
            stateBefore: s.stateBefore ? {
                ...s.stateBefore,
                perks: Array.isArray(s.stateBefore.perks) ? s.stateBefore.perks : [...(s.stateBefore.perks || [])],
            } : null,
            stateAfter: s.stateAfter ? {
                ...s.stateAfter,
                perks: Array.isArray(s.stateAfter.perks) ? s.stateAfter.perks : [...(s.stateAfter.perks || [])],
            } : null,
        })),
        assignedCosts: Object.fromEntries(assignedCosts),
    };

    writeFileSync(args.output, JSON.stringify(serializableResult, null, 2), 'utf-8');
    console.log(`\nFull report written to: ${args.output}`);
}
