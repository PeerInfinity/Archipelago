"""Base class for game-specific helper expanders."""

from typing import Dict, Any, List
import collections

class BaseGameExportHandler:
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand helper functions in a rule structure."""
        if not rule or not isinstance(rule, dict):
            return rule
            
        if rule.get('type') == 'helper':
            expanded = self.expand_helper(rule['name'], rule.get('args', []))
            if expanded:
                return self.expand_rule(expanded)
            
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]
            
        if rule.get('type') == 'not':
            rule['condition'] = self.expand_rule(rule.get('condition'))
        if rule.get('type') == 'conditional':
            rule['test'] = self.expand_rule(rule.get('test'))
            rule['if_true'] = self.expand_rule(rule.get('if_true'))
            rule['if_false'] = self.expand_rule(rule.get('if_false'))
            
        return rule
        
    def expand_helper(self, helper_name: str, args: List[Any] = None) -> Dict[str, Any]:
        """Expand a helper function into basic rule conditions."""
        return None
    
    def replace_name(self, name: str) -> str:
        """Replace a name with another name if needed for game-specific logic."""
        return name
        
    def handle_special_function_call(self, func_name: str, processed_args: list) -> dict:
        """
        Handle game-specific special function calls that should be converted to helpers.
        
        Args:
            func_name: The name of the function being called
            processed_args: The processed arguments to the function
            
        Returns:
            A dict with the rule structure, or None if this function should not be handled specially
        """
        return None
    
    def get_effective_item_type(self, item_name: str, original_type: str) -> str:
        """
        Get the effective type for an item, considering game-specific event item rules.
        
        Args:
            item_name: The name of the item
            original_type: The original type from the item object
            
        Returns:
            The effective type that should be used for export
        """
        # Default implementation: return the original type
        return original_type
        
    def expand_count_check(self, items: List[str], count: int = 1) -> Dict[str, Any]:
        """Create a count check rule for one or more items."""
        return {
            'type': 'or',
            'conditions': [
                {'type': 'count_check', 'item': item, 'count': count}
                for item in items
            ]
        }
        
    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Return game-specific item definitions beyond the base item_id_to_name.
        Keyed by item name. Should include classification flags.
        """
        return {}
        
    def get_item_max_counts(self, world) -> Dict[str, int]:
        """
        Return game-specific maximum counts for certain items.
        """
        return {}
        
    def get_progression_mapping(self, world) -> Dict[str, Any]:
        """Return game-specific progression item mapping data."""
        return {}
        
    def get_itempool_counts(self, world, multiworld, player) -> Dict[str, int]:
        """Calculate and return item counts for the player's pool."""
        itempool_counts = collections.defaultdict(int)
        for item in multiworld.itempool:
            if item.player == player:
                itempool_counts[item.name] += 1
        if hasattr(multiworld, 'precollected_items'):
            for item in multiworld.precollected_items.get(player, []):
                itempool_counts[item.name] += 1
        for location in multiworld.get_locations(player):
            if location.item and location.item.player == player:
                itempool_counts[location.item.name] += 1

        if hasattr(world, 'difficulty_requirements'):
            if hasattr(world.difficulty_requirements, 'progressive_bottle_limit'):
                itempool_counts['__max_progressive_bottle'] = world.difficulty_requirements.progressive_bottle_limit
            if hasattr(world.difficulty_requirements, 'boss_heart_container_limit'):
                itempool_counts['__max_boss_heart_container'] = world.difficulty_requirements.boss_heart_container_limit
            if hasattr(world.difficulty_requirements, 'heart_piece_limit'):
                itempool_counts['__max_heart_piece'] = world.difficulty_requirements.heart_piece_limit

        return dict(sorted(itempool_counts.items()))
        
    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Extracts game settings relevant for export."""
        settings_dict = {'game': multiworld.game[player]}
        common_settings = [
            'accessibility',
        ]
        for setting in common_settings:
            if hasattr(multiworld, setting) and player in getattr(multiworld, setting, {}):
                value = getattr(multiworld, setting)[player]
                settings_dict[setting] = getattr(value, 'value', value)

        if hasattr(multiworld, 'mode') and player in multiworld.mode:
            mode_val = multiworld.mode[player]
            settings_dict['mode'] = getattr(mode_val, 'value', str(mode_val))

        # Add assume_bidirectional_exits setting with default false
        settings_dict['assume_bidirectional_exits'] = False

        return settings_dict
        
    def get_game_info(self, world) -> Dict[str, Any]:
        """
        Get information about the game's rule formats and structure.
        This can be overridden by game-specific expanders to provide more detailed information.
        
        Returns:
            A dictionary with game information for the frontend.
        """
        return {
            "name": world.game,
            "rule_format": {
                "version": "1.0"
            }
        }
        
    def get_required_fields(self) -> List[str]:
        """
        Get list of required fields for a complete game export.
        
        Returns:
            A list of field names that must be included in the export.
        """
        return ['region_name', 'locations', 'entrances']
        
    def get_all_worlds(self) -> List[Any]:
        """
        Get all worlds associated with this helper.
        This is typically used to access game-specific data and logic.
        
        Returns:
            A list of world objects.
        """
        return []
        
    def cleanup_settings(self, settings_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Perform game-specific cleanup/mapping on exported settings."""
        common_setting_mappings = {
            'accessibility': {0: 'items', 1: 'locations', 2: 'none'},
        }
        for setting_name, value in settings_dict.items():
            if setting_name in common_setting_mappings and isinstance(value, int):
                if value in common_setting_mappings[setting_name]:
                    settings_dict[setting_name] = common_setting_mappings[setting_name][value]
                else:
                    settings_dict[setting_name] = f"unknown_{value}"
        return settings_dict

    def get_region_attributes(self, region) -> Dict[str, Any]:
        """
        Get game-specific region attributes to include in the export.
        This is called for each region during processing.
        
        Args:
            region: The region object being processed
            
        Returns:
            A dictionary of attributes to add to the region data
        """
        # Base implementation returns no additional attributes
        return {}
    
    def ensure_missing_regions_added(self, multiworld, player: int) -> None:
        """
        Hook for game-specific handlers to ensure all regions are properly added to multiworld.
        This is called before processing regions during export.
        
        Some games may create regions but forget to add them to multiworld.regions.
        This method allows fixing such issues at export time without modifying the game's code.
        
        Args:
            multiworld: The multiworld object
            player: The player ID
        """
        # Base implementation does nothing
        pass