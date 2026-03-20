/**
 * Python to JSON Converter
 *
 * Converts Python code to Archipelago-CC JSON rule format.
 * Uses a simple recursive descent parser for common patterns.
 *
 * Supported patterns:
 * - state.has('item'), state.has('item', count)
 * - state.count('item') >= n
 * - state.has_group('group'), state.has_group('group', count)
 * - state.can_reach('region', 'type', player)
 * - Boolean expressions: and, or, not
 * - Comparisons: ==, !=, <, >, <=, >=
 * - Lambda expressions
 * - Function definitions
 */

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('pythonToJson', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[pythonToJson] ${message}`, ...data);
  }
}

/**
 * Simple tokenizer for Python-like expressions
 */
class Tokenizer {
  constructor(code) {
    this.code = code;
    this.pos = 0;
    this.tokens = [];
    this.tokenize();
  }

  tokenize() {
    while (this.pos < this.code.length) {
      this.skipWhitespace();
      if (this.pos >= this.code.length) break;

      const ch = this.code[this.pos];

      // String literals
      if (ch === '"' || ch === "'") {
        this.tokens.push(this.readString());
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(this.code[this.pos + 1]))) {
        this.tokens.push(this.readNumber());
        continue;
      }

      // Identifiers and keywords
      if (/[a-zA-Z_]/.test(ch)) {
        this.tokens.push(this.readIdentifier());
        continue;
      }

      // Two-character operators
      const twoChar = this.code.slice(this.pos, this.pos + 2);
      if (['==', '!=', '<=', '>=', '**', '//', '+=', '-=', '*=', '/='].includes(twoChar)) {
        this.tokens.push({ type: 'operator', value: twoChar });
        this.pos += 2;
        continue;
      }

      // Single character tokens
      if ('()[]{}:,.+-*/<>='.includes(ch)) {
        this.tokens.push({ type: 'operator', value: ch });
        this.pos++;
        continue;
      }

      // Unknown character - skip
      this.pos++;
    }
  }

  skipWhitespace() {
    while (this.pos < this.code.length && /\s/.test(this.code[this.pos])) {
      this.pos++;
    }
  }

  readString() {
    const quote = this.code[this.pos];
    this.pos++;
    let value = '';

    while (this.pos < this.code.length && this.code[this.pos] !== quote) {
      if (this.code[this.pos] === '\\') {
        this.pos++;
        if (this.pos < this.code.length) {
          const escaped = this.code[this.pos];
          if (escaped === 'n') value += '\n';
          else if (escaped === 't') value += '\t';
          else if (escaped === '\\') value += '\\';
          else if (escaped === quote) value += quote;
          else value += escaped;
          this.pos++;
        }
      } else {
        value += this.code[this.pos];
        this.pos++;
      }
    }

    this.pos++; // Skip closing quote
    return { type: 'string', value };
  }

  readNumber() {
    let value = '';
    if (this.code[this.pos] === '-') {
      value = '-';
      this.pos++;
    }

    while (this.pos < this.code.length && /[0-9.]/.test(this.code[this.pos])) {
      value += this.code[this.pos];
      this.pos++;
    }

    return { type: 'number', value: parseFloat(value) };
  }

  readIdentifier() {
    let value = '';
    while (this.pos < this.code.length && /[a-zA-Z0-9_]/.test(this.code[this.pos])) {
      value += this.code[this.pos];
      this.pos++;
    }

    const keywords = ['and', 'or', 'not', 'if', 'else', 'for', 'in', 'lambda', 'def', 'return', 'True', 'False', 'None', 'all', 'any'];
    if (keywords.includes(value)) {
      return { type: 'keyword', value };
    }

    return { type: 'identifier', value };
  }
}

/**
 * Parser for Python expressions
 */
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.warnings = [];
    this.errors = [];
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  advance() {
    return this.tokens[this.pos++];
  }

  match(type, value = null) {
    const token = this.peek();
    if (!token) return false;
    if (token.type !== type) return false;
    if (value !== null && token.value !== value) return false;
    return true;
  }

  expect(type, value = null) {
    if (!this.match(type, value)) {
      const token = this.peek();
      throw new Error(
        `Expected ${type}${value ? ` '${value}'` : ''}, got ${token ? `${token.type} '${token.value}'` : 'end of input'}`
      );
    }
    return this.advance();
  }

  parse() {
    try {
      // Check for lambda
      if (this.match('keyword', 'lambda')) {
        return this.parseLambda();
      }

      // Check for def
      if (this.match('keyword', 'def')) {
        return this.parseFunctionDef();
      }

      // Parse expression
      return this.parseExpression();
    } catch (e) {
      this.errors.push(e.message);
      return null;
    }
  }

  parseLambda() {
    this.expect('keyword', 'lambda');

    // Parse parameters
    const params = [];
    while (!this.match('operator', ':')) {
      if (this.match('identifier')) {
        params.push(this.advance().value);
      }
      if (this.match('operator', ',')) {
        this.advance();
      }
    }

    this.expect('operator', ':');

    // Parse body expression
    const body = this.parseExpression();

    return body;
  }

  parseFunctionDef() {
    this.expect('keyword', 'def');
    const name = this.expect('identifier').value;
    this.expect('operator', '(');

    // Parse parameters
    const params = [];
    while (!this.match('operator', ')')) {
      if (this.match('identifier')) {
        params.push(this.advance().value);
      }
      if (this.match('operator', ',')) {
        this.advance();
      }
    }

    this.expect('operator', ')');
    this.expect('operator', ':');

    // For simplicity, just parse the rest as an expression or return statement
    if (this.match('keyword', 'return')) {
      this.advance();
      return this.parseExpression();
    }

    return this.parseExpression();
  }

  parseExpression() {
    return this.parseConditional();
  }

  parseConditional() {
    let left = this.parseOr();

    // Handle: value if condition else other
    if (this.match('keyword', 'if')) {
      this.advance();
      const condition = this.parseOr();

      this.expect('keyword', 'else');
      const elseValue = this.parseConditional();

      return {
        type: 'conditional',
        test: condition,
        if_true: left,
        if_false: elseValue,
      };
    }

    return left;
  }

  parseOr() {
    let left = this.parseAnd();

    while (this.match('keyword', 'or')) {
      this.advance();
      const right = this.parseAnd();

      if (left.type === 'or') {
        left.conditions.push(right);
      } else {
        left = { type: 'or', conditions: [left, right] };
      }
    }

    return left;
  }

  parseAnd() {
    let left = this.parseNot();

    while (this.match('keyword', 'and')) {
      this.advance();
      const right = this.parseNot();

      if (left.type === 'and') {
        left.conditions.push(right);
      } else {
        left = { type: 'and', conditions: [left, right] };
      }
    }

    return left;
  }

  parseNot() {
    if (this.match('keyword', 'not')) {
      this.advance();
      const operand = this.parseNot();
      return { type: 'not', condition: operand };
    }

    return this.parseComparison();
  }

  parseComparison() {
    let left = this.parseAddSub();

    const compOps = ['==', '!=', '<', '>', '<=', '>=', 'in'];

    if (this.match('operator') && compOps.includes(this.peek()?.value)) {
      const op = this.advance().value;
      const right = this.parseAddSub();

      return {
        type: 'compare',
        left,
        op,
        right,
      };
    }

    // Handle 'in' keyword
    if (this.match('keyword', 'in')) {
      this.advance();
      const right = this.parseAddSub();
      return {
        type: 'compare',
        left,
        op: 'in',
        right,
      };
    }

    return left;
  }

  parseAddSub() {
    let left = this.parseMulDiv();

    while (this.match('operator', '+') || this.match('operator', '-')) {
      const op = this.advance().value;
      const right = this.parseMulDiv();
      left = { type: 'binary_op', left, op, right };
    }

    return left;
  }

  parseMulDiv() {
    let left = this.parseUnary();

    while (
      this.match('operator', '*') ||
      this.match('operator', '/') ||
      this.match('operator', '//')
    ) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { type: 'binary_op', left, op, right };
    }

    return left;
  }

  parseUnary() {
    if (this.match('operator', '-')) {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'negate', value: operand };
    }

    return this.parseCall();
  }

  parseCall() {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match('operator', '(')) {
        // Function call
        this.advance();
        const args = [];

        while (!this.match('operator', ')')) {
          args.push(this.parseExpression());
          if (this.match('operator', ',')) {
            this.advance();
          }
        }

        this.expect('operator', ')');

        // Handle special patterns
        expr = this.handleCall(expr, args);
      } else if (this.match('operator', '.')) {
        // Attribute access
        this.advance();
        const attr = this.expect('identifier').value;
        expr = { type: 'attribute', object: expr, attr };
      } else if (this.match('operator', '[')) {
        // Subscript
        this.advance();
        const index = this.parseExpression();
        this.expect('operator', ']');
        expr = { type: 'subscript', object: expr, index };
      } else {
        break;
      }
    }

    return expr;
  }

  handleCall(func, args) {
    // Check for special patterns
    if (func.type === 'attribute') {
      const obj = func.object;
      const method = func.attr;

      // state.has('item') or state.has('item', count)
      if (obj.type === 'name' && method === 'has') {
        const item = args[0];
        const count = args[1];

        if (count) {
          return {
            type: 'item_check',
            item: this.extractValue(item),
            count: this.extractValue(count),
          };
        }
        return {
          type: 'item_check',
          item: this.extractValue(item),
        };
      }

      // state.count('item')
      if (obj.type === 'name' && method === 'count') {
        return {
          type: 'state_method',
          method: 'count',
          args: args.map((a) => this.simplifyArg(a)),
        };
      }

      // state.has_group('group')
      if (obj.type === 'name' && method === 'has_group') {
        const group = args[0];
        const count = args[1];

        if (count) {
          return {
            type: 'group_check',
            group: this.extractValue(group),
            count: this.extractValue(count),
          };
        }
        return {
          type: 'group_check',
          group: this.extractValue(group),
        };
      }

      // state.can_reach(...)
      if (obj.type === 'name' && method === 'can_reach') {
        const target = args[0];
        const targetType = args[1];

        if (targetType && this.extractValue(targetType) === 'Region') {
          return {
            type: 'can_reach',
            region: this.extractValue(target),
          };
        }
        if (targetType && this.extractValue(targetType) === 'Location') {
          return {
            type: 'location_check',
            location: this.extractValue(target),
          };
        }
        if (targetType && this.extractValue(targetType) === 'Entrance') {
          return {
            type: 'can_reach_entrance',
            entrance: this.extractValue(target),
          };
        }

        // Generic can_reach
        return {
          type: 'state_method',
          method: 'can_reach',
          args: args.map((a) => this.simplifyArg(a)),
        };
      }

      // Generic method call
      return {
        type: 'method_call',
        object: obj,
        method,
        args: args.map((a) => this.simplifyArg(a)),
      };
    }

    // all() and any()
    if (func.type === 'name' && func.name === 'all') {
      // Check if arg is a generator expression
      if (args.length === 1 && args[0].type === 'generator_expression') {
        return {
          type: 'all_of',
          ...this.extractGeneratorDetails(args[0]),
        };
      }
      return { type: 'function_call', function: 'all', args: args.map((a) => this.simplifyArg(a)) };
    }

    if (func.type === 'name' && func.name === 'any') {
      if (args.length === 1 && args[0].type === 'generator_expression') {
        return {
          type: 'any_of',
          ...this.extractGeneratorDetails(args[0]),
        };
      }
      return { type: 'function_call', function: 'any', args: args.map((a) => this.simplifyArg(a)) };
    }

    // min/max
    if (func.type === 'name' && (func.name === 'min' || func.name === 'max')) {
      return {
        type: func.name,
        args: args.map((a) => this.simplifyArg(a)),
      };
    }

    // Generic function call
    if (func.type === 'name') {
      return {
        type: 'helper',
        name: func.name,
        args: args.map((a) => this.simplifyArg(a)),
      };
    }

    return {
      type: 'function_call',
      function: func,
      args: args.map((a) => this.simplifyArg(a)),
    };
  }

  extractValue(node) {
    if (!node) return null;
    if (node.type === 'constant') return node.value;
    if (node.type === 'name') return node.name;
    if (typeof node === 'string' || typeof node === 'number') return node;
    return node;
  }

  simplifyArg(arg) {
    if (arg.type === 'constant') {
      return { type: 'constant', value: arg.value };
    }
    return arg;
  }

  extractGeneratorDetails(genExpr) {
    // Extract details from a generator expression for all_of/any_of
    if (genExpr.generators && genExpr.generators.length > 0) {
      const gen = genExpr.generators[0];
      return {
        element_rule: genExpr.element,
        iterable: gen.iterable,
        var: gen.var,
        condition: gen.conditions?.[0],
      };
    }
    return { element_rule: genExpr.element };
  }

  parsePrimary() {
    // Parenthesized expression or tuple
    if (this.match('operator', '(')) {
      this.advance();

      // Check for generator expression
      const first = this.parseExpression();

      if (this.match('keyword', 'for')) {
        // Generator expression
        const generators = this.parseGenerators();
        this.expect('operator', ')');
        return { type: 'generator_expression', element: first, generators };
      }

      // Tuple or grouped expression
      if (this.match('operator', ',')) {
        const items = [first];
        while (this.match('operator', ',')) {
          this.advance();
          if (this.match('operator', ')')) break;
          items.push(this.parseExpression());
        }
        this.expect('operator', ')');
        return { type: 'tuple', items };
      }

      this.expect('operator', ')');
      return first;
    }

    // List
    if (this.match('operator', '[')) {
      this.advance();
      const items = [];

      while (!this.match('operator', ']')) {
        items.push(this.parseExpression());
        if (this.match('operator', ',')) {
          this.advance();
        }
      }

      this.expect('operator', ']');
      return { type: 'list', items };
    }

    // String literal
    if (this.match('string')) {
      const token = this.advance();
      return { type: 'constant', value: token.value };
    }

    // Number literal
    if (this.match('number')) {
      const token = this.advance();
      return { type: 'constant', value: token.value };
    }

    // Boolean/None literals
    if (this.match('keyword', 'True')) {
      this.advance();
      return { type: 'constant', value: true };
    }
    if (this.match('keyword', 'False')) {
      this.advance();
      return { type: 'constant', value: false };
    }
    if (this.match('keyword', 'None')) {
      this.advance();
      return { type: 'constant', value: null };
    }

    // Identifier
    if (this.match('identifier')) {
      const token = this.advance();
      return { type: 'name', name: token.value };
    }

    throw new Error(`Unexpected token: ${JSON.stringify(this.peek())}`);
  }

  parseGenerators() {
    const generators = [];

    while (this.match('keyword', 'for')) {
      this.advance();
      const varName = this.expect('identifier').value;
      this.expect('keyword', 'in');
      const iterable = this.parseOr();

      const conditions = [];
      while (this.match('keyword', 'if')) {
        this.advance();
        conditions.push(this.parseOr());
      }

      generators.push({
        var: varName,
        iterable,
        conditions,
      });
    }

    return generators;
  }
}

/**
 * Convert Python code to JSON rule format
 */
export function convertPythonToJson(code) {
  const warnings = [];
  const errors = [];

  try {
    // Normalize whitespace
    code = code.trim();

    // Skip comments
    const lines = code.split('\n').filter((line) => !line.trim().startsWith('#'));
    code = lines.join('\n').trim();

    if (!code) {
      return {
        success: true,
        rule: { type: 'constant', value: null },
        warnings: ['Empty code converted to None'],
        errors: [],
      };
    }

    // Tokenize and parse
    const tokenizer = new Tokenizer(code);
    const parser = new Parser(tokenizer.tokens);
    const rule = parser.parse();

    if (parser.errors.length > 0) {
      return {
        success: false,
        rule: null,
        warnings: parser.warnings,
        errors: parser.errors,
      };
    }

    return {
      success: true,
      rule: simplifyRule(rule),
      warnings: parser.warnings,
      errors: [],
    };
  } catch (e) {
    return {
      success: false,
      rule: null,
      warnings,
      errors: [e.message],
    };
  }
}

/**
 * Simplify a rule by removing unnecessary wrappers
 */
function simplifyRule(rule) {
  if (!rule || typeof rule !== 'object') {
    return rule;
  }

  // Recursively simplify children
  const simplified = { ...rule };

  for (const key of Object.keys(simplified)) {
    if (Array.isArray(simplified[key])) {
      simplified[key] = simplified[key].map(simplifyRule);
    } else if (typeof simplified[key] === 'object' && simplified[key] !== null) {
      simplified[key] = simplifyRule(simplified[key]);
    }
  }

  // Simplify single-condition and/or
  if (simplified.type === 'and' && simplified.conditions?.length === 1) {
    return simplified.conditions[0];
  }
  if (simplified.type === 'or' && simplified.conditions?.length === 1) {
    return simplified.conditions[0];
  }

  return simplified;
}

export default { convertPythonToJson };
