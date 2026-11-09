# Architecture

Oddtongue is a static browser application. Its source uses JavaScript ES modules, HTML and separate CSS files. esbuild bundles the main entry and splits modules loaded on demand. There is no application server in guest mode; `serve.mjs` is a local file server for the built site.

## Language editing

`src/app.js` starts the studio, loads saved languages, handles navigation and connects the editing controls to the language engine and scene player.

| Module | Responsibility |
| --- | --- |
| `engine.js` | Validates language documents, generates words from sounds and seeds, composes structured sentences, looks up free text and renders writing. |
| `vocabulary.js` | Defines the starting vocabulary. |
| `language-tools.js` | Handles related words, compounds, sound rules, phrasebooks and vocabulary imports. |
| `language-ui.js` | Connects those tools to the interface. |
| `writing-presets.js` | Defines and applies character mappings. |
| `storage.js` | Loads, validates and saves the local language workspace, including recovery data. |

An edit changes the current in-memory language, refreshes the affected view and saves the local workspace. Imports pass through validation before becoming local languages. Undo history belongs to the current session. Some storage keys and format identifiers retain the earlier names `elseword` and `little-languages` so existing saves still work.

The sentence builder uses explicit subject, verb, object and modifier choices. Built-in dialogue also carries authored grammatical structure. The free-text gloss only matches dictionary entries; it is a separate path from sentence composition.

## Scenes and sound

`scenes.js` supplies the characters, rooms and authored conversations. `scene-language.js` renders their language structures and adds required vocabulary without replacing existing edits. `scene-player.js` presents these conversations using the shared layout geometry in `scene-layout.js`.

Opening the scene editor loads `scene-maker.js` on demand. It owns editor state, undo, current-draft recovery, named local scenes and cloud scene controls. A scene stores its own language snapshot, so changing a studio language does not silently rewrite an existing scene.

`scene-project.js` validates portable scene documents and compiles their dialogue and actions into a timed sequence. `scene-renderer.js` draws that sequence on a canvas. The editor preview and `scene-video.js` use the same renderer; the video module is loaded when needed and records a browser-generated stream with MediaRecorder.

`text-audio.js` synthesizes short character sounds through Web Audio and manages playback and the studio sound preference. It does not record a microphone or generate speech.

## Interface styles

`styles.css` provides the main studio layout. `scenes.css`, `cloud.css`, `language-tools.css` and `scene-maker.css` style their respective areas. `interface.css`, `ribbon.css` and `heading-type.css` layer the shared controls, colors and typography. These ordinary stylesheets are loaded in order. Fonts and artwork are served from `src/assets/`.

## Optional cloud storage

Cloud storage sits alongside the local workspace. It never becomes a prerequisite for creating or editing a language.

1. `cloud-config.js` receives the public configuration inserted at build time. `cloud-ui.js` handles sign-in and the language library; the scene editor supplies its own library controls.
2. `cloud-service.js` wraps the Supabase SDK for authentication and database requests. Session tokens remain inside this adapter.
3. `cloud-library.js` tracks versions, pending writes and links between local and cloud copies. Language and scene libraries use separate validators and caches. `cloud-document.js` compares JSON content independently of object-key order.
4. Supabase stores language and scene documents in PostgreSQL. Row Level Security limits reads to the authenticated owner. Browser clients write through save/delete RPC functions, which validate the document and derive ownership from the authenticated session.

Saving sends the version the editor last opened. If another device has changed that version, the database rejects the stale write and the app keeps the local work. A mutation ID makes retrying the same save safe after a lost response. Deletion removes the document payload and retains a small tombstone so an older device cannot recreate the deleted record by mistake.

Sign-in does not upload local documents. Opening a cloud language creates a local copy, and subsequent edits need an explicit Save online. The public browser key identifies the backend; authentication and database policies enforce ownership.

## Build and tests

`build.mjs` copies static source assets to `dist/` and bundles the app with esbuild. Only the public cloud settings are embedded in the bundle. `serve.mjs` serves `dist/` on port 58110.

`npm test` uses Node's test runner for language behavior, persistence, scenes, sound and cloud flows. Database tests execute the SQL migrations in PGlite with test authentication roles. The browser fixture under `tests/browser/` exercises account dialogs with an in-memory service. These checks do not establish that a hosted backend or its email provider is configured correctly.
