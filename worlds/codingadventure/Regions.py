from BaseClasses import MultiWorld, Region, Entrance
from .Locations import location_table, CodingAdventureLocation

def create_regions(multiworld: MultiWorld, player: int) -> None:
    regions = {}
    
    region_names = [
        "Menu", "LearningHub", "VisualPath", "LogicPath", "ServerPath", "ToolsPath",
        "StaticWebsiteHub", "FrontendTrack", "ReactRoute", "VueRoute", "VanillaRoute",
        "BackendTrack", "ExpressRoute", "DjangoRoute", "FlaskRoute",
        "DesignTrack", "DataTrack", "SQLRoute", "NoSQLRoute",
        "InteractiveAppHub", "AuthPath", "PerfPath", "TestPath", "DevOpsPath",
        "FullStackHub", "SecurityBranch", "ScalingBranch", "DeploymentBranch",
        "ProductionHub"
    ]
    
    for region_name in region_names:
        region = Region(region_name, player, multiworld)
        regions[region_name] = region
        multiworld.regions.append(region)
    
    for location_name, location_data in location_table.items():
        region = regions[location_data.region]
        location = CodingAdventureLocation(player, location_name, location_data.location_id, region)
        
        if location_data.event:
            location.event = True
        
        region.locations.append(location)
    
    create_entrance(regions["Menu"], regions["LearningHub"], "StartLearning")
    
    create_entrance(regions["LearningHub"], regions["VisualPath"], "ToVisualPath")
    create_entrance(regions["LearningHub"], regions["LogicPath"], "ToLogicPath")
    create_entrance(regions["LearningHub"], regions["ServerPath"], "ToServerPath")
    create_entrance(regions["LearningHub"], regions["ToolsPath"], "ToToolsPath")
    create_entrance(regions["LearningHub"], regions["StaticWebsiteHub"], "ToStaticWebsite")
    
    create_entrance(regions["StaticWebsiteHub"], regions["FrontendTrack"], "ToFrontendTrack")
    create_entrance(regions["StaticWebsiteHub"], regions["BackendTrack"], "ToBackendTrack")
    create_entrance(regions["StaticWebsiteHub"], regions["DesignTrack"], "ToDesignTrack")
    create_entrance(regions["StaticWebsiteHub"], regions["DataTrack"], "ToDataTrack")
    create_entrance(regions["StaticWebsiteHub"], regions["InteractiveAppHub"], "ToInteractiveApp")
    
    create_entrance(regions["FrontendTrack"], regions["ReactRoute"], "ToReactRoute")
    create_entrance(regions["FrontendTrack"], regions["VueRoute"], "ToVueRoute")
    create_entrance(regions["FrontendTrack"], regions["VanillaRoute"], "ToVanillaRoute")
    
    create_entrance(regions["BackendTrack"], regions["ExpressRoute"], "ToExpressRoute")
    create_entrance(regions["BackendTrack"], regions["DjangoRoute"], "ToDjangoRoute")
    create_entrance(regions["BackendTrack"], regions["FlaskRoute"], "ToFlaskRoute")
    
    create_entrance(regions["DataTrack"], regions["SQLRoute"], "ToSQLRoute")
    create_entrance(regions["DataTrack"], regions["NoSQLRoute"], "ToNoSQLRoute")
    
    create_entrance(regions["InteractiveAppHub"], regions["AuthPath"], "ToAuthPath")
    create_entrance(regions["InteractiveAppHub"], regions["PerfPath"], "ToPerfPath")
    create_entrance(regions["InteractiveAppHub"], regions["TestPath"], "ToTestPath")
    create_entrance(regions["InteractiveAppHub"], regions["DevOpsPath"], "ToDevOpsPath")
    create_entrance(regions["InteractiveAppHub"], regions["FullStackHub"], "ToFullStackHub")
    
    create_entrance(regions["FullStackHub"], regions["SecurityBranch"], "ToSecurityBranch")
    create_entrance(regions["FullStackHub"], regions["ScalingBranch"], "ToScalingBranch")
    create_entrance(regions["FullStackHub"], regions["DeploymentBranch"], "ToDeploymentBranch")
    create_entrance(regions["FullStackHub"], regions["ProductionHub"], "ToProduction")

def create_entrance(source: Region, target: Region, name: str) -> None:
    entrance = Entrance(source.player, name, source)
    entrance.connect(target)
    source.exits.append(entrance)