# Contributing to Oddtongue

Bug reports, documentation fixes and code contributions are welcome. For a substantial feature or a change to saved data, open an issue first so the intended behavior can be discussed.

## Getting started

Use Node.js 22 or newer. From your checkout, run:

```sh
npm ci
npm test
npm run build
npm run dev
```

Open [localhost:58110](http://localhost:58110/). Rebuild and reload after source changes. Guest mode is enough for most work; see the [development guide](docs/development.md) for optional cloud setup and the [architecture guide](docs/architecture.md) for a source map.

## Making a change

Keep each pull request focused on one problem. Follow the nearby JavaScript and CSS conventions, and avoid unrelated formatting changes. Explain new dependencies or changes to public file formats.

Preserve existing language backups, scene files and browser saves. Some internal identifiers still use `elseword` or `little-languages` for compatibility. Add a new migration for database changes; do not edit the three existing migrations or replay them on a database that already has them.

For a behavior change, add or update a test that demonstrates the behavior. Run `npm test` and `npm run build` before submitting. Check interface changes in the browser, including narrow screens and keyboard navigation. If a check cannot be run, say which one and why.

Keep credentials, personal data, local environment files and generated build output out of commits. Preserve third-party license notices when changing bundled assets.

## Pull requests

Use a subsystem prefix and a concrete verb in commit and pull request titles, such as `[Writing] Keep alphabet controls collapsed until needed` or `[SceneEditor] Preserve the preview position when hiding it`.

Describe the problem, the resulting behavior and how you verified it. A short before-and-after example is often enough. Include screenshots when they help explain a visual change, with personal data removed.

Use short paragraphs rather than a fixed checklist. Explain what a test or manual check establishes, and keep unrelated changes in separate commits.

Link a related issue when one exists. Mention any data migration, compatibility effect or follow-up needed to use the change.

## Reporting an issue

For a bug, include steps to reproduce it, what you expected, what happened, and your browser and operating system. A small sample language or scene file can help if it contains no personal information.

For a feature, describe what you are trying to do and where the current workflow gets in the way. A proposed solution is useful, but the underlying problem matters most.

Contributions are made under the project's [MIT License](LICENSE). Bundled fonts keep their separate licenses.
