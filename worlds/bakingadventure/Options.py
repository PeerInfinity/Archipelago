from dataclasses import dataclass
from Options import Toggle, PerGameCommonOptions


class VanillaPlacement(Toggle):
    """
    If enabled, items will be placed in their original locations following the vanilla baking process.
    If disabled, items will be shuffled randomly across all locations.
    """
    display_name = "Vanilla Item Placement"
    default = False


@dataclass
class BakingAdventureOptions(PerGameCommonOptions):
    vanilla_placement: VanillaPlacement
