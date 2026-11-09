import { generateWord, validateLanguage } from './engine.js';
import { PRONOUNS as SUBJECTS, keyFor as key, entryFor as entry, verbForm, knownNounForm, pluralEntry, clauseError, clauseSyntax } from './sentence-grammar.js';
import { token, renderNode } from './sentence-syntax.js';

const OBJECT_PRONOUNS = { me: 'i', him: 'he', her: 'she', us: 'we', them: 'they' };
const ARTICLES = new Set(['a', 'an', 'the']);
const COPULAS = { am: 'present', is: 'present', are: 'present', was: 'past', were: 'past' };
const AUXILIARIES = { do: 'present', does: 'present', did: 'past', will: 'future' };
const COMMON_ADJECTIVES = new Set('red blue green yellow black white purple orange pink gray grey tall short young hungry thirsty beautiful strange brave clever angry fucking shitty damn goddamn crappy'.split(' '));
const BLOCKED = new Set('and or but because if unless although while who what where when why how which whose to from with without in on at under over into through for of can could may might must should would shall than as very too only every each any all some more most'.split(' '));
const CONTRACTIONS = { "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "won't": 'will not', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are' };
const FIXED_EXPRESSIONS = new Set(['shit', 'fuck', 'fuck you', 'damn it', 'bullshit', 'holy shit', 'hello', 'goodbye', 'thank you', 'sorry', 'excuse me', 'welcome', 'yes', 'no', 'please', 'maybe']);

function fail(message) { throw new Error(message); }
function adjective(language, english) { return entry(language, english)?.pos === 'adjective' || COMMON_ADJECTIVES.has(english); }
function pronoun(language, english) { return SUBJECTS.has(english) || entry(language, english)?.pos === 'pronoun'; }

function noun(language, surface, warnings) {
  const existing = entry(language, surface);
  const known = knownNounForm(language, surface);
  if (known) return known;
  if (existing) fail(`“${surface}” is listed as ${existing.pos}. The translator cannot use it in this noun phrase yet. Try a simple noun or pronoun.`);
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
    if (entry(language, root) && entry(language, root).pos !== 'noun') fail(`“${root}” is listed as ${entry(language, root).pos}. The translator cannot use it as a noun here.`);
  }
  if (!root || root.length > 60) fail('Use a noun shorter than 61 letters.');
  if (plural && !entry(language, root)) warnings.push(`Treated “${surface}” as the plural of “${root}”.`);
  return { root, plural, surface };
}

function phrase(language, tokens, warnings, { subject = false, predicate = false } = {}) {
  if (!tokens.length || tokens.length > 3) fail('Use one noun, with an optional article and one adjective.');
  const words = [...tokens];
  if (words.length === 1 && (pronoun(language, words[0]) || (!subject && Object.hasOwn(OBJECT_PRONOUNS, words[0])))) {
    return { root: !subject && Object.hasOwn(OBJECT_PRONOUNS, words[0]) ? OBJECT_PRONOUNS[words[0]] : words[0], pronoun: true };
  }
  if (predicate && words.length === 1 && adjective(language, words[0])) return { root: words[0], adjectiveOnly: true };
  const article = ARTICLES.has(words[0]) ? words.shift() : '';
  let modifier = '';
  if (words.length === 2 && adjective(language, words[0])) modifier = words.shift();
  if (words.length !== 1) fail('This noun phrase is not supported yet. Use a pronoun or one noun with an optional article and adjective, such as “the dragon” or “a red apple”.');
  const result = noun(language, words[0], warnings);
  if (subject && !article && !result.plural && !entry(language, result.root)) fail('Use an article before an unfamiliar singular subject, such as “the dragon”.');
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
  let subjectCount = pronoun(language, tokens[0]) ? 1 : ARTICLES.has(tokens[0]) ? (adjective(language, tokens[1]) ? 3 : 2) : 1;
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
    const form = verbForm(language, surface);
    if (!form || surface === 'coming') fail('Use a known action verb, such as want, see, eat, buy, walk or sleep.');
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
  const error = clauseError({ verb, object });
  if (error) fail(error);
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
    const lookup = (meaning, pos) => {
      const word = addEntry(language, meaning, pos, addedWords);
      return token(word.word, { kind: 'word', key: meaning, wordId: word.id });
    };
    if (parsed.expression) {
      const text = lookup(parsed.expression, 'particle').text + parsed.punctuation;
      if (parsed.expression.includes(' ')) warnings.push('Translated as a fixed expression.');
      if (addedWords.length) language.revision++;
      return { language: validateLanguage(language), text, addedWords: structuredClone(addedWords), warnings, supported: true };
    }
    const pluralLookup = node => {
      const word = pluralEntry(language, node.head.key, node.surface);
      return word ? token(word.word, { kind: 'word', key: node.head.key, wordId: word.id }) : null;
    };
    const rendered = renderNode(clauseSyntax(parsed), grammar, lookup, pluralLookup);
    const text = rendered.text + (parsed.question ? '?' : parsed.punctuation);
    if (addedWords.length) language.revision++;
    return { language: validateLanguage(language), text, addedWords: structuredClone(addedWords), warnings, supported: true };
  } catch (error) {
    return { language: original, text: '', addedWords: [], warnings: [error.message], supported: false };
  }
}
