import { TRAVEL_EMOJI } from "./rendering_constants.js";
export var SkillType;
(function (SkillType) {
    SkillType[SkillType["Charisma"] = 0] = "Charisma";
    SkillType[SkillType["Study"] = 1] = "Study";
    SkillType[SkillType["Combat"] = 2] = "Combat";
    SkillType[SkillType["Search"] = 3] = "Search";
    SkillType[SkillType["Subterfuge"] = 4] = "Subterfuge";
    SkillType[SkillType["Crafting"] = 5] = "Crafting";
    SkillType[SkillType["REMOVED"] = 6] = "REMOVED";
    SkillType[SkillType["Travel"] = 7] = "Travel";
    SkillType[SkillType["Magic"] = 8] = "Magic";
    SkillType[SkillType["Fortitude"] = 9] = "Fortitude";
    SkillType[SkillType["REMOVED2"] = 10] = "REMOVED2";
    SkillType[SkillType["Ascension"] = 11] = "Ascension";
    SkillType[SkillType["Count"] = 12] = "Count";
})(SkillType || (SkillType = {}));
export const SKILLS = [
    SkillType.Charisma,
    SkillType.Study,
    SkillType.Combat,
    SkillType.Search,
    SkillType.Subterfuge,
    SkillType.Crafting,
    SkillType.Travel,
    SkillType.Magic,
    SkillType.Fortitude,
    SkillType.Ascension,
];
export class SkillDefinition {
    type = SkillType.Count;
    name = "";
    icon = "";
    xp_needed_mult = 1.0;
    constructor(overrides = {}) {
        Object.assign(this, overrides);
    }
}
export const SKILL_DEFINITIONS = [
    new SkillDefinition({ type: SkillType.Charisma, name: "Charisma", icon: "🎭" }),
    new SkillDefinition({ type: SkillType.Study, name: "Study", icon: "🧠" }),
    new SkillDefinition({ type: SkillType.Combat, name: "Combat", icon: "⚔️", xp_needed_mult: 5 }),
    new SkillDefinition({ type: SkillType.Search, name: "Search", icon: "🔎" }),
    new SkillDefinition({ type: SkillType.Subterfuge, name: "Subterfuge", icon: "🗡️" }),
    new SkillDefinition({ type: SkillType.Crafting, name: "Crafting", icon: "🔨" }),
    new SkillDefinition({ type: SkillType.REMOVED, name: "REMOVED", icon: "⁉" }),
    new SkillDefinition({ type: SkillType.Travel, name: "Travel", icon: TRAVEL_EMOJI }),
    new SkillDefinition({ type: SkillType.Magic, name: "Magic", icon: "🔮", xp_needed_mult: 3 }),
    new SkillDefinition({ type: SkillType.Fortitude, name: "Fortitude", icon: "🛡️", xp_needed_mult: 5 }),
    new SkillDefinition({ type: SkillType.REMOVED2, name: "REMOVED", icon: "⁉" }),
    new SkillDefinition({ type: SkillType.Ascension, name: "Ascension", icon: "🙏", xp_needed_mult: 200 }),
];
//# sourceMappingURL=skills.js.map