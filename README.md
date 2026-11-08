# Oddtongue

Oddtongue is a browser-based studio for making constructed languages and trying them in animated conversations. Shape a language's sounds, edit its vocabulary and grammar, then write dialogue and build scenes with it.

The app works without an account. Languages and scene drafts save in your browser; JSON downloads let you keep portable backups. Optional Supabase integration adds private cloud copies.

## Run locally

Install [Node.js](https://nodejs.org/) 22 or newer, then run these commands from the repository directory:

```sh
npm ci
npm run build
npm run dev
```

Open [localhost:58110](http://localhost:58110/). The server serves the built `dist/` directory. Run `npm run build` again after changing source files, then reload the page.

Run the test suite with:

```sh
npm test
```

No environment file or cloud account is needed for local use or tests.

## What you can make

- **Languages:** choose sounds, syllable patterns, sound changes and a generation seed. Edit words, keep spellings through regeneration, add related forms and compounds, and import or export vocabulary as CSV.
- **Grammar and writing:** set word order, adjective placement, plurals and tense, negative and question markers. Build sentences, save a phrasebook, choose a writing preset or map your own symbols, and print a language reference.
- **Conversations:** explore eight rooms and sixteen conversations with interchangeable characters, reply choices, subtitles and synthesized text sounds. Word edits appear in the dialogue.
- **Scenes:** arrange dialogue, actions and pauses for two characters and a prop. Keep named scenes on your device, exchange JSON files, and record clips up to 60 seconds in a supported browser.

Word generation is deterministic from the chosen sounds and seed. The sentence builder and built-in dialogue use explicit grammatical structures. The free-text tool looks up dictionary entries; it does not infer grammar from arbitrary text. Text sounds are character effects rather than pronunciation, and writing presets map characters rather than create fonts.

Video export uses browser Canvas capture and MediaRecorder. It records at normal playback speed in an active, visible tab, using MP4 when supported or WebM otherwise.

## Saving your work

Language edits save automatically on this device. The scene editor also recovers its current draft and offers named local saves. Browser storage belongs to the current browser and site address, so download JSON backups before clearing site data or moving to a different installation.

When cloud storage is configured, **Save online** writes a private copy to your account. Signing in does not upload local work. Opening a cloud language makes a local working copy, and later edits need another Save online. Signing out leaves local copies on the device. Cloud saves do not continuously synchronize or publicly share projects.

See [development setup](docs/development.md) to configure your own Supabase backend using [`.env.example`](.env.example).

## Development

Oddtongue uses JavaScript ES modules and CSS, bundled with esbuild. Supabase provides optional authentication and storage; PGlite runs the database tests locally.

- [Development guide](docs/development.md): commands, browser checks and optional cloud setup.
- [Architecture](docs/architecture.md): source layout and the path from editing to local or cloud persistence.
- [Contributing](CONTRIBUTING.md): focused changes, bug reports and pull requests.

## License and credits

The application is available under the [MIT License](LICENSE).

Bundled fonts retain their SIL Open Font Licenses and copyright notices:

- [VT323](src/assets/VT323-OFL.txt), The VT323 Project Authors.
- [Oxanium](src/assets/Oxanium-OFL.txt), The Oxanium Project Authors.
- [Pixelify Sans](src/assets/PixelifySans-OFL.txt), The Pixelify Sans Project Authors.
