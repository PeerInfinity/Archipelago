"""
Rule test fixtures and test data.

This module provides standardized test cases for rule analysis and evaluation,
including expected inputs, outputs, and evaluation results.
"""

from typing import Dict, Any, List

# =============================================================================
# Simple Rule Test Cases
# =============================================================================

SIMPLE_RULES: List[Dict[str, Any]] = [
    {
        "name": "simple_has",
        "description": "Basic item check with state.has()",
        "lambda_str": "lambda state: state.has('Sword')",
        "expected_json": {"type": "item_check", "item": "Sword"},
        "test_cases": [
            {"items": {"Sword": 1}, "expected": True},
            {"items": {"Sword": 0}, "expected": False},
            {"items": {}, "expected": False},
            {"items": {"Shield": 1}, "expected": False},
        ]
    },
    {
        "name": "has_with_count",
        "description": "Item check with count parameter",
        "lambda_str": "lambda state: state.has('Key', player, 3)",
        "expected_json": {"type": "item_check", "item": "Key", "count": {"type": "constant", "value": 3}},
        "test_cases": [
            {"items": {"Key": 3}, "expected": True},
            {"items": {"Key": 5}, "expected": True},
            {"items": {"Key": 2}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "has_all",
        "description": "Check for all items in a list",
        "lambda_str": "lambda state: state.has_all(['Sword', 'Shield', 'Bow'], player)",
        "expected_json": {
            "type": "state_method",
            "method": "has_all",
            "args": [{"type": "constant", "value": ["Sword", "Shield", "Bow"]}]
        },
        "test_cases": [
            {"items": {"Sword": 1, "Shield": 1, "Bow": 1}, "expected": True},
            {"items": {"Sword": 1, "Shield": 1}, "expected": False},
            {"items": {"Sword": 1, "Bow": 1}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "has_any",
        "description": "Check for any item in a list",
        "lambda_str": "lambda state: state.has_any(['Sword', 'Axe', 'Mace'], player)",
        "expected_json": {
            "type": "state_method",
            "method": "has_any",
            "args": [{"type": "constant", "value": ["Sword", "Axe", "Mace"]}]
        },
        "test_cases": [
            {"items": {"Sword": 1}, "expected": True},
            {"items": {"Axe": 1}, "expected": True},
            {"items": {"Mace": 1}, "expected": True},
            {"items": {"Shield": 1}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "constant_true",
        "description": "Always true rule",
        "lambda_str": "lambda state: True",
        "expected_json": {"type": "constant", "value": True},
        "test_cases": [
            {"items": {}, "expected": True},
            {"items": {"Sword": 1}, "expected": True},
        ]
    },
    {
        "name": "constant_false",
        "description": "Always false rule",
        "lambda_str": "lambda state: False",
        "expected_json": {"type": "constant", "value": False},
        "test_cases": [
            {"items": {}, "expected": False},
            {"items": {"Sword": 1}, "expected": False},
        ]
    },
]

# =============================================================================
# Boolean Operation Test Cases
# =============================================================================

BOOLEAN_RULES: List[Dict[str, Any]] = [
    {
        "name": "boolean_and",
        "description": "AND of two item checks",
        "lambda_str": "lambda state: state.has('Sword') and state.has('Shield')",
        "expected_json": {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {"type": "item_check", "item": "Shield"}
            ]
        },
        "test_cases": [
            {"items": {"Sword": 1, "Shield": 1}, "expected": True},
            {"items": {"Sword": 1}, "expected": False},
            {"items": {"Shield": 1}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "boolean_or",
        "description": "OR of two item checks",
        "lambda_str": "lambda state: state.has('Sword') or state.has('Axe')",
        "expected_json": {
            "type": "or",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {"type": "item_check", "item": "Axe"}
            ]
        },
        "test_cases": [
            {"items": {"Sword": 1}, "expected": True},
            {"items": {"Axe": 1}, "expected": True},
            {"items": {"Sword": 1, "Axe": 1}, "expected": True},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "boolean_not",
        "description": "NOT of an item check",
        "lambda_str": "lambda state: not state.has('Curse')",
        "expected_json": {
            "type": "not",
            "operand": {"type": "item_check", "item": "Curse"}
        },
        "test_cases": [
            {"items": {}, "expected": True},
            {"items": {"Sword": 1}, "expected": True},
            {"items": {"Curse": 1}, "expected": False},
        ]
    },
    {
        "name": "and_chain",
        "description": "Chain of three AND operations",
        "lambda_str": "lambda state: state.has('A') and state.has('B') and state.has('C')",
        "expected_json": {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"},
                {"type": "item_check", "item": "C"}
            ]
        },
        "test_cases": [
            {"items": {"A": 1, "B": 1, "C": 1}, "expected": True},
            {"items": {"A": 1, "B": 1}, "expected": False},
            {"items": {"A": 1}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "or_chain",
        "description": "Chain of three OR operations",
        "lambda_str": "lambda state: state.has('A') or state.has('B') or state.has('C')",
        "expected_json": {
            "type": "or",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"},
                {"type": "item_check", "item": "C"}
            ]
        },
        "test_cases": [
            {"items": {"A": 1}, "expected": True},
            {"items": {"B": 1}, "expected": True},
            {"items": {"C": 1}, "expected": True},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "mixed_and_or",
        "description": "Mixed AND/OR with proper precedence",
        "lambda_str": "lambda state: state.has('A') and state.has('B') or state.has('C')",
        "expected_json": {
            "type": "or",
            "conditions": [
                {
                    "type": "and",
                    "conditions": [
                        {"type": "item_check", "item": "A"},
                        {"type": "item_check", "item": "B"}
                    ]
                },
                {"type": "item_check", "item": "C"}
            ]
        },
        "test_cases": [
            {"items": {"A": 1, "B": 1}, "expected": True},
            {"items": {"C": 1}, "expected": True},
            {"items": {"A": 1}, "expected": False},
            {"items": {"B": 1}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "parenthesized_or",
        "description": "Parenthesized OR inside AND",
        "lambda_str": "lambda state: state.has('A') and (state.has('B') or state.has('C'))",
        "expected_json": {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {
                    "type": "or",
                    "conditions": [
                        {"type": "item_check", "item": "B"},
                        {"type": "item_check", "item": "C"}
                    ]
                }
            ]
        },
        "test_cases": [
            {"items": {"A": 1, "B": 1}, "expected": True},
            {"items": {"A": 1, "C": 1}, "expected": True},
            {"items": {"A": 1}, "expected": False},
            {"items": {"B": 1}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
]

# =============================================================================
# Comparison Operation Test Cases
# =============================================================================

COMPARISON_RULES: List[Dict[str, Any]] = [
    {
        "name": "count_greater_than",
        "description": "Item count greater than constant",
        "lambda_str": "lambda state: state.count('Key') > 5",
        "expected_json": {
            "type": "compare",
            "left": {"type": "state_method", "method": "count", "args": [{"type": "constant", "value": "Key"}]},
            "op": ">",
            "right": {"type": "constant", "value": 5}
        },
        "test_cases": [
            {"items": {"Key": 6}, "expected": True},
            {"items": {"Key": 10}, "expected": True},
            {"items": {"Key": 5}, "expected": False},
            {"items": {"Key": 0}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "count_greater_equal",
        "description": "Item count greater than or equal to constant",
        "lambda_str": "lambda state: state.count('Key') >= 5",
        "expected_json": {
            "type": "compare",
            "left": {"type": "state_method", "method": "count", "args": [{"type": "constant", "value": "Key"}]},
            "op": ">=",
            "right": {"type": "constant", "value": 5}
        },
        "test_cases": [
            {"items": {"Key": 5}, "expected": True},
            {"items": {"Key": 10}, "expected": True},
            {"items": {"Key": 4}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "count_equals",
        "description": "Item count equals constant",
        "lambda_str": "lambda state: state.count('Key') == 3",
        "expected_json": {
            "type": "compare",
            "left": {"type": "state_method", "method": "count", "args": [{"type": "constant", "value": "Key"}]},
            "op": "==",
            "right": {"type": "constant", "value": 3}
        },
        "test_cases": [
            {"items": {"Key": 3}, "expected": True},
            {"items": {"Key": 2}, "expected": False},
            {"items": {"Key": 4}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "count_less_than",
        "description": "Item count less than constant",
        "lambda_str": "lambda state: state.count('Key') < 3",
        "expected_json": {
            "type": "compare",
            "left": {"type": "state_method", "method": "count", "args": [{"type": "constant", "value": "Key"}]},
            "op": "<",
            "right": {"type": "constant", "value": 3}
        },
        "test_cases": [
            {"items": {"Key": 0}, "expected": True},
            {"items": {"Key": 2}, "expected": True},
            {"items": {"Key": 3}, "expected": False},
            {"items": {"Key": 5}, "expected": False},
            {"items": {}, "expected": True},
        ]
    },
]

# =============================================================================
# State Method Test Cases
# =============================================================================

STATE_METHOD_RULES: List[Dict[str, Any]] = [
    {
        "name": "can_reach_region",
        "description": "Region reachability check",
        "lambda_str": "lambda state: state.can_reach('Castle', 'Region', player)",
        "expected_json": {
            "type": "can_reach",
            "region": "Castle"
        },
        "test_cases": [
            {"items": {}, "regions": {"Castle"}, "expected": True},
            {"items": {}, "regions": {"Village"}, "expected": False},
            {"items": {}, "regions": set(), "expected": False},
        ]
    },
    {
        "name": "has_group",
        "description": "Item group check",
        "lambda_str": "lambda state: state.has_group('Swords', player)",
        "expected_json": {
            "type": "group_check",
            "group": "Swords",
            "count": 1
        },
        "test_cases": [
            {"items": {"Short Sword": 1}, "groups": {"Swords": ["Short Sword", "Long Sword"]}, "expected": True},
            {"items": {"Shield": 1}, "groups": {"Swords": ["Short Sword", "Long Sword"]}, "expected": False},
            {"items": {}, "groups": {"Swords": ["Short Sword", "Long Sword"]}, "expected": False},
        ]
    },
    {
        "name": "count_item",
        "description": "Item count retrieval",
        "lambda_str": "lambda state: state.count('Arrow', player)",
        "expected_json": {
            "type": "state_method",
            "method": "count",
            "args": [{"type": "constant", "value": "Arrow"}]
        },
        "test_cases": [
            {"items": {"Arrow": 10}, "expected": 10},
            {"items": {"Arrow": 0}, "expected": 0},
            {"items": {}, "expected": 0},
        ]
    },
]

# =============================================================================
# Complex Rule Test Cases
# =============================================================================

COMPLEX_RULES: List[Dict[str, Any]] = [
    {
        "name": "nested_logic",
        "description": "Deeply nested boolean logic",
        "lambda_str": "lambda state: (state.has('A') and (state.has('B') or state.has('C'))) or (state.has('D') and state.has('E'))",
        "expected_json": {
            "type": "or",
            "conditions": [
                {
                    "type": "and",
                    "conditions": [
                        {"type": "item_check", "item": "A"},
                        {
                            "type": "or",
                            "conditions": [
                                {"type": "item_check", "item": "B"},
                                {"type": "item_check", "item": "C"}
                            ]
                        }
                    ]
                },
                {
                    "type": "and",
                    "conditions": [
                        {"type": "item_check", "item": "D"},
                        {"type": "item_check", "item": "E"}
                    ]
                }
            ]
        },
        "test_cases": [
            {"items": {"A": 1, "B": 1}, "expected": True},
            {"items": {"A": 1, "C": 1}, "expected": True},
            {"items": {"D": 1, "E": 1}, "expected": True},
            {"items": {"A": 1}, "expected": False},
            {"items": {"D": 1}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "mixed_checks",
        "description": "Combined item checks, counts, and region access",
        "lambda_str": "lambda state: state.has('Sword') and state.count('Key') >= 3 and state.can_reach('Dungeon', 'Region', player)",
        "expected_json": {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {
                    "type": "compare",
                    "left": {"type": "state_method", "method": "count", "args": [{"type": "constant", "value": "Key"}]},
                    "op": ">=",
                    "right": {"type": "constant", "value": 3}
                },
                {"type": "can_reach", "region": "Dungeon"}
            ]
        },
        "test_cases": [
            {"items": {"Sword": 1, "Key": 3}, "regions": {"Dungeon"}, "expected": True},
            {"items": {"Sword": 1, "Key": 5}, "regions": {"Dungeon"}, "expected": True},
            {"items": {"Sword": 1, "Key": 2}, "regions": {"Dungeon"}, "expected": False},
            {"items": {"Sword": 1, "Key": 3}, "regions": set(), "expected": False},
            {"items": {"Key": 3}, "regions": {"Dungeon"}, "expected": False},
        ]
    },
]

# =============================================================================
# Conditional/Ternary Test Cases
# =============================================================================

CONDITIONAL_RULES: List[Dict[str, Any]] = [
    {
        "name": "simple_conditional",
        "description": "Simple if-else expression",
        "lambda_str": "lambda state: state.has('A') if state.has('B') else state.has('C')",
        "expected_json": {
            "type": "conditional",
            "test": {"type": "item_check", "item": "B"},
            "if_true": {"type": "item_check", "item": "A"},
            "if_false": {"type": "item_check", "item": "C"}
        },
        "test_cases": [
            {"items": {"A": 1, "B": 1}, "expected": True},
            {"items": {"B": 1}, "expected": False},
            {"items": {"C": 1}, "expected": True},
            {"items": {"A": 1}, "expected": False},
            {"items": {}, "expected": False},
        ]
    },
]

# =============================================================================
# Helper Function Test Cases
# =============================================================================

HELPER_RULES: List[Dict[str, Any]] = [
    {
        "name": "simple_helper",
        "description": "Call to a helper function",
        "lambda_str": "lambda state: can_fight(state)",
        "expected_json": {
            "type": "helper",
            "name": "can_fight",
            "args": []
        },
        "helper_body": "lambda state: state.has('Sword') or state.has('Bow')",
        "test_cases": [
            {"items": {"Sword": 1}, "expected": True},
            {"items": {"Bow": 1}, "expected": True},
            {"items": {}, "expected": False},
        ]
    },
]

# =============================================================================
# AST Format Test Cases
# =============================================================================

AST_FORMAT_RULES: List[Dict[str, Any]] = [
    {
        "name": "ast_constant_true",
        "description": "AST constant true",
        "ast_rule": {"type": "constant", "value": True},
        "expected_evaluation": True,
    },
    {
        "name": "ast_constant_false",
        "description": "AST constant false",
        "ast_rule": {"type": "constant", "value": False},
        "expected_evaluation": False,
    },
    {
        "name": "ast_item_check",
        "description": "AST item check",
        "ast_rule": {"type": "item_check", "item": "Sword"},
        "test_cases": [
            {"items": {"Sword": 1}, "expected": True},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "ast_and",
        "description": "AST and operation",
        "ast_rule": {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {"type": "item_check", "item": "Shield"}
            ]
        },
        "test_cases": [
            {"items": {"Sword": 1, "Shield": 1}, "expected": True},
            {"items": {"Sword": 1}, "expected": False},
        ]
    },
    {
        "name": "ast_or",
        "description": "AST or operation",
        "ast_rule": {
            "type": "or",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {"type": "item_check", "item": "Axe"}
            ]
        },
        "test_cases": [
            {"items": {"Sword": 1}, "expected": True},
            {"items": {"Axe": 1}, "expected": True},
            {"items": {}, "expected": False},
        ]
    },
    {
        "name": "ast_not",
        "description": "AST not operation",
        "ast_rule": {
            "type": "not",
            "operand": {"type": "item_check", "item": "Curse"}
        },
        "test_cases": [
            {"items": {}, "expected": True},
            {"items": {"Curse": 1}, "expected": False},
        ]
    },
    {
        "name": "ast_region_check",
        "description": "AST region reachability",
        "ast_rule": {"type": "can_reach", "region": "Castle"},
        "test_cases": [
            {"items": {}, "regions": {"Castle"}, "expected": True},
            {"items": {}, "regions": set(), "expected": False},
        ]
    },
]

# =============================================================================
# Rule Builder Format Test Cases
# =============================================================================

RULE_BUILDER_RULES: List[Dict[str, Any]] = [
    {
        "name": "rb_has",
        "description": "Rule Builder Has rule",
        "rb_rule": {"rule": "Has", "options": [], "args": {"item_name": "Sword", "count": 1}},
        "expected_ast": {"type": "item_check", "item": "Sword"},
    },
    {
        "name": "rb_has_all",
        "description": "Rule Builder HasAll rule",
        "rb_rule": {"rule": "HasAll", "options": [], "args": {"item_names": ["Sword", "Shield"]}},
        "expected_ast": {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {"type": "item_check", "item": "Shield"}
            ]
        },
    },
    {
        "name": "rb_has_any",
        "description": "Rule Builder HasAny rule",
        "rb_rule": {"rule": "HasAny", "options": [], "args": {"item_names": ["Sword", "Axe"]}},
        "expected_ast": {
            "type": "or",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {"type": "item_check", "item": "Axe"}
            ]
        },
    },
    {
        "name": "rb_and",
        "description": "Rule Builder And rule",
        "rb_rule": {
            "rule": "And",
            "options": [],
            "args": {
                "children": [
                    {"rule": "Has", "options": [], "args": {"item_name": "A"}},
                    {"rule": "Has", "options": [], "args": {"item_name": "B"}}
                ]
            }
        },
        "expected_ast": {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        },
    },
    {
        "name": "rb_or",
        "description": "Rule Builder Or rule",
        "rb_rule": {
            "rule": "Or",
            "options": [],
            "args": {
                "children": [
                    {"rule": "Has", "options": [], "args": {"item_name": "A"}},
                    {"rule": "Has", "options": [], "args": {"item_name": "B"}}
                ]
            }
        },
        "expected_ast": {
            "type": "or",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        },
    },
    {
        "name": "rb_can_reach_region",
        "description": "Rule Builder CanReachRegion rule",
        "rb_rule": {"rule": "CanReachRegion", "options": [], "args": {"region_name": "Castle"}},
        "expected_ast": {"type": "can_reach", "region": "Castle"},
    },
]

# =============================================================================
# All Rules Collection
# =============================================================================

ALL_RULES = (
    SIMPLE_RULES +
    BOOLEAN_RULES +
    COMPARISON_RULES +
    STATE_METHOD_RULES +
    COMPLEX_RULES +
    CONDITIONAL_RULES +
    HELPER_RULES
)
