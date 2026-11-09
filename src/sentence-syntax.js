const length = text => [...text].length;
export const literal = (text = '') => ({ text, tokens: [] });
export const token = (text, source) => ({ text, tokens: text ? [{ ...source, text, start: 0, end: length(text) }] : [] });

// Keep offsets beside the authored words while rearranging constituents. This
// avoids guessing a meaning from a generated spelling (which may be a homonym).
export function join(parts, separator = ' ') {
  const present = parts.filter(part => part?.text);
  let text = '', offset = 0;
  const tokens = [];
  present.forEach((part, index) => {
    if (index) { text += separator; offset += length(separator); }
    tokens.push(...part.tokens.map(item => ({ ...item, start: item.start + offset, end: item.end + offset })));
    text += part.text;
    offset += length(part.text);
  });
  return { text, tokens };
}

function withSuffix(part, marker, text) {
  if (!text) return part;
  const end = length(part.text);
  const last = part.tokens.at(-1);
  if (last?.kind === 'word' && last.end === end) {
    return { text: part.text + text, tokens: [...part.tokens.slice(0, -1), {
      ...last, text: last.text + text, end: end + length(text),
      suffixes: [...(last.suffixes ?? []), { marker, text }],
    }] };
  }
  return join([part, token(text, { kind: 'marker', marker })], '');
}

/**
 * Authored syntax only: strings are exact dictionary keys, nouns have a head,
 * determiner/adjectives/plural/modifiers, clauses have S/V/O slots and markers,
 * and sequences/fragments retain their explicit phrase order. A clause can be
 * nested as another clause's object. English prose is never parsed or inferred.
 */
export function renderNode(node, grammar, lookup, pluralLookup) {
  if (!node) return literal();
  if (typeof node === 'string') return lookup(node);
  if (node.type === 'word') return lookup(node.key, node.pos);
  if (node.type === 'noun') {
    const inflection = node.plural && pluralLookup?.(node);
    const head = inflection || withSuffix(renderNode(node.head, grammar, lookup, pluralLookup), 'plural', node.plural ? grammar.plural : '');
    const adjectives = (node.adjectives ?? []).map(item => renderNode(item, grammar, lookup, pluralLookup));
    const noun = grammar.adjective === 'after' ? [head, ...adjectives] : [...adjectives, head];
    return join([renderNode(node.determiner, grammar, lookup, pluralLookup), ...noun, ...(node.modifiers ?? []).map(item => renderNode(item, grammar, lookup, pluralLookup))]);
  }
  if (node.type === 'sequence' || node.type === 'fragment') {
    return join((node.items ?? []).map(item => renderNode(item, grammar, lookup, pluralLookup)), node.separator ?? ' ');
  }
  if (node.type === 'clause') {
    const tense = token(node.tense === 'past' ? grammar.past : node.tense === 'future' ? grammar.future : '', { kind: 'marker', marker: node.tense });
    const slots = {
      S: renderNode(node.subject, grammar, lookup, pluralLookup),
      V: join([token(node.negative ? grammar.negative : '', { kind: 'marker', marker: 'negative' }), tense, renderNode(node.modal, grammar, lookup, pluralLookup), renderNode(node.verb, grammar, lookup, pluralLookup)]),
      O: renderNode(node.object, grammar, lookup, pluralLookup),
    };
    return join([
      renderNode(node.front, grammar, lookup, pluralLookup),
      ...Array.from(grammar.order).map(slot => slots[slot]),
      renderNode(node.tail, grammar, lookup, pluralLookup),
      token(node.question ? grammar.question : '', { kind: 'marker', marker: 'question' }),
    ]);
  }
  throw new Error(`Unsupported scene syntax node: ${node.type}.`);
}

