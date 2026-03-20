from dataclasses import dataclass
from Options import Toggle, PerGameCommonOptions

class VanillaPlacement(Toggle):
    """Place items in their original locations. When disabled, items are shuffled randomly."""
    display_name = "Vanilla Item Placement"
    default = False

@dataclass
class CodingAdventureOptions(PerGameCommonOptions):
    vanilla_placement: VanillaPlacement
