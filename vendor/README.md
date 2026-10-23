# Spine compatibility runtimes

## Spine 2.x

`spine-core-2.1.js` is the official `spine-js/spine.js` at tag [2.1.25](https://github.com/EsotericSoftware/spine-runtimes/tree/142e770e5b4b42395a3a0a68ff3c8a21ba2774eb), wrapped as `window.spine21`. The core preserves native 2.x bone inheritance, flips, IK, mesh weighting, and FFD. The 2.0 compatibility path uses the same core after decoding its distinct binary layout. `spine-2x-bridge.js` supplies WebGL rendering through the existing 3.4 batcher/atlas, bounds calculation, and an animation-name API adapter. It does not convert 2.x bone transforms to 3.x transforms.

Local fixes to the archived JS core: use `getFrameCount()` for IK/FFD durations; qualify `this.boneIndex` in flip timelines; initialize sparse FFD arrays with zeroes; default omitted rotation angles to zero; read setup-pose bone flip flags. These repair upstream JavaScript reader/runtime defects and follow the Java reader's defaults. The original license header is preserved, with the complete license in `LICENSE.spine-2.1`.

The binary readers in `old-spine-decoder.js` follow official `SkeletonBinary.java` at tags **2.0.18** (`309889c65336eab821e8ef695a5ce9ea77069bb2`, `spine-libgdx/src/com/esotericsoftware/spine/`) and **2.1.25** (`142e770e5b4b42395a3a0a68ff3c8a21ba2774eb`, `spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/`). The 2.0 license is retained as `LICENSE.spine-2.0`. Differences include nonessential metadata and 2.1 bone/animation flip fields. Numeric version headers select the matching reader; unknown binary versions are rejected rather than guessed. Unversioned JSON with the legacy object-based skins/slots/animations structure uses a visibly labeled 2.1 compatibility fallback. No export file is changed.

`spine-webgl-3.4.js` comes from the official `spine-ts/build/spine-webgl.js` at the [3.4.02 tag](https://github.com/EsotericSoftware/spine-runtimes/tree/ef5013143178918ddfc7cabfbddeae7aec7cf84e), commit `ef5013143178918ddfc7cabfbddeae7aec7cf84e`, with its license in `LICENSE.spine-3.4`. It is wrapped to expose `window.spine34`. Two path-length bugs in its JSON reader are corrected: integer division for the length array and an accidentally doubled loop increment.

`old-spine-decoder.js` implements the older binary layouts using these official format references:

- **3.2:** `spine-libgdx/spine-libgdx/src/com/esotericsoftware/spine/SkeletonBinary.java` at commit `6491800a23b1ce0093396423abdfbf0b7298a9ca`, following the upstream 3.2.00 update in `8d7f761311d14bbb8ed1fe9c2c32d3bbf71cd4d4`. License: `LICENSE.spine-3.2`.
- **3.4:** `spine-csharp/src/SkeletonBinary.cs` at the 3.4.02 commit above.

Both binary readers produce an in-memory JSON representation. The 3.2 adapter preserves its bone shear fields, weighted and linked meshes, FFD, constraint timelines, curves, draw order, and events while adapting earlier mesh/constraint names to the 3.4 renderer. It uses the 3.4 bone/mesh rendering implementation as a compatibility bridge; there is no separate native 3.2 WebGL bundle. Original assets are never rewritten. The 3.4 path is verified with genuine official mesh/path exports and the user's `E50002.spine` project. The 3.2 path is verified with deterministic reference fixtures, whose wire layout and generation script are included under `tests/fixtures/`.

`spine-webgl-3.6.js` is vendored from [esterTion/spine-runtimes](https://github.com/esterTion/spine-runtimes/tree/8d79291441394b3a279d5d36f054d563dbc15e16), a fork of the official Esoteric Software runtime with a Spine 3.5/3.6 binary reader.

Source: `spine-ts/build/spine-webgl.js`, commit `8d79291441394b3a279d5d36f054d563dbc15e16`.

Local change: an outer function wrapper exports `window.spine36`, keeping it separate from the modern player's `window.spine`. The upstream runtime implementation is otherwise unchanged. The applicable Spine runtime license is retained in `LICENSE.spine-3.6`.

`spine-webgl-3.7.js` and `spine-webgl-3.8.js` are the official Esoteric Software `spine-ts/build/spine-webgl.js` bundles, wrapped in the same way to expose `window.spine37` and `window.spine38`:

| Series | Official source commit | License |
| --- | --- | --- |
| 3.7 | `9639bcc81722d7178fd9d1cdc1a3d55a4c91f989` | `LICENSE.spine-3.7` |
| 3.8 | `8b4844bd4b193ba9e54487ed397a777993cbad56` | `LICENSE.spine-3.8` |

The 3.7 TypeScript runtime has no binary parser. `spine-binary-3.7.js` ports the existing 3.6 fork's reader to the official 3.7 binary layout, using `spine-csharp/src/SkeletonBinary.cs` from the 3.7 commit above as the format reference. Changes cover the audio path and audio events, IK compression/stretch/uniform flags and timelines, clipping wire type, point attachment field order, and truncated-read/string bounds checks. It reads 3.7 data directly; no format conversion or external executable is used. Both source licenses are retained beside it.

The 4.0, 4.1, and 4.2 players are exact-version npm aliases to the official `@esotericsoftware/spine-player` packages. The existing 4.3 player remains the default for 4.3 exports. The local runtime catalog selects the matching major/minor series, loads it on demand, and retains its namespace independently of the other runtimes. No runtime is downloaded during preview playback.

Additional 3.x compatibility readers in old-spine-decoder.js follow the official Java SkeletonBinary.java sources: 3.0 at 8e9595f496f7; 3.1 at tag 3.1.07 (including the earlier parent/mesh array layout before 3.1.05); 3.3 at 534ffc8d1d27 (its final reader body is identical to 3.4.02); and 3.5 at tag 3.5.51. Their source licenses are preserved as LICENSE.spine-3.0, -3.1, -3.3, and -3.5. The 3.5 reader handles its FPS metadata, bone transform mode, constraint ordering and absence of 3.6 dark slot colors/local transform flags, then renders its JSON representation with spine36. All sources are in https://github.com/EsotericSoftware/spine-runtimes.

The 3.8 JSON and binary readers permit best-effort loading of 3.8.75 exports instead of unconditionally rejecting the version header. The remaining data readers are unchanged. This local change is tested against reference JSON/binary fixtures and the user's lrsc502/lrsc532 JSON and 233/228 binary exports, preserving the original version and all file contents. The upstream reason is export bugs, as documented in https://github.com/EsotericSoftware/spine-runtimes/issues/2428.
