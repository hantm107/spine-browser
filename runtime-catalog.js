// Shared by the main process and renderer: one matching runtime per export series.
(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.spineRuntimeCatalog = catalog;
})(typeof window === 'undefined' ? globalThis : window, () => ({
  '2.0': { runtime: 'legacy20', kind: 'legacy', version: '2.0', namespace: 'spine21', binaryDecoder: 'old', scripts: ['vendor/spine-webgl-3.4.js', 'vendor/spine-core-2.1.js', 'old-spine-decoder.js', 'vendor/spine-2x-bridge.js'] },
  '2.1': { runtime: 'legacy21', kind: 'legacy', version: '2.1', namespace: 'spine21', binaryDecoder: 'old', scripts: ['vendor/spine-webgl-3.4.js', 'vendor/spine-core-2.1.js', 'old-spine-decoder.js', 'vendor/spine-2x-bridge.js'] },
  '3.0': { runtime: 'legacy30', kind: 'legacy', version: '3.0', namespace: 'spine34', binaryDecoder: 'old', scripts: ['vendor/spine-webgl-3.4.js', 'old-spine-decoder.js'] },
  '3.1': { runtime: 'legacy31', kind: 'legacy', version: '3.1', namespace: 'spine34', binaryDecoder: 'old', scripts: ['vendor/spine-webgl-3.4.js', 'old-spine-decoder.js'] },
  '3.3': { runtime: 'legacy33', kind: 'legacy', version: '3.3', namespace: 'spine34', binaryDecoder: 'old', scripts: ['vendor/spine-webgl-3.4.js', 'old-spine-decoder.js'] },
  '3.2': { runtime: 'legacy32', kind: 'legacy', version: '3.2', namespace: 'spine34', binaryDecoder: 'old', scripts: ['vendor/spine-webgl-3.4.js', 'old-spine-decoder.js'] },
  '3.4': { runtime: 'legacy34', kind: 'legacy', version: '3.4', namespace: 'spine34', binaryDecoder: 'old', scripts: ['vendor/spine-webgl-3.4.js', 'old-spine-decoder.js'] },
  '3.5': { runtime: 'legacy35', kind: 'legacy', version: '3.5', namespace: 'spine36', binaryDecoder: 'old', scripts: ['vendor/spine-webgl-3.6.js', 'old-spine-decoder.js'] },
  '3.6': { runtime: 'legacy36', kind: 'legacy', version: '3.6', namespace: 'spine36', scripts: ['vendor/spine-webgl-3.6.js'] },
  '3.7': { runtime: 'legacy37', kind: 'legacy', version: '3.7', namespace: 'spine37', scripts: ['vendor/spine-webgl-3.7.js', 'vendor/spine-binary-3.7.js'] },
  '3.8': { runtime: 'legacy38', kind: 'legacy', version: '3.8', namespace: 'spine38', scripts: ['vendor/spine-webgl-3.8.js'] },
  '4.0': { runtime: 'player40', kind: 'player', version: '4.0.31', scripts: ['node_modules/spine-player-40/dist/iife/spine-player.js'] },
  '4.1': { runtime: 'player41', kind: 'player', version: '4.1.56', scripts: ['node_modules/spine-player-41/dist/iife/spine-player.js'] },
  '4.2': { runtime: 'player42', kind: 'player', version: '4.2.120', scripts: ['node_modules/spine-player-42/dist/iife/spine-player.js'] },
  '4.3': { runtime: 'modern', kind: 'player', version: '4.3.13', scripts: [] },
}));
