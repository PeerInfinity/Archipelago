# Format Conversion Feasibility Analysis

## Overview

This document analyzes the feasibility of creating a bidirectional conversion tool between:
- **Format A**: Archipelago-CC JSON rule format (this repository)
- **Format B**: PR #5048 Rule Builder JSON format

## Format Schemas

### Archipelago-CC Format (Format A)

```json
{
  "type": "<rule_type>",
  // type-specific fields
}
```

Common rule types:
| Type | Structure | Example |
|------|-----------|---------|
| `constant` | `{type, value}` | `{"type": "constant", "value": true}` |
| `item_check` | `{type, item, count?}` | `{"type": "item_check", "item": "Sword", "count": 2}` |
| `and` | `{type, conditions[]}` | `{"type": "and", "conditions": [...]}` |
| `or` | `{type, conditions[]}` | `{"type": "or", "conditions": [...]}` |
| `not` | `{type, condition}` | `{"type": "not", "condition": {...}}` |
| `state_method` | `{type, method, args[]}` | `{"type": "state_method", "method": "has_all", "args": [...]}` |
| `helper` | `{type, name, args[]}` | `{"type": "helper", "name": "canSwim", "args": []}` |
| `compare` | `{type, left, op, right}` | `{"type": "compare", "left": {...}, "op": ">=", "right": {...}}` |
| `can_reach` | `{type, region}` | `{"type": "can_reach", "region": "Castle"}` |

### PR #5048 Format (Format B)

```json
{
  "rule": "<RuleClassName>",
  "options": [],
  "args": { /* named arguments */ }
}
```

For composite rules:
```json
{
  "rule": "And",
  "options": [],
  "children": [ /* child rules */ ]
}
```

Common rule types:
| Rule | Structure | Example |
|------|-----------|---------|
| `True_`/`False_` | `{rule, options, args: {}}` | `{"rule": "True_", "options": [], "args": {}}` |
| `Has` | `{rule, options, args: {item_name, count}}` | `{"rule": "Has", "options": [], "args": {"item_name": "Sword", "count": 2}}` |
| `HasAll` | `{rule, options, args: {items}}` | `{"rule": "HasAll", "options": [], "args": {"items": ["Key1", "Key2"]}}` |
| `HasAny` | `{rule, options, args: {items}}` | `{"rule": "HasAny", "options": [], "args": {"items": ["Sword", "Axe"]}}` |
| `And` | `{rule, options, children[]}` | `{"rule": "And", "options": [], "children": [...]}` |
| `Or` | `{rule, options, children[]}` | `{"rule": "Or", "options": [], "children": [...]}` |
| `CanReachRegion` | `{rule, options, args: {region_name}}` | `{"rule": "CanReachRegion", "options": [], "args": {"region_name": "Castle"}}` |
| `CanReachLocation` | `{rule, options, args: {location_name}}` | `{"rule": "CanReachLocation", "options": [], "args": {"location_name": "Chest1"}}` |

---

## Mapping Analysis

### Direct Mappings (Bidirectional)

These rule types have clear 1:1 mappings:

| Format A | Format B | Bidirectional |
|----------|----------|---------------|
| `{"type": "constant", "value": true}` | `{"rule": "True_", ...}` | Yes |
| `{"type": "constant", "value": false}` | `{"rule": "False_", ...}` | Yes |
| `{"type": "item_check", "item": X}` | `{"rule": "Has", "args": {"item_name": X, "count": 1}}` | Yes |
| `{"type": "item_check", "item": X, "count": N}` | `{"rule": "Has", "args": {"item_name": X, "count": N}}` | Yes |
| `{"type": "and", "conditions": [...]}` | `{"rule": "And", "children": [...]}` | Yes |
| `{"type": "or", "conditions": [...]}` | `{"rule": "Or", "children": [...]}` | Yes |
| `{"type": "can_reach", "region": X}` | `{"rule": "CanReachRegion", "args": {"region_name": X}}` | Yes |
| `{"type": "can_reach_entrance", "entrance": X}` | `{"rule": "CanReachEntrance", "args": {"entrance_name": X}}` | Yes |
| `{"type": "location_check", "location": X}` | `{"rule": "CanReachLocation", "args": {"location_name": X}}` | Yes |

### State Method Mappings (A → B)

Format A `state_method` types can be converted to Format B:

| Format A Method | Format B Rule |
|-----------------|---------------|
| `has` | `Has` |
| `has_all` | `HasAll` |
| `has_any` | `HasAny` |
| `has_all_counts` | `HasAllCounts` |
| `has_group` | `HasGroup` |
| `can_reach` (with args) | `CanReachRegion` or `CanReachLocation` |

### Partial/Lossy Mappings

Some conversions lose information or require approximation:

| Format A | Format B | Notes |
|----------|----------|-------|
| `{"type": "not", ...}` | No direct equivalent | Must wrap in custom rule or expand |
| `{"type": "helper", "name": X}` | Custom rule required | Game-specific helpers don't exist in B |
| `{"type": "compare", ...}` | Custom rule required | No built-in comparison rules in B |
| `{"type": "conditional", ...}` | Custom rule required | No ternary in B |
| `{"type": "binary_op", ...}` | Not supported | Arithmetic not supported in B |

### Non-Convertible Types (A → B)

These Format A types cannot be directly converted:

| Format A Type | Reason |
|---------------|--------|
| `helper` | Game-specific functions; no equivalent in B |
| `compare` | Arbitrary comparisons not supported |
| `binary_op` | Arithmetic operations not supported |
| `conditional` | Ternary logic not supported |
| `attribute` | Object attribute access not supported |
| `subscript` | Array/dict access not supported |
| `all_of` / `any_of` | Generator expressions not supported |
| `f_string` | String formatting not supported |
| Game-specific types | `capability`, `coins`, etc. |

### Non-Convertible Types (B → A)

| Format B Type | Reason |
|---------------|--------|
| `options` array | No equivalent filtering mechanism in A |
| `HasFromList` | Would need expansion to `or` of `item_check`s |
| `HasFromListUnique` | Complex counting not directly representable |
| `HasGroupUnique` | Complex counting not directly representable |
| Custom rules | Game-specific; would become `helper` nodes |

---

## Conversion Feasibility Assessment

### A → B Conversion (Archipelago-CC → Rule Builder)

**Feasibility: PARTIAL (~60-70% of rules)**

**Convertible:**
- Boolean constants (`true`/`false`)
- Simple item checks (`item_check`)
- Logical operators (`and`, `or`)
- Region/location reachability (`can_reach`, `location_check`)
- Most `state_method` calls (`has`, `has_all`, `has_any`, etc.)

**Not Convertible:**
- Game-specific helpers (would become opaque custom rules)
- Complex expressions (compare, binary_op, conditional)
- Generator expressions (all_of, any_of)
- Attribute/subscript access

### B → A Conversion (Rule Builder → Archipelago-CC)

**Feasibility: HIGH (~85-95% of rules)**

**Convertible:**
- All boolean rules (`True_`, `False_`)
- All item rules (`Has`, `HasAll`, `HasAny`, `HasAllCounts`, `HasGroup`)
- All composite rules (`And`, `Or`)
- All reachability rules (`CanReachRegion`, `CanReachLocation`, `CanReachEntrance`)
- `HasFromList` → expand to `or` of `item_check`s with counting logic
- `HasGroupUnique` → `state_method` call

**Partially Convertible:**
- `options` filtering → could become `conditional` wrapper
- Custom rules → become `helper` nodes (preserves structure, loses semantics)

---

## Proposed Converter Design

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Rule Format Converter                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    │
│  │  Format A   │───▶│  Intermediate │───▶│  Format B   │    │
│  │   Parser    │    │ Representation│    │   Emitter   │    │
│  └─────────────┘    └──────────────┘    └─────────────┘    │
│         │                   │                   │           │
│         │                   ▼                   │           │
│         │          ┌──────────────┐             │           │
│         │          │ Unconvertible │             │           │
│         │          │   Rules Log   │             │           │
│         │          └──────────────┘             │           │
│         │                                       │           │
│         ▼                                       ▼           │
│  ┌─────────────┐                        ┌─────────────┐    │
│  │  Format B   │◀───────────────────────│  Format A   │    │
│  │   Parser    │                        │   Emitter   │    │
│  └─────────────┘                        └─────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Intermediate Representation

```python
@dataclass
class IntermediateRule:
    """Format-agnostic rule representation"""
    kind: RuleKind  # CONSTANT, ITEM_CHECK, AND, OR, REACH_REGION, etc.

    # For constants
    value: Optional[bool] = None

    # For item checks
    item_name: Optional[str] = None
    count: int = 1

    # For composite rules
    children: List['IntermediateRule'] = field(default_factory=list)

    # For reachability
    target_name: Optional[str] = None
    target_type: Optional[str] = None  # 'region', 'location', 'entrance'

    # For unconvertible rules
    original_format: Optional[str] = None  # 'A' or 'B'
    original_data: Optional[dict] = None
    conversion_notes: List[str] = field(default_factory=list)
```

### Conversion Mapping Table

```python
# Format A → Intermediate
A_TO_INTERMEDIATE = {
    'constant': lambda r: IntermediateRule(
        kind=RuleKind.CONSTANT,
        value=r['value']
    ),
    'item_check': lambda r: IntermediateRule(
        kind=RuleKind.ITEM_CHECK,
        item_name=r['item'],
        count=r.get('count', 1)
    ),
    'and': lambda r: IntermediateRule(
        kind=RuleKind.AND,
        children=[convert_a_to_intermediate(c) for c in r['conditions']]
    ),
    'or': lambda r: IntermediateRule(
        kind=RuleKind.OR,
        children=[convert_a_to_intermediate(c) for c in r['conditions']]
    ),
    'can_reach': lambda r: IntermediateRule(
        kind=RuleKind.REACH_REGION,
        target_name=r['region'],
        target_type='region'
    ),
    # ... etc
}

# Intermediate → Format B
INTERMEDIATE_TO_B = {
    RuleKind.CONSTANT: lambda r: {
        'rule': 'True_' if r.value else 'False_',
        'options': [],
        'args': {}
    },
    RuleKind.ITEM_CHECK: lambda r: {
        'rule': 'Has',
        'options': [],
        'args': {'item_name': r.item_name, 'count': r.count}
    },
    RuleKind.AND: lambda r: {
        'rule': 'And',
        'options': [],
        'children': [convert_intermediate_to_b(c) for c in r.children]
    },
    # ... etc
}
```

### Handling Unconvertible Rules

```python
def convert_with_fallback(rule_a: dict) -> Tuple[dict, List[str]]:
    """
    Convert Format A to Format B with fallback handling.

    Returns:
        Tuple of (converted_rule, warnings)
    """
    warnings = []
    rule_type = rule_a.get('type')

    if rule_type in DIRECT_CONVERTIBLE:
        return convert_direct(rule_a), warnings

    if rule_type == 'helper':
        # Preserve as custom rule with original data
        warnings.append(f"Helper '{rule_a['name']}' converted to opaque custom rule")
        return {
            'rule': 'CustomHelper',
            'options': [],
            'args': {
                'name': rule_a['name'],
                'original_args': rule_a.get('args', []),
                '_unconverted': True
            }
        }, warnings

    if rule_type in ['compare', 'binary_op', 'conditional']:
        warnings.append(f"Complex expression '{rule_type}' not fully convertible")
        return {
            'rule': 'UnconvertedExpression',
            'options': [],
            'args': {
                'original_type': rule_type,
                'original_data': rule_a,
                '_unconverted': True
            }
        }, warnings

    # Fallback: preserve original
    warnings.append(f"Unknown rule type '{rule_type}' preserved as-is")
    return {
        'rule': 'Unknown',
        'options': [],
        'args': {'original': rule_a, '_unconverted': True}
    }, warnings
```

---

## Implementation Recommendation

### Phase 1: Core Converter (Recommended)

Implement bidirectional conversion for the common subset:

| Priority | Rule Types | Effort |
|----------|------------|--------|
| High | `constant`, `item_check`/`Has`, `and`/`And`, `or`/`Or` | Low |
| High | `can_reach`/`CanReachRegion`, `location_check`/`CanReachLocation` | Low |
| Medium | `state_method(has_all)`/`HasAll`, `state_method(has_any)`/`HasAny` | Medium |
| Medium | `count_check`/`Has` with count, `group_check`/`HasGroup` | Medium |

**Estimated Coverage**: ~70% of typical rules

### Phase 2: Extended Support (Optional)

| Priority | Rule Types | Effort |
|----------|------------|--------|
| Medium | `not` → custom wrapper | Medium |
| Low | `helper` → `CustomHelper` placeholder | Low |
| Low | `compare` → `CustomComparison` placeholder | Medium |
| Low | `options` filtering → `conditional` wrapper | High |

### Phase 3: Game-Specific Extensions (Future)

Create game-specific converters for heavily customized worlds:
- Super Metroid (complex helper hierarchy)
- A Link to the Past (dungeon-specific logic)
- The Witness (custom panel rules)

---

## Conclusion

**Is conversion possible?** Yes, with limitations.

| Direction | Feasibility | Coverage | Recommendation |
|-----------|-------------|----------|----------------|
| A → B | Partial | 60-70% | Implement with fallback handling |
| B → A | High | 85-95% | Fully implement |

**Key Challenges:**
1. Game-specific helpers in Format A have no equivalent in Format B
2. Complex expressions (compare, binary_op) not supported in Format B
3. Option filtering in Format B has no equivalent in Format A

**Recommended Approach:**
1. Build a core converter handling the common subset
2. Implement fallback handling that preserves unconvertible rules as opaque nodes
3. Generate conversion reports listing what couldn't be converted
4. Consider game-specific converter extensions for popular worlds

The converter would be most useful for:
- Migrating worlds from lambda rules to Rule Builder pattern
- Validating Rule Builder implementations against existing behavior
- Creating compatibility layers between systems
