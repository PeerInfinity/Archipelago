// Create a stub implementation that will be replaced with a real instance later
// This avoids circular dependencies by not importing StateManager during module loading
const stubInstance = {
  // Stub implementation with dummy methods to prevent errors
  inventory: { has: () => false, count: () => 0, countGroup: () => 0 },
  helpers: { executeHelper: () => false },
  debugMode: false,
  regions: {},
  isRegionReachable: () => false,
  isLocationChecked: () => false,
  can_reach: () => false,
  state: { hasFlag: () => false },
};

// We'll start with the stub, then the initialize() function in index.js
// will replace this with the real instance
let instance = stubInstance;

export default {
  // Simple getter that returns whatever the current instance is
  get instance() {
    return instance;
  },

  // Method for index.js to replace the stub with a real instance
  setInstance(realInstance) {
    instance = realInstance;
    return instance;
  },
};
