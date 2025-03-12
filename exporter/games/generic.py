"""Generic fallback helper expander."""

from .base import BaseHelperExpander

class GenericHelperExpander(BaseHelperExpander):
    """Fallback expander that preserves helper nodes."""
    
    def expand_helper(self, helper_name: str):
        return None  # Preserve helper nodes as-is