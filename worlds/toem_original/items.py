from dataclasses import dataclass
from itertools import groupby
from typing import final

from BaseClasses import Item, ItemClassification

from .constants import GAME_NAME, Area


@final
class ItemGroup:
    STAMP = "Stamp"
    PHOTO = "Photo"
    ITEM = "Item"
    CASETTE = "CASETTE"


@final
class ItemName:
    HOMELANDA_STAMP = "Homelanda stamp"
    OAKLAVILLE_STAMP = "Oaklaville stamp"
    STANHAMN_STAMP = "Stanhamn stamp"
    LOGCITY_STAMP = "Logcity stamp"
    KIIRUBERG_STAMP = "Kiiruberg stamp"
    BASTO_STAMP = "Basto stamp"

    COW_PHOTO = "Cow photo"
    FLIES_PHOTO = "Flies photo"
    HOME_BIRD_PHOTO = "Home bird photo"
    TATO_PHOTO = "Tato photo"
    ANT_PHOTO = "Ant photo"
    BEEHIVE_PHOTO = "Beehive photo"
    BUTTERFLY_PHOTO = "Butterfly photo"
    OSKAR_PHOTO = "Oskar photo"
    SERO_PHOTO = "Sero photo"
    FOREST_BIRD_PHOTO = "Forest bird photo"
    LADYBUG_PHOTO = "Ladybug photo"
    TOM_PHOTO = "Tom photo"
    NESTWORM_PHOTO = "Nestworm photo"
    PET_ROCK_PHOTO = "Pet rock photo"
    SNAIL_PHOTO = "Snail photo"
    SQUIRREL_PHOTO = "Squirrel photo"
    STAG_BEETLE_PHOTO = "Stag beetle photo"
    TATO_BUG_PHOTO = "Tato bug photo"
    TATO_FLY_PHOTO = "Tato fly photo"
    BUBBLE_FLY_PHOTO = "Bubble fly photo"
    FIA_PHOTO = "Fia photo"
    FRAS_PHOTO = "Fräs photo"
    WILLEMIJN_PHOTO = "Willemijn photo"
    CRAB_PHOTO = "Crab photo"
    DRAGONFLY_PHOTO = "Dragonfly photo"
    HAPPY_CARP_PHOTO = "Happy carp photo"
    JELLYFISH_PHOTO = "Jellyfish photo"
    KING_FISH_PHOTO = "King fish photo"
    SEAGULL_PHOTO = "Seagull photo"
    SEAHORSE_PHOTO = "Seahorse photo"
    SUNDAY_SWAN_PHOTO = "Sunday swan photo"
    TATO_SCUBA_PHOTO = "Tato scuba photo"
    TATO_SWIM_PHOTO = "Tato swim photo"
    TOAD_PHOTO = "Toad photo"
    BUSINESS_PIGEON_PHOTO = "Business pigeon photo"
    PORTILLO_PHOTO = "Portillo photo"
    MOUSE_PHOTO = "Mouse photo"
    PIGEON_PHOTO = "Pigeon photo"
    PUNK_PARROT_PHOTO = "Punky parrot photo"
    TATO_SKATEBOARD_PHOTO = "Tato skateboard photo"
    TATO_TOURIST_PHOTO = "Tato tourist photo"
    TURTLE_PHOTO = "Turtle photo"
    MIKEE_PHOTO = "Mikée photo"
    NARIKO_PHOTO = "Nariko photo"
    COSMO_DEER_PHOTO = "Cosmo deer photo"
    TEDDY_PHOTO = "Teddy photo"
    FLUFF_PHOTO = "Fluff ball photo"
    HEDGEHOG_PHOTO = "Hedgehog photo"
    METEOPAL_PHOTO = "Meteopal photo"
    GOAT_PHOTO = "Mountain goat photo"
    OWL_PHOTO = "Owl photo"
    SNOW_BIRD_PHOTO = "Snow bird photo"
    TATO_ALIEN_PHOTO = "Tato alien photo"
    TATO_SKI_PHOTO = "Tato ski photo"
    BAT_PHOTO = "Bat photo"
    SNAKE_PHOTO = "Beach snake photo"
    BEAK_BIRD_PHOTO = "Beak bird photo"
    BITLING_FROG_PHOTO = "Bitling frog photo"
    BITLING_MOUSE_PHOTO = "Bitling mouse photo"
    BITLING_SNAIL_PHOTO = "Bitling snail photo"
    BITLING_TATO_PHOTO = "Bitling tato photo"
    COCO_CRAB_PHOTO = "Coco crab photo"
    DAY_LIZARD_PHOTO = "Day lizard photo"
    DRILL_MOLE_PHOTO = "Drill mole photo"
    EGGERT_PHOTO = "Eggert photo"
    FIRE_FLY_PHOTO = "Fire fly photo"
    GLOW_WORM_PHOTO = "Glow worm photo"
    ITSY_BITSY_PHOTO = "Itsy bitsy photo"
    MUD_FROG_PHOTO = "Mud frog photo"
    NIGHT_LIZARD_PHOTO = "Night lizard photo"
    SNOUT_BUG_PHOTO = "Snout bug photo"
    TATO_COCO_PHOTO = "Tato coco photo"
    TATO_KING_PHOTO = "Tato king photo"
    WATER_STRIDER_PHOTO = "Water strider photo"

    BACKPACK = "Backpack"
    CAMERA = "Camera"
    CLOGS = "Clogs"
    FINGER = "Foam finger"
    TRIPOD = "Tripod"
    COWBOY_HAT = "Cowboy hat"
    LOST_SOCK = "Lost sock"
    FJALLBJORN_HAT = "Fjällbjörn hat"
    GHOST_GLASSES = "Ghost glasses"
    SOAKED_SOCK = "Soaked sock"
    MONSTER_MASK = "Monster mask"
    FRAMES_FILTERS = "Frames & filters"
    FISHING_HAT = "Fishing hat"
    HONK_ATTACHMENT = "Honk attachment"
    UMBRELLA = "Umbrella"
    OLD_KEY = "Old key"
    HARD_HAT = "Hard hat"
    DIVING_HELMET = "Diving helmet"
    RUBBER_BOOTS = "Rubber boots"
    FISHERMAN_WHISTLE = "Fisherman's whisle"
    SANDWICH = "Supreme deluxe sandwich"
    PIRATE_HAT = "Pirate hat"
    PAPER_HAT = "Paper hat"
    FLAG = "Photo challenger flag"
    HOTBEAN_HAT = "Hotbean hat"
    REPORTER_HAT = "Reporter hat"
    MUDDY_CAMERA = "Muddy camera"
    SNEAKERS = "Sneakers"
    CINNAMON_BUN = "Cinnamon bun"
    FRISBEE = "Frisbee"
    CLIMBING_BOOTS = "Climbing boots"
    PUFFER_HAT = "Puffer hat"
    SCARF = "Scarf"
    SKI_GOGGLES = "Ski goggles"
    SPACE_HELMET = "Space helmet"
    WATERGUN = "Water popper attachment"
    SUN_HAT = "Sun hat"
    MELONEAR = "Melonear"
    BANAKIN = "Banakin"
    ORANGANAS = "Oranganas"
    BEANUT = "Beanut"
    PICKAXE = "Pickaxe"
    SUN_CAP = "Sun cap"
    FLIP_FLOPS = "Flip-flops"
    ICE_CREAM = "Ice cream"
    ROYAL_CAPE = "Royal cape"
    MINIGAME_TICKET = "minigame ticket"
    LEI = "Lei"
    VACATION_SHIRT = "Vacation shirt"
    ROYAL_CANE = "Royal cane"
    EMPTY_BOTTLE = "Empty bottle"
    WATER_BOTTLE = "Water bottle"
    VIKING_HELMET = "Viking helmet"
    FOOT_CAST = "Foot cast"
    BERET = "Beret"

    PHOTO_OF_HOME_TAPE = "Jamal Green - Photo of Home"
    SQUIRREL_PHOTO_TAPE = "Launchable Socks - Squirrel Photography"


class ToemItem(Item):
    game: str = GAME_NAME


@dataclass(frozen=True)
class ItemData:
    classification: ItemClassification
    quantity: int
    group: str
    area: str


item_table: dict[str, ItemData] = {
    ItemName.HOMELANDA_STAMP: ItemData(
        ItemClassification.progression_skip_balancing, 3, ItemGroup.STAMP, Area.HOMELANDA
    ),
    ItemName.OAKLAVILLE_STAMP: ItemData(
        ItemClassification.progression_skip_balancing, 15, ItemGroup.STAMP, Area.OAKLAVILLE
    ),
    ItemName.STANHAMN_STAMP: ItemData(
        ItemClassification.progression_skip_balancing, 16, ItemGroup.STAMP, Area.STANHAMN
    ),
    ItemName.LOGCITY_STAMP: ItemData(ItemClassification.progression_skip_balancing, 18, ItemGroup.STAMP, Area.LOGCITY),
    ItemName.KIIRUBERG_STAMP: ItemData(
        ItemClassification.progression_skip_balancing, 13, ItemGroup.STAMP, Area.KIIRUBERG
    ),
    ItemName.BASTO_STAMP: ItemData(ItemClassification.progression_skip_balancing, 20, ItemGroup.STAMP, Area.BASTO),
    ItemName.COW_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.HOMELANDA),
    ItemName.FLIES_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.HOMELANDA),
    ItemName.HOME_BIRD_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.HOMELANDA),
    ItemName.TATO_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.HOMELANDA),
    ItemName.ANT_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.BEEHIVE_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.BUTTERFLY_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.OSKAR_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.SERO_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.FOREST_BIRD_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.LADYBUG_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.TOM_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.NESTWORM_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.PET_ROCK_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.SNAIL_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.SQUIRREL_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.STAG_BEETLE_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.TATO_BUG_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.TATO_FLY_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.OAKLAVILLE),
    ItemName.BUBBLE_FLY_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.FIA_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.FRAS_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.WILLEMIJN_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.CRAB_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.DRAGONFLY_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.HAPPY_CARP_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.JELLYFISH_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.KING_FISH_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.SEAGULL_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.SEAHORSE_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.SUNDAY_SWAN_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.TATO_SCUBA_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.TATO_SWIM_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.TOAD_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.STANHAMN),
    ItemName.BUSINESS_PIGEON_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.LOGCITY),
    ItemName.PORTILLO_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.LOGCITY),
    ItemName.MOUSE_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.LOGCITY),
    ItemName.PIGEON_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.LOGCITY),
    ItemName.PUNK_PARROT_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.LOGCITY),
    ItemName.TATO_SKATEBOARD_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.LOGCITY),
    ItemName.TATO_TOURIST_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.LOGCITY),
    ItemName.TURTLE_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.LOGCITY),
    ItemName.MIKEE_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.NARIKO_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.COSMO_DEER_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.TEDDY_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.FLUFF_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.HEDGEHOG_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.METEOPAL_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.GOAT_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.OWL_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.SNOW_BIRD_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.TATO_ALIEN_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.TATO_SKI_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.KIIRUBERG),
    ItemName.BAT_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.SNAKE_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.BEAK_BIRD_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.BITLING_FROG_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.BITLING_MOUSE_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.BITLING_SNAIL_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.BITLING_TATO_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.COCO_CRAB_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.DAY_LIZARD_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.DRILL_MOLE_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.EGGERT_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.FIRE_FLY_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.GLOW_WORM_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.ITSY_BITSY_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.MUD_FROG_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.NIGHT_LIZARD_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.SNOUT_BUG_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.TATO_COCO_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.TATO_KING_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.WATER_STRIDER_PHOTO: ItemData(ItemClassification.filler, 1, ItemGroup.PHOTO, Area.BASTO),
    ItemName.BACKPACK: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.HOMELANDA),
    ItemName.CAMERA: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.HOMELANDA),
    ItemName.CLOGS: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.HOMELANDA),
    ItemName.FINGER: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.OAKLAVILLE),
    ItemName.TRIPOD: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.OAKLAVILLE),
    ItemName.COWBOY_HAT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.OAKLAVILLE),
    ItemName.LOST_SOCK: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.OAKLAVILLE),
    ItemName.FJALLBJORN_HAT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.OAKLAVILLE),
    ItemName.GHOST_GLASSES: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.OAKLAVILLE),
    ItemName.SOAKED_SOCK: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.OAKLAVILLE),
    ItemName.MONSTER_MASK: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.OAKLAVILLE),
    ItemName.FRAMES_FILTERS: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.FISHING_HAT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.HONK_ATTACHMENT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.UMBRELLA: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.OLD_KEY: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.HARD_HAT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.DIVING_HELMET: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.RUBBER_BOOTS: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.FISHERMAN_WHISTLE: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.SANDWICH: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.PIRATE_HAT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.PAPER_HAT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.FLAG: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.STANHAMN),
    ItemName.HOTBEAN_HAT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.LOGCITY),
    ItemName.REPORTER_HAT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.LOGCITY),
    ItemName.MUDDY_CAMERA: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.LOGCITY),
    ItemName.SNEAKERS: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.LOGCITY),
    ItemName.CINNAMON_BUN: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.LOGCITY),
    ItemName.FRISBEE: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.LOGCITY),
    ItemName.CLIMBING_BOOTS: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.KIIRUBERG),
    ItemName.PUFFER_HAT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.KIIRUBERG),
    ItemName.SCARF: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.KIIRUBERG),
    ItemName.SKI_GOGGLES: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.KIIRUBERG),
    ItemName.SPACE_HELMET: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.KIIRUBERG),
    ItemName.WATERGUN: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.SUN_HAT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.MELONEAR: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.BANAKIN: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.ORANGANAS: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.BEANUT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.PICKAXE: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.SUN_CAP: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.FLIP_FLOPS: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.ICE_CREAM: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.ROYAL_CAPE: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.MINIGAME_TICKET: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.LEI: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.VACATION_SHIRT: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.ROYAL_CANE: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.EMPTY_BOTTLE: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.WATER_BOTTLE: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.VIKING_HELMET: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.FOOT_CAST: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.BERET: ItemData(ItemClassification.filler, 1, ItemGroup.ITEM, Area.BASTO),
    ItemName.PHOTO_OF_HOME_TAPE: ItemData(ItemClassification.filler, 1, ItemGroup.CASETTE, Area.HOMELANDA),
    ItemName.SQUIRREL_PHOTO_TAPE: ItemData(ItemClassification.filler, 1, ItemGroup.CASETTE, Area.OAKLAVILLE),
}

item_name_to_id: dict[str, int] = {name: i for i, name in enumerate(item_table, start=1)}


def get_item_group(item_name: str) -> str:
    return item_table[item_name].group


def get_item_area(location_name: str) -> str:
    return item_table[location_name].area


item_name_groups: dict[str, set[str]] = {
    group: set(item_names)
    for group, item_names in groupby(sorted(item_table, key=get_item_group), get_item_group)
    if group != ""
}
item_name_groups.update(
    {group: set(item_names) for group, item_names in groupby(sorted(item_table, key=get_item_area), get_item_area)}
)

filler_items: tuple[str, ...] = (
    ItemName.HOMELANDA_STAMP,
    ItemName.OAKLAVILLE_STAMP,
    ItemName.STANHAMN_STAMP,
    ItemName.LOGCITY_STAMP,
    ItemName.KIIRUBERG_STAMP,
)
