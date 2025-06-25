// frontend/modules/stateManager/ruleProcessor.js
// Shared rule processing logic for both evaluation and rendering

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('ruleProcessor', message, ...data);
  } else {
    // In worker context, only log ERROR and WARN levels to keep console clean
    if (level === 'error' || level === 'warn') {
      const consoleMethod =
        console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[ruleProcessor] ${message}`, ...data);
    }
  }
}

/**
 * Processes a rule using a shared traversal algorithm and pluggable processors.
 * This eliminates code duplication between rule evaluation and rule rendering.
 * 
 * @param {any} rule - The rule object (or primitive) to process
 * @param {object} context - Context object (StateManager interface or snapshot interface)
 * @param {object} processor - Processor object with handler methods for each rule type
 * @param {object} options - Additional options (depth, colorblind mode, etc.)
 * @returns {any} - Result depends on the processor (boolean for evaluation, HTMLElement for rendering)
 */
export function processRule(rule, context, processor, options = {}) {
  const depth = options.depth || 0;
  
  // Handle primitive types directly
  if (typeof rule !== 'object' || rule === null) {
    if (processor.handlePrimitive) {
      return processor.handlePrimitive(rule, context, options);
    }
    return rule; // Default behavior: return the primitive value itself
  }

  // Validate context if processor requires it
  if (processor.validateContext && !processor.validateContext(context, rule)) {
    log('warn', '[processRule] Invalid context provided', { rule, contextProvided: !!context });
    if (processor.handleInvalidContext) {
      return processor.handleInvalidContext(rule, context, options);
    }
    return undefined;
  }

  const ruleType = rule?.type;

  // Error handling wrapper
  try {
    // Recursive processing function for child rules
    const processChild = (childRule, childOptions = {}) => {
      const mergedOptions = { ...options, ...childOptions, depth: depth + 1 };
      return processRule(childRule, context, processor, mergedOptions);
    };

    // Delegate to the appropriate processor handler
    switch (ruleType) {
      case 'constant':
      case 'value':
        return processor.handleConstant ? 
          processor.handleConstant(rule, context, options, processChild) : 
          rule.value;

      case 'name':
        return processor.handleName ? 
          processor.handleName(rule, context, options, processChild) : 
          undefined;

      case 'item_check':
        return processor.handleItemCheck ? 
          processor.handleItemCheck(rule, context, options, processChild) : 
          undefined;

      case 'count_check':
        return processor.handleCountCheck ? 
          processor.handleCountCheck(rule, context, options, processChild) : 
          undefined;

      case 'group_check':
        return processor.handleGroupCheck ? 
          processor.handleGroupCheck(rule, context, options, processChild) : 
          undefined;

      case 'helper':
        return processor.handleHelper ? 
          processor.handleHelper(rule, context, options, processChild) : 
          undefined;

      case 'state_method':
        return processor.handleStateMethod ? 
          processor.handleStateMethod(rule, context, options, processChild) : 
          undefined;

      case 'and':
        return processor.handleAnd ? 
          processor.handleAnd(rule, context, options, processChild) : 
          undefined;

      case 'or':
        return processor.handleOr ? 
          processor.handleOr(rule, context, options, processChild) : 
          undefined;

      case 'not':
        return processor.handleNot ? 
          processor.handleNot(rule, context, options, processChild) : 
          undefined;

      case 'attribute':
        return processor.handleAttribute ? 
          processor.handleAttribute(rule, context, options, processChild) : 
          undefined;

      case 'function_call':
        return processor.handleFunctionCall ? 
          processor.handleFunctionCall(rule, context, options, processChild) : 
          undefined;

      case 'subscript':
        return processor.handleSubscript ? 
          processor.handleSubscript(rule, context, options, processChild) : 
          undefined;

      case 'compare':
      case 'comparison':
        return processor.handleCompare ? 
          processor.handleCompare(rule, context, options, processChild) : 
          undefined;

      case 'conditional':
        return processor.handleConditional ? 
          processor.handleConditional(rule, context, options, processChild) : 
          undefined;

      case 'binary_op':
        return processor.handleBinaryOp ? 
          processor.handleBinaryOp(rule, context, options, processChild) : 
          undefined;

      case 'list':
        return processor.handleList ? 
          processor.handleList(rule, context, options, processChild) : 
          undefined;

      case 'setting_check':
        return processor.handleSettingCheck ? 
          processor.handleSettingCheck(rule, context, options, processChild) : 
          undefined;

      default:
        if (processor.handleUnknown) {
          return processor.handleUnknown(rule, context, options, processChild);
        }
        log('warn', `[processRule] Unknown rule type: ${ruleType}`, { rule });
        return undefined;
    }
  } catch (error) {
    if (processor.handleError) {
      return processor.handleError(error, rule, context, options);
    }
    log('error', '[processRule] Error during processing:', {
      ruleType,
      rule,
      error,
      contextType: typeof context,
    });
    return undefined;
  }
}

/**
 * Base processor class that other processors can extend.
 * Provides default error handling and common utilities.
 */
export class BaseRuleProcessor {
  validateContext(context, rule) {
    return context != null;
  }

  handleError(error, rule, context, options) {
    log('error', '[BaseRuleProcessor] Error in rule processing:', {
      error,
      ruleType: rule?.type,
      rule
    });
    return undefined;
  }

  handleInvalidContext(rule, context, options) {
    log('warn', '[BaseRuleProcessor] Invalid context for rule:', { rule });
    return undefined;
  }

  handleUnknown(rule, context, options, processChild) {
    log('warn', '[BaseRuleProcessor] Unknown rule type:', rule?.type, { rule });
    return undefined;
  }
}