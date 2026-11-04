(function () {
  const modern = window.spine;
  const loaded = new Map([['4.3', Promise.resolve(modern)]]);
  const scripts = new Map();
  let queue = Promise.resolve();

  function loadScript(src) {
    if (scripts.has(src)) return scripts.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => { script.remove(); resolve(); };
      script.onerror = () => { script.remove(); scripts.delete(src); reject(new Error(`Could not load the bundled runtime: ${src}`)); };
      document.head.append(script);
    });
    scripts.set(src, promise);
    return promise;
  }

  function load(series) {
    if (loaded.has(series)) return loaded.get(series);
    const descriptor = window.spineRuntimeCatalog[series];
    if (!descriptor) return Promise.reject(new Error(`No runtime is bundled for Spine ${series}.`));
    // Older player bundles publish window.spine. Load them sequentially, retain
    // each namespace, and restore the main namespace before rendering resumes.
    const promise = queue.then(async () => {
      try {
        if (descriptor.kind === 'player') window.spine = undefined;
        for (const script of descriptor.scripts) await loadScript(script);
        const runtime = descriptor.namespace ? window[descriptor.namespace] : window.spine;
        if (!runtime?.SkeletonJson || (!runtime.SkeletonBinary && !descriptor.binaryDecoder) || (descriptor.kind === 'player' && !runtime.SpinePlayer)) {
          throw new Error(`The Spine ${series} runtime did not initialize.`);
        }
        return runtime;
      } finally { window.spine = modern; }
    });
    loaded.set(series, promise);
    queue = promise.catch(() => { loaded.delete(series); });
    return promise;
  }
  window.SpineRuntimeLoader = { load, atlasRuntime: modern };
})();
