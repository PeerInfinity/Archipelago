from BaseClasses import Location
from typing import Dict

base_location_id = 400000000

class CodingAdventureLocation(Location):
    game: str = "Coding Adventure"

class LocationData:
    def __init__(self, region: str, name: str, location_id: int = None, event: bool = False):
        self.region: str = region
        self.name: str = name
        self.location_id: int = location_id
        self.event: bool = event

location_table: Dict[str, LocationData] = {
    "Learn HTML": LocationData("VisualPath", "Learn HTML", 400000001),
    "Learn CSS": LocationData("VisualPath", "Learn CSS", 400000002),
    "Learn Design Systems": LocationData("VisualPath", "Learn Design Systems", 400000003),
    "Learn JavaScript": LocationData("LogicPath", "Learn JavaScript", 400000004),
    "Learn DOM Manipulation": LocationData("LogicPath", "Learn DOM Manipulation", 400000005),
    "Learn Algorithms": LocationData("LogicPath", "Learn Algorithms", 400000006),
    "Choose Server Language": LocationData("ServerPath", "Choose Server Language", 400000007),
    "Learn File I/O": LocationData("ServerPath", "Learn File I/O", 400000008),
    "Learn HTTP Basics": LocationData("ServerPath", "Learn HTTP Basics", 400000009),
    "Learn Git": LocationData("ToolsPath", "Learn Git", 400000010),
    "Learn Command Line": LocationData("ToolsPath", "Learn Command Line", 400000011),
    "Learn Package Managers": LocationData("ToolsPath", "Learn Package Managers", 400000012),
    "Static Website Milestone": LocationData("StaticWebsiteHub", "Static Website Milestone", 400000013),
    "Learn React": LocationData("ReactRoute", "Learn React", 400000014),
    "React Components": LocationData("ReactRoute", "React Components", 400000015),
    "Redux": LocationData("ReactRoute", "Redux", 400000016),
    "Learn Vue": LocationData("VueRoute", "Learn Vue", 400000017),
    "Vue Components": LocationData("VueRoute", "Vue Components", 400000018),
    "Vuex": LocationData("VueRoute", "Vuex", 400000019),
    "Advanced Vanilla JS": LocationData("VanillaRoute", "Advanced Vanilla JS", 400000020),
    "Custom State System": LocationData("VanillaRoute", "Custom State System", 400000021),
    "Learn Express": LocationData("ExpressRoute", "Learn Express", 400000022),
    "Build REST APIs": LocationData("ExpressRoute", "Build REST APIs", 400000023),
    "MongoDB Integration": LocationData("ExpressRoute", "MongoDB Integration", 400000024),
    "Learn Django": LocationData("DjangoRoute", "Learn Django", 400000025),
    "Django REST Framework": LocationData("DjangoRoute", "Django REST Framework", 400000026),
    "Django ORM": LocationData("DjangoRoute", "Django ORM", 400000027),
    "Learn Flask": LocationData("FlaskRoute", "Learn Flask", 400000028),
    "Flask-RESTful": LocationData("FlaskRoute", "Flask-RESTful", 400000029),
    "SQLAlchemy": LocationData("FlaskRoute", "SQLAlchemy", 400000030),
    "UI/UX Principles": LocationData("DesignTrack", "UI/UX Principles", 400000031),
    "Responsive Design": LocationData("DesignTrack", "Responsive Design", 400000032),
    "Accessibility": LocationData("DesignTrack", "Accessibility", 400000033),
    "Learn SQL": LocationData("SQLRoute", "Learn SQL", 400000034),
    "PostgreSQL": LocationData("SQLRoute", "PostgreSQL", 400000035),
    "Query Optimization": LocationData("SQLRoute", "Query Optimization", 400000036),
    "Learn NoSQL": LocationData("NoSQLRoute", "Learn NoSQL", 400000037),
    "MongoDB": LocationData("NoSQLRoute", "MongoDB", 400000038),
    "Indexing Strategies": LocationData("NoSQLRoute", "Indexing Strategies", 400000039),
    "Interactive App Milestone": LocationData("InteractiveAppHub", "Interactive App Milestone", 400000040),
    "Sessions": LocationData("AuthPath", "Sessions", 400000041),
    "JWT": LocationData("AuthPath", "JWT", 400000042),
    "OAuth": LocationData("AuthPath", "OAuth", 400000043),
    "Caching": LocationData("PerfPath", "Caching", 400000044),
    "CDN": LocationData("PerfPath", "CDN", 400000045),
    "Load Balancing": LocationData("PerfPath", "Load Balancing", 400000046),
    "Unit Tests": LocationData("TestPath", "Unit Tests", 400000047),
    "Integration Tests": LocationData("TestPath", "Integration Tests", 400000048),
    "E2E Tests": LocationData("TestPath", "E2E Tests", 400000049),
    "Docker": LocationData("DevOpsPath", "Docker", 400000050),
    "CI/CD": LocationData("DevOpsPath", "CI/CD", 400000051),
    "Monitoring": LocationData("DevOpsPath", "Monitoring", 400000052),
    "Full-Stack Integration Milestone": LocationData("FullStackHub", "Full-Stack Integration Milestone", 400000053),
    "HTTPS": LocationData("SecurityBranch", "HTTPS", 400000054),
    "CORS": LocationData("SecurityBranch", "CORS", 400000055),
    "Input Validation": LocationData("SecurityBranch", "Input Validation", 400000056),
    "Horizontal Scaling": LocationData("ScalingBranch", "Horizontal Scaling", 400000057),
    "Microservices": LocationData("ScalingBranch", "Microservices", 400000058),
    "Cloud Provider": LocationData("DeploymentBranch", "Cloud Provider", 400000059),
    "Domain Setup": LocationData("DeploymentBranch", "Domain Setup", 400000060),
    "SSL Certificate": LocationData("DeploymentBranch", "SSL Certificate", 400000061),
    "Production Deployment": LocationData("ProductionHub", "Production Deployment", None, event=True),
}