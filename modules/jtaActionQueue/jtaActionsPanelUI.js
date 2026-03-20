// Actions button panel - shows available actions grouped by zone (with navigation), items, artifacts, and special
import { createQueueEntry } from '../jtaQueueEngine/jtaActionDefs.js';

export class JTAActionsPanelUI {
    /** @type {HTMLElement} */
    #container;

    /** @type {import('../shared/actionQueue/actionQueue.js').ActionQueue|null} */
    #queue = null;

    /** @type {object|null} Catalog from buildActionCatalog() */
    #catalog = null;

    /** @type {Function|null} */
    #onQueueChanged = null;

    /** @type {Function|null} Returns insertion index (0 for top, undefined for end) */
    #getInsertIndex = null;

    /** @type {string[]} Zone names in order */
    #zoneNames = [];

    /** @type {number} Current zone index */
    #zoneIndex = 0;

    constructor(container) {
        this.#container = container;
        this.#render();
    }

    /**
     * Bind to a queue and catalog
     * @param {import('../shared/actionQueue/actionQueue.js').ActionQueue} queue
     * @param {object} catalog - From buildActionCatalog()
     * @param {Function} [onQueueChanged] - Called when entries are added
     * @param {Function} [getInsertIndex] - Returns insertion index (0 for top, undefined for end)
     */
    bind(queue, catalog, onQueueChanged, getInsertIndex) {
        this.#queue = queue;
        this.#catalog = catalog;
        this.#onQueueChanged = onQueueChanged || null;
        this.#getInsertIndex = getInsertIndex || null;
        this.#buildZoneList();
        this.#renderButtons();
    }

    /** @private */
    #render() {
        this.#container.innerHTML = `
            <summary style="cursor: pointer; user-select: none; font-weight: bold; padding: 2px 0;">Available Actions</summary>
            <div class="aq-actions-body" style="display: flex; flex-direction: column; gap: 6px; padding: 4px 0;">
                <div class="aq-zone-nav" style="display: flex; align-items: center; gap: 4px;">
                    <button class="aq-zone-prev" style="min-width: 28px;">&lt;</button>
                    <select class="aq-zone-select" style="flex: 1; text-align: center; background: #333; color: #ccc; border: 1px solid #555; border-radius: 3px; padding: 2px 4px;"></select>
                    <button class="aq-zone-next" style="min-width: 28px;">&gt;</button>
                </div>
                <div class="aq-zone-tasks"></div>
                <div class="aq-other-actions"></div>
            </div>
        `;

        // Zone navigation
        this.#container.querySelector('.aq-zone-prev').addEventListener('click', () => {
            if (this.#zoneNames.length === 0) return;
            this.#zoneIndex = (this.#zoneIndex - 1 + this.#zoneNames.length) % this.#zoneNames.length;
            this.#container.querySelector('.aq-zone-select').selectedIndex = this.#zoneIndex;
            this.#renderZoneTasks();
        });
        this.#container.querySelector('.aq-zone-next').addEventListener('click', () => {
            if (this.#zoneNames.length === 0) return;
            this.#zoneIndex = (this.#zoneIndex + 1) % this.#zoneNames.length;
            this.#container.querySelector('.aq-zone-select').selectedIndex = this.#zoneIndex;
            this.#renderZoneTasks();
        });
        this.#container.querySelector('.aq-zone-select').addEventListener('change', (e) => {
            this.#zoneIndex = e.target.selectedIndex;
            this.#renderZoneTasks();
        });

        const actionsBody = this.#container.querySelector('.aq-actions-body');

        // Click handler for all action buttons (delegated)
        actionsBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.aq-action-btn');
            if (!btn || !this.#queue || !this.#catalog) return;

            const catalogEntry = this.#findCatalogEntry(btn.dataset.actionType, btn.dataset.actionId);
            if (catalogEntry) {
                const queueEntry = createQueueEntry(catalogEntry);
                const idx = this.#getInsertIndex ? this.#getInsertIndex() : undefined;
                this.#queue.add(queueEntry, idx);
                if (this.#onQueueChanged) this.#onQueueChanged();
            }
        });

        // Drag support — action buttons can be dragged onto the queue
        actionsBody.addEventListener('dragstart', (e) => {
            const btn = e.target.closest('.aq-action-btn');
            if (!btn || !this.#catalog) return;

            const catalogEntry = this.#findCatalogEntry(btn.dataset.actionType, btn.dataset.actionId);
            if (catalogEntry) {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('application/aq-action', JSON.stringify(catalogEntry));
                btn.classList.add('aq-dragging');
            }
        });

        actionsBody.addEventListener('dragend', (e) => {
            const btn = e.target.closest('.aq-action-btn');
            if (btn) btn.classList.remove('aq-dragging');
        });
    }

    /** Find a catalog entry by type and id */
    #findCatalogEntry(actionType, actionId) {
        if (!this.#catalog) return null;
        const allActions = [...this.#catalog.tasks, ...this.#catalog.items, ...this.#catalog.prestige];
        return allActions.find(a =>
            a.actionType === actionType && String(a.actionId) === String(actionId)
        ) || null;
    }

    /** Build the ordered zone name list from catalog */
    #buildZoneList() {
        this.#zoneNames = [];
        if (!this.#catalog) return;
        const seen = new Set();
        for (const task of this.#catalog.tasks) {
            const group = task.group || 'Unknown';
            if (!seen.has(group)) {
                seen.add(group);
                this.#zoneNames.push(group);
            }
        }
        this.#zoneIndex = 0;
    }

    /** Render all buttons */
    #renderButtons() {
        this.#populateZoneSelect();
        this.#renderZoneTasks();
        this.#renderOtherActions();
    }

    /** Populate the zone dropdown (called once when catalog is bound) */
    #populateZoneSelect() {
        const select = this.#container.querySelector('.aq-zone-select');
        if (!select) return;
        select.innerHTML = this.#zoneNames.map((name, i) =>
            `<option value="${i}">${name}</option>`
        ).join('');
        select.selectedIndex = this.#zoneIndex;
    }

    /** Render tasks for the current zone */
    #renderZoneTasks() {
        const container = this.#container.querySelector('.aq-zone-tasks');
        if (!container) return;

        if (this.#zoneNames.length === 0) {
            container.innerHTML = '';
            return;
        }

        const zoneName = this.#zoneNames[this.#zoneIndex];

        const tasks = this.#catalog.tasks.filter(t => t.group === zoneName);
        let html = '<div class="aq-action-group-buttons" style="display: flex; flex-wrap: wrap; gap: 4px;">';
        for (const task of tasks) {
            html += `<button class="aq-action-btn" draggable="true" data-action-type="${task.actionType}" data-action-id="${task.actionId}" title="${zoneName}: ${task.label}">${task.label}</button>`;
        }
        html += '</div>';
        container.innerHTML = html;
    }

    /** Render items, artifacts, and special actions */
    #renderOtherActions() {
        const container = this.#container.querySelector('.aq-other-actions');
        if (!container || !this.#catalog) return;

        let html = '';

        // Item and artifact actions grouped by their group field
        if (this.#catalog.items.length > 0) {
            const itemsByGroup = new Map();
            for (const item of this.#catalog.items) {
                const group = item.group || 'Items';
                if (!itemsByGroup.has(group)) itemsByGroup.set(group, []);
                itemsByGroup.get(group).push(item);
            }
            for (const [groupName, items] of itemsByGroup) {
                html += `<div class="aq-action-group" style="margin-top: 4px;">
                    <div style="font-weight: bold; margin-bottom: 2px;">${groupName}</div>
                    <div class="aq-action-group-buttons" style="display: flex; flex-wrap: wrap; gap: 4px;">`;
                for (const item of items) {
                    html += `<button class="aq-action-btn aq-item-btn" draggable="true" data-action-type="${item.actionType}" data-action-id="${item.actionId}" title="Use ${item.label}">${item.icon || ''} ${item.label}</button>`;
                }
                html += `</div></div>`;
            }
        }

        // Prestige actions
        if (this.#catalog.prestige.length > 0) {
            html += `<div class="aq-action-group" style="margin-top: 4px;">
                <div style="font-weight: bold; margin-bottom: 2px;">Special</div>
                <div class="aq-action-group-buttons" style="display: flex; flex-wrap: wrap; gap: 4px;">`;
            for (const action of this.#catalog.prestige) {
                html += `<button class="aq-action-btn aq-special-btn" draggable="true" data-action-type="${action.actionType}" data-action-id="${action.actionId}" title="${action.label}">${action.label}</button>`;
            }
            html += `</div></div>`;
        }

        container.innerHTML = html;
    }
}
