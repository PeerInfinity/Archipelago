let ENERGY_EMOJI = "🔋";
export let ENERGY_TEXT = `${ENERGY_EMOJI}Energy`;
let XP_EMOJI = "♟️";
export let XP_TEXT = `${XP_EMOJI}XP`;
let DIVINE_SPARK_EMOJI = "✨";
export let DIVINE_SPARK_TEXT = `${DIVINE_SPARK_EMOJI}Divine Spark`;
export let ATTUNEMENT_EMOJI = "🌀";
export let ATTUNEMENT_TEXT = `${ATTUNEMENT_EMOJI}Attunement`;
export let POWER_EMOJI = "💪";
export let POWER_TEXT = `${POWER_EMOJI}Power`;
export let HASTE_EMOJI = "🐇";
export let HASTE_TEXT = `${HASTE_EMOJI}Haste`;
export let TRAVEL_EMOJI = "🗺️";
export let MINOR_TIME_COMPRESSION_EMOJI = "⌚";
export let BOTTLED_LIGHTNING_EMOJI = "⚡";
export let BOTTLED_LIGHTNING_TEXT = `${BOTTLED_LIGHTNING_EMOJI}Bottled Lightning`;
/**
 * Patch rendering constants at runtime. Only provided fields are changed.
 * Compound _TEXT values are rebuilt from their emoji + label parts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function patchRenderingConstants(overrides) {
    if (overrides.ENERGY_EMOJI !== undefined)
        ENERGY_EMOJI = overrides.ENERGY_EMOJI;
    if (overrides.ENERGY_TEXT !== undefined)
        ENERGY_TEXT = overrides.ENERGY_TEXT;
    else if (overrides.ENERGY_EMOJI !== undefined)
        ENERGY_TEXT = `${ENERGY_EMOJI}Energy`;
    if (overrides.XP_EMOJI !== undefined)
        XP_EMOJI = overrides.XP_EMOJI;
    if (overrides.XP_TEXT !== undefined)
        XP_TEXT = overrides.XP_TEXT;
    else if (overrides.XP_EMOJI !== undefined)
        XP_TEXT = `${XP_EMOJI}XP`;
    if (overrides.DIVINE_SPARK_EMOJI !== undefined)
        DIVINE_SPARK_EMOJI = overrides.DIVINE_SPARK_EMOJI;
    if (overrides.DIVINE_SPARK_TEXT !== undefined)
        DIVINE_SPARK_TEXT = overrides.DIVINE_SPARK_TEXT;
    else if (overrides.DIVINE_SPARK_EMOJI !== undefined)
        DIVINE_SPARK_TEXT = `${DIVINE_SPARK_EMOJI}Divine Spark`;
    if (overrides.ATTUNEMENT_EMOJI !== undefined)
        ATTUNEMENT_EMOJI = overrides.ATTUNEMENT_EMOJI;
    if (overrides.ATTUNEMENT_TEXT !== undefined)
        ATTUNEMENT_TEXT = overrides.ATTUNEMENT_TEXT;
    else if (overrides.ATTUNEMENT_EMOJI !== undefined)
        ATTUNEMENT_TEXT = `${ATTUNEMENT_EMOJI}Attunement`;
    if (overrides.POWER_EMOJI !== undefined)
        POWER_EMOJI = overrides.POWER_EMOJI;
    if (overrides.POWER_TEXT !== undefined)
        POWER_TEXT = overrides.POWER_TEXT;
    else if (overrides.POWER_EMOJI !== undefined)
        POWER_TEXT = `${POWER_EMOJI}Power`;
    if (overrides.HASTE_EMOJI !== undefined)
        HASTE_EMOJI = overrides.HASTE_EMOJI;
    if (overrides.HASTE_TEXT !== undefined)
        HASTE_TEXT = overrides.HASTE_TEXT;
    else if (overrides.HASTE_EMOJI !== undefined)
        HASTE_TEXT = `${HASTE_EMOJI}Haste`;
    if (overrides.TRAVEL_EMOJI !== undefined)
        TRAVEL_EMOJI = overrides.TRAVEL_EMOJI;
    if (overrides.MINOR_TIME_COMPRESSION_EMOJI !== undefined)
        MINOR_TIME_COMPRESSION_EMOJI = overrides.MINOR_TIME_COMPRESSION_EMOJI;
    if (overrides.BOTTLED_LIGHTNING_EMOJI !== undefined)
        BOTTLED_LIGHTNING_EMOJI = overrides.BOTTLED_LIGHTNING_EMOJI;
    if (overrides.BOTTLED_LIGHTNING_TEXT !== undefined)
        BOTTLED_LIGHTNING_TEXT = overrides.BOTTLED_LIGHTNING_TEXT;
    else if (overrides.BOTTLED_LIGHTNING_EMOJI !== undefined)
        BOTTLED_LIGHTNING_TEXT = `${BOTTLED_LIGHTNING_EMOJI}Bottled Lightning`;
}
/**
 * Read current rendering constants as a plain object (for export/serialization).
 */
export function readRenderingConstants() {
    return {
        ENERGY_EMOJI,
        ENERGY_TEXT,
        XP_EMOJI,
        XP_TEXT,
        DIVINE_SPARK_EMOJI,
        DIVINE_SPARK_TEXT,
        ATTUNEMENT_EMOJI,
        ATTUNEMENT_TEXT,
        POWER_EMOJI,
        POWER_TEXT,
        HASTE_EMOJI,
        HASTE_TEXT,
        TRAVEL_EMOJI,
        MINOR_TIME_COMPRESSION_EMOJI,
        BOTTLED_LIGHTNING_EMOJI,
        BOTTLED_LIGHTNING_TEXT,
    };
}
//# sourceMappingURL=rendering_constants.js.map