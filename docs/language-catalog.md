# Language catalog

The server stores 1,000 fixed version-1 language blueprints in
`oddtongue_private.language_blueprints`. Each blueprint contains a name, seed,
sound inventory, syllable patterns and grammar. The migration populates these
rows once; clicking Generate does not create a new catalog entry.

`pick_language_blueprint(excluded_seeds)` selects one row at random. Guests and
signed-in users can call it, but neither can read or change the backing table.
The endpoint accepts up to 25 recent seeds to avoid immediately repeating a
selection. It returns one JSON object:

```text
{version, name, seed, preset, sounds, grammar}
```

The browser expands the selected blueprint into a normal language document with
the existing deterministic vocabulary engine. All starting words are editable.
During expansion, markers that use sounds outside the recipe's inventory are
replaced with deterministic short forms from that inventory. Compatible markers
are retained. This affects new copies only; saved languages retain their markers.
After creation, editing, local backups and cloud saves use the same document
format as manually created languages. Saving a language retains its actual words,
so it does not depend on another catalog lookup.

The catalog is omitted from the frontend bundle and has no browse/list endpoint.
This is not a secrecy boundary: repeated public calls can reveal different
entries, and the population recipe is part of this open-source repository.

Apply `supabase/migrations/202611090001_language_catalog.sql` before deploying a
frontend that calls this RPC. Its tests check all 1,000 blueprints, complete
vocabulary expansion, deterministic spellings, exclusion limits and database
permissions.
