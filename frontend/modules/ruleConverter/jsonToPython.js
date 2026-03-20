/**
 * JSON to Python Converter
 *
 * Converts Archipelago-CC JSON rule format to Python code.
 * This is a JavaScript port of exporter/converter/json_to_python.py
 */

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('jsonToPython', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[jsonToPython] ${message}`, ...data);
  }
}

/**
 * Converter class from JSON rules to Python code
 */
export class JSONToPython {
  constructor(stateVar = 'state', indentSize = 4) {
    this.stateVar = stateVar;
    this.indentSize = indentSize;
    this.warnings = [];
    this.errors = [];
  }

  /**
   * Convert a JSON rule to Python code
   * @param {Object} rule - Rule dictionary in AST format
   * @returns {{code: string, warnings: string[], errors: string[], success: boolean}}
   */
  convert(rule) {
    this.warnings = [];
    this.errors = [];

    try {
      const code = this._convertRule(rule);
      return {
        code,
        warnings: [...this.warnings],
        errors: [...this.errors],
        success: this.errors.length === 0,
      };
    } catch (e) {
      this.errors.push(`Conversion failed: ${e.message}`);
      return {
        code: `# Error: ${e.message}\n${JSON.stringify(rule, null, 2)}`,
        warnings: [...this.warnings],
        errors: [...this.errors],
        success: false,
      };
    }
  }

  /**
   * Convert a single rule to Python code
   */
  _convertRule(rule, context = 'expression') {
    if (rule === null || rule === undefined) {
      return 'None';
    }

    if (typeof rule !== 'object' || Array.isArray(rule)) {
      return this._convertPrimitive(rule);
    }

    const ruleType = rule.type;
    if (!ruleType) {
      if ('value' in rule) {
        return this._convertPrimitive(rule.value);
      }
      this.warnings.push(`Rule missing 'type' field: ${JSON.stringify(rule)}`);
      return JSON.stringify(rule);
    }

    const converter = this._getConverter(ruleType);
    if (converter) {
      return converter.call(this, rule, context);
    }

    this.warnings.push(`Unknown rule type '${ruleType}', generating comment`);
    return `# Unknown type: ${ruleType}\n${JSON.stringify(rule, null, 2)}`;
  }

  /**
   * Get the converter function for a rule type
   */
  _getConverter(type) {
    const converters = {
      // Constants
      constant: this._convertConstant,

      // Item and group rules
      item_check: this._convertItemCheck,
      count_check: this._convertCountCheck,
      group_check: this._convertGroupCheck,
      group_count: this._convertGroupCount,
      prog_item_count: this._convertProgItemCount,

      // Boolean logic
      and: this._convertAnd,
      or: this._convertOr,
      not: this._convertNot,
      conditional: this._convertConditional,

      // Reachability
      can_reach: this._convertCanReach,
      location_check: this._convertLocationCheck,
      can_reach_entrance: this._convertCanReachEntrance,
      region_reference: this._convertRegionReference,
      region_attribute: this._convertRegionAttribute,

      // Function/method calls
      helper: this._convertHelper,
      state_method: this._convertStateMethod,
      method_call: this._convertMethodCall,
      function_call: this._convertFunctionCall,

      // References
      attribute: this._convertAttribute,
      name: this._convertName,
      subscript: this._convertSubscript,
      setting_value: this._convertSettingValue,
      player_id: this._convertPlayerId,

      // Collections
      list: this._convertList,
      tuple: this._convertTuple,

      // Imperative constructs
      block: this._convertBlock,
      return: this._convertReturn,
      assign: this._convertAssign,
      for_range: this._convertForRange,
      for_iter: this._convertForIter,
      if_statement: this._convertIfStatement,
      break: this._convertBreak,
      continue: this._convertContinue,

      // Generators
      all_of: this._convertAllOf,
      any_of: this._convertAnyOf,
      generator_expression: this._convertGeneratorExpression,

      // Math operations
      binary_op: this._convertBinaryOp,
      compare: this._convertCompare,
      min: this._convertMin,
      max: this._convertMax,
      negate: this._convertNegate,

      // String formatting
      f_string: this._convertFString,
      formatted_value: this._convertFormattedValue,

      // Error/unknown
      error: this._convertError,
      unknown: this._convertUnknown,
    };

    return converters[type];
  }

  /**
   * Convert a primitive value to Python code
   */
  _convertPrimitive(value) {
    if (value === null || value === undefined) {
      return 'None';
    }
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (Array.isArray(value)) {
      const items = value.map((v) => this._convertPrimitive(v)).join(', ');
      return `[${items}]`;
    }
    if (typeof value === 'object') {
      const items = Object.entries(value)
        .map(([k, v]) => `${JSON.stringify(k)}: ${this._convertPrimitive(v)}`)
        .join(', ');
      return `{${items}}`;
    }
    return JSON.stringify(value);
  }

  /**
   * Indent code by the given level
   */
  _indent(code, level = 1) {
    const indent = ' '.repeat(this.indentSize * level);
    return code
      .split('\n')
      .map((line) => (line.trim() ? indent + line : line))
      .join('\n');
  }

  /**
   * Check if a rule needs parentheses
   */
  _needsParens(rule, parentOp) {
    if (!rule || typeof rule !== 'object') return false;
    const ruleType = rule.type || '';
    if (parentOp === 'and' && ruleType === 'or') return true;
    if (['and', 'or'].includes(parentOp) && ruleType === 'conditional') return true;
    return false;
  }

  // -------------------------------------------------------------------------
  // Converters
  // -------------------------------------------------------------------------

  _convertConstant(rule) {
    return this._convertPrimitive(rule.value);
  }

  _convertItemCheck(rule) {
    const item = rule.item || '';
    const count = rule.count || 1;

    const itemCode =
      typeof item === 'object' ? this._convertRule(item) : JSON.stringify(item);

    if (count !== 1) {
      return `${this.stateVar}.has(${itemCode}, ${count})`;
    }
    return `${this.stateVar}.has(${itemCode})`;
  }

  _convertCountCheck(rule) {
    const item = rule.item || '';
    const count = rule.count || 1;

    const itemCode =
      typeof item === 'object' ? this._convertRule(item) : JSON.stringify(item);

    return `${this.stateVar}.count(${itemCode}) >= ${count}`;
  }

  _convertGroupCheck(rule) {
    const group = rule.group || '';
    const count = rule.count || 1;

    if (count !== 1) {
      return `${this.stateVar}.has_group(${JSON.stringify(group)}, ${count})`;
    }
    return `${this.stateVar}.has_group(${JSON.stringify(group)})`;
  }

  _convertGroupCount(rule) {
    const group = rule.group || '';
    return `${this.stateVar}.count_group(${JSON.stringify(group)})`;
  }

  _convertProgItemCount(rule) {
    const item = rule.item || '';
    return `${this.stateVar}.count(${JSON.stringify(item)})`;
  }

  _convertAnd(rule) {
    const conditions = rule.conditions || [];
    if (!conditions.length) return 'True';

    const parts = conditions.map((cond) => {
      let code = this._convertRule(cond);
      if (this._needsParens(cond, 'and')) {
        code = `(${code})`;
      }
      return code;
    });

    return parts.length === 1 ? parts[0] : parts.join(' and ');
  }

  _convertOr(rule) {
    const conditions = rule.conditions || [];
    if (!conditions.length) return 'False';

    const parts = conditions.map((cond) => {
      let code = this._convertRule(cond);
      if (this._needsParens(cond, 'or')) {
        code = `(${code})`;
      }
      return code;
    });

    return parts.length === 1 ? parts[0] : parts.join(' or ');
  }

  _convertNot(rule) {
    const condition = rule.condition || {};
    const code = this._convertRule(condition);
    const condType = condition?.type || '';

    if (['and', 'or', 'conditional'].includes(condType)) {
      return `not (${code})`;
    }
    return `not ${code}`;
  }

  _convertConditional(rule) {
    const test = rule.test || {};
    const ifTrue = rule.if_true || {};
    const ifFalse = rule.if_false;

    const testCode = this._convertRule(test);
    const ifTrueCode = this._convertRule(ifTrue);

    if (ifFalse === null || ifFalse === undefined) {
      return `${ifTrueCode} if ${testCode} else None`;
    }

    const ifFalseCode = this._convertRule(ifFalse);
    return `${ifTrueCode} if ${testCode} else ${ifFalseCode}`;
  }

  _convertCanReach(rule) {
    const region = rule.region || '';
    return `${this.stateVar}.can_reach(${JSON.stringify(region)}, 'Region', ${this.stateVar}.player)`;
  }

  _convertLocationCheck(rule) {
    const location = rule.location || '';
    return `${this.stateVar}.can_reach(${JSON.stringify(location)}, 'Location', ${this.stateVar}.player)`;
  }

  _convertCanReachEntrance(rule) {
    const entrance = rule.entrance || '';
    return `${this.stateVar}.can_reach(${JSON.stringify(entrance)}, 'Entrance', ${this.stateVar}.player)`;
  }

  _convertRegionReference(rule) {
    const region = rule.region || '';
    return `${this.stateVar}.multiworld.get_region(${JSON.stringify(region)}, ${this.stateVar}.player)`;
  }

  _convertRegionAttribute(rule) {
    const region = rule.region || '';
    const attr = rule.attr || '';
    return `${this.stateVar}.multiworld.get_region(${JSON.stringify(region)}, ${this.stateVar}.player).${attr}`;
  }

  _convertHelper(rule) {
    const name = rule.name || 'unknown_helper';
    const args = rule.args || [];

    const argParts = args.map((arg) =>
      typeof arg === 'object' ? this._convertRule(arg) : this._convertPrimitive(arg)
    );

    const argsStr = argParts.join(', ');

    if (argsStr && !argsStr.startsWith(this.stateVar)) {
      return `${name}(${this.stateVar}, ${argsStr})`;
    }
    return argsStr ? `${name}(${argsStr})` : `${name}(${this.stateVar})`;
  }

  _convertStateMethod(rule) {
    const method = rule.method || '';
    const args = rule.args || [];

    const argParts = args.map((arg) => {
      if (typeof arg === 'object') {
        if (arg.type === 'constant') {
          return this._convertPrimitive(arg.value);
        }
        return this._convertRule(arg);
      }
      return this._convertPrimitive(arg);
    });

    return `${this.stateVar}.${method}(${argParts.join(', ')})`;
  }

  _convertMethodCall(rule) {
    const obj = rule.object || {};
    const method = rule.method || '';
    const args = rule.args || [];

    const objCode = this._convertRule(obj);
    const argParts = args.map((arg) =>
      typeof arg === 'object' ? this._convertRule(arg) : this._convertPrimitive(arg)
    );

    return `${objCode}.${method}(${argParts.join(', ')})`;
  }

  _convertFunctionCall(rule) {
    const func = rule.function || rule.name || 'unknown';
    const args = rule.args || [];

    const funcCode = typeof func === 'object' ? this._convertRule(func) : func;
    const argParts = args.map((arg) =>
      typeof arg === 'object' ? this._convertRule(arg) : this._convertPrimitive(arg)
    );

    return `${funcCode}(${argParts.join(', ')})`;
  }

  _convertAttribute(rule) {
    const obj = rule.object || {};
    const attr = rule.attr || '';
    return `${this._convertRule(obj)}.${attr}`;
  }

  _convertName(rule) {
    return rule.name || '';
  }

  _convertSubscript(rule) {
    const obj = rule.object || rule.value || {};
    const index = rule.index || rule.slice || {};

    return `${this._convertRule(obj)}[${this._convertRule(index)}]`;
  }

  _convertSettingValue(rule) {
    const setting = rule.setting || '';
    return `world.options.${setting}.value`;
  }

  _convertPlayerId() {
    return `${this.stateVar}.player`;
  }

  _convertList(rule) {
    const items = rule.value || rule.items || [];
    const itemCodes = items.map((item) =>
      typeof item === 'object' ? this._convertRule(item) : this._convertPrimitive(item)
    );
    return `[${itemCodes.join(', ')}]`;
  }

  _convertTuple(rule) {
    const items = rule.value || rule.items || [];
    const itemCodes = items.map((item) =>
      typeof item === 'object' ? this._convertRule(item) : this._convertPrimitive(item)
    );
    if (itemCodes.length === 1) {
      return `(${itemCodes[0]},)`;
    }
    return `(${itemCodes.join(', ')})`;
  }

  _convertBlock(rule) {
    const statements = rule.statements || [];
    return statements.map((stmt) => this._convertRule(stmt, 'statement')).join('\n');
  }

  _convertReturn(rule) {
    const value = rule.value || {};
    return `return ${this._convertRule(value)}`;
  }

  _convertAssign(rule) {
    const name = rule.name || '_';
    const value = rule.value || {};
    const op = rule.op || '=';

    const valueCode = this._convertRule(value);
    return op === '=' ? `${name} = ${valueCode}` : `${name} ${op} ${valueCode}`;
  }

  _convertForRange(rule) {
    const varName = rule.var || 'i';
    const count = rule.count || {};
    const body = rule.body || [];

    const countCode = this._convertRule(count);
    const bodyLines = body.map((stmt) => this._indent(this._convertRule(stmt, 'statement')));
    const bodyStr = bodyLines.length ? bodyLines.join('\n') : this._indent('pass');

    return `for ${varName} in range(${countCode}):\n${bodyStr}`;
  }

  _convertForIter(rule) {
    const varName = rule.var || 'item';
    const iterable = rule.iterable || {};
    const body = rule.body || [];

    const iterCode = this._convertRule(iterable);
    const bodyLines = body.map((stmt) => this._indent(this._convertRule(stmt, 'statement')));
    const bodyStr = bodyLines.length ? bodyLines.join('\n') : this._indent('pass');

    return `for ${varName} in ${iterCode}:\n${bodyStr}`;
  }

  _convertIfStatement(rule) {
    const test = rule.test || {};
    const body = rule.body || [];
    const orelse = rule.orelse || [];

    const testCode = this._convertRule(test);
    const bodyLines = body.map((stmt) => this._indent(this._convertRule(stmt, 'statement')));
    const bodyStr = bodyLines.length ? bodyLines.join('\n') : this._indent('pass');

    let result = `if ${testCode}:\n${bodyStr}`;

    if (orelse.length) {
      const orelseLines = orelse.map((stmt) =>
        this._indent(this._convertRule(stmt, 'statement'))
      );
      result += `\nelse:\n${orelseLines.join('\n')}`;
    }

    return result;
  }

  _convertBreak() {
    return 'break';
  }

  _convertContinue() {
    return 'continue';
  }

  _convertAllOf(rule) {
    const elementRule = rule.element_rule || {};
    const iterable = rule.iterable || {};
    const varName = rule.var || 'x';
    const condition = rule.condition;

    const elemCode = this._convertRule(elementRule);
    const iterCode = this._convertRule(iterable);

    if (condition) {
      const condCode = this._convertRule(condition);
      return `all(${elemCode} for ${varName} in ${iterCode} if ${condCode})`;
    }
    return `all(${elemCode} for ${varName} in ${iterCode})`;
  }

  _convertAnyOf(rule) {
    const elementRule = rule.element_rule || {};
    const iterable = rule.iterable || {};
    const varName = rule.var || 'x';
    const condition = rule.condition;

    const elemCode = this._convertRule(elementRule);
    const iterCode = this._convertRule(iterable);

    if (condition) {
      const condCode = this._convertRule(condition);
      return `any(${elemCode} for ${varName} in ${iterCode} if ${condCode})`;
    }
    return `any(${elemCode} for ${varName} in ${iterCode})`;
  }

  _convertGeneratorExpression(rule) {
    const element = rule.element || {};
    const generators = rule.generators || [];

    const elemCode = this._convertRule(element);

    const genParts = generators.map((gen) => {
      const varName = gen.var || 'x';
      const iterable = gen.iterable || {};
      const conditions = gen.conditions || [];

      const iterCode = this._convertRule(iterable);
      let part = `for ${varName} in ${iterCode}`;

      for (const cond of conditions) {
        part += ` if ${this._convertRule(cond)}`;
      }

      return part;
    });

    return `(${elemCode} ${genParts.join(' ')})`;
  }

  _convertBinaryOp(rule) {
    const left = rule.left || {};
    const op = rule.op || '+';
    const right = rule.right || {};

    return `(${this._convertRule(left)} ${op} ${this._convertRule(right)})`;
  }

  _convertCompare(rule) {
    const left = rule.left || {};
    let ops = rule.ops || [rule.op || '=='];
    let comparators = rule.comparators || [rule.right || {}];

    if (!Array.isArray(ops)) ops = [ops];
    if (!Array.isArray(comparators)) comparators = [comparators];

    const leftCode = this._convertRule(left);
    const parts = [leftCode];

    ops.forEach((op, i) => {
      parts.push(`${op} ${this._convertRule(comparators[i])}`);
    });

    return parts.join(' ');
  }

  _convertMin(rule) {
    const args = rule.args || [];
    const argCodes = args.map((arg) =>
      typeof arg === 'object' ? this._convertRule(arg) : this._convertPrimitive(arg)
    );
    return `min(${argCodes.join(', ')})`;
  }

  _convertMax(rule) {
    const args = rule.args || [];
    const argCodes = args.map((arg) =>
      typeof arg === 'object' ? this._convertRule(arg) : this._convertPrimitive(arg)
    );
    return `max(${argCodes.join(', ')})`;
  }

  _convertNegate(rule) {
    const value = rule.value || {};
    return `-${this._convertRule(value)}`;
  }

  _convertFString(rule) {
    const parts = rule.parts || [];
    let result = 'f"';

    for (const part of parts) {
      if (typeof part === 'object') {
        const partType = part.type || '';
        if (partType === 'formatted_value') {
          result += `{${this._convertRule(part.value || {})}}`;
        } else if (partType === 'constant') {
          result += String(part.value || '');
        } else {
          result += `{${this._convertRule(part)}}`;
        }
      } else {
        result += String(part);
      }
    }

    result += '"';
    return result;
  }

  _convertFormattedValue(rule) {
    return this._convertRule(rule.value || {});
  }

  _convertError(rule) {
    const message = rule.message || 'Unknown error';
    this.errors.push(`Error rule encountered: ${message}`);
    return `# Error: ${message}`;
  }

  _convertUnknown(rule) {
    const original = rule.original || rule;
    this.warnings.push(`Unknown rule: ${JSON.stringify(original)}`);
    return `# Unknown: ${JSON.stringify(original)}`;
  }
}

// -------------------------------------------------------------------------
// Convenience Functions
// -------------------------------------------------------------------------

/**
 * Convert a JSON rule to Python code
 */
export function convertJsonToPython(rule, stateVar = 'state', indentSize = 4) {
  const converter = new JSONToPython(stateVar, indentSize);
  return converter.convert(rule);
}

/**
 * Convert a JSON rule to a Python lambda expression
 */
export function convertJsonToLambda(rule, stateVar = 'state') {
  const result = convertJsonToPython(rule, stateVar);

  if (result.code.includes('\n')) {
    result.warnings.push('Multi-line code cannot be converted to lambda, using function');
    const indented = result.code
      .split('\n')
      .map((line) => '    ' + line)
      .join('\n');
    return {
      ...result,
      code: `def rule(${stateVar}):\n${indented}`,
    };
  }

  return {
    ...result,
    code: `lambda ${stateVar}: ${result.code}`,
  };
}

/**
 * Convert a JSON rule to a Python function definition
 */
export function convertJsonToFunction(rule, funcName = 'rule', stateVar = 'state') {
  const result = convertJsonToPython(rule, stateVar);

  const code = result.code;
  if (code.trim().startsWith('return ') || code.includes('\n')) {
    const indented = code
      .split('\n')
      .map((line) => '    ' + line)
      .join('\n');
    return {
      ...result,
      code: `def ${funcName}(${stateVar}):\n${indented}`,
    };
  }

  return {
    ...result,
    code: `def ${funcName}(${stateVar}):\n    return ${code}`,
  };
}

export default JSONToPython;
