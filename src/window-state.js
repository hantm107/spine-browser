const fs = require('node:fs');
const path = require('node:path');

function createWindowStateStore(file) {
  let states = {};
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) states = saved;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Could not load window sizes:', error.message);
  }

  function options(key, defaults, workArea) {
    const saved = states[key];
    if (!Number.isSafeInteger(saved?.width) || !Number.isSafeInteger(saved?.height)
      || saved.width <= 0 || saved.height <= 0) return { ...defaults };
    const fit = (value, minimum, available) => Math.max(minimum, Math.min(value, available));
    return { ...defaults,
      width: fit(saved.width, defaults.minWidth, workArea.width),
      height: fit(saved.height, defaults.minHeight, workArea.height),
    };
  }

  function track(win, key) {
    let maximized = states[key]?.maximized === true;
    win.on('maximize', () => { maximized = true; });
    win.on('unmaximize', () => { maximized = false; });
    // Save once on close, rather than doing filesystem work during resizing.
    win.on('close', () => {
      const { width, height } = win.getNormalBounds();
      states[key] = { width, height, maximized: win.isMinimized() ? maximized : win.isMaximized() };
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file + '.tmp', JSON.stringify(states));
        fs.renameSync(file + '.tmp', file);
      } catch (error) { console.warn('Could not save window sizes:', error.message); }
    });
    if (maximized) win.maximize();
  }

  return { options, track };
}

module.exports = { createWindowStateStore };
