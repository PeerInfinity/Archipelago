"""Analyzer for function objects found in closure variables.

This module provides the ClosureFunctionAnalyzer class which handles functions
stored in closure variables during rule analysis. These functions cannot be
directly serialized to JSON but can be analyzed if we can access their source
or recognize their structure patterns.

Common use cases include games that use `options_to_access_rule` and
`path_to_access_rule` lambdas that contain lists of function objects.

Game-specific configuration (known items, sword tiers, fallback rules) is
obtained from the game handler via hook methods, keeping this module generic.
"""

import ast
import inspect
import logging
import sys
import textwrap
from typing import Any, Dict, List, Optional, Set, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from .rule_analyzer import RuleAnalyzer

logger = logging.getLogger(__name__)


class ClosureFunctionAnalyzer:
    """Analyzes function objects to extract their rule logic.

    This handles functions that are stored in closure variables,
    where we have the function object but need to analyze its behavior.

    The analyzer uses multiple strategies:
    1. Source code analysis via inspect.getsource() + AST parsing
    2. Closure pattern recognition based on variable signatures
    3. Conservative fallback rules when analysis fails
    """

    # Maximum recursion depth to prevent infinite loops
    MAX_DEPTH = 10

    # ==================== Feature Flags ====================
    # These flags control experimental features that may cause regressions.
    # All flags default to False (disabled) for safety.

    # Feature: Limit closure analysis depth
    # When enabled, closures deeper than MAX_CLOSURE_DEPTH use game handler fallback.
    # This prevents rule explosion with complex entrance shuffle but may reduce accuracy.
    # LOSSY: Keep disabled by default - could miss valid access paths.
    ENABLE_CLOSURE_DEPTH_LIMIT = False
    MAX_CLOSURE_DEPTH = 3  # Only used when ENABLE_CLOSURE_DEPTH_LIMIT is True

    # Feature: Limit number of closure options analyzed
    # When enabled, only the first MAX_CLOSURE_OPTIONS options are analyzed in options_to_access_rule.
    # This reduces rule size but may miss some valid access paths.
    # LOSSY: Keep disabled by default - could miss valid access paths.
    ENABLE_CLOSURE_OPTIONS_LIMIT = False
    MAX_CLOSURE_OPTIONS = 10  # Only used when ENABLE_CLOSURE_OPTIONS_LIMIT is True

    # Feature: Fingerprint-based deduplication
    # When enabled, uses canonical string fingerprints to detect duplicate conditions.
    # This can catch duplicates that simple equality check misses.
    # LOSSLESS: Safe to enable - only removes true duplicates.
    ENABLE_FINGERPRINT_DEDUP = True

    # Feature: Nested structure flattening
    # When enabled, flattens nested OR(OR(a,b),c) -> OR(a,b,c) and AND(AND(a,b),c) -> AND(a,b,c).
    # This produces more compact rules.
    # LOSSLESS: Safe to enable - semantically equivalent transformation.
    ENABLE_NESTED_FLATTENING = True

    # Feature: Cross-type dominance pruning
    # When enabled, in OR conditions, simpler options (item-only) dominate complex ones (item+can_reach).
    # If Has(X) is present, AND(CanReachEntrance(Y), Has(X)) can be pruned.
    # LOSSLESS: Safe to enable - removes strictly redundant options in OR.
    ENABLE_CROSS_TYPE_DOMINANCE = True

    # Feature: Propagate rule_target_name and target_type to sub-analyzers
    # When enabled, sub-analyzers receive the parent's rule_target_name and target_type,
    # allowing location name replacement (e.g., 'ep_boss' -> 'location') to work in nested rules.
    # This is needed for ALttP Eastern Palace - Boss and similar patterns.
    # CORRECTNESS: Enable to ensure proper rule analysis for nested lambdas.
    ENABLE_RULE_TARGET_PROPAGATION = True

    # Feature: Merge parent analyzer's closure_vars into sub-analyzer
    # When enabled, parent closure_vars are merged into child closure_vars, preserving
    # injected values like 'world' which is needed for _lttp_has_key universal key detection.
    # Special handling: 'world' from parent is preferred if it has game options.
    # CORRECTNESS: Enable to ensure proper world object is available in nested rules.
    ENABLE_CLOSURE_VARS_MERGING = True

    # Feature: Detect add_rule combine mode (AND vs OR)
    # When enabled, examines bytecode to detect whether add_rule() used combine="and" or combine="or".
    # This is needed for ALttP Skull Woods - Big Chest and other locations with OR-combined rules.
    # CORRECTNESS: Enable to properly handle OR-combined rules from add_rule().
    ENABLE_ADD_RULE_COMBINE_DETECTION = True

    # Patterns recognized by closure variable names
    KNOWN_PATTERNS = {
        'options_to_access_rule': {'options'},
        'path_to_access_rule': {'path', 'entrance'},
        'moon_pearl_check': {'player'},
    }

    def __init__(self, parent_analyzer: 'RuleAnalyzer', max_depth: Optional[int] = None):
        """Initialize the ClosureFunctionAnalyzer.

        Args:
            parent_analyzer: The RuleAnalyzer instance for recursive analysis
            max_depth: Maximum recursion depth (defaults to MAX_DEPTH)
        """
        self.parent_analyzer = parent_analyzer
        self.max_depth = max_depth if max_depth is not None else self.MAX_DEPTH
        self._seen_functions: Set[int] = set()  # Cycle detection by function id

    @property
    def game_handler(self):
        """Get the game handler from the parent analyzer."""
        return getattr(self.parent_analyzer, 'game_handler', None)

    def analyze_function(self, func: Callable, depth: int = 0) -> Optional[Dict[str, Any]]:
        """Attempt to analyze a function object.

        Args:
            func: The function object to analyze
            depth: Current recursion depth

        Returns:
            Analyzed rule dict, or None if unanalyzable
        """
        if not callable(func):
            logger.debug(f"ClosureFunctionAnalyzer: Not a callable: {type(func)}")
            return None

        if depth > self.max_depth:
            logger.warning(f"ClosureFunctionAnalyzer: Max depth {self.max_depth} exceeded")
            return None

        func_id = id(func)
        if func_id in self._seen_functions:
            logger.debug(f"ClosureFunctionAnalyzer: Circular reference detected for func id {func_id}")
            return {'type': 'constant', 'value': True}  # Conservative: assume accessible
        self._seen_functions.add(func_id)

        try:
            # Get function qualified name for pattern detection
            func_qualname = getattr(func, '__qualname__', '')
            logger.debug(f"ClosureFunctionAnalyzer: Analyzing {func_qualname} at depth {depth}")

            # Method 1: Try to analyze by recognizing closure patterns
            # This is faster than source extraction and handles dynamic lambdas
            result = self._analyze_via_closure_pattern(func, depth)
            if result is not None:
                logger.debug(f"ClosureFunctionAnalyzer: Closure pattern analysis succeeded")
                return result

            # Method 2: Try to get source and parse AST
            result = self._analyze_via_source(func, depth)
            if result is not None:
                logger.debug(f"ClosureFunctionAnalyzer: Source analysis succeeded")
                return result

            # Method 3: Try bytecode analysis as last resort
            result = self._analyze_via_bytecode(func)
            if result is not None:
                logger.debug(f"ClosureFunctionAnalyzer: Bytecode analysis succeeded")
                return result

            logger.debug(f"ClosureFunctionAnalyzer: All analysis methods failed for {func_qualname}")
            return None
        finally:
            self._seen_functions.discard(func_id)

    def _analyze_via_source(self, func: Callable, depth: int) -> Optional[Dict[str, Any]]:
        """Try to analyze function via source code extraction.

        Args:
            func: The function to analyze
            depth: Current recursion depth

        Returns:
            Analyzed rule dict, or None if analysis failed
        """
        try:
            source = inspect.getsource(func)
            # Remove leading indentation
            source = textwrap.dedent(source)

            # Parse the source code
            tree = ast.parse(source)

            # Find lambda or function body
            for node in ast.walk(tree):
                if isinstance(node, ast.Lambda):
                    # Create sub-analyzer with function's closure vars
                    closure_vars = self._extract_closure_vars(func)

                    # Feature flag: Merge parent analyzer's closure_vars to preserve injected values
                    if self.ENABLE_CLOSURE_VARS_MERGING:
                        parent_closure_vars = self.parent_analyzer.closure_vars or {}
                        for key, value in parent_closure_vars.items():
                            if key not in closure_vars:
                                # Add parent vars that aren't in function's closure
                                closure_vars[key] = value
                            elif key == 'world':
                                # Special handling for 'world': prefer the parent's world if it
                                # has game options (meaning it's a game World, not a MultiWorld).
                                # In ALttP, lambdas capture 'world' = MultiWorld, but the exporter
                                # injects 'world' = ALttPWorld which is needed for _lttp_has_key
                                # universal key detection.
                                parent_world = value
                                if hasattr(parent_world, 'options'):
                                    closure_vars['world'] = parent_world

                    # Import here to avoid circular imports
                    from .rule_analyzer import RuleAnalyzer

                    # Build sub-analyzer kwargs
                    sub_analyzer_kwargs = {
                        'closure_vars': closure_vars,
                        'rule_func': func,
                        'player_context': self.parent_analyzer.player_context,
                        'game_handler': self.parent_analyzer.game_handler,
                        'seen_funcs': self.parent_analyzer.seen_funcs,
                    }

                    # Feature flag: Propagate rule_target_name and target_type to sub-analyzers
                    if self.ENABLE_RULE_TARGET_PROPAGATION:
                        sub_analyzer_kwargs['rule_target_name'] = self.parent_analyzer.rule_target_name
                        sub_analyzer_kwargs['target_type'] = self.parent_analyzer.target_type

                    sub_analyzer = RuleAnalyzer(**sub_analyzer_kwargs)
                    result = sub_analyzer.visit(node.body)
                    if result and result.get('type') != 'error':
                        return result

        except (OSError, TypeError) as e:
            # Source not available for dynamically created functions
            logger.debug(f"ClosureFunctionAnalyzer: Source not available: {e}")
        except SyntaxError as e:
            logger.debug(f"ClosureFunctionAnalyzer: Syntax error in source: {e}")
        except Exception as e:
            logger.debug(f"ClosureFunctionAnalyzer: Source analysis error: {e}")

        return None

    def _analyze_via_closure_pattern(self, func: Callable, depth: int) -> Optional[Dict[str, Any]]:
        """Analyze by recognizing closure variable patterns.

        This method detects known function patterns based on their closure
        variable signatures and qualified names.

        Args:
            func: The function to analyze
            depth: Current recursion depth

        Returns:
            Analyzed rule dict, or None if pattern not recognized
        """
        if not hasattr(func, '__closure__') or not func.__closure__:
            # No closure - might be a simple function, try source analysis
            return None

        closure_vars = self._extract_closure_vars(func)
        if not closure_vars:
            return None

        qualname = getattr(func, '__qualname__', '')
        closure_var_names = set(closure_vars.keys())

        # Pattern: options_to_access_rule result
        # lambda state: any(rule(state) for rule in options)
        if 'options' in closure_vars and isinstance(closure_vars['options'], (list, tuple)):
            return self._analyze_options_pattern(closure_vars['options'], depth)

        # Pattern: path_to_access_rule result
        # lambda state: state.can_reach(entrance.name, 'Entrance', entrance.player)
        #               and all(rule(state) for rule in path)
        # Note: ALttP's set_bunny_rules uses 'new_path' instead of 'path' in some lambdas
        path_var = None
        if 'path' in closure_vars:
            path_var = closure_vars['path']
        elif 'new_path' in closure_vars:
            path_var = closure_vars['new_path']

        if path_var is not None and 'entrance' in closure_vars:
            return self._analyze_path_pattern(
                path_var,
                closure_vars['entrance'],
                depth
            )

        # Pattern: add_rule combined lambda
        # lambda state: rule(state) and old_rule(state)  -- combine="and"
        # lambda state: rule(state) or old_rule(state)   -- combine="or"
        # Created by worlds/generic/Rules.py add_rule() function
        if 'rule' in closure_vars and 'old_rule' in closure_vars:
            rule_func = closure_vars['rule']
            old_rule_func = closure_vars['old_rule']
            if callable(rule_func) and callable(old_rule_func):
                # Feature flag: Detect AND vs OR by examining bytecode
                if self.ENABLE_ADD_RULE_COMBINE_DETECTION:
                    combine_mode = self._detect_add_rule_combine_mode(func)
                else:
                    combine_mode = 'and'  # Default to AND if detection disabled
                return self._analyze_add_rule_pattern(rule_func, old_rule_func, depth, combine_mode)

        # Pattern: locality_rules item_rule wrapper
        # lambda i, sending_blockers=..., old_rule=location.item_rule: \
        #     i.name not in sending_blockers[i.player] and old_rule(i)
        # Created by worlds/generic/Rules.py locality_rules() function
        # We analyze just old_rule since sending_blockers is a multiworld locality concern
        if 'old_rule' in closure_vars and 'sending_blockers' in closure_vars:
            old_rule_func = closure_vars['old_rule']
            if callable(old_rule_func):
                logger.debug(f"ClosureFunctionAnalyzer: Detected locality_rules item_rule pattern")
                return self._analyze_locality_item_rule_pattern(old_rule_func, depth)

        # Pattern: Simple item check with 'player' captured
        # lambda state: state.has('Moon Pearl', player)
        if 'player' in closure_vars and len(closure_vars) <= 2:
            return self._analyze_simple_check_pattern(func, closure_vars)

        # Pattern: Superbunny mirror check (glitch modes)
        # lambda state: path_rule(state) and state.has('Magic Mirror', player)
        if 'player' in closure_vars:
            # Check if this looks like a superbunny pattern
            func_code = getattr(func, '__code__', None)
            if func_code:
                # Look for 'Magic Mirror' or 'has_sword' in constants
                consts = func_code.co_consts
                if 'Magic Mirror' in consts or 'Pegasus Boots' in consts:
                    logger.debug(f"ClosureFunctionAnalyzer: Detected superbunny pattern")
                    # This is a complex superbunny rule - use source analysis
                    return None  # Fall through to source analysis

        logger.debug(f"ClosureFunctionAnalyzer: Unrecognized closure pattern with vars: {closure_var_names}")
        return None

    def _analyze_options_pattern(self, options, depth: int) -> Optional[Dict[str, Any]]:
        """Analyze any(rule(state) for rule in options) pattern.

        This pattern is used by ALttP's options_to_access_rule() which returns
        a lambda that evaluates multiple possible access paths.

        Args:
            options: List of rule functions
            depth: Current recursion depth

        Returns:
            Analyzed rule dict as an 'or' of all options
        """
        # Feature flag: Limit closure analysis depth
        if self.ENABLE_CLOSURE_DEPTH_LIMIT and depth > self.MAX_CLOSURE_DEPTH:
            # Try to get game-specific fallback from handler
            fallback = None
            if self.game_handler and hasattr(self.game_handler, 'get_unanalyzable_rule_fallback'):
                fallback = self.game_handler.get_unanalyzable_rule_fallback()
            if fallback:
                print(
                    f"LOSSY FALLBACK: Rule depth {depth} exceeds MAX_CLOSURE_DEPTH "
                    f"({self.MAX_CLOSURE_DEPTH}) in _analyze_options_pattern, using game handler fallback",
                    file=sys.stderr
                )
                return fallback
            # No handler fallback available
            print(
                f"LOSSY FALLBACK: Rule depth {depth} exceeds MAX_CLOSURE_DEPTH "
                f"({self.MAX_CLOSURE_DEPTH}) in _analyze_options_pattern, no fallback available",
                file=sys.stderr
            )
            return None

        if not options:
            # Empty options list - any([]) is False
            return {'rule': 'False_'}

        # Feature flag: Limit number of options analyzed
        options_to_analyze = options
        if self.ENABLE_CLOSURE_OPTIONS_LIMIT and len(options) > self.MAX_CLOSURE_OPTIONS:
            print(
                f"LOSSY FALLBACK: {len(options)} closure options exceeds MAX_CLOSURE_OPTIONS "
                f"({self.MAX_CLOSURE_OPTIONS}), truncating options list",
                file=sys.stderr
            )
            options_to_analyze = options[:self.MAX_CLOSURE_OPTIONS]

        analyzed_options = []
        failed_count = 0

        for i, option_func in enumerate(options_to_analyze):
            if not callable(option_func):
                logger.warning(f"ClosureFunctionAnalyzer: Option {i} is not callable: {type(option_func)}")
                failed_count += 1
                continue

            result = self.analyze_function(option_func, depth + 1)
            if result is not None:
                analyzed_options.append(result)
            else:
                # Try bytecode analysis as last resort
                bytecode_result = self._analyze_via_bytecode(option_func)
                if bytecode_result is not None:
                    analyzed_options.append(bytecode_result)
                else:
                    logger.debug(f"ClosureFunctionAnalyzer: Could not analyze option {i}")
                    failed_count += 1

        # If we analyzed at least some options, return what we got
        # Only fail completely if we couldn't analyze ANY option
        if len(analyzed_options) == 0:
            if failed_count > 0:
                # We had options but couldn't analyze any - try game handler fallback
                fallback = None
                if self.game_handler and hasattr(self.game_handler, 'get_unanalyzable_rule_fallback'):
                    fallback = self.game_handler.get_unanalyzable_rule_fallback()
                if fallback:
                    print(
                        f"LOSSY FALLBACK: All {failed_count} rule options failed analysis, "
                        f"using game handler fallback",
                        file=sys.stderr
                    )
                    return fallback
                # No handler fallback - return None to indicate failure
                print(
                    f"LOSSY FALLBACK: All {failed_count} rule options failed analysis, "
                    f"no game handler fallback available",
                    file=sys.stderr
                )
                return None
            return {'rule': 'False_'}

        if len(analyzed_options) == 1:
            return analyzed_options[0]

        # Simplify: remove duplicates and True constants
        simplified = self._simplify_or_conditions(analyzed_options)
        if len(simplified) == 0:
            return {'rule': 'False_'}
        elif len(simplified) == 1:
            return simplified[0]
        return {'rule': 'Or', 'children': simplified}

    def _analyze_path_pattern(self, path: List, entrance, depth: int) -> Optional[Dict[str, Any]]:
        """Analyze path_to_access_rule result.

        This pattern represents:
        lambda state: state.can_reach(entrance.name, 'Entrance', entrance.player)
                      and all(rule(state) for rule in path)

        Args:
            path: List of rule functions representing path requirements
            entrance: Entrance object with name attribute
            depth: Current recursion depth

        Returns:
            Analyzed rule combining can_reach and path requirements

        Note:
            In ALttP's bunny rule BFS, path is built as: new_path = path + [entrance.access_rule]
            This means the LAST element of path is always the entrance's own access rule.
            Since CanReachEntrance already checks the entrance's access_rule via Entrance.can_reach(),
            we skip the last element to avoid double-counting the entrance rule.
        """
        # Feature flag: Limit closure analysis depth
        if self.ENABLE_CLOSURE_DEPTH_LIMIT and depth > self.MAX_CLOSURE_DEPTH:
            # Try to get game-specific fallback from handler
            fallback = None
            if self.game_handler and hasattr(self.game_handler, 'get_unanalyzable_rule_fallback'):
                fallback = self.game_handler.get_unanalyzable_rule_fallback()
            if fallback:
                print(
                    f"LOSSY FALLBACK: Rule depth {depth} exceeds MAX_CLOSURE_DEPTH "
                    f"({self.MAX_CLOSURE_DEPTH}) in _analyze_path_pattern, using game handler fallback",
                    file=sys.stderr
                )
                return fallback
            # No handler fallback available
            print(
                f"LOSSY FALLBACK: Rule depth {depth} exceeds MAX_CLOSURE_DEPTH "
                f"({self.MAX_CLOSURE_DEPTH}) in _analyze_path_pattern, no fallback available",
                file=sys.stderr
            )
            return None

        # Build the can_reach part
        entrance_name = getattr(entrance, 'name', str(entrance))
        can_reach = {
            'rule': 'CanReachEntrance',
            'args': {'entrance_name': entrance_name}
        }

        # Skip the last element of path - it's the entrance's access_rule which is already
        # checked by CanReachEntrance via Entrance.can_reach(). Including it would double-count
        # the entrance rule, causing incorrect logic (e.g., requiring Beat Agahnim 2 when
        # the entrance rule is "open_pyramid OR Beat Agahnim 2").
        path_to_analyze = path[:-1] if path else []

        # Analyze each rule in path (excluding the last element)
        path_conditions = []
        for i, rule_func in enumerate(path_to_analyze):
            if callable(rule_func):
                result = self.analyze_function(rule_func, depth + 1)
                if result is not None:
                    path_conditions.append(result)
                else:
                    # Try bytecode analysis
                    bytecode_result = self._analyze_via_bytecode(rule_func)
                    if bytecode_result is not None:
                        path_conditions.append(bytecode_result)
                    else:
                        logger.debug(f"ClosureFunctionAnalyzer: Could not analyze path rule {i}")
                        # Skip this rule rather than failing entirely
                        continue
            else:
                logger.warning(f"ClosureFunctionAnalyzer: Path rule {i} is not callable")
                continue

        # Combine: can_reach AND all(path)
        if not path_conditions:
            return can_reach

        all_conditions = [can_reach] + path_conditions

        # Simplify if possible
        simplified = self._simplify_and_conditions(all_conditions)
        if len(simplified) == 1:
            return simplified[0]
        return {'rule': 'And', 'children': simplified}

    def _detect_add_rule_combine_mode(self, func: Callable) -> str:
        """Detect whether an add_rule lambda uses AND or OR combination.

        Examines bytecode to find POP_JUMP_IF_FALSE (AND) or POP_JUMP_IF_TRUE (OR).

        Args:
            func: The combined lambda function

        Returns:
            'and' or 'or' based on bytecode analysis, defaults to 'and'
        """
        try:
            import dis
            code = func.__code__
            for instr in dis.get_instructions(code):
                if instr.opname == 'POP_JUMP_IF_FALSE':
                    return 'and'
                elif instr.opname == 'POP_JUMP_IF_TRUE':
                    return 'or'
        except Exception as e:
            logger.debug(f"ClosureFunctionAnalyzer: Could not detect combine mode: {e}")
        return 'and'  # Default to AND

    def _analyze_add_rule_pattern(self, rule_func: Callable, old_rule_func: Callable,
                                   depth: int, combine_mode: str = 'and') -> Optional[Dict[str, Any]]:
        """Analyze add_rule combined lambda pattern.

        This pattern is created by worlds/generic/Rules.py add_rule() function:
        lambda state: rule(state) and old_rule(state)  -- combine="and"
        lambda state: rule(state) or old_rule(state)   -- combine="or"

        Args:
            rule_func: The new rule being added
            old_rule_func: The existing rule
            depth: Current recursion depth
            combine_mode: 'and' or 'or' to determine how rules are combined

        Returns:
            Analyzed rule combining both rules with AND or OR
        """
        logger.debug(f"ClosureFunctionAnalyzer: Analyzing add_rule pattern at depth {depth} (combine={combine_mode})")

        # Analyze both rules
        rule_result = self.analyze_function(rule_func, depth + 1)
        old_rule_result = self.analyze_function(old_rule_func, depth + 1)

        # If new rule analysis failed, try bytecode
        if rule_result is None:
            rule_result = self._analyze_via_bytecode(rule_func)
        # If old rule analysis failed, try bytecode
        if old_rule_result is None:
            old_rule_result = self._analyze_via_bytecode(old_rule_func)

        # Handle cases where one or both failed
        if rule_result is None and old_rule_result is None:
            logger.debug(f"ClosureFunctionAnalyzer: Both add_rule components failed analysis")
            return None
        elif rule_result is None:
            # Only old_rule succeeded - return it (rule is implicitly True for AND, False for OR)
            logger.debug(f"ClosureFunctionAnalyzer: Only old_rule succeeded in add_rule ({combine_mode})")
            if combine_mode == 'or':
                # rule OR old_rule where rule=False means just old_rule
                return old_rule_result
            return old_rule_result
        elif old_rule_result is None:
            # Only rule succeeded - return it (old_rule is implicitly True for AND, False for OR)
            logger.debug(f"ClosureFunctionAnalyzer: Only rule succeeded in add_rule ({combine_mode})")
            if combine_mode == 'or':
                # rule OR old_rule where old_rule=False means just rule
                return rule_result
            return rule_result

        # Both succeeded - combine with AND or OR
        conditions = [rule_result, old_rule_result]

        if combine_mode == 'or':
            simplified = self._simplify_or_conditions(conditions)
            if len(simplified) == 0:
                return {'rule': 'False_'}
            elif len(simplified) == 1:
                return simplified[0]
            logger.debug(f"ClosureFunctionAnalyzer: add_rule OR pattern combined: {simplified}")
            return {'rule': 'Or', 'children': simplified}
        else:
            simplified = self._simplify_and_conditions(conditions)
            if len(simplified) == 0:
                return {'rule': 'True_'}
            elif len(simplified) == 1:
                return simplified[0]
            logger.debug(f"ClosureFunctionAnalyzer: add_rule AND pattern combined: {simplified}")
            return {'rule': 'And', 'children': simplified}

    def _analyze_locality_item_rule_pattern(self, old_rule_func: Callable,
                                             depth: int) -> Optional[Dict[str, Any]]:
        """Analyze locality_rules item_rule wrapper pattern.

        This pattern is created by worlds/generic/Rules.py locality_rules() function:
        lambda i, sending_blockers=..., old_rule=location.item_rule: \
            i.name not in sending_blockers[i.player] and old_rule(i)

        The sending_blockers check is a multiworld locality concern (local_items,
        non_local_items options) that we don't need to export for single-world tracking.
        We just analyze and return the old_rule.

        Args:
            old_rule_func: The original item_rule function
            depth: Current recursion depth

        Returns:
            Analyzed rule from old_rule, or True_ if old_rule can't be analyzed
        """
        logger.debug(f"ClosureFunctionAnalyzer: Analyzing locality_rules item_rule at depth {depth}")

        # Check if old_rule is the default Location.item_rule (always returns True)
        # In this case, we can just return True_
        from BaseClasses import Location
        if old_rule_func is Location.item_rule:
            logger.debug(f"ClosureFunctionAnalyzer: old_rule is default Location.item_rule, returning True_")
            return {'rule': 'True_'}

        # Try to analyze the old_rule
        old_rule_result = self.analyze_function(old_rule_func, depth + 1)

        # If analysis failed, try bytecode
        if old_rule_result is None:
            old_rule_result = self._analyze_via_bytecode(old_rule_func)

        if old_rule_result is None:
            # Couldn't analyze old_rule - return True_ as fallback
            # This is more permissive but avoids losing the rule entirely
            logger.debug(f"ClosureFunctionAnalyzer: Could not analyze locality item_rule old_rule, using True_")
            return {'rule': 'True_'}

        return old_rule_result

    def _analyze_via_bytecode(self, func: Callable) -> Optional[Dict[str, Any]]:
        """Analyze a function by examining its bytecode constants and names.

        This is a last-resort analysis that extracts information from the
        compiled bytecode when source code is not available.

        Args:
            func: The function to analyze

        Returns:
            Analyzed rule dict, or None if analysis failed
        """
        import dis

        func_code = getattr(func, '__code__', None)
        if not func_code:
            return None

        consts = func_code.co_consts
        names = func_code.co_names if hasattr(func_code, 'co_names') else ()
        freevars = func_code.co_freevars

        # Extract closure variables for additional context
        closure_vars = self._extract_closure_vars(func)

        # Analyze bytecode to detect OR vs AND patterns
        # Look for JUMP_IF_TRUE_OR_POP (OR short-circuit) vs JUMP_IF_FALSE_OR_POP (AND)
        is_or_pattern = False
        is_and_pattern = False
        try:
            bytecode = list(dis.get_instructions(func_code))
            for instr in bytecode:
                if instr.opname in ('JUMP_IF_TRUE_OR_POP', 'POP_JUMP_IF_TRUE'):
                    is_or_pattern = True
                elif instr.opname in ('JUMP_IF_FALSE_OR_POP', 'POP_JUMP_IF_FALSE', 'POP_JUMP_FORWARD_IF_FALSE'):
                    is_and_pattern = True
        except Exception:
            pass  # Fall back to heuristics if bytecode analysis fails

        # Get known items from game handler (if available)
        # This allows game-specific items to be recognized in bytecode analysis
        known_items: Set[str] = set()
        if self.game_handler and hasattr(self.game_handler, 'get_known_items_for_bytecode'):
            known_items = self.game_handler.get_known_items_for_bytecode()

        # Check for helper expansions from game handler
        # This allows games to define how helpers like 'has_sword' expand in bytecode
        def get_helper_expansion(helper_name: str) -> List[str]:
            if self.game_handler and hasattr(self.game_handler, 'get_bytecode_helper_expansion'):
                return self.game_handler.get_bytecode_helper_expansion(helper_name)
            return []

        # Check for combined patterns: (item AND helper) OR item
        # This pattern is used in some games' glitch mode rules
        # Example: (Moon Pearl AND has_sword) OR Magic Mirror
        helper_expansion = get_helper_expansion('has_sword')
        if 'has' in names and 'has_sword' in names and is_or_pattern and is_and_pattern and helper_expansion:
            item_names = []
            for const in consts:
                if isinstance(const, str) and const and not const.startswith('<'):
                    if const not in ('Entrance', 'Region', 'Location'):
                        if const in known_items:
                            item_names.append(const)

            if len(item_names) >= 2:
                # Pattern: (first_item AND has_sword) OR second_item
                # The bytecode order is: item1 check -> AND jump -> has_sword -> OR jump -> item2
                # Convert has_sword to actual item checks using game handler's helper expansion
                has_sword_rule = {
                    'rule': 'HasAny',
                    'args': {'items': helper_expansion}
                }
                first_item = {'rule': 'Has', 'args': {'item_name': item_names[0]}}
                second_item = {'rule': 'Has', 'args': {'item_name': item_names[1]}}

                and_part = {'rule': 'And', 'children': [first_item, has_sword_rule]}
                result = {'rule': 'Or', 'children': [and_part, second_item]}

                logger.debug(f"ClosureFunctionAnalyzer: Bytecode found (item AND has_sword) OR item pattern: {item_names}")
                return result

        # Check for option attribute access pattern: world.worlds[player].options.xxx
        # This handles rules like: state.has('Beat Agahnim 2', player) or world.worlds[player].options.open_pyramid
        option_name = None
        has_option_access = 'options' in names and 'worlds' in names
        if has_option_access:
            # Look for option name - it's the last attribute access after 'options'
            # Get known option names from game handler (if available)
            known_option_names = set()
            if self.game_handler and hasattr(self.game_handler, 'get_known_option_names'):
                known_option_names = self.game_handler.get_known_option_names()
            # Check in names (attribute names)
            for name in names:
                if name in known_option_names:
                    option_name = name
                    break
            # Also check constants in case it's passed as a string
            if not option_name:
                for const in consts:
                    if isinstance(const, str) and const in known_option_names:
                        option_name = const
                        break

        # Check for state.has() pattern - collect ALL item names first
        if 'has' in names and known_items:
            item_names = []
            for const in consts:
                if isinstance(const, str) and const and not const.startswith('<'):
                    # Skip type strings
                    if const not in ('Entrance', 'Region', 'Location'):
                        if const in known_items:
                            item_names.append(const)

            # If we have an OR pattern with has() and option access, combine them
            if is_or_pattern and option_name and len(item_names) >= 1:
                # Try to evaluate the option at export time
                option_value = self._try_evaluate_option(option_name, closure_vars)
                if option_value is True:
                    # Option evaluates to True, so the OR is always True
                    logger.debug(f"ClosureFunctionAnalyzer: Bytecode OR pattern with option '{option_name}' = True -> True_")
                    return {'rule': 'True_'}
                elif option_value is False:
                    # Option evaluates to False, so only the item check matters
                    logger.debug(f"ClosureFunctionAnalyzer: Bytecode OR pattern with option '{option_name}' = False -> Has('{item_names[0]}')")
                    return {'rule': 'Has', 'args': {'item_name': item_names[0]}}
                else:
                    # Could not evaluate option, return full OR rule
                    option_rule = {'rule': 'OptionValue', 'args': {'option': option_name}}
                    item_rule = {'rule': 'Has', 'args': {'item_name': item_names[0]}}
                    logger.debug(f"ClosureFunctionAnalyzer: Bytecode found OR pattern: has('{item_names[0]}') or option '{option_name}'")
                    return {'rule': 'Or', 'children': [option_rule, item_rule]}

            if len(item_names) == 1:
                logger.debug(f"ClosureFunctionAnalyzer: Bytecode found has('{item_names[0]}')")
                return {'rule': 'Has', 'args': {'item_name': item_names[0]}}
            elif len(item_names) > 1:
                # Multiple items - use bytecode analysis to determine OR vs AND
                item_checks = [{'rule': 'Has', 'args': {'item_name': name}} for name in item_names]
                if is_or_pattern and not is_and_pattern:
                    logger.debug(f"ClosureFunctionAnalyzer: Bytecode found OR pattern with items: {item_names}")
                    return {'rule': 'Or', 'children': item_checks}
                elif is_and_pattern and not is_or_pattern:
                    logger.debug(f"ClosureFunctionAnalyzer: Bytecode found AND pattern with items: {item_names}")
                    return {'rule': 'And', 'children': item_checks}
                else:
                    # Both AND and OR detected but no has_sword - default to OR
                    logger.debug(f"ClosureFunctionAnalyzer: Bytecode found mixed pattern, defaulting to OR: {item_names}")
                    return {'rule': 'Or', 'children': item_checks}

        # Handle standalone option access in OR pattern (e.g., option_value or other_check)
        if is_or_pattern and option_name and 'has' not in names:
            logger.debug(f"ClosureFunctionAnalyzer: Bytecode found standalone option access: '{option_name}'")
            return {'rule': 'OptionValue', 'args': {'option': option_name}}

        # Check for state.can_reach() pattern
        if 'can_reach' in names:
            # Find target name in constants or closure
            for const in consts:
                if isinstance(const, str) and const and const not in ('Entrance', 'Region', 'Location'):
                    target_type = 'Region'
                    if 'Entrance' in consts:
                        target_type = 'Entrance'
                    logger.debug(f"ClosureFunctionAnalyzer: Bytecode found can_reach('{const}', '{target_type}')")
                    return {
                        'rule': 'CanReachEntrance' if target_type == 'Entrance' else 'CanReachRegion',
                        'args': {'entrance_name' if target_type == 'Entrance' else 'region_name': const}
                    }

            # Check closure for entrance object
            if 'entrance' in closure_vars:
                entrance = closure_vars['entrance']
                entrance_name = getattr(entrance, 'name', str(entrance))
                logger.debug(f"ClosureFunctionAnalyzer: Bytecode found can_reach via closure entrance '{entrance_name}'")
                return {'rule': 'CanReachEntrance', 'args': {'entrance_name': entrance_name}}

        # Check for helper functions that have bytecode expansions
        # Convert to HasAny item checks using game handler's expansion mapping
        for name in names:
            expansion = get_helper_expansion(name)
            if expansion:
                logger.debug(f"ClosureFunctionAnalyzer: Bytecode found {name}(), converting to item checks")
                return {
                    'rule': 'HasAny',
                    'args': {'items': expansion}
                }

        return None

    def _try_evaluate_option(self, option_name: str, closure_vars: Dict[str, Any]) -> Optional[bool]:
        """Try to evaluate an option value at export time.

        This is used to simplify rules like `has(X) or option.to_bool()` when we can
        determine the option's value from the world context.

        Controlled by the resolve_options_to_constants setting - when False, this
        method always returns None to keep options as references.

        Args:
            option_name: Name of the option to evaluate (e.g., 'open_pyramid')
            closure_vars: Closure variables that might contain world context

        Returns:
            True if option evaluates to True
            False if option evaluates to False
            None if we cannot determine the value or resolve_options_to_constants is False
        """
        # Check if we should resolve options to constants
        if self.game_handler and hasattr(self.game_handler, 'should_resolve_options_to_constants'):
            if not self.game_handler.should_resolve_options_to_constants():
                logger.debug(f"_try_evaluate_option: Skipping evaluation of '{option_name}' (resolve_options_to_constants=False)")
                return None

        # Try to get world from closure vars or game handler
        world = closure_vars.get('world')

        # If world is not in closure, try to get it from game handler
        if world is None and self.game_handler:
            world = getattr(self.game_handler, 'world', None)

        if world is None:
            logger.debug(f"_try_evaluate_option: No world context available for '{option_name}'")
            return None

        try:
            # Get player from closure or default to 1
            player = closure_vars.get('player', 1)

            # Determine if we have the player's world or the multiworld
            if hasattr(world, 'options'):
                # We have the player's world directly
                player_world = world
                multiworld = getattr(world, 'multiworld', None)
            elif hasattr(world, 'worlds'):
                # We have the multiworld - get player's world
                multiworld = world
                player_world = multiworld.worlds.get(player)
                if player_world is None:
                    logger.debug(f"_try_evaluate_option: Could not get player world for player {player}")
                    return None
            else:
                logger.debug(f"_try_evaluate_option: World object has no 'options' or 'worlds' attribute")
                return None

            # Get the option object
            if not hasattr(player_world, 'options'):
                logger.debug(f"_try_evaluate_option: Player world has no 'options' attribute")
                return None

            option_obj = getattr(player_world.options, option_name, None)
            if option_obj is None:
                logger.debug(f"_try_evaluate_option: Option '{option_name}' not found")
                return None

            # Use direct value truthiness, NOT to_bool()
            # The bytecode pattern detection recognizes direct option access like:
            #   world.worlds[player].options.open_pyramid
            # NOT:
            #   world.worlds[player].options.open_pyramid.to_bool(world, player)
            # So we must evaluate the option the same way the original code does.
            # For Choice options, bool(option) uses bool(option.value).
            # to_bool() may have different semantics (e.g., OpenPyramid.to_bool()
            # checks goal and entrance_shuffle, not just the value).
            result = bool(getattr(option_obj, 'value', False))
            logger.debug(f"_try_evaluate_option: bool({option_name}.value) = {result}")
            return result

        except Exception as e:
            logger.debug(f"_try_evaluate_option: Failed to evaluate '{option_name}': {e}")
            return None

    def _analyze_simple_check_pattern(self, func: Callable,
                                      closure_vars: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Analyze simple state.has() patterns by examining bytecode.

        Handles patterns like:
        - lambda state: state.has('Moon Pearl', player)
        - lambda state: state.has('Magic Mirror', player)
        - lambda state: state.has('Magic Mirror', player) and has_sword(state, player) or state.has('Moon Pearl', player)

        Args:
            func: The function to analyze
            closure_vars: Extracted closure variables

        Returns:
            Analyzed item_check rule, or None if pattern not matched
        """
        func_code = getattr(func, '__code__', None)
        if not func_code:
            return None

        consts = func_code.co_consts
        names = func_code.co_names if hasattr(func_code, 'co_names') else ()

        # Check if this calls 'has' method (state.has())
        if 'has' not in names:
            return None

        # If this pattern includes has_sword or multiple items with AND/OR,
        # delegate to _analyze_via_bytecode which handles complex patterns
        if 'has_sword' in names:
            logger.debug(f"ClosureFunctionAnalyzer: Complex pattern with has_sword, using bytecode analysis")
            return self._analyze_via_bytecode(func)

        # Extract item name from constants - it's the string argument to has()
        # Filter out None and code objects, look for item-like strings
        item_candidates = []
        for const in consts:
            if isinstance(const, str) and const and not const.startswith('<'):
                item_candidates.append(const)

        # If we have multiple items, also delegate to bytecode analysis
        # to properly detect OR vs AND patterns
        if len(item_candidates) > 1:
            logger.debug(f"ClosureFunctionAnalyzer: Multiple items found, using bytecode analysis")
            return self._analyze_via_bytecode(func)

        # If this pattern includes option access (world.worlds[player].options.X),
        # delegate to bytecode analysis which handles has() OR option patterns
        if 'options' in names and 'worlds' in names:
            logger.debug(f"ClosureFunctionAnalyzer: Pattern includes option access, using bytecode analysis")
            return self._analyze_via_bytecode(func)

        if len(item_candidates) == 1:
            item_name = item_candidates[0]
            logger.debug(f"ClosureFunctionAnalyzer: Detected has() check for '{item_name}'")
            return {'rule': 'Has', 'args': {'item_name': item_name}}

        return None

    def _extract_closure_vars(self, func: Callable) -> Dict[str, Any]:
        """Extract closure variables and default argument values from a function.

        This extracts both:
        1. Closure variables (freevars) - captured from enclosing scope
        2. Default argument values - often used to capture values at definition time

        Args:
            func: The function to extract closure variables from

        Returns:
            Dictionary mapping variable names to their values
        """
        result = {}

        # Extract closure variables (freevars)
        if hasattr(func, '__closure__') and func.__closure__ is not None:
            if hasattr(func, '__code__'):
                freevars = func.__code__.co_freevars
                for name, cell in zip(freevars, func.__closure__):
                    try:
                        result[name] = cell.cell_contents
                    except ValueError:
                        # Empty cell
                        pass

        # Extract default argument values
        # These are often used in patterns like:
        #   lambda i, old_rule=location.item_rule: ... and old_rule(i)
        if hasattr(func, '__defaults__') and func.__defaults__ is not None:
            if hasattr(func, '__code__'):
                code = func.__code__
                # co_varnames starts with positional args, then *args, **kwargs, then locals
                # Defaults apply to the last N positional args (where N = len(__defaults__))
                arg_count = code.co_argcount
                defaults = func.__defaults__
                # Match defaults to their parameter names
                # Default values are right-aligned to parameters
                first_default_idx = arg_count - len(defaults)
                for i, default_value in enumerate(defaults):
                    param_idx = first_default_idx + i
                    if param_idx < len(code.co_varnames):
                        param_name = code.co_varnames[param_idx]
                        result[param_name] = default_value

        return result

    def _flatten_or_children(self, children: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Flatten nested OR structures: OR(OR(a,b), c) -> OR(a, b, c).

        Args:
            children: List of child rules

        Returns:
            Flattened list where nested OR children are lifted up
        """
        flattened = []
        for child in children:
            if child.get('rule') == 'Or' and 'children' in child:
                # Recursively flatten nested ORs
                flattened.extend(self._flatten_or_children(child['children']))
            else:
                flattened.append(child)
        return flattened

    def _flatten_and_children(self, children: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Flatten nested AND structures: AND(AND(a,b), c) -> AND(a, b, c).

        Args:
            children: List of child rules

        Returns:
            Flattened list where nested AND children are lifted up
        """
        flattened = []
        for child in children:
            if child.get('rule') == 'And' and 'children' in child:
                # Recursively flatten nested ANDs
                flattened.extend(self._flatten_and_children(child['children']))
            else:
                flattened.append(child)
        return flattened

    def _extract_items_from_rule(self, rule: Dict[str, Any]) -> Optional[Set[str]]:
        """Extract item names from a rule for dominance comparison.

        Args:
            rule: A rule dict

        Returns:
            Set of item names, or None if rule has can_reach requirements
        """
        if rule.get('rule') == 'Has':
            return {rule.get('args', {}).get('item_name', '')}
        elif rule.get('rule') == 'HasAny':
            return set(rule.get('args', {}).get('items', []))
        elif rule.get('rule') in ('CanReachEntrance', 'CanReachRegion'):
            return None  # Has can_reach, not a pure item rule
        elif rule.get('rule') == 'And' and 'children' in rule:
            items = set()
            for child in rule['children']:
                child_items = self._extract_items_from_rule(child)
                if child_items is None:
                    return None  # Has can_reach requirement
                items.update(child_items)
            return items
        elif rule.get('rule') in ('True_', 'False_'):
            return set()  # Constants have no item requirements
        return None  # Unknown rule type, treat conservatively

    def _prune_dominated_options(self, options: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove options that are dominated by simpler options.

        An option A dominates option B if A's item requirements are a subset of B's
        AND A has no can_reach requirements while B does.

        Example: Has(Moon Pearl) dominates AND(CanReachEntrance(X), Has(Moon Pearl))

        Args:
            options: List of rule dicts

        Returns:
            List with dominated options removed
        """
        # Separate options by whether they have can_reach requirements
        simple_options = []  # No can_reach requirements
        complex_options = []  # Has can_reach requirements

        for opt in options:
            items = self._extract_items_from_rule(opt)
            if items is not None:
                simple_options.append((opt, items))
            else:
                complex_options.append(opt)

        # Check if any complex option is dominated by a simple option
        kept_complex = []
        for complex_opt in complex_options:
            dominated = False
            # For complex options, we need to extract just the item requirements
            # The complex option needs can_reach + items, but if a simple option
            # needs the same or fewer items, it dominates
            for simple_opt, simple_items in simple_options:
                # A simple option (items only) dominates a complex option
                # if the simple option's items are a subset of what the complex
                # option requires (since simple doesn't need can_reach)
                # Actually, the simpler check: if simple_items is empty or
                # the complex option requires at least all of simple_items,
                # then simple dominates
                if not simple_items:  # True_ dominates everything
                    dominated = True
                    break
            if not dominated:
                kept_complex.append(complex_opt)

        # Reconstruct the options list
        result = [opt for opt, _ in simple_options] + kept_complex
        return result

    def _rule_fingerprint(self, rule: Dict[str, Any]) -> str:
        """Generate a canonical string fingerprint for a rule.

        This creates a deterministic string representation that can be used
        for deduplication, catching cases where rules are structurally identical
        but have different dict ordering.

        Args:
            rule: A rule dictionary

        Returns:
            Canonical string representation
        """
        import json
        return json.dumps(rule, sort_keys=True)

    def _simplify_or_conditions(self, conditions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Simplify a list of OR conditions.

        Removes:
        - Duplicate conditions
        - If any condition is True, the whole OR is True
        - False conditions (they don't affect OR)

        Args:
            conditions: List of rule dicts

        Returns:
            Simplified list of conditions
        """
        # Feature flag: Flatten nested OR structures first
        if self.ENABLE_NESTED_FLATTENING:
            conditions = self._flatten_or_children(conditions)

        seen = []
        seen_fingerprints: Set[str] = set()  # For fingerprint-based dedup

        for cond in conditions:
            # True makes the whole OR true (both formats)
            if cond.get('type') == 'constant' and cond.get('value') is True:
                return [{'rule': 'True_'}]
            if cond.get('rule') == 'True_':
                return [{'rule': 'True_'}]

            # Skip False (doesn't affect OR) (both formats)
            if cond.get('type') == 'constant' and cond.get('value') is False:
                continue
            if cond.get('rule') == 'False_':
                continue

            # Skip duplicates
            if self.ENABLE_FINGERPRINT_DEDUP:
                # Use fingerprint-based deduplication
                fingerprint = self._rule_fingerprint(cond)
                if fingerprint not in seen_fingerprints:
                    seen_fingerprints.add(fingerprint)
                    seen.append(cond)
            else:
                # Simple equality check
                if cond not in seen:
                    seen.append(cond)

        # Feature flag: Cross-type dominance pruning
        if self.ENABLE_CROSS_TYPE_DOMINANCE and len(seen) > 1:
            seen = self._prune_dominated_options(seen)

        return seen

    def _simplify_and_conditions(self, conditions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Simplify a list of AND conditions.

        Removes:
        - Duplicate conditions
        - If any condition is False, the whole AND is False
        - True conditions (they don't affect AND)

        Args:
            conditions: List of rule dicts

        Returns:
            Simplified list of conditions
        """
        # Feature flag: Flatten nested AND structures first
        if self.ENABLE_NESTED_FLATTENING:
            conditions = self._flatten_and_children(conditions)

        seen = []
        seen_fingerprints: Set[str] = set()  # For fingerprint-based dedup

        for cond in conditions:
            # False makes the whole AND false (both formats)
            if cond.get('type') == 'constant' and cond.get('value') is False:
                return [{'rule': 'False_'}]
            if cond.get('rule') == 'False_':
                return [{'rule': 'False_'}]

            # Skip True (doesn't affect AND) (both formats)
            if cond.get('type') == 'constant' and cond.get('value') is True:
                continue
            if cond.get('rule') == 'True_':
                continue

            # Skip duplicates
            if self.ENABLE_FINGERPRINT_DEDUP:
                # Use fingerprint-based deduplication
                fingerprint = self._rule_fingerprint(cond)
                if fingerprint not in seen_fingerprints:
                    seen_fingerprints.add(fingerprint)
                    seen.append(cond)
            else:
                # Simple equality check
                if cond not in seen:
                    seen.append(cond)

        return seen if seen else [{'rule': 'True_'}]


class UnanalyzableRulePatternMatcher:
    """Utility class for detecting unanalyzable rule patterns.

    This class provides static methods for detecting whether a function
    matches a known unanalyzable pattern that should use fallback handling.

    DEPRECATED: Prefer using game_handler.is_unanalyzable_rule_pattern() instead.
    This class is kept for backward compatibility.
    """

    @staticmethod
    def is_unanalyzable_pattern(func: Callable, game_handler=None) -> bool:
        """Check if a function matches an unanalyzable rule pattern.

        Checks the game handler first (if available), then falls back to
        legacy detection for known patterns.

        Args:
            func: The function to check
            game_handler: Optional game handler for game-specific detection

        Returns:
            True if this appears to be an unanalyzable rule pattern
        """
        if not callable(func):
            return False

        # Prefer game handler detection
        if game_handler and hasattr(game_handler, 'is_unanalyzable_rule_pattern'):
            return game_handler.is_unanalyzable_rule_pattern(func)

        # Legacy fallback: check for set_bunny_rules pattern
        qualname = getattr(func, '__qualname__', '')
        return 'set_bunny_rules' in qualname

    @staticmethod
    def get_pattern_type(func: Callable) -> Optional[str]:
        """Identify which rule pattern a function matches.

        Args:
            func: The function to analyze

        Returns:
            Pattern name string, or None if not recognized
        """
        closure_var_names = UnanalyzableRulePatternMatcher._get_closure_var_names(func)

        # Match by closure variable signature
        if set(closure_var_names) == {'options'}:
            return 'options_to_access_rule'
        # Accept both 'path' and 'new_path' - ALttP uses 'new_path' in some bunny rule lambdas
        if ({'path', 'entrance'} <= set(closure_var_names) or
            {'new_path', 'entrance'} <= set(closure_var_names)):
            return 'path_to_access_rule'
        if set(closure_var_names) == {'player'}:
            return 'simple_item_check'
        if 'player' in closure_var_names:
            return 'complex_check'

        return 'unknown'

    @staticmethod
    def _get_closure_var_names(func: Callable) -> List[str]:
        """Get the names of closure variables.

        Args:
            func: The function to inspect

        Returns:
            List of closure variable names
        """
        if hasattr(func, '__code__'):
            return list(func.__code__.co_freevars)
        return []


# Backward compatibility alias
BunnyRulePatternMatcher = UnanalyzableRulePatternMatcher
