"""Game-specific export handler for Saving Princess."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class SavingPrincessGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Saving Princess'
    """Export handler for Saving Princess with custom handling for world.is_pool_expanded conditionals."""

    def __init__(self, world=None):
        """Initialize with world reference to access is_pool_expanded."""
        super().__init__()
        self.world = world

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Expand rule with special handling for world.is_pool_expanded conditionals.

        Saving Princess uses conditional rules that test world.is_pool_expanded at runtime.
        Since this value is known at export time, we resolve these conditionals and
        return only the appropriate branch.
        """
        if not rule:
            return rule

        # Handle conditional rules that test world.is_pool_expanded
        if rule.get('type') == 'conditional':
            test = rule.get('test', {})
            # Check if this is testing world.is_pool_expanded
            if (test.get('type') == 'attribute' and
                test.get('attr') == 'is_pool_expanded' and
                test.get('object', {}).get('type') == 'name' and
                test.get('object', {}).get('name') == 'world'):

                # Get the actual value of is_pool_expanded from the world instance
                # This is set during generation based on options.expanded_pool
                world = self.world
                is_pool_expanded = getattr(world, 'is_pool_expanded', False)

                logger.info(f"Resolving world.is_pool_expanded conditional: expanded_pool = {is_pool_expanded}")

                # Return the appropriate branch based on the actual value
                if is_pool_expanded:
                    result = rule.get('if_true')
                    logger.debug(f"Using if_true branch: {result}")
                else:
                    result = rule.get('if_false')
                    logger.debug(f"Using if_false branch: {result}")

                # Recursively expand the selected branch
                return self.expand_rule(result) if result else result

        # Handle conditionals within item checks (for nested conditionals)
        if rule.get('type') == 'item_check':
            item = rule.get('item')
            if isinstance(item, dict):
                rule['item'] = self.expand_rule(item)

        # Standard recursive expansion for compound rules
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]

        # Recursively expand helper nodes
        if rule.get('type') == 'helper':
            expanded = self.expand_helper(rule['name'])
            return expanded if expanded else rule

        return rule
