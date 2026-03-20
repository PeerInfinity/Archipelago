# Rule Type Test Fixtures

This directory contains shared test fixtures for validating rule type evaluation behavior across both the Python analyzer and JavaScript frontend.

## Purpose

The fixtures provide a **single source of truth** for how rule types should be evaluated. This ensures:

1. **Consistency**: Python and JavaScript evaluate rules the same way
2. **Round-trip validation**: Python export → JSON → JS evaluation works correctly
3. **Easy test case management**: Add new test cases by editing JSON, not code
4. **Clear documentation**: Each test case documents expected behavior

## File Structure

```
test_json/fixtures/
├── README.md                    # This file
└── rule_type_tests.json         # Test cases for all rule types
```

## Fixture Format

The `rule_type_tests.json` file contains test suites organized by rule type:

```json
{
  "version": 1,
  "test_suites": {
    "rule_type_name": {
      "description": "Human-readable description",
      "tests": [
        {
          "name": "test_case_name",
          "rule": { "type": "...", ... },
          "expected": <expected_result>,
          "context": { ... },  // Optional: inventory, settings, etc.
          "note": "Optional explanation"
        }
      ]
    }
  }
}
```

### Context Fields

The optional `context` object can include:

| Field | Type | Description |
|-------|------|-------------|
| `inventory` | `{string: number}` | Item counts (e.g., `{"Sword": 1, "Key": 5}`) |
| `groups` | `{string: number}` | Group counts (e.g., `{"swords": 3}`) |
| `settings` | `{string: any}` | Game settings (e.g., `{"difficulty": "hard"}`) |
| `regions` | `string[]` | Reachable regions (e.g., `["Castle", "Town"]`) |
| `playerId` | `number` | Current player ID (default: 1) |

## Running Tests

### Python Tests

```bash
# All fixture tests
python -m pytest test_json/test_rule_fixtures.py -v

# Specific rule type
python -m pytest test_json/test_rule_fixtures.py -k "negate" -v

# With unittest
python -m unittest tests.test_rule_fixtures -v
```

### JavaScript Tests

The JavaScript tests use Vitest and run against the same fixtures:

```bash
# All unit tests (includes fixtures)
npm run test:unit

# Run in watch mode during development
npm run test:unit:watch

# Run specific test suite
npm run test:unit -- -t "constant"

# Run with verbose output
npm run test:unit -- --reporter=verbose
```

## Adding New Test Cases

### 1. Simple Addition

Add a new test object to an existing suite:

```json
{
  "name": "new_test_case",
  "rule": {"type": "binary_op", "op": "+", "left": {"type": "constant", "value": 1}, "right": {"type": "constant", "value": 2}},
  "expected": 3
}
```

### 2. Test With Context

For tests that need inventory or settings:

```json
{
  "name": "check_sword_requirement",
  "rule": {"type": "item_check", "item": "Master Sword"},
  "context": {
    "inventory": {"Master Sword": 1}
  },
  "expected": true
}
```

### 3. New Rule Type Suite

Add a new suite for a new rule type:

```json
"new_rule_type": {
  "description": "Tests for the new_rule_type",
  "tests": [
    {
      "name": "basic_test",
      "rule": {"type": "new_rule_type", ...},
      "expected": ...
    }
  ]
}
```

### 4. Run Tests

After adding test cases, run the tests to verify:

```bash
python -m pytest test_json/test_rule_fixtures.py -v --tb=short
```

## Currently Covered Rule Types

| Rule Type | Tests | Description |
|-----------|-------|-------------|
| `constant` | 7 | Literal values |
| `negate` | 5 | Unary minus |
| `player_id` | 3 | Player ID reference |
| `binary_op` | 8 | Arithmetic operations |
| `compare` | 10 | Comparisons |
| `and` | 5 | Logical AND |
| `or` | 4 | Logical OR |
| `not` | 3 | Logical NOT |
| `conditional` | 3 | Ternary expressions |
| `min` | 3 | Minimum value |
| `max` | 3 | Maximum value |
| `item_check` | 4 | Item checks |
| `count_item` | 2 | Item counts |
| `group_check` | 3 | Group checks |
| `group_count` | 2 | Group counts |
| `list` | 2 | List literals |
| `block` | 3 | Block execution |
| `for_range` | 1 | For loops |
| `setting_value` | 3 | Setting lookups |
| `helper` | 4 | Helper function calls |
| `state_method` | 6 | State manager methods |
| `can_reach` | 3 | Region reachability |

**Total: 87 test cases**

## Best Practices

1. **Name tests descriptively**: Use names like `has_item_with_count_satisfied` not `test1`
2. **Add notes for edge cases**: Use the `note` field to explain non-obvious expected behavior
3. **Test both success and failure**: Include tests for both passing and failing conditions
4. **Keep rules minimal**: Test one thing at a time; avoid complex nested rules unless testing nesting specifically
5. **Use realistic values**: Use item names like "Sword" not "x" for better readability

## Maintenance

When implementing a new rule type:

1. Add test cases to `rule_type_tests.json`
2. Update the Python evaluator in `test_rule_fixtures.py` if needed
3. Run Python tests: `python -m pytest test_json/test_rule_fixtures.py -v`
4. Implement the rule type in `ruleEngine.js`
5. Run JavaScript tests: `npm run test:unit`
6. If a test uses unsupported features, add it to `SKIP_TESTS` in `ruleEngine.test.js`
