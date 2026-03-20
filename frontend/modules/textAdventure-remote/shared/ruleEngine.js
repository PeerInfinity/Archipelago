/**
 * Rule Engine - Thread-Agnostic Rule Evaluation (facade)
 *
 * This file re-exports the public API from the modular rule engine.
 * The implementation is split across focused modules in ./ruleEngine/.
 *
 * All consumers can continue importing from this file unchanged.
 *
 * @module shared/ruleEngine
 */

export { evaluateRule } from './ruleEngine/core.js';
export { resolveHelperScope, clearHelperCache } from './ruleEngine/helperScope.js';
export { debugRule, extractFunctionPath, debugPythonAST } from './ruleEngine/debug.js';
