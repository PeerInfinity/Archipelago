// inventory.js
export class Inventory {
    constructor(items = [], excludeItems = [], progressionMapping = {}, itemData = {}, debugLog = null) {
        this.items = new Map();
        this.excludeSet = new Set(excludeItems);
        this.progressionMapping = progressionMapping;
        this.itemData = itemData;
        this.debugLog = debugLog;
        
        this.log('Constructing inventory with:', {
            items,
            excludeItems,
            progressionMapping,
            itemData
        });
        
        // Initialize inventory with items
        for (const item of items) {
            this.addItem(item);
        }
    }
    
    log(message, data = null) {
        if (this.debugLog) {
            const logEntry = data ? 
                `${message} ${JSON.stringify(data, null, 1)}` : // Use depth of 1
                message;
            this.debugLog.push(logEntry);
            console.log(logEntry);
        }
    }
    
    addItem(item) {
        if (!this.excludeSet.has(item)) {
            const count = (this.items.get(item) || 0) + 1;
            this.items.set(item, count);
            this.log(`Added item ${item}, new count: ${count}`);
        }
    }
    
    has(itemName) {
        if (this.excludeSet.has(itemName)) {
            this.log(`Item ${itemName} is excluded`);
            return false;
        }
        
        // Direct check first
        if (this.items.has(itemName)) {
            this.log(`Direct item check for ${itemName}: true`);
            return true;
        }
        
        // Progressive check
        for (const [progressiveItem, mapping] of Object.entries(this.progressionMapping)) {
            const targetSpec = mapping.items.find(i => i.name === itemName);
            if (targetSpec) {
                const progressiveCount = this.items.get(progressiveItem) || 0;
                const hasEnough = progressiveCount >= targetSpec.level;
                if (hasEnough) {
                    this.log(`Found ${itemName} from progressive item ${progressiveItem}`);
                    return true;
                }
            }
        }
        
        this.log(`No match found for ${itemName}`);
        return false;
    }
    
    count(itemName) {
        if (this.excludeSet.has(itemName)) {
            return 0;
        }
        
        // For non-progressive items, return direct count
        const directCount = this.items.get(itemName) || 0;
        if (directCount > 0 || !this.progressionMapping[itemName]) {
            this.log(`Direct count check for ${itemName}: ${directCount}`);
            return directCount;
        }
        
        // For progressive items, determine highest level available
        const mapping = this.progressionMapping[itemName];
        const count = this.items.get(itemName) || 0;
        this.log(`Progressive count check for ${itemName}: ${count}`);
        return count;
    }
    
    countGroup(groupName) {
        if (this.excludeSet.has("Any" + groupName)) {
            this.log(`Group ${groupName} excluded by Any${groupName}`);
            return 0;
        }

        let count = 0;
        this.items.forEach((itemCount, itemName) => {
            const itemInfo = this.itemData[itemName];
            if (itemInfo && itemInfo.groups.includes(groupName)) {
                count += itemCount;
            }
        });
        
        this.log(`Group ${groupName} count: ${count}`);
        return count;
    }

    getInventoryState() {
        this.log('Current inventory state:', {
            items: Object.fromEntries(this.items),
            excludeSet: Array.from(this.excludeSet),
            progressionMapping: this.progressionMapping
        });
    }
}