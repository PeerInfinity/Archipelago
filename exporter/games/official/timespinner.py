"""Timespinner game-specific export handler."""

from ..base import GenericGameExportHandler


class TimespinnerGameExportHandler(GenericGameExportHandler):
    """Export handler for Timespinner.

    Game-specific handling:
    - Maps self.flag_* Logic class attributes to options (without flag_ prefix)
    - Exports precalculated_weights warp unlock values (handles keys/key naming difference)
    - Preserves helper definitions (prevents generic has_*/can_* pattern expansion)
    """

    # Map self.<attr> in TimespinnerLogic to setting names
    # flag_* prefix is stripped; warp unlocks are identity-mapped for WORLD_ATTRIBUTES
    SELF_ATTR_TO_SETTING = {
        'flag_specific_keycards': 'specific_keycards',
        'flag_eye_spy': 'eye_spy',
        'flag_unchained_keys': 'unchained_keys',
        'flag_prism_break': 'prism_break',
        'flag_find_the_flame': 'find_the_flame',
        'pyramid_keys_unlock': 'pyramid_keys_unlock',
        'present_keys_unlock': 'present_keys_unlock',
        'past_keys_unlock': 'past_keys_unlock',
        'time_keys_unlock': 'time_keys_unlock',
    }

    # Export warp unlocks at top level (logic uses 'keys', world uses 'key')
    # Handle both objects (original world) and dicts (WorldGen world)
    WORLD_ATTRIBUTES = {
        'pyramid_keys_unlock': lambda w, m, p: _get_pcw_attr(w, 'pyramid_keys_unlock'),
        'present_keys_unlock': lambda w, m, p: _get_pcw_attr(w, 'present_key_unlock'),
        'past_keys_unlock': lambda w, m, p: _get_pcw_attr(w, 'past_key_unlock'),
        'time_keys_unlock': lambda w, m, p: _get_pcw_attr(w, 'time_key_unlock'),
    }

    def _is_common_helper_pattern(self, helper_name: str) -> bool:
        """Disable generic pattern expansion - helpers are exported as-is."""
        return False


def _get_pcw_attr(world, attr_name: str):
    """Get attribute from precalculated_weights, handling both objects and dicts."""
    pcw = getattr(world, 'precalculated_weights', None)
    if pcw is None:
        return None
    # Handle dict-based precalculated_weights (from WorldGen worlds)
    if isinstance(pcw, dict):
        return pcw.get(attr_name)
    # Handle object-based precalculated_weights (from original world)
    return getattr(pcw, attr_name, None)
