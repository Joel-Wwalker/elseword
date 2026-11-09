// English forms belong to the input/output boundary. Saved dictionary entries
// retain their own meanings and spellings, including literal inflected forms.
export const keyFor = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
export const entryFor = (language, meaning) => (language?.words ?? []).find(word => keyFor(word.english) === keyFor(meaning));
export const PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that']);
export const ENGLISH_PLURALS = Object.freeze({ child: 'children', person: 'people', leaf: 'leaves', fish: 'fish', sheep: 'sheep', mouse: 'mice', foot: 'feet', tooth: 'teeth', man: 'men', woman: 'women' });
const BUILTIN_PLURAL_ROOTS = Object.freeze({ books: 'book', tickets: 'ticket', coins: 'coin', stars: 'star' });
export const ENGLISH_PAST = Object.freeze({ be: 'was', have: 'had', do: 'did', eat: 'ate', drink: 'drank', buy: 'bought', sell: 'sold', give: 'gave', take: 'took', go: 'went', come: 'came', see: 'saw', hear: 'heard', know: 'knew', speak: 'spoke', find: 'found', read: 'read', write: 'wrote', sleep: 'slept', make: 'made', pay: 'paid', say: 'said', run: 'ran', stop: 'stopped', meet: 'met', shit: 'shat' });
const VERB_ALIASES = Object.freeze({ am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', has: 'have', needs: 'need', coming: 'come', said: 'say', stops: 'stop', does: 'do', asked: 'ask' });
const SWEAR_VERBS = new Set(['fuck', 'shit', 'piss']);
const NO_OBJECT = new Set(['go', 'come', 'wait', 'sleep', 'work', 'walk', 'run', 'stop']);
const OPTIONAL_OBJECT = new Set(['eat', 'drink', ...SWEAR_VERBS]);
const DIRECTIONAL_HOME = new Set(['go', 'come', 'walk', 'run']);
const MASS_OR_TIME = new Set('bread water tea coffee milk soup rice fruit cheese fish salt sugar sleep rain time work today tomorrow yesterday morning night day home'.split(' '));
const capitalize = text => text ? [...text][0].toLocaleUpperCase('en-US') + text.slice([...text][0].length) : '';
const SLOT_TYPES = { subject: ['noun', 'pronoun'], verb: ['verb'], object: ['noun', 'pronoun'], adjective: ['adjective'] };
const OBJECT_CASE = new Map([['i', 'me'], ['he', 'him'], ['she', 'her'], ['we', 'us'], ['they', 'them']]);
const selectionEntry = (language, value) => (language?.words ?? []).find(word => word.id === value) ?? entryFor(language, value);

/** Both editors offer the same dictionary roles; old selections are validated separately. */
export function sentenceChoices(language) {
  return Object.fromEntries(Object.entries(SLOT_TYPES).map(([slot, types]) => [slot,
    (language?.words ?? []).filter(word => types.includes(word.pos) && (slot !== 'verb' ||
      (verbForm(language, word.english)?.root ?? keyFor(word.english)) === keyFor(word.english))),
  ]));
}

export function canPluralizeObject(options, language) {
  return Boolean(options.object && selectionEntry(language, options.object)?.pos === 'noun');
}

export function verbForm(language, surface) {
  const word = keyFor(surface), known = candidate => entryFor(language, candidate)?.pos === 'verb' || SWEAR_VERBS.has(candidate);
  if (Object.hasOwn(VERB_ALIASES, word)) return { root: VERB_ALIASES[word], tense: ['was', 'were', 'said', 'asked'].includes(word) ? 'past' : 'present' };
  const past = Object.entries(ENGLISH_PAST).find(([root, form]) => root !== form && form === word && known(root));
  if (past) return { root: past[0], tense: 'past' };
  const linked = entryFor(language, word);
  if (linked?.family?.kind === 'alias') {
    const root = language.words.find(item => item.id === linked.family.rootId);
    if (root?.pos === 'verb') return { root: keyFor(root.english), tense: 'present' };
  }
  if (known(word)) return { root: word, tense: 'present' };
  const pastCandidates = word.endsWith('ied') ? [word.slice(0, -3) + 'y'] : word.endsWith('ed') ? [word.slice(0, -2), word.slice(0, -1), /([a-z])\1ed$/.test(word) ? word.slice(0, -3) : ''] : [];
  const pastRoots = [...new Set(pastCandidates.filter(known))];
  if (pastRoots.length === 1) return { root: pastRoots[0], tense: 'past' };
  const presentCandidates = word.endsWith('ies') ? [word.slice(0, -3) + 'y'] : [word.endsWith('es') ? word.slice(0, -2) : '', word.endsWith('s') ? word.slice(0, -1) : ''];
  const presentRoots = [...new Set(presentCandidates.filter(known))];
  return presentRoots.length === 1 ? { root: presentRoots[0], tense: 'present' } : null;
}

export function englishPlural(noun) {
  if (Object.hasOwn(ENGLISH_PLURALS, noun)) return ENGLISH_PLURALS[noun];
  if (/[^aeiou]y$/iu.test(noun)) return noun.slice(0, -1) + 'ies';
  return noun + (/(s|x|z|ch|sh)$/iu.test(noun) ? 'es' : 's');
}

export function knownNounForm(language, surface) {
  const word = keyFor(surface), existing = entryFor(language, word);
  if (existing?.family?.kind === 'plural') {
    const root = language.words.find(item => item.id === existing.family.rootId);
    if (root?.pos === 'noun') return { root: keyFor(root.english), plural: true, surface: word };
  }
  const irregular = Object.entries(ENGLISH_PLURALS).find(([root, plural]) => root !== plural && plural === word);
  if (irregular) return { root: irregular[0], plural: true, surface: word };
  if (existing?.pos === 'noun' && Object.hasOwn(BUILTIN_PLURAL_ROOTS, word)) return { root: BUILTIN_PLURAL_ROOTS[word], plural: true, surface: word };
  const roots = (language?.words ?? []).filter(item => item.pos === 'noun' && keyFor(item.english) !== word && englishPlural(keyFor(item.english)) === word);
  if (roots.length === 1) return { root: keyFor(roots[0].english), plural: true, surface: word };
  return existing?.pos === 'noun' ? { root: word, plural: false, surface: word } : null;
}

export function pluralEntry(language, root, surface) {
  const base = entryFor(language, root), explicit = surface && surface !== root ? entryFor(language, surface) : null;
  if (explicit?.pos === 'noun') return explicit;
  const plural = englishPlural(root);
  return (language?.words ?? []).find(word => word.family?.kind === 'plural' && word.family.rootId === base?.id)
    ?? (plural !== root ? entryFor(language, plural) : null);
}

export function clauseError({ verb, object }) {
  if (verb === 'be') return object ? '' : 'Choose a noun or adjective after “be”.';
  if (object?.adjectiveOnly) return 'Choose an object for this adjective, or use “be”.';
  if (!object && !NO_OBJECT.has(verb) && !OPTIONAL_OBJECT.has(verb)) return 'Add an object after this verb.';
  if (object && NO_OBJECT.has(verb)) {
    if (DIRECTIONAL_HOME.has(verb) && object.root === 'home' && !object.article && !object.modifier && !object.plural) return '';
    return 'This verb supports no object, or “home” after go, come, walk or run. Other complements are not supported yet.';
  }
  return '';
}

export function clauseFromSelections(options, language) {
  for (const [slot, types] of Object.entries(SLOT_TYPES)) {
    if (!options[slot]) continue;
    const entry = selectionEntry(language, options[slot]) ?? (['subject', 'object'].includes(slot)
      ? entryFor(language, knownNounForm(language, options[slot])?.root) : null);
    if (!entry) throw new Error(`The ${slot} word “${options[slot]}” is no longer in this dictionary. Choose another word.`);
    if (!types.includes(entry.pos)) throw new Error(`Choose ${slot === 'adjective' ? 'an adjective' : slot === 'verb' ? 'a verb' : 'a noun or pronoun'} for the ${slot}. “${entry.english}” is listed as ${entry.pos}.`);
  }
  const source = value => keyFor(selectionEntry(language, value)?.english ?? value);
  const subjectKey = source(options.subject), verbKey = source(options.verb), objectKey = source(options.object), modifier = source(options.adjective);
  if (!subjectKey || !verbKey) throw new Error('Choose a subject and a verb.');
  const verb = verbForm(language, verbKey)?.root ?? verbKey;
  if (objectKey && modifier && selectionEntry(language, options.object)?.pos === 'pronoun') throw new Error('Use a description with a noun object, or leave the object empty after “be”.');
  const nounPart = (surface, subject = false) => {
    if (PRONOUNS.has(surface) || entryFor(language, surface)?.pos === 'pronoun') return { root: surface, pronoun: true };
    const form = knownNounForm(language, surface) ?? { root: surface, surface, plural: false };
    const plural = form.plural || (!subject && Boolean(options.plural));
    return { ...form, plural, article: plural || MASS_OR_TIME.has(form.root) ? '' : subject ? 'the' : 'a' };
  };
  const object = objectKey ? { ...nounPart(objectKey), modifier } : modifier ? { root: modifier, adjectiveOnly: true } : null;
  const clause = { subject: nounPart(subjectKey, true), verb, object, tense: options.tense ?? 'present', negative: Boolean(options.negative), question: Boolean(options.question) };
  const error = clauseError(clause);
  if (error) throw new Error(error);
  return clause;
}

export function clauseSyntax(clause) {
  const word = (key, pos) => ({ type: 'word', key, pos });
  const phrase = part => !part ? null : part.pronoun ? word(part.root, 'pronoun') : part.adjectiveOnly ? word(part.root, 'adjective') : {
    type: 'noun', head: word(part.root, 'noun'), determiner: part.article ? word(part.article === 'an' ? 'a' : part.article, 'particle') : null,
    adjectives: part.modifier ? [word(part.modifier, 'adjective')] : [], plural: Boolean(part.plural), surface: part.surface,
  };
  return { type: 'clause', subject: phrase(clause.subject), verb: word(clause.verb, 'verb'), object: phrase(clause.object), tense: clause.tense, negative: clause.negative, question: clause.question };
}

export function englishSentence(clause) {
  const phrase = (part, object = false) => {
    if (!part) return '';
    if (part.pronoun) return object ? OBJECT_CASE.get(part.root) ?? part.root : part.root === 'i' ? 'I' : part.root;
    if (part.adjectiveOnly) return part.root;
    const body = [part.modifier, part.plural ? englishPlural(part.root) : part.root].filter(Boolean).join(' ');
    const article = part.article === 'a' && /^(?:[aeiou]|hour|honest|honou?r|heir)/i.test(body) ? 'an' : part.article;
    return [article, body].filter(Boolean).join(' ');
  };
  const { subject, verb, tense, negative, question } = clause;
  const pluralSubject = subject.plural || ['you', 'we', 'they'].includes(subject.root);
  const thirdPerson = !pluralSubject && subject.root !== 'i';
  let auxiliary = '', inflected = verb;
  if (tense === 'future') auxiliary = 'will';
  else if (verb === 'be') {
    auxiliary = tense === 'past' ? (pluralSubject ? 'were' : 'was') : subject.root === 'i' ? 'am' : pluralSubject ? 'are' : 'is';
    inflected = '';
  } else if (negative || question) auxiliary = tense === 'past' ? 'did' : thirdPerson ? 'does' : 'do';
  else if (tense === 'past') inflected = ENGLISH_PAST[verb] ?? (verb.endsWith('e') ? verb + 'd' : /[^aeiou]y$/.test(verb) ? verb.slice(0, -1) + 'ied' : verb + 'ed');
  else if (thirdPerson) inflected = ({ have: 'has', do: 'does', go: 'goes' })[verb] ?? englishPlural(verb);
  const tail = [negative ? 'not' : '', inflected, phrase(clause.object, true)];
  const parts = question && auxiliary ? [auxiliary, phrase(subject), ...tail] : [phrase(subject), auxiliary, ...tail];
  return capitalize(parts.filter(Boolean).join(' ')) + (question ? '?' : '.');
}
