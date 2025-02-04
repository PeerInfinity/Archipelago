# Development Documentation

## Vision
Create a robust system for using Archipelago's location access rules in web-based applications, enabling:
- Accurate client-side location checking
- Development of new web interfaces
- Enhanced testing capabilities

## Architecture

### Core Components

#### 1. Rule Export System
- Converts Python rule functions to standardized JSON format
- Preserves helper function references
- Handles complex rule patterns including boolean operations, method calls, and conditional expressions

#### 2. Frontend Implementation 
- Evaluates rules using native JavaScript helper functions
- Manages inventory and state
- Provides rule debugging capabilities
- Supports game-specific logic through helpers

#### 3. Testing Infrastructure
- Automated test execution via Playwright
- Comprehensive debug logging
- Test result analysis and reporting

### Rule Processing Flow

1. Backend (Python)
   - Analyzer parses rule functions using AST
   - Converts to standardized JSON structure
   - Preserves helper function references
   - Exports complete ruleset

2. Frontend (JavaScript)
   - Loads exported rules
   - Implements helper functions natively
   - Evaluates rules using helper infrastructure
   - Maintains game state and inventory

### Supported Rule Types

1. Basic Rules
   - `item_check`: Direct item requirements
   - `count_check`: Item quantity requirements
   - `helper`: Preserved helper function references 
   - `group_check`: Item group requirements
   - `constant`: Static boolean values

2. Composite Rules
   - `and`: Multiple required conditions
   - `or`: Alternative conditions
   - `comparison`: Numeric comparisons
   - `state_method`: State method calls

3. Special Rules
   - Conditional expressions
   - Nested helper calls
   - Progressive item handling
   - State flags and methods

## Development Status

### Working Features

- Complete rule analysis and export
- Helper function preservation and execution
- Inventory and state management  
- Automated testing infrastructure
- Debug logging system
- Test result analysis

### Enhanced Analyzer Capabilities

The analyzer now properly handles:
- Complex lambda expressions
- Nested parentheses
- Multiline rules
- Method chains
- String literals and escaping
- Conditional expressions
- Return statements
- Boolean operations

### Debug Infrastructure

The debug system provides:
- Rule evaluation traces
- Inventory state logs
- Helper function execution logs
- Test execution details
- Step-by-step rule processing
- Performance metrics

### Test Results Structure

Results are now organized as:
```javascript
{
  summary: {
    total: number,
    passed: number, 
    failed: number,
    percentage: number
  },
  results: [{
    location: string,
    result: {
      passed: boolean,
      message: string,
      expectedAccess: boolean,
      requiredItems: string[],
      excludedItems: string[]
    },
    debugLog: LogEntry[]
  }]
}
```

## Development Priorities

### 1. Rule System Completion (High Priority)
- [ ] Fix complex helper function parsing
- [ ] Handle edge cases in helper execution
- [ ] Improve progressive item logic
- [ ] Add support for complex state tracking
- [ ] Enhance error handling and recovery
- [ ] Add option to enable/disable JSON file saving (similar to spoiler file option)

### 2. Testing Infrastructure (High Priority)
- [ ] Add performance benchmarking
- [ ] Expand test coverage
- [ ] Enhance failure analysis

### 3. Frontend Development (Medium Priority)
- [ ] Improve rule evaluation performance
- [ ] Enhance error reporting
- [ ] Add advanced filtering options
- [ ] Implement caching strategies
- [ ] Improve component organization
- [ ] Add robust state management
- [ ] Enhance accessibility

### 4. Archipidle Integration (Medium Priority)
- [ ] Properly integrate with console
- [ ] Sync inventory state
- [ ] Connect to server functionality
- [ ] Handle multiplayer features
- [ ] Support game progress tracking

### 5. Performance Optimization (Lower Priority)
- [ ] Profile rule evaluation
- [ ] Optimize React rendering
- [ ] Implement caching
- [ ] Add lazy loading
- [ ] Monitor memory usage

### 6. Documentation & Release (Ongoing)
- [ ] Complete user guides
- [ ] Complete API documentation
- [ ] Add debugging guides
- [ ] Document helper implementations
- [ ] Create example implementations
- [ ] Document deployment process

### 7. Code Style (Lower Priority)
- [ ] Update Python string quotes to match style guide
- [ ] Adjust JavaScript/HTML/CSS indentation
- [ ] Add type annotations in Python code
- [ ] Add docstrings to new classes
- [ ] Standardize JavaScript quote usage

## Technical Details

### Rule Format
```javascript
{
  type: string,      // Rule type (item_check, helper, etc.)
  conditions: Rule[], // For composite rules
  item: string,      // For item checks
  count: number,     // For counting rules
  name: string,      // For helper functions
  args: any[],       // For helper arguments
  value: boolean     // For constant rules
}
```

### Debug Log Format
```javascript
{
  timestamp: string,
  message: string,
  data?: any,
  trace?: {
    type: string,
    rule: Rule,
    result: boolean,
    children: Trace[]
  }
}
```

## Implementation Notes

### Helper Functions
- Implemented natively in JavaScript
- Match Python behavior exactly
- Access inventory and state
- Support debug logging
- Handle progressive items

### Rule Evaluation
- Recursive evaluation strategy
- Caches intermediate results
- Handles circular references
- Provides evaluation traces
- Supports short-circuiting

### State Management  
- Tracks inventory contents
- Manages progressive items
- Handles item exclusions
- Maintains game flags
- Supports debug inspection