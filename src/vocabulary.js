// Explicit entries keep the free-text tool an honest dictionary gloss.
// Inflected entries remain available to the free-text dictionary gloss. Scripted
// conversations and the sentence builder use explicitly authored grammar instead.
const groups = [
  ['Essentials', 'particle', 'hello|goodbye|yes|no|please|thank you|sorry|excuse me|welcome|okay|maybe|again|now|later|here|there|this|that|another|a|the|and|or|but|not|very|too|only|all|then'],
  ['People', 'pronoun', 'i|you|he|she|we|they|it'],
  ['People', 'noun', 'friend|person|family|mother|father|child|baker|teacher|cat|dog'],
  ['Actions', 'verb', 'be|is|are|have|has|want|need|needs|like|love|eat|drink|buy|sell|give|take|go|come|coming|see|hear|know|speak|learn|help|find|wait|open|close|read|write|sleep|make|work|pay|ask|say|said|walk|run|hope|stops|does'],
  ['Actions', 'particle', 'will|can'],
  ['Food', 'noun', 'bread|water|tea|coffee|milk|soup|rice|apple|fruit|cheese|egg|fish|salt|sugar|cake|bowl|cup|plate'],
  ['Places', 'noun', 'home|shop|bakery|market|station|library|garden|clinic|school|street|sea'],
  ['Everyday things', 'noun', 'door|window|room|table|chair|bed|bag|book|books|map|ticket|tickets|train|bus|flower|tree|leaf|rain|sun|moon|star|stars|key|coin|coins|bell|bottle|sign'],
  ['Descriptions', 'adjective', 'good|bad|big|small|hot|cold|new|old|happy|sad|tired|quiet|loud|fast|slow|full|empty|lost|ready|sweet|fresh|heavy|late|free|bright|real|closed'],
  ['Time & numbers', 'number', 'zero|one|two|three|four|five|six|seven|eight|nine|ten'],
  ['Time & numbers', 'noun', 'today|tomorrow|yesterday|morning|night|day|time|hour'],
  ['Questions', 'question', 'who|what|where|when|why|how|much|how much|how many'],
  ['Directions', 'particle', 'left|right|straight|near|far|inside|outside|with|to|from|under|in|on|of|for|before'],
];

const entries = (source) => source.flatMap(([category, pos, list]) => list.split('|').map((english) => Object.freeze({
  id: english.replace(/\s+/gu, '-'), english, pos, category,
})));

// Append release additions after all original entries. The generator resolves
// collisions in entry order, so inserting words above would change older seeds.
export const SCENE_VOCAB_ADDITIONS = Object.freeze(entries([
  ['Actions', 'verb', 'stop|meet|pass|asked|am'],
  ['Actions', 'particle', 'should'],
  ['Essentials', 'particle', 'your|my|an'],
  ['People', 'noun', 'name'],
  ['Descriptions', 'adjective', 'pleased|unfortunate'],
  ['Everyday things', 'noun', 'coincidence'],
]));

export const CORE_VOCAB = Object.freeze([...entries(groups), ...SCENE_VOCAB_ADDITIONS]);
