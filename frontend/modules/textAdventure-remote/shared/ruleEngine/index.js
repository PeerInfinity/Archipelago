/**
 * Rule Engine public API.
 *
 * Re-exports the public interface from the modular rule engine.
 * All consumers should import from this module (or the facade at ../ruleEngine.js).
 *
 * @module shared/ruleEngine
 */

export { evaluateRule } from './core.js';
export { resolveHelperScope, clearHelperCache } from './helperScope.js';
export { debugRule, extractFunctionPath, debugPythonAST } from './debug.js';
