# Spine Browser

A local Electron browser for Spine editor projects and exported animations.

Legacy **Spine 2.0 and 2.1** JSON and binary skeleton exports are supported alongside the existing 3.x and 4.x runtimes. Native 2.x animation behavior includes bone flips, IK, weighted meshes, and FFD. Related `.spine` projects can preview their accompanying exports as usual. Unversioned legacy JSON uses a clearly labeled 2.1 compatibility fallback; unversioned/`Dev` binary exports cannot be safely identified and remain unsupported. Reference coverage and archive-specific limitations are documented in [vendor/README.md](vendor/README.md) and [tests/fixtures/README.md](tests/fixtures/README.md). Original assets are never rewritten.

The library uses the left half of the window, with a dedicated category column and a full-height file browser beside it. List and grid views automatically add columns as space permits. The smaller animation preview and playback controls occupy the right half.

The original app code is covered by the repository's [MIT license](LICENSE). Bundled and derived Spine runtime code, compatibility readers, and upstream sample assets retain their upstream license terms; see [vendor/README.md](vendor/README.md) and [tests/fixtures/README.md](tests/fixtures/README.md). The MIT license does not replace those third-party terms.

```sh
npm install
npm start
```

To build a portable Windows x64 executable, run `npm ci` followed by `npm run build:win`. The result is `dist/Spine-Browser-1.2.0-portable.exe`; users can run that single file without installing Node.js or Spine. The app is unsigned, so Windows may display an unknown-publisher warning. Build output excludes test fixtures, snapshots, temporary files, and local settings. Upload the executable as a GitHub Release asset; keep generated builds out of the source repository.

`node tests/packaged-smoke.cjs` launches the generated executable with a temporary user profile and checks JSON and binary playback using the checked-in fixtures. It saves results and a screenshot under `.temp/`.

Choose an asset folder, then select a file to preview it. Search matches file names and folders. The animation controls let you pause playback or choose another animation; the buttons below the preview open the selected file in Explorer or Spine.

Version 1.1 groups related `.spine`, `.json`, and `.skel` siblings into one asset. Expand **Related files** to preview a specific member. Ambiguous skeletons stay separate. Search includes the names of all group members.

Each animation has its own wrapping button. The shared toolbar provides pause/play, restart, loop/play-once, speed, timeline scrubbing and forward/backward frame stepping. Frame stepping uses the export's FPS when available, otherwise 30 FPS. Skin selection remains available for exports with multiple skins.

The app restores the last folder, selected asset, search, library scroll, list/grid view, favorites filter, playback speed, loop mode, and animation choice. **Recent folders** remembers the last ten folders; **Rescan folder** refreshes the current library. A missing folder produces an error and leaves Choose folder available.

Use the star on an entry to bookmark it and **Favorites** in the Categories section to open your global bookmarks across all folders. Favorites store absolute file paths and can be previewed regardless of the active folder. Existing bookmarks migrate automatically. Missing or moved files stay bookmarked with an unavailable status, and their full paths remain visible. **Grid** shows larger thumbnail cards. Thumbnails are captured as you preview visible assets, rather than rendering the entire collection in the background. Pause at a useful frame and press **Update thumbnail** to replace a thumbnail. Thumbnail PNGs are cached in Electron's user data directory; original assets are never modified.

A source snapshot of version 1.0.0, before the UX changes, is saved locally under `snapshots/spine-browser-before-ux-20261023-112128.zip`. Extract it into a separate folder and run `npm ci` followed by `npm start` to restore it. Installed dependencies, personal editor state, and generated reports are excluded from that snapshot.

Tick **Hide .skel files** above the file list to hide standalone binary exports. The setting is remembered between sessions; `.spine` projects continue to use their associated exports for playback.

Supported playback versions: **Spine 3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.0, 4.1, 4.2, and 4.3**, for binary `.skel` and JSON exports. The app detects the export version and loads its local runtime or compatibility adapter automatically. Switching folders or versions requires no setting changes or re-export. Previews work offline and do not launch the Spine editor. Unsupported or malformed files display an explanation instead of being sent to an incompatible parser.

Skeleton `.json` files appear in the file list and preview directly, just like `.skel` files. Ordinary application JSON is ignored. JSON files remain visible when **Hide .skel files** is checked. Uppercase `.JSON` extensions and UTF-8 files with a byte order mark are supported.

For playback, place a `.skel` or skeleton `.json` beside an atlas with the same base name and all the atlas page images. If the folder contains only one skeleton and one atlas, their names can differ. A `.spine` project can use a matching export in its folder. A numbered project such as `001.spine` can also use the folder's only skeleton, including when it is exported as both JSON and binary. Folders with ambiguous exports require matching names. Raw editor projects can be opened in Spine but cannot be rendered directly.

The original project and export files are never overwritten. The 3.0-3.5 binary formats are decoded in memory. Versions 3.0-3.4 use the shared 3.4 renderer; 3.5 uses the 3.6 renderer with its own binary layout. Earlier mesh and constraint names are normalized without changing source files. Version routing covers every released 3.x minor series; individual experimental beta layouts are not guaranteed. The 4.2 player is pinned to 4.2.120, the latest published 4.2 package verified during this update. The bundled legacy runtime's source and license are documented in [vendor/README.md](vendor/README.md).

Run `npm test` for asset-resolution/version/scanning regression tests and actual Electron playback/UI checks. The Electron tests briefly show a test window to verify animation advances, then close it. Verification results and a sample screenshot are saved in `.temp/`.

Spine 3.8.75 JSON and binary exports receive best-effort preview support. The upstream runtime rejects this editor version because of known export bugs (https://github.com/EsotericSoftware/spine-runtimes/issues/2428). The version guards are relaxed while the standard data readers remain unchanged. Original version metadata is preserved and source files are never rewritten. Verified locally with lrsc502/lrsc532 JSON and the 233/228 binary exports; damaged files may still require re-exporting. Default playback skips zero-duration placeholders when animated clips are available.

Version 1.2 adds a **Categories** sidebar section with **All assets**, **Favorites**, and **custom categories without an app-imposed count limit**. Create a category with the name field and + button. Each category automatically receives a unique RGB color. The original eight colors are preserved; additional colors are generated as needed, with collision checks. Click **Tags** on an asset and use the large category toggle buttons to add or remove memberships; selected buttons show a checkmark. The red **Close** button is at the bottom of the popup. its colored name tags appear directly on the asset card in both list and grid views. Click a tag or category name to browse that global collection. Use the category menu to rename or delete it. Names must be unique (case insensitive) and at most 40 characters. Deleting a category requires a second confirmation click and preserves original files, Favorites, and other memberships. Category colors, membership, and selected collection are remembered across restarts using absolute paths.
