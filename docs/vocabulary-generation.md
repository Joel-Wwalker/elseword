# Vocabulary generation

Generate vocabulary makes another variation using the saved seed, sound settings
and document revision. Kept words retain their spelling. Linked forms follow their
roots unless their own spelling is kept.

Restart vocabulary from seed uses a fixed starting sequence instead of the current
revision. Repeating it with the same seed, sounds, dictionary order and kept words
produces the same vocabulary. It preserves grammar, writing, notes, IDs and saved
phrases. It does not restore an earlier snapshot: added entries, changed sounds and
kept spellings can affect the result. Catalog copies initially use generation 1;
Restart uses generation 0, like manually created languages. Undo restores the
previous vocabulary while the current session remains open.

New languages choose short grammar markers from their sound inventory. Existing
markers are left alone when sounds change. Rules identifies markers outside the
inventory and offers an explicit replacement preview. Word-length and positional
restrictions apply to whole vocabulary words, not these short grammatical forms.

Rules reports repeated spellings, excluding aliases that still share their root's
spelling. Generating a vocabulary with homonyms requires a choice before it is
saved. Homonyms remain allowed. When there are at most 10,000 possible generation
combinations, the diagnostic enumerates their distinct permitted spellings. Larger
spaces show actual dictionary collisions without claiming an exact capacity.
