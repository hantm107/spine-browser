# Library backup format

Spine Browser exports a UTF-8 JSON file, with this version 1 envelope:

```json
{
  "format": "spine-browser-library",
  "version": 1,
  "appVersion": "1.6.2",
  "exportedAt": "2026-11-08T00:00:00.000Z",
  "data": {
    "workspace": {
      "favorites": {},
      "recent": [],
      "categories": [],
      "browseLocations": {}
    },
    "appendList": [],
    "preferences": {
      "hideSkelFiles": false,
      "importSettings": null
    }
  }
}
```

`version` identifies the backup schema independently of the application version. Unknown versions and other applications' JSON files are rejected. Future schema changes should add an explicit migration before accepting a new version.

| Section | Contents |
| --- | --- |
| `workspace.favorites` | Map of stable absolute-path asset IDs to bookmark records. Legacy `true` values are also supported. |
| `workspace.categories` | Ordered `{id, name, color, assets}` records. `assets` uses the same bookmark map; IDs, colors and memberships are preserved. |
| `workspace.folder`, `recent` | Last opened folder and ordered recent folder links. |
| Other workspace fields | `category`, `selected`, `search`, `view`, `favoritesOnly`, `scroll`, and per-collection `browseLocations` including visible anchors. |
| `appendList` | Ordered saved source records, including unavailable sources. Availability is recalculated from disk after restoration. |
| `preferences` | Hide .skel setting and nullable `{cliPath, editorVersion}` import settings. |

A bookmark includes `id`, `fullPath`, `fileName`, `name`, `folder`, and `relativePath`, plus the application's saved metadata. Grouped assets retain their `files` records and thumbnail key. Keeping the existing workspace shape avoids losing the identity of groups with several source formats or duplicating shared category memberships. Derived metadata can be refreshed when the folder or bookmark is inspected again.

Exports include links and metadata only. They contain no project/texture bytes, thumbnail images, editor sessions, temporary import workspaces, or window state. Paths are absolute and are not remapped automatically. Archive source assets separately when moving machines, including working folders referenced by reconstructed Append sources.

Restore validates the complete document (maximum 32 MiB), asks before replacing data, and writes a full recovery JSON under the profile's `library-backups` directory before any changes. Backup files and the Append-list file use temporary-file replacement. Renderer preference writes revert on failure; an unsuccessful preference write also restores the previous Append list. The JSON recovery copy remains available if the application or machine stops during restoration; the renderer profile and Append list are separate stores, so replacement across both is not a single filesystem transaction. Use **Restore library** with the recovery file to return to the previous snapshot.
