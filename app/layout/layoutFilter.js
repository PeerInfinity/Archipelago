// layoutFilter.js - Filter layout configuration based on enabled modules
// Extracted from init.js lines 1599-1702

/**
 * Recursively filters layout content based on enabled modules
 *
 * @param {Array} content - Array of layout items to filter
 * @param {Function} isModuleEnabledFunc - Function to check if a module is enabled
 * @param {Function} getModuleIdFunc - Function to get module ID from component type
 * @param {Object} logger - Logger instance
 * @returns {Array} Filtered layout content array
 */
export function filterLayoutContent(content, isModuleEnabledFunc, getModuleIdFunc, logger) {
  if (!Array.isArray(content)) {
    logger.warn(
      'init',
      'filterLayoutContent called with non-array content:',
      content
    );
    return content;
  }

  logger.debug(
    'init',
    '[filterLayoutContent] Starting to process content array of length:',
    content.length,
    JSON.stringify(content)
  );

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        logger.warn(
          'init',
          '[filterLayoutContent] Encountered invalid item:',
          item
        );
        return item;
      }

      logger.debug(
        'init',
        `[filterLayoutContent] Processing item: ${item.type} - ${
          item.title || item.componentType
        }`
      );

      if (item.type === 'component') {
        const moduleId = getModuleIdFunc(item.componentType);
        logger.debug(
          'init',
          `[filterLayoutContent] Item is component. Type: ${item.componentType}, Derived ModuleId: ${moduleId}`
        );

        // If moduleId is null (componentType not registered) OR if the module is found but not enabled, filter out
        if (!moduleId || (moduleId && !isModuleEnabledFunc(moduleId))) {
          if (!moduleId) {
            logger.info(
              'init',
              `[filterLayoutContent] Filtering out component '${item.componentType}' because no module registered it (likely the owning module is disabled).`
            );
          } else {
            logger.info(
              'init',
              `[filterLayoutContent] Filtering out component '${item.componentType}' (module '${moduleId}') because module is disabled.`
            );
          }
          return null;
        }
      }

      // If item has its own content (e.g., stack, row, column), recursively filter it
      if (item.content && Array.isArray(item.content)) {
        logger.debug(
          'init',
          `[filterLayoutContent] Item '${item.type} - ${
            item.title || 'N/A'
          }' has children. Recursively filtering its content of length ${
            item.content.length
          }`
        );

        item.content = filterLayoutContent(
          item.content,
          isModuleEnabledFunc,
          getModuleIdFunc,
          logger
        );

        logger.debug(
          'init',
          `[filterLayoutContent] Item '${item.type} - ${
            item.title || 'N/A'
          }' children filtered. New content length: ${item.content.length}`
        );

        // If a container item (stack, row, column) becomes empty after filtering, remove it
        if (
          item.content.length === 0 &&
          (item.type === 'stack' ||
            item.type === 'row' ||
            item.type === 'column')
        ) {
          logger.info(
            'init',
            `[filterLayoutContent] Filtering out empty container '${
              item.type
            }' (originally titled '${
              item.title || 'N/A'
            }') after its children were removed.`
          );
          return null;
        }
      }

      return item;
    })
    .filter((item) => item !== null);
}
