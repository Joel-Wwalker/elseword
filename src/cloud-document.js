/**
 * Compare validated JSON documents by content. PostgreSQL jsonb can reorder
 * object keys, while array order (such as vocabulary entries) is meaningful.
 * The caller's document is never changed.
 */
export function canonicalJSON(value) {
  const ordered = item => {
    if (Array.isArray(item)) return item.map(ordered);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])]));
    }
    return item;
  };
  return JSON.stringify(ordered(value));
}
