from dataclasses import dataclass
from typing import final

from .constants import Area


@final
class RegionName:
    MENU = "Menu"
    HOMELANDA = "Homelanda"
    OAKLAVILLE = "Oaklaville"
    STANHAMN = "Stanhamn"
    LOGCITY = "Logcity"
    KIIRUBERG = "Kiiruberg"
    MOUNTAIN_TOP = "Mountain Top"
    BASTO = "Basto"


@dataclass
class RegionData:
    area: str
    exits: tuple[str, ...] = ()


toem_regions: dict[str, RegionData] = {
    RegionName.HOMELANDA: RegionData(Area.HOMELANDA, exits=(RegionName.OAKLAVILLE,)),
    RegionName.OAKLAVILLE: RegionData(Area.OAKLAVILLE, exits=(RegionName.STANHAMN,)),
    RegionName.STANHAMN: RegionData(Area.STANHAMN, exits=(RegionName.LOGCITY,)),
    RegionName.LOGCITY: RegionData(Area.LOGCITY, exits=(RegionName.KIIRUBERG,)),
    RegionName.KIIRUBERG: RegionData(Area.KIIRUBERG, exits=(RegionName.MOUNTAIN_TOP,)),
    RegionName.MOUNTAIN_TOP: RegionData(Area.MOUNTAIN_TOP, exits=(RegionName.BASTO,)),
    RegionName.BASTO: RegionData(Area.BASTO),
}
