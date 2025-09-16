import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use relative path from scripts directory
const projectRoot = path.join(__dirname, '..');
const modulesDir = path.join(projectRoot, 'frontend', 'modules');

// Function to extract moduleInfo from a file
function extractModuleInfo(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Look for export const moduleInfo = { ... }
    const moduleInfoMatch = content.match(/export\s+const\s+moduleInfo\s*=\s*\{([^}]*)\}/s);

    if (!moduleInfoMatch) {
      return null;
    }

    const moduleInfoContent = moduleInfoMatch[1];

    // Parse the moduleInfo object (simplified parser)
    const moduleInfo = {};

    // Extract simple string/number fields
    const fields = ['name', 'title', 'componentType', 'icon', 'column', 'description'];
    fields.forEach(field => {
      const regex = new RegExp(`${field}\\s*:\\s*['"\`]([^'"\`]*?)['"\`]`, 's');
      const match = moduleInfoContent.match(regex);
      if (match) {
        moduleInfo[field] = match[1];
      }
    });

    // Handle column as number
    const columnMatch = moduleInfoContent.match(/column\s*:\s*(\d+)/);
    if (columnMatch) {
      moduleInfo.column = parseInt(columnMatch[1]);
    }

    // Check for any additional fields (arrays, objects, etc.)
    // Look for other field patterns
    const allFieldMatches = moduleInfoContent.matchAll(/(\w+)\s*:\s*(?:['"`.{[]|true|false|\d)/g);
    for (const match of allFieldMatches) {
      const field = match[1];
      if (!moduleInfo.hasOwnProperty(field) && !fields.includes(field)) {
        moduleInfo[field] = '✓'; // Mark as present but don't parse complex values
      }
    }

    return moduleInfo;
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

// Get all modules
const modules = [];
const allFields = new Set(['name', 'title', 'componentType', 'icon', 'column', 'description']);

// Scan all module directories
const modulesDirs = fs.readdirSync(modulesDir);
for (const moduleDir of modulesDirs) {
  const modulePath = path.join(modulesDir, moduleDir);
  const indexPath = path.join(modulePath, 'index.js');

  if (fs.existsSync(indexPath) && fs.statSync(modulePath).isDirectory()) {
    const moduleInfo = extractModuleInfo(indexPath);

    if (moduleInfo) {
      // Track all fields we've seen
      Object.keys(moduleInfo).forEach(field => allFields.add(field));

      modules.push({
        directory: moduleDir,
        ...moduleInfo
      });
    } else {
      // Module exists but has no moduleInfo
      modules.push({
        directory: moduleDir,
        noModuleInfo: true
      });
    }
  }
}

// Sort modules alphabetically by directory name
modules.sort((a, b) => {
  return (a.directory || '').localeCompare(b.directory || '');
});

// Convert set to sorted array
const fieldsList = Array.from(allFields).sort((a, b) => {
  // Priority order for common fields
  const priority = ['name', 'title', 'componentType', 'icon', 'column', 'description'];
  const aIndex = priority.indexOf(a);
  const bIndex = priority.indexOf(b);

  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
  if (aIndex !== -1) return -1;
  if (bIndex !== -1) return 1;

  return a.localeCompare(b);
});

// Split modules into two groups
const modulesWithComponent = modules.filter(m => !m.noModuleInfo && m.componentType);
const modulesWithoutComponent = modules.filter(m => m.noModuleInfo || !m.componentType);

// Generate markdown table
let markdown = `# Module Info Status Report

Generated: ${new Date().toISOString()}

## Summary

- Total modules scanned: ${modulesDirs.length}
- Modules with moduleInfo: ${modules.filter(m => !m.noModuleInfo).length}
- Modules without moduleInfo: ${modules.filter(m => m.noModuleInfo).length}
- Modules with componentType (panels): ${modulesWithComponent.length}
- Modules without componentType (non-panels): ${modulesWithoutComponent.length}

## Panel Modules (with componentType)

| Module | ${fieldsList.join(' | ')} |
|--------|${fieldsList.map(() => '---').join('|')}|
`;

// Add panel module rows
for (const module of modulesWithComponent) {
  const cells = [module.directory];

  for (const field of fieldsList) {
    const value = module[field];
    if (value === undefined || value === null || value === '') {
      cells.push('❌');
    } else if (value === '✓') {
      cells.push('✓');
    } else if (field === 'column') {
      const columnName = value === 1 ? 'Left' : value === 2 ? 'Middle' : value === 3 ? 'Right' : value.toString();
      cells.push(columnName);
    } else if (field === 'icon') {
      cells.push(value || '❌');
    } else {
      // Truncate long values
      const displayValue = value.length > 30 ? value.substring(0, 27) + '...' : value;
      cells.push(displayValue);
    }
  }

  markdown += `| ${cells.join(' | ')} |\n`;
}

// Add non-panel modules table
markdown += `
## Non-Panel Modules (without componentType)

| Module | ${fieldsList.join(' | ')} |
|--------|${fieldsList.map(() => '---').join('|')}|
`;

// Add non-panel module rows
for (const module of modulesWithoutComponent) {
  if (module.noModuleInfo) {
    markdown += `| ${module.directory} | ${fieldsList.map(() => '❌').join(' | ')} |\n`;
  } else {
    const cells = [module.directory];

    for (const field of fieldsList) {
      const value = module[field];
      if (value === undefined || value === null || value === '') {
        cells.push('❌');
      } else if (value === '✓') {
        cells.push('✓');
      } else if (field === 'column') {
        const columnName = value === 1 ? 'Left' : value === 2 ? 'Middle' : value === 3 ? 'Right' : value.toString();
        cells.push(columnName);
      } else if (field === 'icon') {
        cells.push(value || '❌');
      } else {
        // Truncate long values
        const displayValue = value.length > 30 ? value.substring(0, 27) + '...' : value;
        cells.push(displayValue);
      }
    }

    markdown += `| ${cells.join(' | ')} |\n`;
  }
}

// Add legend
markdown += `
## Legend

- ✓ = Field is present
- ❌ = Field is missing or empty
- Column values: Left (1), Middle (2), Right (3)

## Modules Without ModuleInfo

The following modules do not have moduleInfo exported:
`;

const modulesWithoutInfo = modules.filter(m => m.noModuleInfo);
if (modulesWithoutInfo.length > 0) {
  for (const module of modulesWithoutInfo.sort((a, b) => a.directory.localeCompare(b.directory))) {
    markdown += `- ${module.directory}\n`;
  }
} else {
  markdown += `\nNone - all modules have moduleInfo!\n`;
}

// Add recommendations section
markdown += `
## Recommendations

Based on the analysis, consider adding the following fields to modules that are missing them:

1. **icon** - Visual identifier for the module (emoji or icon)
2. **description** - Brief description of what the module does
3. **column** - Layout column position (1=left, 2=middle, 3=right)
4. **dependencies** - List of other modules this module depends on
5. **version** - Module version for tracking updates
6. **author** - Module author information
7. **tags** - Categorization tags for filtering/searching

## Statistics by Column

`;

// Column statistics for panel modules only
const columnStats = { 1: [], 2: [], 3: [], undefined: [] };
for (const module of modulesWithComponent) {
  const col = module.column || 'undefined';
  columnStats[col] = columnStats[col] || [];
  columnStats[col].push(module.directory);
}

markdown += `| Column | Count | Modules |\n`;
markdown += `|--------|-------|---------|\n`;
markdown += `| Left (1) | ${columnStats[1].length} | ${columnStats[1].sort().join(', ') || 'None'} |\n`;
markdown += `| Middle (2) | ${columnStats[2].length} | ${columnStats[2].sort().join(', ') || 'None'} |\n`;
markdown += `| Right (3) | ${columnStats[3].length} | ${columnStats[3].sort().join(', ') || 'None'} |\n`;
markdown += `| Unspecified | ${columnStats.undefined.length} | ${columnStats.undefined.sort().join(', ') || 'None'} |\n`;

// Write the markdown file
const outputPath = path.join(projectRoot, 'docs', 'json', 'developer', 'guides', 'module_info_status.md');

// Ensure the directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, markdown);

console.log(`✅ Module info status report generated: ${outputPath}`);
console.log(`\nSummary:`);
console.log(`  - Total modules: ${modulesDirs.length}`);
console.log(`  - With moduleInfo: ${modules.filter(m => !m.noModuleInfo).length}`);
console.log(`  - Without moduleInfo: ${modules.filter(m => m.noModuleInfo).length}`);
console.log(`  - Unique fields found: ${fieldsList.join(', ')}`);