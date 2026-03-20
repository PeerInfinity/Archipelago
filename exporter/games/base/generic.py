"""Generic fallback helper expander.

This is the recommended base class for new game export handlers.

GenericGameExportHandler extends BaseGameExportHandler with:
- Intelligent rule analysis that attempts to infer meaning from patterns
- Recognition of common helper naming patterns (has_*, can_*, defeat_*, etc.)
- Special handling for __analyzed_func__ and other edge cases
- LogicMixin pattern expansion (_*_has_item, _*_has_region, etc.)
- AUTO_EXPORT_DISCOVERED_HELPERS enabled by default

To create a new game handler, simply inherit from GenericGameExportHandler
and add a GAME_NAME class attribute:

    class MyGameExportHandler(GenericGameExportHandler):
        GAME_NAME = 'My Game Name'

        # Override methods only when you need custom behavior

The handler will be automatically discovered and registered.
"""

from typing import Dict, Any, List, Optional
from .handler import BaseGameExportHandler
import re
import logging

logger = logging.getLogger(__name__)


class GenericGameExportHandler(BaseGameExportHandler):
    """Fallback expander that intelligently handles game-specific rules.

    This is the recommended base class for new game export handlers.
    Provides intelligent defaults for rule analysis and helper expansion.

    By default, AUTO_EXPORT_DISCOVERED_HELPERS is enabled. Override with False
    if your game has complex helpers that can't be automatically exported.
    """

    # Enable automatic helper export by default for GenericGameExportHandler
    # Most games benefit from this. Override with False if needed.
    AUTO_EXPORT_DISCOVERED_HELPERS = True

    # =========================================================================
    # Hook implementations - these extend Base's expand_rule behavior
    # =========================================================================

    def _handle_analyzed_func(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle __analyzed_func__ state methods with intelligent fallback.

        Attempts to extract meaningful information from rules that couldn't
        be fully analyzed.
        """
        # Try to extract more detailed information from original rule if available
        if 'original' in rule:
            return self._analyze_original_rule(rule['original'])

        # Attempt to infer rule type from any available information
        return self._infer_rule_type(rule)

    def _expand_helper_by_pattern(self, helper_name: str, args: List[Any]) -> Optional[Dict[str, Any]]:
        """Expand helper functions by common naming patterns.

        Recognizes patterns like has_*, can_*, defeat_*, etc. and expands
        them to appropriate rule types.
        """
        # Check if helper was auto-preserved or explicitly preserved
        is_auto_preserved = (hasattr(self, 'is_auto_preserved_helper') and
                             self.is_auto_preserved_helper(helper_name))
        if is_auto_preserved or self.should_preserve_as_helper(helper_name):
            return None

        # Don't pattern-expand helpers that have arguments - they are parametric
        # functions whose behavior depends on the args and cannot be reduced to a
        # simple item/capability check based on the helper name alone.
        # For example, has_logic_list_building(buildings, index, ...) checks different
        # items depending on args, not a single "Logic_List_Building" item.
        if args:
            return None

        # Try pattern-based expansion
        if self._is_common_helper_pattern(helper_name):
            return self._expand_common_helper(helper_name, args)

        return None

    def _expand_logic_mixin_patterns(self, method_name: str, args: List[Any]) -> Optional[Dict[str, Any]]:
        """Expand LogicMixin naming patterns to rule structures.

        Many games define wrapper methods like _game_has_item(player, item) that
        delegate to state.has(). We expand these inline to their underlying rule types.
        """
        # Pattern: _*_has_item(player, item) -> item_check
        if method_name.endswith('_has_item') and len(args) >= 1:
            item = args[0]
            item_name = item.get('value') if isinstance(item, dict) else item
            logger.debug(f"Expanding LogicMixin {method_name} to item_check for '{item_name}'")
            return {'type': 'item_check', 'item': item_name}

        # Pattern: _*_has_region(player, region) -> can_reach
        if method_name.endswith('_has_region') and len(args) >= 1:
            region = args[0]
            region_name = region.get('value') if isinstance(region, dict) else region
            logger.debug(f"Expanding LogicMixin {method_name} to can_reach for '{region_name}'")
            return {'type': 'can_reach', 'region': region_name}

        # Pattern: _*_has_item_and_region(player, item, region) -> and(item_check, can_reach)
        if method_name.endswith('_has_item_and_region') and len(args) >= 2:
            item = args[0]
            region = args[1]
            item_name = item.get('value') if isinstance(item, dict) else item
            region_name = region.get('value') if isinstance(region, dict) else region
            logger.debug(f"Expanding LogicMixin {method_name} to and(item_check, can_reach)")
            return {
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': item_name},
                    {'type': 'can_reach', 'region': region_name}
                ]
            }

        return None

    # =========================================================================
    # Helper methods for the hooks above
    # =========================================================================

    def _analyze_original_rule(self, original_rule: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze the original rule structure before it became __analyzed_func__."""
        # Look for state method calls in the original rule
        if original_rule.get('type') == 'state_method':
            method = original_rule.get('method', '')
            args = original_rule.get('args', [])

            # Handle 'has' method for item requirements
            if method == 'has' and len(args) >= 1:
                return {
                    'type': 'item_check',
                    'item': args[0]
                }

            # Handle other known state methods
            if method in ['can_reach', 'has_group', 'has_any']:
                return {
                    'type': 'game_specific_check',
                    'method': method,
                    'args': args,
                    'description': f"Requires {method}({', '.join(str(a) for a in args)})"
                }

        return {
            'type': 'generic_rule',
            'description': 'Game-specific rule',
            'details': 'This rule could not be fully analyzed due to game-specific implementation'
        }

    def _infer_rule_type(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Infer rule type based on context clues when original data is unavailable."""
        # Look for keywords in rule name or source code if available
        rule_str = str(rule)

        # Item check patterns
        if 'has(' in rule_str.lower() or 'state.has' in rule_str.lower():
            item_match = re.search(r"has\(['\"](.*?)['\"]\s*,", rule_str)
            if item_match:
                return {
                    'type': 'item_check',
                    'item': item_match.group(1),
                    'inferred': True
                }

        # Location access patterns
        if 'can_reach' in rule_str.lower():
            return {
                'type': 'can_reach',
                'inferred': True,
                'description': 'Requires reaching a specific location'
            }

        # Return a more descriptive generic rule
        return {
            'type': 'generic_rule',
            'description': 'Game-specific rule',
            'details': 'This rule could not be fully analyzed but may involve item requirements'
        }

    def _is_common_helper_pattern(self, helper_name: str) -> bool:
        """Check if a helper name matches common naming patterns across games."""
        common_patterns = [
            # Item access patterns
            r'^has_.*',
            r'^can_use_.*',
            r'^can_access_.*',
            r'^can_reach_.*',
            r'^has_access_to_.*',
            # General capability patterns
            r'^can_.*',
            r'^is_.*',
            # Game-specific but common
            r'^slay_.*',
            r'^defeat_.*',
            r'^open_.*',
            r'^unlock_.*',
        ]

        for pattern in common_patterns:
            if re.match(pattern, helper_name):
                return True
        return False

    def _expand_common_helper(self, helper_name: str, args: List[Any]) -> Optional[Dict[str, Any]]:
        """Expand common helper functions based on naming convention."""
        # Extract the object of the helper (what it applies to)
        parts = helper_name.split('_')
        action = parts[0] if parts else ''
        subject = '_'.join(parts[1:]) if len(parts) > 1 else ''

        if not subject:
            return None

        # Create appropriate rule based on helper type
        if action == 'has':
            return {
                'type': 'item_check',
                'item': subject.title(),
                'inferred': True,
                'description': f"Requires having {subject.replace('_', ' ').title()}"
            }
        elif action == 'can':
            return {
                'type': 'capability',
                'capability': subject,
                'inferred': True,
                'description': f"Requires ability to {subject.replace('_', ' ')}"
            }
        elif action in ['defeat', 'slay']:
            return {
                'type': 'enemy_requirement',
                'enemy': subject,
                'inferred': True,
                'description': f"Requires defeating {subject.replace('_', ' ').title()}"
            }

        # Generic helper description when we can't infer more
        return {
            'type': 'generic_helper',
            'name': helper_name,
            'args': args,
            'description': f"Requires {helper_name.replace('_', ' ')}"
        }
