# Spine Browser

A Windows desktop app for browsing, previewing, and combining Spine animations.

## Download

[**Download the latest Windows portable build**](https://github.com/hantm107/spine-browser/releases/latest)

Run the `.exe` directly. No installation or Node.js is required. The release includes a SHA-256 checksum.

## Features

- Preview Spine JSON and binary exports across 2.0, 2.1, 3.0–3.8, and 4.0–4.3, with playback controls, skin selection, and scrubbing.
- Organize assets with search, thumbnails, Favorites, categories, and a saved Append list. Each collection remembers your browsing position.
- Import multiple animations into a new project with separate rigs, one bone color per rig, image-sequence renaming, and a combined preview.

## Quick start

1. Choose an asset folder and select an animation to preview it.
2. Keep exported `.json` or `.skel` files beside their atlas and texture pages.
3. Click the preview to pause or resume; drag horizontally to scrub.

Raw `.spine` projects need accompanying exports for library playback. Previewing exports works offline without the Spine editor.

To combine animations, open **Import animation** and follow **Open projects → Choose animations → Names & images → Preview → Save project**. Native importing requires an installed, activated Spine editor, a `.spine` project with an `images/` folder for each input, and Main at the same or a newer Spine version than Import. The app saves a new project and preserves the source files.

[Read the user guide](docs/USER_GUIDE.md) for import options, image sequences, skins, and format compatibility.

## Development

Requires Node.js and npm.

App source lives in `src/`, tests in `tests/`, bundled runtimes and licenses in `vendor/`, and the user guide in `docs/`.

```sh
npm ci
npm start
```

```sh
npm test          # Unit and Electron UI checks
npm run build:win # Windows x64 portable executable in dist/
```

Optional native-editor tests: `npm run test:import-native`. Set `SPINE_NATIVE_IMPORT_CLI` to your activated Spine CLI path.

## License

Original app code: [MIT](LICENSE). Bundled Spine runtimes and sample assets retain their own terms; see [vendor licenses](vendor/README.md) and [fixture licenses](tests/fixtures/README.md).
