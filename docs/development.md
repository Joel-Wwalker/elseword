# Development

## Local setup

Use Node.js 22 or newer. CI uses Node.js 24. Install the locked dependencies, build the app and start the local server:

```sh
npm ci
npm run build
npm run dev
```

Open [localhost:58110](http://localhost:58110/). The server reads `dist/`; it does not watch or rebuild source files. After editing `src/`, run `npm run build` again and reload the browser.

Guest mode needs no environment variables or account. To build in guest mode, leave the Supabase URL and key unset. If you have a local cloud configuration, set those values to empty in `.env.local` for a guest build.

## Checks

```sh
npm test
npm run build
```

The test command runs `tests/*.test.mjs` through Node's test runner. It covers the language engine, storage and imports, scene timing and rendering, audio behavior and cloud state. SQL policy tests use PGlite locally and require no hosted database. To run a single test file:

```sh
node --test tests/engine.test.mjs
```

For a change to the interface, also check the affected flow in the browser. Useful checks include keyboard access, a narrow viewport, reduced motion, saving and reloading, and an export/import round trip when file formats are involved.

The account-dialog fixture uses an in-memory service and does not send email or modify cloud data:

```sh
node tests/browser/serve.mjs
```

Open [the cloud UI fixture](http://localhost:58111/tests/browser/cloud.html). This is a manual fixture, separate from the application build and `npm test`.

## Optional Supabase setup

Use a Supabase project you control. The app needs authentication, PostgreSQL and the Data API. Keep the existing migrations unchanged and apply them once, in filename order, to a fresh project:

1. `supabase/migrations/202611070001_cloud_languages.sql`
2. `supabase/migrations/202611080001_language_tools.sql`
3. `supabase/migrations/202611080002_cloud_scenes.sql`
4. `supabase/migrations/202611090001_language_catalog.sql`
5. `supabase/migrations/202611090002_scene_draft_references.sql`
6. `supabase/migrations/202611090003_generation_version.sql`
7. `supabase/migrations/202611090004_scene_expressions.sql`

Do not replay an applied migration. Add a new migration for later schema changes. [The database guide](../supabase/README.md) describes ownership, validation, version checks and RPC errors.

Apply new migrations before deploying client code that writes the new fields. The scene-expression migration accepts the optional per-line expression setting while keeping existing version-one scenes valid; it does not rewrite saved documents or change ownership rules.

Copy [`.env.example`](../.env.example) to `.env.local` and fill in:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_GOOGLE_ENABLED=false
```

Use the project's [public publishable key](https://supabase.com/docs/guides/getting-started/api-keys). A secret or service-role key does not belong in this file or the browser bundle. `.env.local` is ignored by Git. The build reads it, embeds the public settings and leaves the file out of `dist/`.

In Supabase Authentication, configure the site URL and allowed redirect URL for [localhost:58110](http://localhost:58110/) during local development. Add the exact deployed return URL when setting up hosting. Follow Supabase's [passwordless email setup](https://supabase.com/docs/guides/auth/auth-email-passwordless) and configure email delivery for your intended users. Email sign-in uses [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), so the link must finish in the browser where sign-in began.

Google sign-in is optional. Follow Supabase's [Google setup guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) to configure an OAuth client and callback URL before setting `SUPABASE_GOOGLE_ENABLED=true`. Leave it false to keep the Google button hidden. Rebuild after any configuration change.

Verify sign-in, saving, opening a copy, conflicting saves and account isolation against your own backend. Automated tests cover the local implementation and SQL rules; they do not verify live email delivery or provider configuration.

## Static hosting

Build with the intended public configuration and serve the contents of `dist/` from a static host. Cloud configuration is fixed at build time, so changing the backend requires another build. Configure authentication return URLs for the deployed address before testing sign-in there.

Browser storage is scoped to a site origin. Moving from localhost to another address does not carry local saves with it; export JSON backups and import them at the new address, or explicitly save and open cloud copies.
