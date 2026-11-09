# Vocabulary generation

Generate vocabulary makes another variation using the saved seed, sound settings
and document revision. Kept words retain their spelling. Linked forms follow their
roots unless their own spelling is kept.

Restart vocabulary from seed uses a fixed starting sequence instead of the current
revision. Repeating it with the same seed, sounds, dictionary order and kept words
produces the same vocabulary. It preserves grammar, writing, notes, IDs and saved
phrases. It does not restore an earlier snapshot: added entries, changed sounds and
kept spellings can affect the result. Catalog copies initially use revision 1;
Restart uses salt 0, like manually created languages. Undo restores the
previous vocabulary while the current session remains open.

Fresh defaults, starters and catalog copies record `generationVersion: 2`. This
version avoids three consecutive vowel letters and triple repeated letters when
generating roots, including the boundary with their plural ending. The check uses
the language's vowel inventory. It does not shorten or rewrite derived words.
Changing the plural marker can therefore affect later generated roots.

Backups without a generation version keep the original seeded algorithm. Loading
or importing any language preserves its words, kept forms and grammar markers.
Editing sound settings opts out of the default spelling preferences; a seed-only
edit keeps them. Explicit sound restrictions and weights, multi-letter vowels and
vowel-only syllable inventories retain their custom behavior. If a tiny custom
inventory cannot produce a preferred form within the bounded search, generation
uses that inventory rather than inventing sounds or returning an empty word.
Intentional custom affixes, compounds and kept spellings can contain longer runs.

New languages choose short grammar markers from their sound inventory. Existing
markers are left alone when sounds change. Rules identifies markers outside the
inventory and offers an explicit replacement preview. Word-length and positional
restrictions apply to whole vocabulary words, not these short grammatical forms.

Rules reports repeated spellings, excluding aliases that still share their root's
spelling. Generating a vocabulary with homonyms requires a choice before it is
saved. Homonyms remain allowed. When there are at most 10,000 possible generation
combinations, the diagnostic enumerates their distinct permitted spellings. Larger
spaces show actual dictionary collisions without claiming an exact capacity.

Before deploying the frontend with generation version 2, apply the
`202611090003_generation_version.sql` migration. It accepts the optional field in
language documents and scene snapshots without rewriting existing rows or the
server's catalog blueprints.
