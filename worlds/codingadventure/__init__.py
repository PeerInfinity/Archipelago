from typing import Dict, ClassVar
from BaseClasses import Item, ItemClassification, MultiWorld, Tutorial
from worlds.AutoWorld import WebWorld, World
from .Items import item_table, WebDevJourneyItem
from .Locations import location_table
from .Options import WebDevJourneyOptions
from .Regions import create_regions
from .Rules import set_rules

class WebDevJourneyWeb(WebWorld):
    theme = "ocean"
    tutorials = []

class WebDevJourneyWorld(World):
    """
    WebDevJourney is an educational game that takes you through the complete journey 
    of becoming a web developer, from learning HTML/CSS basics to deploying 
    production-ready full-stack applications.
    """
    
    game: ClassVar[str] = "WebDevJourney"
    web: ClassVar[WebWorld] = WebDevJourneyWeb()
    
    options_dataclass = WebDevJourneyOptions
    
    item_name_to_id: ClassVar[Dict[str, int]] = {
        name: data.id for name, data in item_table.items() if data.id is not None
    }
    
    location_name_to_id: ClassVar[Dict[str, int]] = {
        name: data.location_id for name, data in location_table.items() if data.location_id is not None
    }
    
    def generate_early(self) -> None:
        # If seed is 1, disable randomization to use canonical item placements
        if self.multiworld.seed == 1:
            self.options.randomize_items.value = False
    
    def create_regions(self) -> None:
        create_regions(self.multiworld, self.player)
    
    def set_rules(self) -> None:
        set_rules(self)
    
    def create_items(self) -> None:
        if not self.options.randomize_items.value:
            self._place_original_items()
        else:
            item_pool = []
            items_to_create = {
                "HTML": 1,
                "CSS": 1,
                "Design Systems": 1,
                "JavaScript Basics": 1,
                "DOM Manipulation": 1,
                "Algorithms": 1,
                "Server Basics": 1,
                "File I/O": 1,
                "HTTP Basics": 1,
                "Git": 1,
                "Command Line": 1,
                "Package Managers": 1,
                "Static Website Complete": 1,
                "React": 1,
                "Vue": 1,
                "Frontend Framework": 3,
                "State Management": 3,
                "Express": 1,
                "Django": 1,
                "Flask": 1,
                "REST APIs": 3,
                "Database Integration": 3,
                "UI/UX": 1,
                "Responsive Design": 1,
                "Accessibility": 1,
                "SQL": 1,
                "NoSQL": 1,
                "Database Basics": 2,
                "Query Optimization": 2,
                "Interactive App Complete": 1,
                "Sessions": 1,
                "JWT": 1,
                "Authentication": 1,
                "Caching": 1,
                "CDN": 1,
                "Performance": 1,
                "Unit Tests": 1,
                "Integration Tests": 1,
                "Testing": 1,
                "Docker": 1,
                "CI/CD": 1,
                "DevOps": 1,
                "Full-Stack Complete": 1,
                "HTTPS": 1,
                "CORS": 1,
                "Security Complete": 1,
                "Horizontal Scaling": 1,
                "Scaling Complete": 1,
                "Cloud Provider": 1,
                "Domain": 1,
                "Deployment Complete": 1
            }
            
            for name, count in items_to_create.items():
                data = item_table[name]
                for _ in range(count):
                    item = WebDevJourneyItem(name, data.classification, data.id, self.player)
                    item_pool.append(item)
            
            self.multiworld.itempool += item_pool
    
    def _place_original_items(self) -> None:
        """Place items in canonical locations when randomization is disabled."""
        original_placements = {
            "Learn HTML": "HTML",
            "Learn CSS": "CSS",
            "Learn Design Systems": "Design Systems",
            "Learn JavaScript": "JavaScript Basics",
            "Learn DOM Manipulation": "DOM Manipulation",
            "Learn Algorithms": "Algorithms",
            "Choose Server Language": "Server Basics",
            "Learn File I/O": "File I/O",
            "Learn HTTP Basics": "HTTP Basics",
            "Learn Git": "Git",
            "Learn Command Line": "Command Line",
            "Learn Package Managers": "Package Managers",
            "Static Website Milestone": "Static Website Complete",
            "Learn React": "React",
            "React Components": "Frontend Framework",
            "Redux": "State Management",
            "Learn Vue": "Vue",
            "Vue Components": "Frontend Framework",
            "Vuex": "State Management",
            "Advanced Vanilla JS": "Frontend Framework",
            "Custom State System": "State Management",
            "Learn Express": "Express",
            "Build REST APIs": "REST APIs",
            "MongoDB Integration": "Database Integration",
            "Learn Django": "Django",
            "Django REST Framework": "REST APIs",
            "Django ORM": "Database Integration",
            "Learn Flask": "Flask",
            "Flask-RESTful": "REST APIs",
            "SQLAlchemy": "Database Integration",
            "UI/UX Principles": "UI/UX",
            "Responsive Design": "Responsive Design",
            "Accessibility": "Accessibility",
            "Learn SQL": "SQL",
            "PostgreSQL": "Database Basics",
            "Query Optimization": "Query Optimization",
            "Learn NoSQL": "NoSQL",
            "MongoDB": "Database Basics",
            "Indexing Strategies": "Query Optimization",
            "Interactive App Milestone": "Interactive App Complete",
            "Sessions": "Sessions",
            "JWT": "JWT",
            "OAuth": "Authentication",
            "Caching": "Caching",
            "CDN": "CDN",
            "Load Balancing": "Performance",
            "Unit Tests": "Unit Tests",
            "Integration Tests": "Integration Tests",
            "E2E Tests": "Testing",
            "Docker": "Docker",
            "CI/CD": "CI/CD",
            "Monitoring": "DevOps",
            "Full-Stack Integration Milestone": "Full-Stack Complete",
            "HTTPS": "HTTPS",
            "CORS": "CORS",
            "Input Validation": "Security Complete",
            "Horizontal Scaling": "Horizontal Scaling",
            "Microservices": "Scaling Complete",
            "Cloud Provider": "Cloud Provider",
            "Domain Setup": "Domain",
            "SSL Certificate": "Deployment Complete"
        }
        
        for location_name, item_name in original_placements.items():
            location = self.multiworld.get_location(location_name, self.player)
            item_data = item_table[item_name]
            item = WebDevJourneyItem(item_name, item_data.classification, item_data.id, self.player)
            location.place_locked_item(item)
    
    def create_item(self, name: str) -> Item:
        data = item_table[name]
        return WebDevJourneyItem(name, data.classification, data.id, self.player)
    
    def generate_basic(self) -> None:
        """Place Victory event at the Victory location."""
        victory_location = self.multiworld.get_location("Production Deployment", self.player)
        victory_item = WebDevJourneyItem("Victory", item_table["Victory"].classification, None, self.player)
        victory_location.place_locked_item(victory_item)
        
        self.multiworld.completion_condition[self.player] = lambda state: state.has("Victory", self.player)
    
    def fill_slot_data(self) -> Dict:
        return {}