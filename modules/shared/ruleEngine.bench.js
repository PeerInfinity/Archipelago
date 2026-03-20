/**
 * Performance benchmarks for ruleEngine.js
 *
 * Run with: npm run bench
 *
 * These benchmarks measure evaluation time for different rule types
 * and complexity levels to identify optimization opportunities and
 * detect performance regressions.
 *
 * @see frontend/modules/shared/ruleEngine.js
 */

import { bench, describe } from 'vitest';
import { evaluateRule } from './ruleEngine.js';

// =============================================================================
// Test Context Setup
// =============================================================================

/**
 * Create a mock context with configurable size for benchmarking.
 */
function createMockContext({ inventorySize = 10, regionCount = 5, groupCount = 3 } = {}) {
  const inventory = {};
  for (let i = 0; i < inventorySize; i++) {
    inventory[`Item_${i}`] = Math.floor(Math.random() * 10) + 1;
  }

  const regions = new Set();
  for (let i = 0; i < regionCount; i++) {
    regions.add(`Region_${i}`);
  }

  const groups = {};
  for (let i = 0; i < groupCount; i++) {
    groups[`Group_${i}`] = Math.floor(Math.random() * 5) + 1;
  }

  return {
    _isSnapshotInterface: true,
    inventory,
    regions,
    groups,
    settings: { difficulty: 'normal', mode: 'standard' },
    playerId: 1,

    hasItem(name) {
      return (this.inventory[name] || 0) > 0;
    },
    countItem(name) {
      return this.inventory[name] || 0;
    },
    hasGroup(name, count = 1) {
      return (this.groups[name] || 0) >= count;
    },
    countGroup(name) {
      return this.groups[name] || 0;
    },
    isRegionReachable(name) {
      return this.regions.has(name);
    },
    canReach(name) {
      return this.regions.has(name);
    },
    getPlayerId() {
      return this.playerId;
    },
    getSetting(name) {
      return this.settings[name];
    },
    executeHelper(name, ...args) {
      if (name === 'has') return this.hasItem(args[0]);
      if (name === 'count') return this.countItem(args[0]);
      return undefined;
    },
    executeStateManagerMethod(name, ...args) {
      if (name === 'can_reach') return this.canReach(args[0]);
      if (name === 'has') return this.hasItem(args[0]);
      return undefined;
    },
  };
}

// =============================================================================
// Rule Generators
// =============================================================================

/**
 * Generate a deeply nested binary operation rule.
 */
function generateNestedBinaryOp(depth, op = '+') {
  if (depth <= 1) {
    return { type: 'constant', value: 1 };
  }
  return {
    type: 'binary_op',
    op,
    left: generateNestedBinaryOp(depth - 1, op),
    right: { type: 'constant', value: 1 },
  };
}

/**
 * Generate an AND rule with N conditions.
 */
function generateAndRule(conditionCount) {
  const conditions = [];
  for (let i = 0; i < conditionCount; i++) {
    conditions.push({ type: 'constant', value: true });
  }
  return { type: 'and', conditions };
}

/**
 * Generate an OR rule with N conditions (all false except last).
 */
function generateOrRule(conditionCount) {
  const conditions = [];
  for (let i = 0; i < conditionCount - 1; i++) {
    conditions.push({ type: 'constant', value: false });
  }
  conditions.push({ type: 'constant', value: true });
  return { type: 'or', conditions };
}

/**
 * Generate a nested conditional rule.
 */
function generateNestedConditional(depth) {
  if (depth <= 1) {
    return { type: 'constant', value: 42 };
  }
  return {
    type: 'conditional',
    test: { type: 'constant', value: true },
    if_true: generateNestedConditional(depth - 1),
    if_false: { type: 'constant', value: 0 },
  };
}

/**
 * Generate item checks for multiple items.
 */
function generateItemChecks(count) {
  const conditions = [];
  for (let i = 0; i < count; i++) {
    conditions.push({
      type: 'item_check',
      item: `Item_${i % 10}`, // Cycle through available items
    });
  }
  return { type: 'and', conditions };
}

/**
 * Generate a complex real-world-like rule.
 */
function generateComplexRule() {
  return {
    type: 'and',
    conditions: [
      {
        type: 'or',
        conditions: [
          { type: 'item_check', item: 'Item_0' },
          { type: 'item_check', item: 'Item_1' },
        ],
      },
      {
        type: 'compare',
        op: '>=',
        left: { type: 'count_item', item: 'Item_2' },
        right: { type: 'constant', value: 3 },
      },
      { type: 'can_reach', region: 'Region_0' },
      {
        type: 'conditional',
        test: { type: 'setting_value', setting: 'difficulty' },
        if_true: { type: 'item_check', item: 'Item_3' },
        if_false: { type: 'constant', value: true },
      },
    ],
  };
}

// =============================================================================
// Benchmarks
// =============================================================================

const smallContext = createMockContext({ inventorySize: 10, regionCount: 5 });
const mediumContext = createMockContext({ inventorySize: 100, regionCount: 50 });
const largeContext = createMockContext({ inventorySize: 1000, regionCount: 200 });

describe('Basic Rule Types', () => {
  bench('constant', () => {
    evaluateRule({ type: 'constant', value: 42 }, smallContext);
  });

  bench('item_check (has item)', () => {
    evaluateRule({ type: 'item_check', item: 'Item_0' }, smallContext);
  });

  bench('count_item', () => {
    evaluateRule({ type: 'count_item', item: 'Item_0' }, smallContext);
  });

  bench('can_reach', () => {
    evaluateRule({ type: 'can_reach', region: 'Region_0' }, smallContext);
  });

  bench('setting_value', () => {
    evaluateRule({ type: 'setting_value', setting: 'difficulty' }, smallContext);
  });

  bench('player_id', () => {
    evaluateRule({ type: 'player_id' }, smallContext);
  });
});

describe('Binary Operations', () => {
  bench('simple addition', () => {
    evaluateRule({
      type: 'binary_op',
      op: '+',
      left: { type: 'constant', value: 5 },
      right: { type: 'constant', value: 3 },
    }, smallContext);
  });

  bench('nested 5 levels', () => {
    evaluateRule(generateNestedBinaryOp(5), smallContext);
  });

  bench('nested 10 levels', () => {
    evaluateRule(generateNestedBinaryOp(10), smallContext);
  });

  bench('nested 20 levels', () => {
    evaluateRule(generateNestedBinaryOp(20), smallContext);
  });
});

describe('Comparisons', () => {
  bench('simple compare (==)', () => {
    evaluateRule({
      type: 'compare',
      op: '==',
      left: { type: 'constant', value: 5 },
      right: { type: 'constant', value: 5 },
    }, smallContext);
  });

  bench('compare with item count', () => {
    evaluateRule({
      type: 'compare',
      op: '>=',
      left: { type: 'count_item', item: 'Item_0' },
      right: { type: 'constant', value: 3 },
    }, smallContext);
  });

  bench('in list (5 items)', () => {
    evaluateRule({
      type: 'compare',
      op: 'in',
      left: { type: 'constant', value: 3 },
      right: {
        type: 'list',
        value: [1, 2, 3, 4, 5].map((v) => ({ type: 'constant', value: v })),
      },
    }, smallContext);
  });
});

describe('Boolean Logic', () => {
  bench('AND with 5 conditions', () => {
    evaluateRule(generateAndRule(5), smallContext);
  });

  bench('AND with 20 conditions', () => {
    evaluateRule(generateAndRule(20), smallContext);
  });

  bench('AND with 50 conditions', () => {
    evaluateRule(generateAndRule(50), smallContext);
  });

  bench('OR with 5 conditions (short-circuit)', () => {
    evaluateRule(generateOrRule(5), smallContext);
  });

  bench('OR with 20 conditions (worst case)', () => {
    evaluateRule(generateOrRule(20), smallContext);
  });

  bench('NOT', () => {
    evaluateRule({
      type: 'not',
      operand: { type: 'constant', value: false },
    }, smallContext);
  });
});

describe('Conditionals', () => {
  bench('simple conditional', () => {
    evaluateRule({
      type: 'conditional',
      test: { type: 'constant', value: true },
      if_true: { type: 'constant', value: 'yes' },
      if_false: { type: 'constant', value: 'no' },
    }, smallContext);
  });

  bench('nested 5 levels', () => {
    evaluateRule(generateNestedConditional(5), smallContext);
  });

  bench('nested 10 levels', () => {
    evaluateRule(generateNestedConditional(10), smallContext);
  });
});

describe('Item Checks (Game-Realistic)', () => {
  bench('5 item checks', () => {
    evaluateRule(generateItemChecks(5), smallContext);
  });

  bench('10 item checks', () => {
    evaluateRule(generateItemChecks(10), smallContext);
  });

  bench('20 item checks', () => {
    evaluateRule(generateItemChecks(20), smallContext);
  });
});

describe('Context Size Impact', () => {
  const itemCheck = { type: 'item_check', item: 'Item_5' };

  bench('item_check - small context (10 items)', () => {
    evaluateRule(itemCheck, smallContext);
  });

  bench('item_check - medium context (100 items)', () => {
    evaluateRule(itemCheck, mediumContext);
  });

  bench('item_check - large context (1000 items)', () => {
    evaluateRule(itemCheck, largeContext);
  });
});

describe('Complex Real-World Rules', () => {
  const complexRule = generateComplexRule();

  bench('complex rule (AND + OR + compare + conditional)', () => {
    evaluateRule(complexRule, smallContext);
  });

  bench('min/max with 5 args', () => {
    evaluateRule({
      type: 'min',
      args: [1, 5, 3, 8, 2].map((v) => ({ type: 'constant', value: v })),
    }, smallContext);
  });

  bench('negate', () => {
    evaluateRule({
      type: 'negate',
      operand: { type: 'constant', value: 42 },
    }, smallContext);
  });
});

describe('Block Execution', () => {
  bench('simple block with return', () => {
    evaluateRule({
      type: 'block',
      statements: [
        { type: 'return', value: { type: 'constant', value: 42 } },
      ],
    }, smallContext);
  });

  bench('block with assignment and return', () => {
    evaluateRule({
      type: 'block',
      statements: [
        { type: 'assign', var: 'x', value: { type: 'constant', value: 10 } },
        { type: 'return', value: { type: 'name', name: 'x' } },
      ],
    }, smallContext);
  });

  bench('for_range (10 iterations)', () => {
    evaluateRule({
      type: 'block',
      statements: [
        { type: 'assign', var: 'sum', value: { type: 'constant', value: 0 } },
        {
          type: 'for_range',
          var: 'i',
          start: { type: 'constant', value: 0 },
          end: { type: 'constant', value: 10 },
          body: [
            { type: 'assign', var: 'sum', op: '+=', value: { type: 'name', name: 'i' } },
          ],
        },
        { type: 'return', value: { type: 'name', name: 'sum' } },
      ],
    }, smallContext);
  });
});

describe('Helper/Method Calls', () => {
  bench('helper call (has)', () => {
    evaluateRule({
      type: 'helper',
      name: 'has',
      args: [{ type: 'constant', value: 'Item_0' }],
    }, smallContext);
  });

  bench('state_method call (can_reach)', () => {
    evaluateRule({
      type: 'state_method',
      method: 'can_reach',
      args: [{ type: 'constant', value: 'Region_0' }],
    }, smallContext);
  });
});
