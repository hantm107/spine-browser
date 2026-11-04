# Spine Browser — project handoff

## Stable v1.6.1 release preparation — 4 November 2026 (Asia/Saigon)

The user confirmed the importer and parent-color behavior work, then explicitly authorized releasing this version on GitHub. The tested **1.5.3-test.4** implementation is promoted to **1.6.1**, following the already published v1.6.0. Application implementation is unchanged from the accepted test build; the package version and release documentation were updated. The release includes all current importer fixes, large-library rendering improvements and their tests. Earlier executable builds, ignored local examples/diagnostics, rollback branches and the pre-rollback stash remain preserved. Private source-project paths were removed from this public handoff; an unredacted local backup and pre-release patch remain in ignored diagnostics.

Fresh stable-build validation: **82 unit tests**, the complete Electron playback/library and importer UI suites, and **18 large-library checks** passed (`.temp/release-1.6.1-tests.log`). All **46 packaged executable checks** passed (`.temp/release-1.6.1-packaged.log`). Native evidence from this implementation includes five passing editor tests before the color clarification and the passing targeted batch test afterward, verifying parent/descendant color equality and distinct group colors in both skin modes. These native checks were not repeated for the release-only version change. The packaged application sources match the working source, and its package version is 1.6.1. Build log: `.temp/release-1.6.1-build.log`.

Prepared artifact: **`dist/Spine-Browser-1.6.1-portable.exe`**, **71,303,634 bytes**. SHA-256: `2754053bddb60c53bbafefcbd1dd26d39b85f3491c72f52a3d1b868f85acb117`. `dist/SHA256SUMS.txt` and the matching `.exe.sha256` sidecar contain this checksum. Only the executable and `SHA256SUMS.txt` are release assets; generated assets and local profiles are excluded from Git. Existing history is retained through a merge with the tested release tree; publishing uses a normal fast-forward push, never a force push.

Release target: [Spine Browser v1.6.1](https://github.com/hantm107/spine-browser/releases/tag/v1.6.1). This is the prepared release snapshot; check GitHub for publication status. The publishing procedure uploads a draft, verifies uploaded asset sizes and hashes, then publishes it as the latest stable release. Local publication evidence is stored in `.temp/release-1.6.1-result.json`.

## One bone color per imported rig — 4 November 2026 (Asia/Saigon)

The user confirmed test.3 works and clarified the color requirement: all descendants should match their imported parent, while separate parents retain distinct colors. Current source/build is **1.5.3-test.4**. The merger now chooses one unused opaque color per imported parent and applies it to every copied descendant bone. Existing Main bones retain their colors. Review hints and README describe this behavior. All earlier uncommitted files and test executables remain preserved; no commit or release was made.

Fresh validation: all **39 merge/sequence tests passed**, including group-wide color equality, different colors between groups/repeated imports, and preservation of existing bones (`.temp/group-colors-tests.log`). The targeted native batch test passed in both skin modes, verifying saved parent/child color equality through Spine 4.2.43 (`.temp/group-colors-native.log`); unrelated native tests were not repeated for this color-only change. The rebuilt executable passed all **46 packaged checks** (`.temp/group-colors-packaged.log`), and the packaged importer source matches the final working files. Build log: `.temp/group-colors-build.log`.

A local example was recreated from the preserved test.3 output, retaining parent colors and applying each color to its full descendant hierarchy. Native save/re-export verified bone relationships, colors and imported attachment keys. Original user projects and the active Spine window were not modified. Example assets and diagnostic scripts remain in ignored local output folders.

Artifact: **`dist/Spine-Browser-1.5.3-test.4-portable.exe`**, **71,305,918 bytes**. SHA-256: `9de326ca86ef2a0a2d3dff8777918dd5930038122dff3de111722008a26b54bd`; matching `.exe.sha256` sidecar present. Use test.4 for future imports; previously saved projects retain their existing bone colors until changed or reimported.

## Independent import rigs and Spine visibility — 4 November 2026 (Asia/Saigon)

The user reported that batch animations needed separate primary bones and distinct child-bone colors, and that an effect visible in the app was missing in Spine. Current source and portable build are **1.5.3-test.3**, still on `test/import-features-on-1.5.2-20261104`. All pre-existing modified/untracked work remains present; no commit, remote change, or release was made.

Batch imports now build each clip's dependency rig beneath its own numbered parent directly under Main's root at X = 1000 (`ImportedMain`, `ImportedMain2`, etc.). Each imported parent and descendant gets a distinct opaque color, avoiding existing Main bone colors. Bones, slots, constraints, weighted indices, animation references, and mapping overrides are independent per clip. Every imported clip hides other rigs with attachment hide keys and restores its own setup attachments where necessary when switching clips. Named skins and numbered sequence images can still be shared across rigs. Review rows identify their source animation; review summaries and reports list all parent groups. Native verification checks every imported parent/descendant, parent relationship and color, plus attachment/setup selections across every group and attachment availability in the previewed skin.

A fresh native export of the reported project confirmed that its imported artwork exists exclusively in the imported named skin, explaining why the app preview differed from Spine when that skin was inactive. New imports default **Create new skins for imported attachments** to **off** in both the UI and merger: the selected source variant and default fallbacks become ordinary Main attachments, available without activating a named skin. The explicit new-skins option remains, with clearer activation instructions. If no source default skin exists, the first source skin is used unless a specific source skin was selected.

A separate corrected example project was created from the original Main and recovered Import, with two independent effect rigs. Both clips retain the selected sequence names and renderable effects without a named skin active. A 60-frame runtime check per saved clip found five visible effect slots and zero visible slots from the other rig; all imported image references resolve. Original Main and Import bytes were checked unchanged. Diagnostics remain in ignored local folders. A brief editor inspection changed imported-skin visibility without saving; interaction stopped when user input was detected. Do not assume the open editor has no unsaved state.

Fresh validation: **82 unit tests passed** (`.temp/import-fixes-units.log`), including runtime clip switching, independent mappings/constraints, and weighted linked meshes with deformation and skin-required bones in both modes. `npm.cmd test` also completed successfully with all playback/library UI checks, 18 large-library checks, and importer UI checks (`.temp/import-fixes-validation.log`; the final weighted-mesh regression was added afterward and passed in the full 82-test unit run). All **five native-editor tests passed without skips** using Spine 4.2.43 and the existing 3.8 bridge, including separate parents/colors and shared sequence images in both modes (`.temp/import-fixes-native.log`). The new portable executable passed all **46 packaged checks** (`.temp/import-fixes-packaged.log`).

Artifact: **`dist/Spine-Browser-1.5.3-test.3-portable.exe`**, **71,304,260 bytes**. SHA-256: `0d4e95fdcb9ddc2313208ff79f3ee1904c2d1020606a8ce46a698099cf2a3143`; matching `.exe.sha256` sidecar present. Build log: `.temp/import-fixes-build.log`. Earlier portable executables remain intact. Close previous Spine Browser instances and use test.3 to check the new importer defaults. The user's active Spine editor was left open.

## Measured library responsiveness fix — 4 November 2026 (Asia/Saigon)

The user reported that most actions were unresponsive in test.1, even with no animation selected. The app had already been closed when investigation began. Instead of changing more window flags, diagnostics launched the original v1.5.2 and test builds with isolated copies of the user's library settings, Append list and thumbnails. The real library contained **506 assets / about 5,771 DOM nodes**. Both old and test.1 builds showed delays. CPU profiling identified whole-library card recreation on selection; native resizing was also substantially slower with the populated library than with an empty library. Software graphics did not improve the populated-library case, so no GPU configuration change was adopted. Original user profiles and asset files were not modified.

Current source/build is **1.5.3-test.2**, on `test/import-features-on-1.5.2-20261104`. `renderProjectList` now caches cards by collection, asset and rendered metadata, updates selection without replacing unchanged nodes, refreshes changed labels/bookmarks/thumbnails, and bounds the cache to 2,000 entries or the active collection size when larger. Collections over 100 assets use `content-visibility: auto` with intrinsic height estimates to defer offscreen contents. This is permanent for large lists, without the earlier native-resize event handler or continuously running resize-anchor loop. Optional visible-asset anchors augment the existing saved selection/search/scroll; three bounded alignment passes during collection restoration keep the same asset at the same vertical offset as deferred sizes settle, including after reload. Pointer/wheel interaction, changed search/view, newer category requests and pending keyboard navigation prevent stale alignment. Smaller collections retain exact existing pixel-scroll behavior.

The final **packaged executable** was measured against v1.5.2 using the same copied 506-asset profile. Synchronous selection work fell from **59.9–75.1 ms to 7.2–8.3 ms** across three corresponding assets; preview-loading calls completed in about 36–38 ms in test.2. Three native `BrowserWindow.setSize` calls measured 3.3–21.2 ms in test.2 versus 4.5–59.1 ms in the baseline. A resize after clearing the preview measured 13.6 ms versus 47.5 ms. These are small-sample programmatic timings, not a guarantee about physical mouse latency. Raw comparison data/CPU profiles and the isolated diagnostic launcher are in `.temp/response-*` and `.temp/responsiveness-probe.cjs`; `.temp/responsiveness-packaged-profile.log` records the final packaged run. No occlusion/GPU flags were added to production.

Validation: `npm.cmd test` passed all **78 unit tests, existing library/playback and importer UI suites, and 18 new large-library checks** (`.temp/responsiveness-validation.log`). New coverage verifies card identity on selection, list/grid offscreen deferral and overflow at 980/1,600 pixels, filtering, keyboard navigation, refreshed category labels, and restoration of the visible asset after Favorites, Append list, custom categories and reloads while another collection is open. Results: `.temp/library-performance-results.json`. The rebuilt executable passed all **46 packaged checks** (`.temp/responsiveness-packaged-validation.log`). Import merge/service/UI source is unchanged from the previous five passing native-editor tests; those slow native checks were not repeated for this library-rendering change.

Artifact: `dist/Spine-Browser-1.5.3-test.2-portable.exe`, **71,304,058 bytes**. SHA-256: `86c14b893d49828677bd5c63a216a2c7b7e58b855eb6bcdde9a47ce131aa4ea0`; a matching `.exe.sha256` sidecar is present. Build log: `.temp/responsiveness-build.log`. All requested batch/guided-import/browse-location features remain active. Original v1.5.2 and test.1 executables and the pre-rollback stash remain preserved. No commit or remote release was made. Close previous app instances and use test.2 for the next user check; subjective responsiveness still needs the user's confirmation.

## Feature-only performance retest — 4 November 2026 (Asia/Saigon)

After the rollback, the user explicitly requested reimplementing batch animation importing, per-animation naming/preview/native verification, the five guided import steps and prominent controls, and per-collection browse positions to see whether performance issues recur. These requested features and their regression tests were restored selectively from the committed v1.6.0 implementation onto the v1.5.2 baseline. Current branch: `test/import-features-on-1.5.2-20261104`; source/lockfile version: **1.5.3-test.1**. This section supersedes the rollback snapshot below regarding active features.

The November resize optimization, window-size persistence and update notifications remain excluded; the stash backup was not reapplied. `main.js`, `style.css`, `preload.js`, legacy/modern runtime loading, playback controls, import preview rendering and the packaging configuration were verified unchanged from v1.5.2. The library renderer changes are limited to collection browse-location tracking and saving it before unload. No dependency versions were changed. The test build deliberately restores the feature implementation without additional performance changes; it does not establish that the user's mouse lag is resolved.

Fresh validation: `npm.cmd test` passed all **78 unit tests and both Electron UI suites** (`.temp/feature-retest-validation.log`). All **five native-editor tests passed with no skips** using `C:\Program Files\Spine\Spine.com`, editor 4.2.43 and the existing 3.8 recovery bridge (`.temp/feature-retest-native.log`). Native coverage includes both skin modes, one shared batch rig/images, independent clip keys/timing, every clip's attachment verification/report, Main/source preservation, both output modes, and existing image-sequence behavior. The initial and save-step screenshots were visually inspected. `npm.cmd run build:win -- --publish never` succeeded, and the generated executable passed all **46 packaged checks** (`.temp/feature-retest-build.log`, `.temp/feature-retest-packaged.log`).

Test artifact: `dist/Spine-Browser-1.5.3-test.1-portable.exe`, **71,302,792 bytes**. SHA-256: `1b44f6a407b23c534511b2b942851f1849a5a3e0b14edc0e97af7206b32ec927`; a matching `.exe.sha256` sidecar is present. The original v1.5.2 executable remains intact and its checksum still matches the release record below. Close the currently running app before trying the new executable; compare resizing with the same asset, view and window size. The user's existing source app was left running. No source commit, remote change or release publication was performed, and the previous stash backup remains preserved.

## User-requested rollback — 4 November 2026 (Asia/Saigon)

The user reported worse performance after the recent changes and explicitly requested reverting to **v1.5.2**. The active working branch is now `rollback/v1.5.2-20261104`, based on release tag `v1.5.2` / commit `bf22859`. Application source and both package manifests are restored to that release. Only this continuity note differs from the release tree; the November resize optimization, window-size persistence, update notification work, and v1.6.0 features are not active. Do not reapply them unless the user asks.

All 23 previously modified/untracked files were preserved with `git stash push --include-untracked` before switching versions. Backup: stash commit `6094112a62e83cdbcce7ac3b849a97e4e57894d2`, named **Backup before rollback to v1.5.2 - 2026-11-04** (`stash@{0}` at rollback time). The original `main` branch remains at `c4d7739` / v1.6.0. Together that branch and the stash preserve the complete pre-rollback source state. Ignored build/verification files and real user profiles were left intact. No remote branch was changed or release published.

The original `dist/Spine-Browser-1.5.2-portable.exe` is present (71,297,203 bytes), and its SHA-256 matches the release record: `5ce4585361d382f93709bd45320d509e1470e9ea593c66a24ec9bd2a2c6e6678`. Fresh `node tests/packaged-smoke.cjs` verification passed all **43 packaged executable checks**, including JSON/binary playback across 2.0, 2.1, 3.0–3.8 and 4.0–4.2 and the original importer UI. Log: `.temp/rollback-1.5.2-packaged.log`. The existing executable was verified directly, without rebuilding it. Installed dependency specifications are identical between v1.5.2 and v1.6.0, so reinstalling dependencies was unnecessary. No real app process was running when the rollback began.

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
