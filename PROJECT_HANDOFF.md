# Spine Browser — project handoff

## v1.6.0 release continuation — 30 October 2026 (Asia/Saigon)

The user authorized releasing the guided importer, batch-animation import, and collection browse-position changes together as v1.6.0. Source and lockfile now report 1.6.0, and these previously local changes are included in the release commit. Earlier sections below are dated implementation snapshots; their statements that the work was uncommitted or unpublished describe that earlier point in the session.

Fresh release checks: all 78 unit tests and both Electron suites passed. The Windows portable build succeeded, and all 46 packaged-executable checks passed, including playback for JSON and binary fixtures across 2.0, 2.1, 3.0–3.8 and 4.0–4.2, restoring All assets after Favorites, guided-step locks, batch controls, and prominent buttons. The five native-editor tests passed earlier during batch-feature validation; the merge/service code has not changed since that pass, and they were not repeated for this release preparation.

Artifact: `dist/Spine-Browser-1.6.0-portable.exe`, 71,303,190 bytes. SHA-256: `c2413af76fafebfaa2862dc81ed574f678616cc68eab4e741c9a6bdaa36f7cb9`. `dist/SHA256SUMS.txt` was regenerated. The executable and checksum are release assets; generated builds remain ignored. Release target: [v1.6.0](https://github.com/hantm107/spine-browser/releases/tag/v1.6.0); use the remote release to confirm publication status and Git for the exact release commit.

## Guided importer UI continuation — 30 October 2026 (Asia/Saigon)

The importer now has five numbered steps: projects, animation selection, names/images and review, combined preview, and save. A sticky progress bar and Continue buttons navigate available steps. Later stages are visibly greyed, with disabled fieldsets and `inert` content so they cannot be used by mouse or keyboard. Both projects must be inspected before step 2; confirming selected animations unlocks step 3; a reviewed plan unlocks step 4; a successfully loaded merged preview unlocks step 5. `selectionConfirmed` and `previewReady` in the UI state track these prerequisites. Changing projects or selected animations relocks dependent stages, while editing names/settings requires review and preview again. Completed save results remain accessible. No merge/service logic was changed for this UI work.

Primary buttons are at least 52 pixels tall, with distinct blue Main/review, purple Import, and a 60-pixel green Save action. Available/current/completed steps, locked hints, keyboard focus on navigation, reduced-motion navigation, and responsive layout are included. Validation: `npm.cmd test` passed all 78 unit tests and both Electron suites; focused importer checks cover initial/partial locks, confirmation, preview failure/retry, successful preview unlocking save, edit/source-change invalidation, saved results, button sizes, focus, and 980-pixel layout without horizontal overflow. Rendered screenshots were inspected under `.temp/import-steps-initial.png`, `import-steps-save.png`, and `import-steps-narrow.png`. Native editor tests were not rerun for this UI-only change; their five passing tests from the batch change remain recorded below. All previous local work is preserved; this update is not committed, packaged, or published.

## Batch-animation continuation — 30 October 2026 (Asia/Saigon)

Local source now supports selecting several animations from one Import skeleton and saving them together. The import workspace adds an animation checklist with Select all/Clear selection, keeps batch selection independent from the source preview, adds editable animation mapping rows for batches, and offers a combined-preview animation selector. Single-animation imports retain their custom-name field and preview-selection behavior.

`buildMerge` accepts `animations` while retaining the existing `animation` option. It unions the selected clips' dependencies, builds one shared rig/group/image set, remaps each clip independently, and applies sequence renaming across all imported timelines. Results include source/output mappings and `animationNames`, with the first `animationName` retained for compatibility. The service previews and saves all clips in one native project, verifies attachment selections for every imported animation, and includes aggregate/per-animation verification and names in the import report. Multi-project batching is not part of this change.

The earlier local browse-position changes remain intact. These changes have not been committed, rebuilt into a portable executable, or published after v1.5.2.

Validation on 30 October: `npm.cmd test` passed all 78 unit tests and both Electron suites; the importer UI suite passed again after the final single-checkbox preview adjustment. All five `test:import-native` tests passed with no skips using Spine 4.2.43 and the existing 3.8 recovery bridge. The new native batch case covers both skin modes, one shared rig, renamed shared images, preview packing, both output modes, all selected attachment keys, and preservation of Main's animation. An initial standard-suite attempt hit a Windows `ENOTEMPTY` temporary-directory cleanup error in the unchanged Append list test; the complete rerun passed without code changes to that test.

## Browse-position continuation — 30 October 2026 (Asia/Saigon)

Local source changes add persistent per-collection browse locations in `workspaceV1.browseLocations`: selected asset, search, scroll, and the current folder for validating the All assets location. `selectCategory` captures the outgoing location before changing filters and restores the incoming selection/scroll. A separate current-category value handles the Favorites checkbox changing before its handler runs; request tracking prevents stale asynchronous category refreshes from replacing the latest selection. Deleting the active custom category restores All assets through the same flow. The existing app-wide folder and view preference are retained.

The Electron regression suite covers returning from Favorites, Append list and custom categories, checkbox navigation, reload while another collection is open, rapid switches, and clicking an already-active collection. These changes are local source work after published v1.5.2; no new release has been published for them.

Validation on 30 October: `npm.cmd test` passed all 75 unit tests and both Electron suites. After the final active-collection adjustment, `node tests/run-electron.cjs` passed again, including all seven new browse-location checks. No native-editor or packaged rebuild was needed for this renderer-only change.

## Release continuation — 29 October 2026 (Asia/Saigon)

The user authorized publishing the latest changes to GitHub. The v1.5.2 source, sequence implementation/tests, and continuity documents are being included in the release commit. The sections below retain the original handoff snapshot; their descriptions of uncommitted work and earlier environment failures are historical.

Fresh release validation: all 75 unit tests and the complete Electron playback/library and importer UI suites passed. A new Windows x64 portable executable was built successfully, and all 43 packaged checks passed, covering JSON/binary playback for 2.0, 2.1, 3.0–3.8, and 4.0–4.2, plus sequence UI/shared-image checks.

All four native-editor tests also passed with no skips using the activated Spine CLI and editor 4.2.43, including legacy recovery through 3.8, attachment selections in both skin modes, separate folders with identical basenames, and sequence renaming in both skin modes and native Spine sequences.

The rebuilt `dist/Spine-Browser-1.5.2-portable.exe` is 71,297,203 bytes. SHA-256: `5ce4585361d382f93709bd45320d509e1470e9ea593c66a24ec9bd2a2c6e6678`. `dist/SHA256SUMS.txt` was regenerated for this artifact. Builds remain ignored and are distributed as release assets.

Release target: [v1.5.2](https://github.com/hantm107/spine-browser/releases/tag/v1.5.2). Check the remote release for publication status.

Prepared **29 October 2026 (Asia/Saigon)** for continuing this project from another ChatGPT account or a new conversation. This is a snapshot: check the working tree and current files before treating version numbers or test results as current.

## Read this first

Spine Browser is a working, local Electron desktop application for browsing, organizing, and previewing Spine animation assets, with a separate workspace for importing one animation into another Spine project. The current folder is `D:\SpineBrowse`.

The working source reports **version 1.5.2**, and a matching Windows portable executable exists locally. **The latest commit is still the v1.4.8 baseline; the 1.5.x image-sequence work is present as uncommitted changes and new files.** A checkout of the current commit alone will therefore lose functionality described below. Preserve the entire working tree, including untracked source and tests.

This handoff was reconstructed from the source, README, local Git history, diffs, build artifacts, and saved verification logs. Earlier development conversations were not available in this conversation. Product behavior below is supported by those files; suggested next steps are recommendations, not a newly agreed feature roadmap.

| Item | State at handoff |
| --- | --- |
| Product / npm package | Spine Browser / `spine-browser` |
| Working source version | `1.5.2` in both package manifests |
| Branch / tracking branch | `main` / `origin/main` |
| Latest local commit | `5886535` — `Release v1.4.8 with legacy recovery and adaptive preview fixes` |
| Local tags | Latest listed tag is `v1.4.6`; other tags include `v1.3.1`, `v1.3.0`, `v1.2.0`, `v1.1.3`, `v1.1.2` |
| Latest local portable build | `dist/Spine-Browser-1.5.2-portable.exe` |
| Fresh validation on 29 October | All **75 unit tests passed**; Electron UI execution failed at GPU startup in this restricted environment |
| Earlier validation | Saved logs show successful Electron/UI checks, native Spine round trips, and a 17-check packaged-app run; details below |
| Publication status | Remote releases and remote branch freshness were not checked; a local executable or release-named commit does not establish publication |

## 1. Purpose and product outline

The application addresses two connected workflows:

1. **Asset library:** point it at local folders, discover Spine projects and exports, preview animations across many Spine versions, and organize assets without modifying their source files.
2. **Animation import:** select a Main project and an Import project, choose one source animation, review its dependencies and names, preview the merge, then create a new native `.spine` project through an installed Spine editor.

The implementation is plain JavaScript, HTML, and CSS using Electron and locally bundled Spine runtimes. There is no application web server, cloud database, or account system in the inspected code. Ordinary export previews work offline and do not launch Spine. Native project inspection, reconstruction, packing, conversion, and saving require an installed, activated Spine editor and the appropriate editor versions.

The About dialog identifies the author as **Han Tuan**. Original application code is MIT licensed. Spine runtime code and upstream samples retain separate license terms documented in [vendor/README.md](vendor/README.md) and [tests/fixtures/README.md](tests/fixtures/README.md).

## 2. What has been achieved

### 2.1 Reliable asset discovery and multi-version playback

- Recursively discovers `.spine`, `.skel`, and actual skeleton `.json` files; ignores ordinary application JSON.
- Groups related project/JSON/binary siblings into one library asset with a Related files selector. Ambiguous exports remain separate instead of being arbitrarily combined.
- Resolves matching skeletons, atlases, and all texture pages. Supports Unity `.atlas.txt`, uppercase extensions, UTF-8 BOMs, and the sole-skeleton/sole-atlas fallback when unambiguous. A normal `.atlas` takes precedence over `.atlas.txt` with the same stem.
- Automatically dispatches supported exports to the matching local runtime or compatibility adapter. Catalog coverage is **2.0, 2.1, every 3.x minor from 3.0 through 3.8, and 4.0–4.3**.
- Uses supported same-stem JSON as an identified fallback for unsupported/custom binary headers when possible. Unknown headers are not interpreted as editor versions.
- Handles missing assets, malformed files, unsupported versions, failed scans, and stale asynchronous preview requests with explicit states.
- Provides best-effort 3.8.75 playback and skips zero-duration placeholder animations when playable clips exist.
- Supports legacy 2.x behavior, including native flips, IK, weighted meshes, FFD, and recovery of certain legacy unsigned encodings of negative draw-order offsets.
- Normalizes texture uploads for correct premultiplied-alpha rendering and Normal/Additive/Multiply/Screen blending across the renderer families. Original textures, atlases, and skeletons are preserved.

### 2.2 Library organization and browsing UX

- Search, list/grid views, global Favorites, and custom categories with persistent membership and unique colors beyond the initial eight presets.
- Category names are case-insensitively unique, limited to 40 characters, and cannot reuse built-in collection names. Removing a category preserves files and other memberships.
- Library/category area occupies the left half of the window, with preview and playback controls on the right. Preview uses 16:10 proportions.
- Keyboard navigation follows visual rows and current filters. Highlighting changes immediately; preview loading waits for 200 ms without another arrow press.
- Playback includes animation buttons, skin selection, pause/resume, restart, loop/play-once, speed, timeline seeking, and frame stepping. Frame stepping uses export FPS or 30 FPS as a fallback.
- Canvas click pauses/resumes; horizontal drag scrubs and leaves playback paused.
- Persists the current folder, selection, search, scroll, view mode, collection, playback preferences, animation choice, and last ten folders. A remembered filter can hide standalone `.skel` files.
- Captures thumbnails as visible assets are previewed and supports manually updating a thumbnail. It does not render the entire library in the background.
- Opens selected files in Explorer or Spine.

### 2.3 Global Append list

- A persistent collection of import sources beside Favorites, independent of the currently browsed folder and custom categories.
- `Append +` saves an absolute source path; removing its bookmark preserves the file.
- The library can open an Append entry directly in the import workspace. The workspace can choose a saved source without reopening Main or showing a folder picker.
- The currently open Import source, including a reconstructed project, can be added to the list.
- Both windows receive immediate changes. Missing projects remain visible as unavailable, and refresh rechecks them. Import availability also depends on the required `images/` folder.

### 2.4 Animation import and native project output

The separate import window has responsive Main and Import panes, skeleton/animation/skin selectors, independent timelines, and a combined preview.

- Inputs normally have a `.spine` project and sibling `images/` folder, and must be in separate folders. Multiple project files trigger an explicit choice.
- Export-only sources can be reconstructed into working `.spine` copies. Legacy data earlier than 3.6 is bridged through a 3.8 editor; 3.8.99 is requested if no installed 3.8 patch is found. Source metadata and attachment hide keys are retained.
- Main must use the same or a later version than Import. Real conversion uses Spine's editor workflow in working copies; changing a version string is not conversion.
- Imports only one selected animation and the dependencies needed for it: setup-visible attachments, ancestor/weighted bones, linked meshes, constraints, clipping/path data, events, referenced images, and used event audio.
- Creates a consistently named parent group directly under Main's root at **X = 1000**. The default prefix is `ImportedMain`; repeated imports receive numbered groups.
- Supports Find/Replace, regular expressions, case matching, individual mapping overrides, a custom animation name, and review invalidation after edits.
- New prefixed skins are enabled by default, including a skin for source-default artwork. The combined preview selects the relevant imported skin. With new skins disabled, the chosen source skin and its default fallbacks are baked into Main's default attachments.
- Requires a new images subfolder for every import. For example, an occupied `Effects/Impact` becomes `Effects/Impact-2`. Existing Main image paths remain intact.
- Defaults to creating a **new project beside Main** with new images in the reviewed subfolder and an accompanying import report. Existing project files are preserved and output-name collisions receive numeric suffixes.
- Can instead create a separate output folder containing `Merged.spine`, required Main/import images, and import data/report.
- Rebuilds the output through the official Spine import/export workflow, then re-exports it and verifies attachment selections and imported setup attachments before publishing into Main's folder.
- Checks project/source changes and output collisions, uses exclusive copies, and rolls back files created by a failed publication. A folder created after review requires a fresh review.
- Preserves other Main animations and skeletons. Missing images in unselected Main skeletons are reported; missing required selected assets block saving.
- Supports `Use result as Main` for repeated imports.

Import previews support click/drag controls, blue/purple source outlines, and two fitting modes. Auto fit follows the visible pose during playback/seeking, excludes transparent effect geometry, expands immediately, and eases when shrinking. Fit animation holds a fixed view of the full clip.

### 2.5 Latest work: image-sequence renaming in the 1.5.x working tree

This feature is implemented in local source and represented by the 1.5.2 build, but has not been committed to the current branch.

- After Review import, detects numbered image groups by **full source folder and skin**, with ownership information for native Spine sequence attachments.
- Automatically replaces unambiguous groups with short names such as `Sequence1_001.png`. Original source names, folders, skins, and import prefixes are not added to replacement filenames.
- Exposes a replacement checkbox, new name before the number, optional suffix, starting number, padding, and filename previews. Reset regenerates short names; automatic names skip names already used in Main.
- Sorts frame numbers numerically and can close gaps: source frames `2, 4, 8, 10` can become `001, 002, 003, 004` without retiming animation keys.
- Updates copied filenames, attachment display names/paths, attachment selection keys, deformation references, and linked-mesh parents together.
- For native Spine sequences, keeps the number last, puts suffix text before it, and changes sequence start/padding while preserving count, setup frame, frame indices, and timing.
- Sequence-managed mapping rows are read-only until the group is disabled and reviewed again. Editing settings invalidates the reviewed plan.
- Deduplicates a source image reused across several slots: one frame/image is renamed and copied once, while each slot retains its own transforms, attachment, and animation keys. The UI displays shared-slot counts.
- Keeps groups from different full source folders separate even when basenames match, so their distinct image bytes can be flattened safely into the chosen destination subfolder.
- Blocks ambiguous same-number images, multiple distinct attachments sharing an image within one slot, invalid Windows filenames, stale groups, and output collisions.

## 3. Architecture and code map

| Files | Responsibility |
| --- | --- |
| `main.js` | Electron lifecycle, main/import windows, app menu/About, filesystem and thumbnail IPC, Append store, import service, Explorer/Spine launching |
| `preload.js` | Context-isolated bridges: `window.spineApi` and `window.spineImport`; renderer Node integration is disabled |
| `index.html`, `style.css`, `renderer.js` | Library UI, persistent workspace, selection, preview lifecycle, collections, thumbnails, keyboard navigation |
| `project-assets.js` | Scanning, version/header detection, skeleton JSON recognition, safe asset pairing and JSON fallbacks |
| `asset-groups.js` | Related-file grouping without combining ambiguous assets |
| `runtime-catalog.js`, `runtime-loader.js` | Version-to-runtime mapping, lazy local script loading, isolated namespaces |
| `legacy-player.js`, `old-spine-decoder.js` | Legacy playback adapter and 2.x/early-3.x binary decoding |
| `blend-compatibility.js` | PMA texture handling and renderer blend compatibility |
| `playback-controls.js` | Shared playback, timeline, frame stepping, and canvas interactions |
| `category-store.js`, `category-ui.js` | Category data, validation, colors, tags, and collection UI |
| `append-list-store.js` | Persistent Append bookmarks, availability, path normalization |
| `import.html`, `import.css`, `import-ui.js` | Main/Import/combined panes, settings, naming review, sequence cards, save flow |
| `import-preview.js` | Import workspace rendering, seeking, fitting, skin selection, bounds handling |
| `import-service.js` | Spine CLI calls, inspection/reconstruction/conversion, preview packing, reviewed plans, copying, native save verification, output/report publication |
| `import-merge.js` | Pure dependency analysis and JSON merge, naming/reference remapping, skin handling, sequence integration, saved-attachment verification |
| `image-sequences.js` | Shared sequence detection and generated-name validation/preview; used from Node and the renderer |
| `vendor/` | Bundled older runtimes, bridges/readers, provenance, upstream licenses |
| `tests/` | Unit tests, Electron playback/UI tests, optional native Spine round trips, packaged executable smoke tests, fixtures |
| `electron-builder.yml` | Explicit packaged-source allowlist and Windows x64 portable target |

Runtime routing is intentionally version-specific:

| Export series | Local runtime path |
| --- | --- |
| 2.0 / 2.1 | 2.1 native core plus 3.4 WebGL bridge; appropriate old binary decoder |
| 3.0–3.4 | 3.4 renderer plus earlier-format compatibility readers |
| 3.5 | 3.6 renderer with its own binary layout reader |
| 3.6 / 3.7 / 3.8 | Separate versioned legacy runtimes; 3.7 includes a dedicated binary reader |
| 4.0 / 4.1 / 4.2 | Official npm player aliases pinned to `4.0.31`, `4.1.56`, `4.2.120` |
| 4.3 | Official default player pinned to `4.3.13` |

Do not collapse these paths into one modern runtime: Spine export compatibility depends on the series, and historical fixes cover real layout differences.

## 4. Development and packaging

Observed installed tools at handoff: **Node v24.12.0**, **Electron 31.7.7**, and **electron-builder 26.15.3**. The manifest allows Electron `^31.0.0`; use the lockfile for reproducible installs. It also includes `@esotericsoftware/spine-canvas` at `^4.3.13`.

Run these from the project directory in PowerShell:

```powershell
npm.cmd ci
npm.cmd start
npm.cmd test
npm.cmd run build:win
node tests/packaged-smoke.cjs
```

Use `npm.cmd` when PowerShell blocks the `npm.ps1` shim under its execution policy. `npm ci` is for setup/reinstallation; installed dependencies are already present in this folder.

The build uses ASAR and an explicit application file list. When adding a runtime-loaded source file, update `electron-builder.yml`; `image-sequences.js` has already been added. Test fixtures, local editor state, snapshots, and temporary output are excluded. Generated builds belong in release assets, not source control.

The current portable artifact is **71,297,196 bytes**. Its SHA-256, freshly calculated during this handoff, is:

```text
61b09ec3a91e6482595b97cc264e64da53e4547e696d5ccd66464813090271a1
```

`dist/SHA256SUMS.txt` still lists **1.4.8**, not 1.5.2. Regenerate release checksums if preparing a new distribution. Older executables also remain in `dist/`; use the manifest version when choosing the current one. The project documents unsigned distribution; the latest saved build log reports the default Electron icon and missing `author` package metadata. Signing was not independently verified during this handoff.

Optional native-editor checks require an activated editor and real installed versions:

```powershell
$env:SPINE_NATIVE_IMPORT_CLI = 'C:\Program Files\Spine\Spine.com'
$env:SPINE_NATIVE_IMPORT_VERSION = '4.2.43'
npm.cmd run test:import-native
```

This script now runs both native test files with concurrency 1. Without the CLI environment variable, native tests skip; that is not evidence of a successful editor round trip. Legacy-recovery tests also need the 3.8 bridge editor available. The import UI defaults to the same CLI path but lets the user choose another path and inspection version.

## 5. Validation evidence and its limits

### Fresh check on 29 October 2026

Ran the current `npm.cmd test` script. All **75 unit tests passed, with zero failures or skips**, covering assets, old decoders, merge logic, sequences, import service, and Append list.

The complete script did **not** pass in this execution environment. The first attempt reached Electron and hit `EPERM` while examining a parent of the default temporary directory. A retry placed `TEMP`/`TMP` under `.temp/handoff-scratch`; unit tests passed again, then Electron's GPU process repeatedly exited with `-1073741515` and terminated with `GPU process isn't usable`. The import-UI stage was not reached. This establishes a current environment limitation, not a diagnosed application regression. No application code was changed to work around it.

The latest attempt is saved in [.temp/handoff-validation.log](.temp/handoff-validation.log). Native Spine checks and the portable executable were not rerun for this documentation task.

### Existing local evidence from earlier development

These are historical logs, inspected during handoff, rather than fresh passes:

| Evidence | Result recorded |
| --- | --- |
| `.temp/shared-sequence-tests.log` | 74 then-current unit tests passed, followed by successful Electron playback/library and import-UI checks, including sequence behavior |
| `.temp/shared-sequence-ui.log` | Import UI checks passed, including shared image groups, replacement names, mapping invalidation, fitting, canvas interactions, Append handoff, and responsive panes |
| `.temp/shared-sequence-native.log` | Sequence renaming passed real native save/re-export checks across skin modes and native Spine sequence attachments |
| `.temp/folder-sequence-native.log` | Later focused regression passed: identical basenames in different source folders retained distinct image bytes when appended into Main |
| `.temp/shared-sequence-build.log` | Built the 1.5.2 Windows x64 portable executable |
| `.temp/shared-sequence-packaged.log` | 4.2 JSON and binary playback passed; 17 packaged checks passed overall. Do not infer that every catalog series was tested in that particular run |
| `.temp/default-main-native-tests.log` | Earlier native attachment-selection save/reopen check passed in both skin modes |
| `.temp/legacy-recovery-bridge.log` | Legacy JSON/custom-header recovery into a modern Main project passed after an earlier failed run |
| `.temp/actual-born2-recovery.log`, `.temp/born2-recovery.log` | Real `effects_1060_born2` recovery recorded through 3.8.99 and into 4.2.43, preserving original source bytes |

There is also an older failing `.temp/legacy-recovery-native.log`; it predates the passing bridge-specific result. Saved logs are development history, so do not treat every old failure as an unresolved current defect or every old pass as current full-suite coverage.

The standard Electron suite includes runtime playback, navigation, real GPU blend-pixel checks, and library states. The import-UI harness uses service/IPC test doubles for much of its workflow while rendering actual runtime previews; native-editor tests provide the separate real save/reopen evidence.

Fixtures have different provenance: 2.x and some early 3.x references are synthetic or adapted, while later series include official Spineboy exports. See [tests/fixtures/README.md](tests/fixtures/README.md) for the distinction. Supported routing does not guarantee every historical beta/custom export layout. Optional real-library checks use `SPINE_TEST_ASSET_FOLDER`; their source folder must exist locally.

## 6. Exact working-tree state to preserve

Before adding this handoff, these tracked files were modified relative to `5886535`:

```text
README.md
electron-builder.yml
import-merge.js
import-service.js
import-ui.js
import.css
import.html
package-lock.json
package.json
tests/import-ui-smoke.cjs
tests/packaged-smoke.cjs
```

These files already existed locally but were untracked:

```text
SOURCE_AUDIT.md
image-sequences.js
tests/image-sequences.test.cjs
tests/sequence-native.test.cjs
```

This documentation task adds `PROJECT_HANDOFF.md` and a short root `AGENTS.md` pointing future coding sessions here. It does not commit, tag, publish, rebuild, or change application behavior.

Important details:

- `git diff --stat` alone omits the untracked sequence implementation/tests. Copying only tracked files or saving only a normal diff is insufficient for a complete handoff.
- The 1.5.x diff adds sequence integration to the merger/service/UI, version and test-script changes, packaged-file inclusion, and smoke assertions. Preserve all of these together.
- `SOURCE_AUDIT.md` is an original-source diagnostic report with an implementation-update note. Statements in its historical body such as “no tests” or “not a Git repository” describe the original audit, not this folder now.
- `.temp/`, `dist/`, `out/`, `node_modules/`, `snapshots/`, `.vscode/`, and local Spine editor state are ignored. They will not follow a normal Git clone.
- A pre-UX v1.0.0 archive exists at `snapshots/spine-browser-before-ux-20261023-112128.zip`. It is an old reference, not a backup of current uncommitted work. Restore it into a separate folder if needed.

## 7. Persistence and changing ChatGPT accounts

Project continuity can be reconstructed from this document, [README.md](README.md), and the code. No ChatGPT memory or conversation transfer was performed. A new session should open this folder and read this handoff; it must not assume access to previous chats.

The application itself stores data locally:

- Renderer `localStorage`: `workspaceV1` (library state, Favorites/categories, and preferences), `hideSkelFiles`, and `spineImportSettings` (CLI/editor settings).
- Electron `app.getPath('userData')`: `append-list.json`, `thumbnails/`, and `import-workspace/<session UUID>/` working/reconstructed project data, as well as the renderer profile's local storage.
- Original asset libraries and projects remain wherever the user keeps them. Favorites, categories, and Append entries use absolute paths.

Switching a ChatGPT account does not by itself copy any of these files. On the same computer with the same folder/profile they remain local; when moving computers or application profiles, separately preserve needed project assets and Electron user data. An Append bookmark to a reconstructed working project depends on retaining that project's working folder, not just the bookmark JSON.

## 8. Known boundaries and recommended next steps

Known product boundaries:

- Raw `.spine` editor files cannot be rendered by the web runtimes without exports; the library needs suitable accompanying exports, or the import workspace must use the editor.
- Export-based reconstruction cannot retain editor-only information absent from exports. Nonessential export data is enabled, but this is not a byte-for-byte editor-project merger.
- Import requires the expected `images/` layout. Its image resolver currently looks for PNG/JPG/JPEG variants; do not assume every preview texture extension is accepted by native importing.
- Newer-to-older project downgrades are blocked. Required editor versions and activation must be available through the launcher.
- Unknown/`Dev` binary layouts without a usable JSON fallback are rejected. Unversioned legacy JSON has an explicitly labeled 2.1 fallback, and 3.8.75 support is best effort.
- Unavailable bookmarks remain listed; moving assets may require updating or re-adding paths.

Recommended continuation, in priority order:

1. **Preserve the current work first.** Review `git status` and retain all modified/untracked source and tests before changing accounts, copying the repository, or resetting anything. This handoff has not created a commit.
2. **Read the latest user request before choosing new work.** The current request was to create this handoff; no additional feature has been requested in this conversation.
3. **On a suitable desktop, confirm the full current tests.** Run `npm.cmd test`; use the optional native-editor command when activated editors are available. The latest fresh unit result is green, but a current full Electron/native run remains unconfirmed here.
4. **If preparing a release, reconcile source and artifacts.** Review the full 1.5.2 diff, include the new source/tests, confirm the portable build, run the desired packaged series, regenerate checksums, and deliberately choose commit/tag/release details. Do not publish merely because the build exists.
5. **Keep this file current.** Record later behavior changes, commits, validation results, and unresolved issues so another account can resume from files rather than missing conversation memory.

Suggested first message in a new account/session:

> Open `D:\SpineBrowse`. Read `AGENTS.md`, `PROJECT_HANDOFF.md`, and `README.md`, then inspect `git status` and the current diff. Preserve the existing uncommitted 1.5.2 work, especially `image-sequences.js` and its tests. Use the handoff as a snapshot, distinguish historical checks from fresh validation, and continue with my next request.
