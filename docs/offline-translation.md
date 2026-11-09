# Offline sentence translation

Writing > Translate English handles a single English clause in the browser. It parses a supported pattern, looks up dictionary meanings, and applies the selected word order, adjective position and grammar particles. The result uses the current alphabet and writing direction. No submitted text goes to an AI service.

Supported examples include `I want bread.`, `She bought a book.`, `Do you see the moon?`, and `The dragon wants a blue umbrella.` New nouns and recognized adjectives are coined from the language's sounds and saved through the normal edit/Undo path. Repeated translations reuse those words. Custom dictionary verbs can extend the supported action vocabulary.

Profanity is not filtered. Common swear verbs, adjectives and short expressions are supported; unfamiliar words remain subject to the same parsing rules. Standalone fixed expressions are stored as editable phrase meanings.

This is a pattern translator, not general English translation. It rejects clauses, idioms, prepositions, unsupported verb forms, ambiguous noun forms and multiple sentences. It does not distinguish senses such as financial bank versus river bank, and it does not claim native-language fluency. Unsupported input leaves the dictionary unchanged.

The existing 2,000-entry dictionary limit still applies. New word generation fails without partial additions when the dictionary is full or the sound inventory cannot supply another distinct spelling. Translation output is cleared when its input or language changes, so it cannot silently show an older dictionary result.
