# Source audit — 23 October 2026

**Implementation update:** The findings below describe the original source; their line numbers refer to that version. Fixes have now been implemented. The app automatically loads local runtimes or compatibility adapters for 3.2, 3.4, 3.6, 3.7, 3.8, 4.0, 4.1, 4.2, and 4.3 exports, removes editor subprocesses from previews, and repairs autoplay, resolution, preview lifecycle, errors, scanning, styling, and filename handling. See [README.md](README.md) for supported playback and `npm test` for regression checks. The original sample files remain unchanged. Runtime provenance is recorded in [vendor/README.md](vendor/README.md).

The application starts and loads its preload API and Spine library. The preview failures have multiple causes. The first is an external-editor version check that waits for the editor to exit; the second is a mismatch between the supplied Spine 3.6.52 assets and the bundled Spine 4.3.13 runtime. Fixing the wait alone will not make those assets playable.

Application source files were left unchanged. This report covers `main.js`, `preload.js`, `renderer.js`, `index.html`, `style.css`, package manifests, installed runtime implementation, sample asset headers, and the existing JVM crash log.

## Findings, in repair order

### 1. Preview waits for an editor process instead of checking the bundled runtime — P1

**Location:** `main.js:20–33`, `main.js:50–74`, `renderer.js:158`.

Every selection awaits `detectSpineVersion`, which executes `C:\Program Files\Spine\Spine.exe --version`. On this machine that launches Spine 3.8.99 Professional. A bounded diagnostic invocation was still running after six seconds and had to be terminated. The application has no timeout and its `execFile` callback only resolves after the process exits. A preview can therefore wait indefinitely while an external editor is open. There is also no cached result, so repeated selections can launch additional editor processes.

**Repair:** Determine the runtime version from the bundled library/package. Preview playback should not launch or depend on the external editor.

### 2. Sample exports cannot be parsed by the bundled runtime; the compatibility check approves them — P1

**Location:** `package.json:12–13`, `main.js:55–73`, `renderer.js:158–164`.

The installed player/core are **4.3.13**. All three local copies of `effect_skill3_hit.skel` identify themselves as **3.6.52**. The backup, `converted_sample_001`, and import-test copies have identical SHA-256 hashes (`c0a080e9dd3e3792759c8874317ce8df8049cbb978d26db7d3aabc91aa44b15f`): the file in the converted folder has not changed format.

After bypassing the external-process wait, the actual Electron player fails on this sample with **`Error: Could not load skeleton data. Offset is outside the bounds of the DataView`**.

Compatibility currently compares the export against the installed **editor**, and compares only major versions. With the observed editor version supplied, it reports `{fileVersion: '3.6.52', runtimeVersion: '3.8.99', mismatch: false}`. Conversely, a valid 4.3 export is rejected when the external editor is 3.8. If Spine is not installed, the function returns without even reading the export's version.

**Repair:** Match the export's major **and minor** version against the runtime actually rendering it. To support these assets, provide a compatible 3.6 runtime path or re-export the projects with the chosen supported editor/runtime version. Changing the version string is not a conversion. See the [official versioning requirements](https://en.esotericsoftware.com/spine-versioning).

### 3. Binary skeletons never receive an initial animation — P1

**Location:** `renderer.js:119–135`, `renderer.js:187`, `renderer.js:215–219`.

`getAnimationName` returns `null` for every `.skel`, so `playerOptions.animation` is omitted. The installed 4.3 player does not automatically choose the first animation: without an animation or a track established in a success callback, it creates an empty animation and pauses.

Confirmed with the actual player using a compatible fixture and the same omitted-animation configuration: the skeleton loads, `idle` is available, but `paused` is `true` and the track is `<empty>`.

**Repair:** Use the player's success callback to inspect loaded skeleton animation names, preserve the exact name, and select/play an initial animation. This works for binary and JSON exports.

### 4. Asset resolution can combine unrelated files, or send an editor project to the runtime — P1

**Location:** `main.js:142–187`.

The resolver falls back to the first binary skeleton and first atlas. An exact JSON match loses to any unrelated `.skel` because the binary fallback comes earlier. If no runtime export exists but an atlas and matching `.spine` do, it returns the editor project as `skeletonPath`; the web player then treats that project as exported binary data.

Reproduced fixtures:

- Selecting `alpha.skel` with no matching atlas resolved `alpha.skel + beta.atlas`.
- Selecting `valid.spine` with `valid.json + valid.atlas` and an unrelated `alpha.skel` resolved `alpha.skel + valid.atlas`.
- A raw `raw.spine + raw.atlas` resolved the `.spine` file as playable skeleton data.

**Repair:** Prefer the selected export itself; find its matching atlas. For editor projects, resolve exports explicitly and reject ambiguous choices. Raw projects should take the existing open-in-editor path.

### 5. Missing assets and early failures leave a blank or stale preview — P1

**Location:** `renderer.js:144–164`, `renderer.js:174–224`.

`previewBox.innerHTML = ''` removes the status paragraphs, then `assignPreviewText` attempts to update those removed elements. A missing texture reproduced an empty preview with zero children and no visible error message. The same issue affects loading/success text. Failures that occur asynchronously inside the player are outside the surrounding `try/catch`; there is no player `error` callback.

Conversely, the no-assets and mismatch branches return before disposing the previous player. Selecting a project with no exports after a failed sample retained the previous player and its error message. Asset resolution and version detection also sit outside the `try` block, so IPC failures there reject the selection without an application error state.

**Repair:** Keep a persistent status element, replace preview content deliberately, dispose the previous player at selection start, and handle both IPC errors and the player's asynchronous error callback.

### 6. Concurrent selections can display the wrong project — P2

**Location:** `renderer.js:138–226`, `renderer.js:228–237`, `renderer.js:240–295`.

There is no selection token/cancellation check after awaits. With a controlled delay on project A's asset resolution, selecting A then B produced `selectedProject = B` while the active player's skeleton URL pointed to A. Clearing selection while A was loading still allowed A to create a new player afterward. Interleavings later in loading can also leave multiple player instances, including instances no longer tracked by `activePlayer`.

**Repair:** Invalidate earlier preview requests when selection changes and verify the current request before changing UI or creating a player; dispose superseded instances.

### 7. JSON-only exports never appear in the browser — P2

**Location:** `main.js:105–108`.

Scanning accepts `.spine` and `.skel`, despite the resolver, preview code, and UI supporting JSON exports. Scanning a compatible `valid.json + valid.atlas` fixture returned `[]`, even though it loaded successfully when invoked directly after bypassing the editor-version gate.

**Repair:** Discover JSON skeleton exports, validate that they contain skeleton data, and associate them with atlases without listing unrelated application JSON files.

### 8. The player's required stylesheet is missing — P2

**Location:** `index.html:7`, `index.html:76`, `style.css:185–204`.

Only `style.css` is loaded. The installed runtime ships `dist/spine-player.css`, but it is never linked. In a loaded compatible fixture, the canvas was only 300 × 150, player control buttons had no background icons, and runtime hidden/control classes had no supporting styles. The preview's flex alignment and minimum height also do not establish a full-size player host.

**Repair:** Load the bundled player stylesheet and give its host a defined usable width and height. See the [official player integration](https://en.esotericsoftware.com/spine-player).

### 9. Preferred animation selection loses letter casing — P2

**Location:** `renderer.js:130–132`.

The code matches animation names case-insensitively but returns the lowercase preference, rather than the actual animation name. For a file containing only `Idle`, the function returns `idle`; the runtime's animation lookup requires the exact name.

**Repair:** Return the matching entry from `animationNames`.

### 10. File and folder names are interpreted as HTML — P2

**Location:** `renderer.js:66–76`, `renderer.js:110–113`.

Names and paths are interpolated directly into `innerHTML`. A synthetic project name containing a `<b>` element was parsed as markup. Real names containing markup characters can damage layout; specially constructed imported folders can inject renderer content, where filesystem and editor-launch APIs are exposed by the preload bridge.

**Repair:** Construct list/header elements and assign names/paths with `textContent` and dataset properties.

### 11. One unreadable or disappearing directory aborts the entire scan — P2

**Location:** `main.js:96–113`, `renderer.js:240–247`.

The recursive walker has no per-directory or per-file error handling, and the caller does not catch scan errors. A missing directory reproduced an IPC rejection. A permission error anywhere below a selected root takes the same path, so successfully discovered entries are lost and no helpful scan status is displayed.

**Repair:** Catch errors at the appropriate filesystem boundary, preserve readable results, and surface skipped paths or fatal root errors in the UI.

### 12. Open-in-Spine can report success when opening failed — P2

**Location:** `main.js:263–281`.

The explicit editor path returns `true` before `execFile` reports launch errors. The fallback ignores the error string returned by `shell.openPath` and also returns `true`. The renderer therefore cannot reliably show its launch-failure state. This is established by source inspection; no intentional failing editor launch was performed.

**Repair:** Resolve an explicit launch result and inspect `shell.openPath`'s returned error string.

### 13. Atlas texture preloading assumes restricted filenames — P3

**Location:** `renderer.js:189–199`.

The preload regex excludes whitespace and recognizes only lowercase `png/jpg/jpeg/webp` extensions. Valid page names with spaces or uppercase extensions are omitted from `rawDataURIs`, leaving loading dependent on fallback file-URL behavior. This restriction is established by source inspection; the supplied sample page name does match the regex.

**Repair:** Read page names through the runtime atlas parser rather than guessing them with a filename regex; preserve exact names and normalize URL keys consistently.

## Validation and limits

- `node --check` passes for all three application JavaScript files. `npm ls --depth=1` reports installed dependencies without missing-package errors.
- A hidden Electron 31.7.7 window loaded the actual HTML, preload, renderer, installed Spine runtime, and main-process IPC handlers. Startup exposed both the runtime and `spineApi` successfully. A compatible JSON fixture loaded with WebGL, so a generally missing runtime or unavailable WebGL is not the cause reproduced here.
- A real `Spine.exe --version` probe launched the installed editor and was terminated after six seconds. Later Electron checks mocked only that subprocess result to the observed editor version; subsequent playback/race fixtures bypassed the incorrect compatibility gate explicitly. These adaptations are recorded in `.temp/source-audit/results.json`.
- The existing `hs_err_pid77472.log` records a native JVM access violation in the Spine **editor**, including `WelcomeRequests` and `Editor.main`; it is not an Electron JavaScript crash log. Its presence is a separate external-editor failure, not evidence that preview parsing crashed the JVM.
- No project test/build scripts exist beyond `npm start`, and this folder is not a Git repository. Disposable fixtures and the isolated Electron profile were removed after the audit to avoid adding fake projects to future scans.

Recommended implementation order: remove the external-editor dependency from previews; choose supported export/runtime versions; fix deterministic asset resolution and binary autoplay; then repair preview lifecycle, errors, scanning, and styling. The current sample format mismatch remains a blocker until a compatible runtime or genuine re-export is provided.
