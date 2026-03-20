import { ItemType } from "./items.js";
import { PerkType } from "./perks.js";
import { SkillType } from "./skills.js";
import { TaskDefinition } from "./zones.js";
export var EventType;
(function (EventType) {
    EventType[EventType["SkillUp"] = 0] = "SkillUp";
    EventType[EventType["GainedPerk"] = 1] = "GainedPerk";
    EventType[EventType["GainedItem"] = 2] = "GainedItem";
    EventType[EventType["UsedItem"] = 3] = "UsedItem";
    EventType[EventType["UndidItem"] = 4] = "UndidItem";
    EventType[EventType["UnlockedTask"] = 5] = "UnlockedTask";
    EventType[EventType["UnlockedSkill"] = 6] = "UnlockedSkill";
    EventType[EventType["UnlockedPower"] = 7] = "UnlockedPower";
    EventType[EventType["TaskCompleted"] = 8] = "TaskCompleted";
    EventType[EventType["PrestigeAvailable"] = 9] = "PrestigeAvailable";
    EventType[EventType["NewHighestZone"] = 10] = "NewHighestZone";
    EventType[EventType["NewHighestZoneFullyCompleted"] = 11] = "NewHighestZoneFullyCompleted";
    EventType[EventType["NewPrestigeLayer"] = 12] = "NewPrestigeLayer";
    EventType[EventType["SkippedZones"] = 13] = "SkippedZones";
    EventType[EventType["SkippedTasks"] = 14] = "SkippedTasks";
    EventType[EventType["Count"] = 15] = "Count";
})(EventType || (EventType = {}));
export class EventContext {
}
export class RenderEvent {
    type;
    context;
    constructor(type, context) {
        this.type = type;
        this.context = context;
    }
}
export class SkillUpContext extends EventContext {
    skill = SkillType.Count;
    new_level = 0;
    levels_gained = 0;
}
export class GainedPerkContext extends EventContext {
    perk = PerkType.Count;
}
export class UsedItemContext extends EventContext {
    item = ItemType.Count;
    count = 0;
}
export class UnlockedTaskContext extends EventContext {
    task_definition = new TaskDefinition();
}
export class UnlockedSkillContext extends EventContext {
    skill = SkillType.Count;
}
export class HighestZoneContext extends EventContext {
    zone = 0;
}
export class SkippedTasksContext extends EventContext {
    tasks = 0;
}
//# sourceMappingURL=events.js.map