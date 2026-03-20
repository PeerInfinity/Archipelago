// presetResolver.js - Shared utility for resolving preset paths from preset_files.json data

/**
 * Resolves the first available preset rules path from parsed preset_files.json data.
 * Selects the first game alphabetically (case-insensitive), preferring seed 1.
 *
 * @param {Object} presetFilesData - Parsed content of preset_files.json
 * @returns {{ path: string, gameKey: string, gameName: string } | null}
 */
export function resolveFirstPresetPath(presetFilesData) {
  if (!presetFilesData) return null;

  // Filter out non-game keys (metadata, etc.) and find games with folders
  const gameKeys = Object.keys(presetFilesData).filter(key => {
    if (key === 'metadata') return false;
    const entry = presetFilesData[key];
    return entry && entry.folders && Object.keys(entry.folders).length > 0;
  });

  if (gameKeys.length === 0) return null;

  // Sort alphabetically (case-insensitive)
  gameKeys.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  // Get the first game alphabetically
  const firstGameKey = gameKeys[0];
  const gameEntry = presetFilesData[firstGameKey];
  const folders = gameEntry.folders;
  const folderNames = Object.keys(folders);

  if (folderNames.length === 0) return null;

  // Get the first folder (prefer seed 1 if available)
  let targetFolder = null;
  let targetFolderName = null;

  for (const folderName of folderNames) {
    const folderData = folders[folderName];
    if (folderData.seed === 1) {
      targetFolder = folderData;
      targetFolderName = folderName;
      break;
    }
  }

  // If no seed 1, use the first folder
  if (!targetFolder) {
    targetFolderName = folderNames[0];
    targetFolder = folders[targetFolderName];
  }

  // Find the rules file (standard, not player-specific)
  const files = targetFolder.files || [];
  const rulesFile = files.find(f => f.endsWith('_rules.json') && !f.includes('_P'));

  if (!rulesFile) return null;

  return {
    path: `./presets/${firstGameKey}/${targetFolderName}/${rulesFile}`,
    gameKey: firstGameKey,
    gameName: gameEntry.name || firstGameKey,
  };
}
