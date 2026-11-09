# Optional cloud storage

Oddtongue works without a backend. Connecting a Supabase project adds email-link sign-in, optional Google sign-in, and private cloud copies of languages and scenes. Local drafts and downloaded files remain independent of cloud copies.

## Apply the migrations

Create a Supabase project, then apply these files once, in filename order:

| Order | Migration | Purpose |
| --- | --- | --- |
| 1 | [`202611070001_cloud_languages.sql`](migrations/202611070001_cloud_languages.sql) | Language storage, document validation, owner read policies, and versioned save/delete functions. |
| 2 | [`202611080001_language_tools.sql`](migrations/202611080001_language_tools.sql) | Language v2 validation for word families, sound rules, and phrasebooks; keeps v1 support without rewriting existing rows. |
| 3 | [`202611080002_cloud_scenes.sql`](migrations/202611080002_cloud_scenes.sql) | Scene storage, validation, owner read policies, and versioned save/delete functions. |

| 4 | [`202611090001_language_catalog.sql`](migrations/202611090001_language_catalog.sql) | Private catalog of 1,000 language blueprints and anonymous single-language selection. |

The SQL expects Supabase's `auth.users`, `auth.uid()`, `anon`, and `authenticated` roles. Use your migration runner, or apply the files manually in the SQL editor. For manual installation, wrap the first file in `BEGIN;` and `COMMIT;`; the later files already contain transaction boundaries. Run and verify one file before continuing to the next.

Keep a record of which migrations were applied to each environment. Manual SQL execution does not register migration history with a CLI runner. Do not replay already-applied files. Treat all applied migration files as immutable and add a new migration for future changes.

## Configure the app and authentication

Copy the root [`.env.example`](../.env.example) to `.env.local` and set the public browser configuration:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<public-publishable-key>
SUPABASE_GOOGLE_ENABLED=false
```

Use a public publishable key or legacy `anon` key. The build includes these values in browser JavaScript; never supply a secret or `service_role` key. Keep `.env.local` out of version control. Run `npm run build` after changing configuration.

Enable email-link sign-in in Supabase Auth. Set the authentication site URL to the deployed app address and allow the exact return URLs used by each environment, for example:

```text
https://<app-domain>/
http://localhost:58110/
```

The app returns sign-ins to its current directory with a trailing slash. If deployed under a path, allow that path as well, such as `https://<app-domain>/oddtongue/`. Email links use PKCE: open the sign-in link in the browser that requested it. Configure email delivery for your deployment and verify that links arrive and return to the app.

For optional Google sign-in:

1. Configure a Google OAuth web client for the deployment.
2. Register the Supabase callback as an authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Enable the Google provider in Supabase Auth and enter the client credentials there. Provider secrets belong in Supabase, not the app environment file.
4. Keep the app return URL on the Supabase redirect allowlist, set `SUPABASE_GOOGLE_ENABLED=true`, and rebuild.

## Ownership and write contract

`cloud_languages` and `cloud_scenes` each belong to a stable authenticated user ID. Row Level Security permits signed-in clients to select only their own rows. Anonymous clients have no table access, and browser clients have no direct insert, update, or delete privileges.

Writes go through four functions, which derive ownership from `auth.uid()` and check it again inside the transaction:

| Function | Parameters |
| --- | --- |
| `save_language`, `save_scene` | `p_id`, `p_document`, `p_expected_version`, `p_mutation_id` |
| `delete_language`, `delete_scene` | `p_id`, `p_expected_version`, `p_mutation_id` |

A save creates a record when `p_expected_version` is `null`; an update must provide the current cloud version. The server increments that version atomically. It is separate from a language document's `revision` field or format version. A mutation UUID identifies one attempted write: an exact retry of the last accepted mutation returns its saved result, while stale or mismatched requests return `CLOUD_CONFLICT`.

Each function returns `{id, document, version, updated_at, deleted_at}`. Deletion clears the payload and keeps a compact tombstone so an old device cannot recreate the same cloud row. Separate local copies remain available and can be saved under a new UUID. Deleting a Supabase account cascades its language and scene rows. There is no public-sharing endpoint.

Each collection permits 50 active records per account. Saves validate document structure and enforce a 1,000,000-byte JSONB limit. Scenes contain an independent v2 language snapshot and 1–24 beats. Browser validation additionally resolves built-in scene references and geometry. PostgreSQL's JSONB text formatting can make cloud payloads larger than compact browser JSON, so files near the browser limit may need to be reduced before saving online.

| Error | Meaning |
| --- | --- |
| `AUTH_REQUIRED` | No authenticated subject is available. |
| `INVALID_DOCUMENT` | The document or write parameters violate validation limits. |
| `CLOUD_CONFLICT` | The version changed, the row was deleted, or the request cannot affect that ID. |
| `CLOUD_LIMIT` | The account already has 50 active records in that collection. |

## Verify an installation

After applying the migrations, run the following SQL files manually as an administrator:

- [`verify-cloud-schema.sql`](verify-cloud-schema.sql) checks the language table's policies, grants, functions, and constraints through the database catalog.
- [`verify_creative_studio.sql`](verify_creative_studio.sql) checks both collections and their functions, then reports row and validation counts without returning document contents.

Both scripts are read-only. Compare their results with the expectations in the SQL comments: RLS enabled, one owner-scoped SELECT policy per table, no anonymous access, authenticated SELECT only, and authenticated execution limited to the four save/delete functions. Write functions use `SECURITY DEFINER` with an empty `search_path`; helper functions are not callable by browser roles.

Run the local database tests from the repository root after installing dependencies:

```sh
node --test tests/cloud-database.test.mjs tests/cloud-language-tools.test.mjs tests/cloud-scenes-database.test.mjs
```

These tests execute the migrations in PGlite with a test authentication schema. They cover document validation, owner isolation, direct-write rejection, optimistic versions, retries, deletion, byte limits, and quotas. They do not verify a hosted deployment's configuration. Separately test email and any enabled Google sign-in, then use two test accounts to confirm that each account sees only its own cloud copies.
