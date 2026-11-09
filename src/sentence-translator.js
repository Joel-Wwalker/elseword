import { generateWord, validateLanguage } from './engine.js';

const SUBJECTS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that']);
const OBJECT_PRONOUNS = { me: 'i', him: 'he', her: 'she', us: 'we', them: 'they' };
const ARTICLES = new Set(['a', 'an', 'the']);
const COPULAS = { am: 'present', is: 'present', are: 'present', was: 'past', were: 'past' };
const AUXILIARIES = { do: 'present', does: 'present', did: 'past', will: 'future' };
const IRREGULAR_PAST = { had: 'have', ate: 'eat', drank: 'drink', bought: 'buy', sold: 'sell', gave: 'give', took: 'take', went: 'go', came: 'come', saw: 'see', heard: 'hear', knew: 'know', spoke: 'speak', found: 'find', wrote: 'write', slept: 'sleep', made: 'make', paid: 'pay', said: 'say', ran: 'run', met: 'meet', shat: 'shit' };
const IRREGULAR_PLURALS = { children: 'child', people: 'person', leaves: 'leaf', mice: 'mouse', feet: 'foot', teeth: 'tooth', men: 'man', women: 'woman' };
const COMMON_ADJECTIVES = new Set('red blue green yellow black white purple orange pink gray grey tall short young hungry thirsty beautiful strange brave clever angry fucking shitty damn goddamn crappy'.split(' '));
const BLOCKED = new Set('and or but because if unless although while who what where when why how which whose to from with without in on at under over into through for of can could may might must should would shall than as very too only every each any all some more most'.split(' '));
const CONTRACTIONS = { "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "won't": 'will not', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are' };
const INTRANSITIVE = new Set(['go', 'come', 'wait', 'sleep', 'work', 'walk', 'run', 'stop']);
const SWEAR_VERBS = new Set(['fuck', 'shit', 'piss']);
const FIXED_EXPRESSIONS = new Set(['shit', 'fuck', 'fuck you', 'damn it', 'bullshit', 'holy shit']);
const key = value => value.toLocaleLowerCase('en-US');

function fail(message) { throw new Error(message); }
function entry(language, english) { return language.words.find(word => key(word.english) === english); }
function adjective(language, english) { return entry(language, english)?.pos === 'adjective' || COMMON_ADJECTIVES.has(english); }
function verbRoot(language, word) {
  const knownVerb = candidate => entry(language, candidate)?.pos === 'verb' || SWEAR_VERBS.has(candidate);
  if (word === 'has') return { root: 'have', tense: 'present' };
  if (Object.hasOwn(IRREGULAR_PAST, word) && knownVerb(IRREGULAR_PAST[word])) return { root: IRREGULAR_PAST[word], tense: 'past' };
  if (knownVerb(word) && !['coming', 'asked', 'needs', 'stops', 'does'].includes(word)) return { root: word, tense: 'present' };
  const pastCandidates = word.endsWith('ied') ? [word.slice(0, -3) + 'y'] : word.endsWith('ed') ? [word.slice(0, -2), word.slice(0, -1), /([a-z])\1ed$/.test(word) ? word.slice(0, -3) : ''] : [];
  const past = pastCandidates.filter(knownVerb);
  if (new Set(past).size === 1) return { root: past[0], tense: 'past' };
  const presentCandidates = word.endsWith('ies') ? [word.slice(0, -3) + 'y'] : [word.endsWith('es') ? word.slice(0, -2) : '', word.endsWith('s') ? word.slice(0, -1) : ''];
  const present = presentCandidates.filter(knownVerb);
  if (new Set(present).size === 1) return { root: present[0], tense: 'present' };
  return null;
}

function noun(language, surface, warnings) {
  const existing = entry(language, surface);
  if (existing?.family?.kind === 'plural') {
    const root = language.words.find(word => word.id === existing.family.rootId);
    if (root?.pos === 'noun') return { root: key(root.english), plural: true, surface };
  }
  if (Object.hasOwn(IRREGULAR_PLURALS, surface)) return { root: IRREGULAR_PLURALS[surface], plural: true, surface };
  if (existing?.pos === 'noun') return { root: surface, plural: false, surface };
  if (existing) fail(`“${surface}” is not a noun in this dictionary.`);
  if (COMMON_ADJECTIVES.has(surface) || surface.endsWith('ly')) fail(`“${surface}” looks like an adjective or adverb. Use a noun, or add it to the dictionary as a noun first.`);
  if (surface.endsWith('ing') || surface.endsWith('ed')) fail(`“${surface}” could be a noun or a verb form. Use a simpler noun phrase.`);
  let root = surface, plural = false;
  if (surface.endsWith('ies')) {
    const candidate = surface.slice(0, -3) + 'y';
    if (entry(language, candidate)?.pos !== 'noun') fail(`I cannot determine the singular of “${surface}”. Add its singular and plural to the dictionary first.`);
    root = candidate; plural = true;
  } else if (surface.endsWith('s') && !/(?:ss|us|is)$/.test(surface)) {
    const candidates = [surface.slice(0, -1)];
    if (surface.endsWith('es')) candidates.push(surface.slice(0, -2));
    if (surface.endsWith('ves')) candidates.push(surface.slice(0, -3) + 'f', surface.slice(0, -3) + 'fe');
    const known = [...new Set(candidates.filter(candidate => entry(language, candidate)?.pos === 'noun'))];
    if (known.length > 1) fail(`The singular of “${surface}” is ambiguous. Add its plural to the dictionary first.`);
    if (known.length === 1) root = known[0];
    else if (/(?:sses|zzes|ches|shes)$/.test(surface)) root = surface.slice(0, -2);
    else if (/(?:ses|xes|zes|oes|ves|thes)$/.test(surface)) fail(`I cannot determine the singular of “${surface}”. Add its singular or plural to the dictionary first.`);
    else root = surface.slice(0, -1);
    plural = true;
    if (entry(language, root) && entry(language, root).pos !== 'noun') fail(`“${root}” is not a noun in this dictionary.`);
  }
  if (!root || root.length > 60) fail('Use a noun shorter than 61 letters.');
  if (plural && !entry(language, root)) warnings.push(`Treated “${surface}” as the plural of “${root}”.`);
  return { root, plural, surface };
}

function phrase(language, tokens, warnings, { subject = false, predicate = false } = {}) {
  if (!tokens.length || tokens.length > 3) fail('Use one noun, with an optional article and one adjective.');
  const words = [...tokens];
  if (words.length === 1 && (SUBJECTS.has(words[0]) || (!subject && Object.hasOwn(OBJECT_PRONOUNS, words[0])))) return { root: OBJECT_PRONOUNS[words[0]] ?? words[0], pronoun: true };
  if (predicate && words.length === 1 && adjective(language, words[0])) return { root: words[0], adjectiveOnly: true };
  const article = ARTICLES.has(words[0]) ? words.shift() : '';
  let modifier = '';
  if (words.length === 2 && adjective(language, words[0])) modifier = words.shift();
  if (words.length !== 1 || (subject && !article && !entry(language, words[0]))) fail('Use a pronoun or a clear noun phrase, such as “the dragon” or “a red apple”.');
  const result = noun(language, words[0], warnings);
  if (['a', 'an'].includes(article) && result.plural) fail('Use a singular noun after “a” or “an”.');
  return { ...result, article, modifier };
}

function parse(language, english, warnings) {
  if (typeof english !== 'string' || english.length > 2000) fail('Enter one English sentence of at most 2,000 characters.');
  const input = english.trim().replaceAll('’', "'");
  if (!input) fail('Enter a short English sentence.');
  const punctuation = /[.!?]$/.test(input) ? input.at(-1) : '.';
  const body = /[.!?]$/.test(input) ? input.slice(0, -1) : input;
  if (!/^[a-z'\s]+$/i.test(body)) fail('Use one simple sentence without commas, numbers or extra punctuation.');
  const tokens = key(body).split(/\s+/).flatMap(word => (Object.hasOwn(CONTRACTIONS, word) ? CONTRACTIONS[word] : word).split(' '));
  const expression = tokens.join(' ');
  if (FIXED_EXPRESSIONS.has(expression)) return { expression, punctuation };
  if (tokens.some(word => word.includes("'") || BLOCKED.has(word))) fail('This sentence has a clause, modifier or verb form the translator does not support. Try one subject, one verb and one object.');
  let question = punctuation === '?', tense = 'present', negative = false, auxiliary = '', copula = false;
  if (Object.hasOwn(AUXILIARIES, tokens[0]) || Object.hasOwn(COPULAS, tokens[0])) {
    auxiliary = tokens.shift(); question = true;
    copula = Object.hasOwn(COPULAS, auxiliary);
    tense = copula ? COPULAS[auxiliary] : AUXILIARIES[auxiliary];
  }
  let subjectCount = SUBJECTS.has(tokens[0]) ? 1 : ARTICLES.has(tokens[0]) ? (adjective(language, tokens[1]) ? 3 : 2) : 1;
  const subject = phrase(language, tokens.splice(0, subjectCount), warnings, { subject: true });
  if (!auxiliary && (Object.hasOwn(AUXILIARIES, tokens[0]) || Object.hasOwn(COPULAS, tokens[0]))) {
    auxiliary = tokens.shift(); copula = Object.hasOwn(COPULAS, auxiliary);
    tense = copula ? COPULAS[auxiliary] : AUXILIARIES[auxiliary];
  }
  if (tokens[0] === 'not') { tokens.shift(); negative = true; }
  if (negative && !auxiliary) fail('Use “do not”, “did not”, “will not” or a form of “be” for a negative sentence.');
  let verb;
  if (copula) verb = 'be';
  else {
    const surface = tokens.shift() ?? '';
    const form = verbRoot(language, surface);
    if (!form) fail('Use a known action verb, such as want, see, eat, buy, walk or sleep.');
    if (auxiliary && form.root !== surface) fail('Use the base verb after do, does, did or will.');
    if (!auxiliary && surface === 'read') fail('“Read” can be present or past. Use “do read” or “did read” to choose the tense.');
    verb = form.root;
    if (!auxiliary) tense = form.tense;
    if (verb === 'be') {
      if (auxiliary !== 'will') fail('Use am, is, are, was, were or will be.');
      copula = true;
    }
  }
  if (tokens.includes('not')) fail('Put “not” immediately after the auxiliary verb.');
  const object = tokens.length ? phrase(language, tokens, warnings, { predicate: copula }) : null;
  if (copula && !object) fail('A sentence with “be” needs a noun or adjective.');
  if (!copula && !object && !INTRANSITIVE.has(verb) && !SWEAR_VERBS.has(verb)) fail('Add an object after this verb.');
  if (object && INTRANSITIVE.has(verb)) fail('This verb only supports a sentence without an object. Prepositional phrases are not supported yet.');
  return { subject, verb, object, question, tense, negative, punctuation };
}

function addEntry(language, english, pos, addedWords) {
  const existing = entry(language, english);
  if (existing) return existing;
  if (language.words.length >= 2000) fail('This dictionary has reached its 2,000-word limit. Remove a word before adding new meanings.');
  const ids = new Set(language.words.map(word => word.id)), spellings = new Set(language.words.map(word => key(word.word)));
  const baseId = `translated-${english.replaceAll(' ', '-')}`;
  let id = baseId, index = 2;
  while (ids.has(id)) id = `${baseId}-${index++}`;
  let word;
  for (let salt = 0; salt < 128; salt++) {
    word = generateWord(language, english, `sentence:${salt}`);
    if (!spellings.has(key(word))) break;
    if (salt === 127) fail('The sound rules cannot provide another distinct word. Add more sounds before translating new meanings.');
  }
  const result = { id, english, word, pos, category: 'Added words', locked: false, notes: '' };
  language.words.push(result); addedWords.push(result);
  return result;
}

/** Translate one supported English clause. Unsupported input never changes its dictionary. */
export function translateSentence(source, english) {
  const original = validateLanguage(source), language = structuredClone(original), addedWords = [], warnings = [];
  try {
    const parsed = parse(language, english, warnings), grammar = language.grammar;
    const lookup = (meaning, pos) => addEntry(language, meaning, pos, addedWords).word;
    if (parsed.expression) {
      const text = lookup(parsed.expression, 'particle') + parsed.punctuation;
      if (parsed.expression.includes(' ')) warnings.push('Translated as a fixed expression.');
      if (addedWords.length) language.revision++;
      return { language: validateLanguage(language), text, addedWords: structuredClone(addedWords), warnings, supported: true };
    }
    const renderPhrase = part => {
      if (!part) return '';
      if (part.pronoun) return lookup(part.root, 'pronoun');
      if (part.adjectiveOnly) return lookup(part.root, 'adjective');
      let nounText = lookup(part.root, 'noun');
      if (part.plural) {
        const linked = entry(language, part.surface);
        nounText = linked?.family?.kind === 'plural' ? linked.word : nounText + grammar.plural;
      }
      const modifier = part.modifier ? lookup(part.modifier, 'adjective') : '';
      const nounPhrase = (grammar.adjective === 'after' ? [nounText, modifier] : [modifier, nounText]).filter(Boolean).join(' ');
      return [part.article ? lookup(part.article === 'an' ? 'a' : part.article, 'particle') : '', nounPhrase].filter(Boolean).join(' ');
    };
    const slots = {
      S: renderPhrase(parsed.subject),
      V: [parsed.negative ? grammar.negative : '', parsed.tense === 'past' ? grammar.past : parsed.tense === 'future' ? grammar.future : '', lookup(parsed.verb, 'verb')].filter(Boolean).join(' '),
      O: renderPhrase(parsed.object),
    };
    const parts = [...grammar.order].map(slot => slots[slot]).filter(Boolean);
    if (parsed.question && grammar.question) parts.push(grammar.question);
    const text = parts.join(' ') + (parsed.question ? '?' : parsed.punctuation);
    if (addedWords.length) language.revision++;
    return { language: validateLanguage(language), text, addedWords: structuredClone(addedWords), warnings, supported: true };
  } catch (error) {
    return { language: original, text: '', addedWords: [], warnings: [error.message], supported: false };
  }
}
