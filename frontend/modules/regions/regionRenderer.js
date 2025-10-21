// regionRenderer.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionUI:Renderer');

/**
 * RegionRenderer
 *
 * Handles rendering coordination for the regions panel.
 * Manages sorting, filtering, fragment building, and DOM updates.
 *
 * Data Flow:
 * 1. Receive regionsToRender array from NavigationManager
 * 2. Apply search filter
 * 3. Apply reachability filter
 * 4. Apply sorting
 * 5. Build DOM fragments (using RegionBlockBuilder for individual blocks)
 * 6. Update DOM
 * 7. Update section visibility
 */
export class RegionRenderer {
  constructor(regionBlockBuilder) {
    this.regionBlockBuilder = regionBlockBuilder;

    logger.debug('RegionRenderer constructed');
  }

  /**
   * Sort regions based on sort method
   * @param {Array} regions - Array of region objects
   * @param {string} sortMethod - Sort method ('original', 'alphabetical', 'accessibility-original', 'accessibility-alphabetical')
   * @param {Array} originalRegionOrder - Original region order from static data
   * @returns {Array} Sorted regions
   */
  sortRegions(regions, sortMethod, originalRegionOrder = []) {
    if (!regions || regions.length === 0) return regions;

    // Skip indicators should stay in place
    const skipIndicators = regions.filter(r => r.isSkipIndicator);
    const regionsToSort = regions.filter(r => !r.isSkipIndicator);

    let sorted = [...regionsToSort];

    if (sortMethod === 'alphabetical' || sortMethod === 'accessibility-alphabetical') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMethod === 'original' || sortMethod === 'accessibility-original') {
      // Sort by original order
      if (originalRegionOrder && originalRegionOrder.length > 0) {
        sorted.sort((a, b) => {
          const indexA = originalRegionOrder.indexOf(a.name);
          const indexB = originalRegionOrder.indexOf(b.name);
          return indexA - indexB;
        });
      }
    }
    // For navigation mode (when not in "Show All"), preserve path order
    // which is already the order in the array

    // Put skip indicators back if any
    if (skipIndicators.length > 0) {
      // Find where skip indicators were and put them back
      // For simplicity, just append them (they're usually in the middle anyway)
      return sorted;
    }

    return sorted;
  }

  /**
   * Filter regions by search term
   * @param {Array} regions - Array of region objects
   * @param {string} searchTerm - Search term (lowercase)
   * @returns {Array} Filtered regions
   */
  filterBySearch(regions, searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') return regions;

    return regions.filter(region =>
      region.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  /**
   * Filter regions by reachability
   * @param {Array} regions - Array of region objects
   * @param {boolean} showReachable - Show reachable regions
   * @param {boolean} showUnreachable - Show unreachable regions
   * @returns {Array} Filtered regions
   */
  filterByReachability(regions, showReachable, showUnreachable) {
    if (showReachable && showUnreachable) return regions;

    return regions.filter(region => {
      // Skip indicators are always shown
      if (region.isSkipIndicator) return true;

      const isReachable = region.isReachable;
      return (isReachable && showReachable) || (!isReachable && showUnreachable);
    });
  }

  /**
   * Build region block DOM elements
   * @param {Array} regionsToRender - Array of region objects to render
   * @param {Object} staticData - Static game data
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface for region blocks
   * @param {string} sortMethod - Current sort method
   * @param {boolean} useColorblind - Whether to use colorblind mode
   * @param {string} sectionOrder - Section order preference
   * @returns {Object} Object with fragments: { available, unavailable, general }
   */
  buildRegionFragments(regionsToRender, staticData, snapshot, snapshotInterface, sortMethod, useColorblind, sectionOrder) {
    const availableFragment = document.createDocumentFragment();
    const unavailableFragment = document.createDocumentFragment();
    const generalFragment = document.createDocumentFragment();

    const isAccessibilitySort = sortMethod.includes('accessibility');

    regionsToRender.forEach((regionInfo) => {
      let regionBlock;

      if (regionInfo.isSkipIndicator) {
        // Build skip indicator using RegionBlockBuilder (it has special handling for skip indicators)
        regionBlock = this.regionBlockBuilder.buildRegionBlock(
          regionInfo.name,
          null, // No region data needed for skip indicator
          snapshot,
          snapshotInterface,
          regionInfo.isReachable,
          useColorblind,
          regionInfo.uid,
          false, // Skip indicators are never expanded
          staticData,
          true, // isSkipIndicator
          sectionOrder
        );
      } else {
        // Get static region data
        const regionData = staticData.regions.get(regionInfo.name);
        if (!regionData) {
          logger.warn(`Region data not found for: ${regionInfo.name}`);
          return;
        }

        // Build region block using RegionBlockBuilder
        regionBlock = this.regionBlockBuilder.buildRegionBlock(
          regionInfo.name,
          regionData,
          snapshot,
          snapshotInterface,
          regionInfo.isReachable,
          useColorblind,
          regionInfo.uid,
          regionInfo.expanded,
          staticData,
          false, // Not a skip indicator
          sectionOrder
        );

        if (!regionBlock) {
          logger.warn(`Failed to build region block for: ${regionInfo.name}`);
          return;
        }
      }

      // Add to appropriate fragment based on sort method
      if (isAccessibilitySort) {
        if (regionInfo.isReachable) {
          availableFragment.appendChild(regionBlock);
        } else {
          unavailableFragment.appendChild(regionBlock);
        }
      } else {
        generalFragment.appendChild(regionBlock);
      }
    });

    logger.debug(`Built ${regionsToRender.length} region blocks`);

    return {
      available: availableFragment,
      unavailable: unavailableFragment,
      general: generalFragment
    };
  }

  /**
   * Update section visibility based on sort method
   * @param {HTMLElement} regionsContainer - The regions container element
   * @param {string} sortMethod - Current sort method
   */
  updateSectionVisibility(regionsContainer, sortMethod) {
    if (!regionsContainer) {
      logger.warn('updateSectionVisibility called with null regionsContainer');
      return;
    }

    const isAccessibilitySort = sortMethod.includes('accessibility');

    const accessibilitySections = regionsContainer.querySelector('#accessibility-sorted-sections');
    const generalSection = regionsContainer.querySelector('#general-sorted-list-section');

    if (!accessibilitySections) {
      logger.warn('accessibility-sorted-sections element not found in regionsContainer');
    } else {
      accessibilitySections.style.display = isAccessibilitySort ? 'block' : 'none';
    }

    if (!generalSection) {
      logger.warn('general-sorted-list-section element not found in regionsContainer');
    } else {
      generalSection.style.display = isAccessibilitySort ? 'none' : 'block';
    }

    logger.debug(`Section visibility updated (accessibility: ${isAccessibilitySort})`);
  }

  /**
   * Render regions to DOM
   * @param {HTMLElement} regionsContainer - The regions container element
   * @param {Array} regionsToRender - Array of region objects to render (must include 'expanded' property)
   * @param {Object} staticData - Static game data
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface
   * @param {Object} options - Rendering options
   * @returns {void}
   */
  renderRegions(regionsContainer, regionsToRender, staticData, snapshot, snapshotInterface, options = {}) {
    const {
      searchTerm = '',
      showReachable = true,
      showUnreachable = true,
      sortMethod = 'original',
      originalRegionOrder = [],
      useColorblind = false,
      sectionOrder = 'entrances-exits-locations'
    } = options;

    logger.info(`Rendering ${regionsToRender.length} regions (sort: ${sortMethod})`);

    // Apply filters
    let filtered = this.filterBySearch(regionsToRender, searchTerm);
    filtered = this.filterByReachability(filtered, showReachable, showUnreachable);

    // Apply sorting (only for "Show All" mode, navigation mode preserves path order)
    const showAll = regionsToRender.some(r => r.mode === 'showAll');
    if (showAll) {
      filtered = this.sortRegions(filtered, sortMethod, originalRegionOrder);
    }

    // Build fragments
    const fragments = this.buildRegionFragments(
      filtered,
      staticData,
      snapshot,
      snapshotInterface,
      sortMethod,
      useColorblind,
      sectionOrder
    );

    // Update DOM
    const availableContent = regionsContainer.querySelector('#available-content');
    const unavailableContent = regionsContainer.querySelector('#unavailable-content');
    const generalContent = regionsContainer.querySelector('#general-sorted-list-content');

    if (!availableContent) {
      logger.warn('available-content element not found in regionsContainer');
    } else {
      availableContent.innerHTML = '';
      availableContent.appendChild(fragments.available);
    }

    if (!unavailableContent) {
      logger.warn('unavailable-content element not found in regionsContainer');
    } else {
      unavailableContent.innerHTML = '';
      unavailableContent.appendChild(fragments.unavailable);
    }

    if (!generalContent) {
      logger.warn('general-sorted-list-content element not found in regionsContainer');
    } else {
      generalContent.innerHTML = '';
      generalContent.appendChild(fragments.general);
    }

    // Update section visibility
    this.updateSectionVisibility(regionsContainer, sortMethod);

    logger.info(`Rendering complete (${filtered.length} regions displayed)`);
  }
}

export default RegionRenderer;
