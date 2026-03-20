import { getSkillString, joinWithCommasAndAnd } from "./rendering.js";
import { getSkill } from "./simulation.js";
import { SkillType } from "./skills.js";
var SkillModifierType;
(function (SkillModifierType) {
    SkillModifierType[SkillModifierType["Item"] = 0] = "Item";
    SkillModifierType[SkillModifierType["Perk"] = 1] = "Perk";
    SkillModifierType[SkillModifierType["Count"] = 2] = "Count";
})(SkillModifierType || (SkillModifierType = {}));
export class SkillModifier {
    skill = SkillType.Count;
    effect = 0;
    constructor(skill, effect) {
        this.skill = skill;
        this.effect = effect;
    }
}
class SkillModifierList {
    modifiers = [];
    type = SkillModifierType.Count;
    constructor(type, modifiers) {
        this.type = type;
        for (const [skill, effect] of modifiers) {
            this.modifiers.push(new SkillModifier(skill, effect));
        }
    }
    getStacked(stacks) {
        const newList = new SkillModifierList(this.type, []);
        for (const modifier of this.modifiers) {
            newList.modifiers.push(new SkillModifier(modifier.skill, modifier.effect * stacks));
        }
        return newList;
    }
    buildSkillMap() {
        const map = new Map();
        for (const modifier of this.modifiers) {
            const existing_value = map.get(modifier.effect) ?? [];
            existing_value.push(modifier.skill);
            map.set(modifier.effect, existing_value);
        }
        const string_map = new Map();
        for (const [effect, skills] of map) {
            const skill_strings = [];
            for (const skill of skills) {
                skill_strings.push(getSkillString(skill));
            }
            string_map.set(effect, joinWithCommasAndAnd(skill_strings));
        }
        return string_map;
    }
    getDescription() {
        const map = this.buildSkillMap();
        let desc = "";
        for (const [effect, skill_string] of map) {
            if (desc.length != 0) {
                desc += "<br>";
            }
            desc += `Improves ${skill_string} Task speed by ${(effect * 100).toFixed(0)}%`;
            if (this.type == SkillModifierType.Item) {
                desc += " each";
            }
        }
        return desc;
    }
    getAppliedDescription() {
        const map = this.buildSkillMap();
        let desc = "";
        for (const [effect, skill_string] of map) {
            if (desc.length != 0) {
                desc += "<br>";
            }
            desc += `${skill_string} Task speed increased ${(effect * 100).toFixed(0)}%`;
        }
        return desc;
    }
    applyEffect() {
        for (const modifier of this.modifiers) {
            getSkill(modifier.skill).speed_modifier += modifier.effect;
        }
    }
    getSkillEffect(type) {
        const modifier = this.modifiers.find(modifier => { return modifier.skill == type; });
        return modifier ? modifier.effect : 0;
    }
    affectsSkill(type) {
        return this.getSkillEffect(type) != 0;
    }
}
export class ItemSkillModifierList extends SkillModifierList {
    constructor(modifiers) {
        super(SkillModifierType.Item, modifiers);
    }
}
export class PerkSkillModifierList extends SkillModifierList {
    constructor(modifiers) {
        super(SkillModifierType.Perk, modifiers);
    }
}
//# sourceMappingURL=modifiers.js.map