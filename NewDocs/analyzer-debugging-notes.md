# Rule Parser Debugging Notes

## Issue 1: Lambda Function Parsing Failures
Date: Feb 2, 2025

### Problem
Multiple lambda function parsing failures observed in test output, with errors like:
```
Syntax error parsing source: '(' was never closed (<unknown>, line 2)
```

Affects rules like:
- `state.has('Flippers', player)`
- `can_use_bombs(state, player)`

### Analysis
The `_clean_source()` function is not properly handling nested parentheses within lambda expressions. This causes truncated rule extraction that misses important conditions.

Example problematic lambda:
```python
lambda state: state.has('Flippers', player) or can_lift_rocks(state, player)
```

Current parser fails because it:
- Doesn't track nested parentheses
- Loses part of complex boolean expressions 
- Truncates at first closing parenthesis

### Planned Fix
1. Implement proper parenthesis matching in lambda body extraction
2. Handle both method calls and function calls properly within the lambda
3. Preserve full boolean expressions

### Starting Implementation
First focusing on `_clean_source()`. Three versions exist:
1. Original: Simple indentation and basic lambda handling
2. Updated: Basic parenthesis tracking with string joins
3. Latest: More structured lambda extraction

Key features we need to preserve:
- Indentation cleaning
- Lambda extraction
- Parenthesis tracking
- Source cleaning with whitespace preservation
- Proper multiline handling

The new version needs to combine these while fixing the parenthesis matching issue.



### Update 1: Method Call Parsing
Fixed initial parsing issues but discovered new cases with simple boolean returns:
```python
lambda state: True
```
is being converted to:
```python
def __analyzed_func__(state):
    return True)
```

Issues identified:
1. Extra closing parenthesis being captured from the staticmethod wrapper
2. Need to differentiate between method calls and simple returns

## Next Steps
1. Implement improved `_clean_source()` with parenthesis tracking
2. Add test cases specifically for lambda parsing
3. Add debug logging in lambda handling code
4. Verify fix maintains support for simpler lambda cases

We'll track each issue we find and fix in this document as we progress through debugging and improving the Rule Parser.



### Update 2: String Escaping
Found new failure case with escaped characters:
```python
"set_rule(multiworld.get_location('Blind\\'s Hideout - Top', player), lambda state: can_use_bombs(state, player))\n"
```

Issues:
1. Escaped quotes in location names affecting pattern matching
2. Function call not being captured completely due to string escaping
3. Need to handle both method calls (state.has) and function calls (can_use_bombs)



### Update 3: Complex Multiline Rules
Found failure with complex multiline rule containing nested parentheses:
```python
lambda state: (state.has('Hookshot', player) or
              (state._lttp_has_key('Small Key (Ice Palace)', player, 4)
              if item_name_in_location_names(state, 'Big Key (Ice Palace)', player,
                  [('Ice Palace - Spike Room', player), ...])
              else state._lttp_has_key('Small Key (Ice Palace)', player, 6)))
```

Issues:
1. Parentheses in item/location names being counted in nesting level
2. Multiline expression getting truncated
3. Conditional expression (if/else) not being preserved
4. Need to handle tuple literals in location list



### Update 4: Resolution of Parser Issues
Successfully resolved several key parsing challenges:

1. Simple rules:
```python
lambda state: True
lambda state: state.has('Item', player)
```

2. Method calls with string arguments:
```python
lambda state: state.has('Blind\'s Hideout - Top', player)
```

3. Complex multiline expressions:
```python
lambda state: (state.has('Hookshot', player) or
              (state._lttp_has_key('Small Key (Ice Palace)', player, 4)
              if item_name_in_location_names(...) else ...))
```

Expected Rule Structures:
- Simple item checks
- Method calls with escaped characters
- Boolean operations (and/or)
- Complex conditional expressions
- Nested parentheses in location names
- Helper function calls
- State method calls

This completes the parser debugging phase. Next phase will focus on frontend rule evaluation.



### Update 5: Improved Argument Processing
Date: Feb 5, 2025

Successfully resolved argument handling to properly distinguish between:
1. Helper function arguments
2. State method arguments
3. Special context parameters (state, player)

#### Solution
Modified argument processing to maintain two separate argument lists:
```python
args = []                   # All arguments 
processed_args = []         # Arguments excluding state/player
```

This allows different handling for:
- Helper functions: Use processed_args (excludes state/player)
- State methods: Use full args for path validation
- item_check conversions: Use first non-state/player argument as item name

#### Results
- Test failures reduced from 35 to 23 
- Successfully passing:
  - All can_use_bombs() tests (Chicken House, Aginah's Cave)
  - All can_kill_most_things() tests (Mini Moldorm Cave)
  - All basic item_check cases (Sick Kid, Flute Spot)

#### Remaining Issues
Failures now primarily involve complex access paths that depend on:
- Progressive item handling
- Path rule evaluation
- Beat Agahnim 1 state tracking

Next step is to analyze these specific failure patterns to identify if the issue lies in:
- Rule parsing
- Rule evaluation
- State tracking
- Frontend implementation
