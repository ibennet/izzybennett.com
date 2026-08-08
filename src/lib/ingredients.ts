/**
 * Ingredient ↔ step linking. Recipe ingredients are structured `{ name, qty?, unit? }`
 * (see content.config.ts); steps are free-form prose that name those ingredients. This
 * module builds a name→measurement index from a recipe's ingredients and rewrites step
 * HTML so each ingredient mention becomes a hover/tap target showing its measurement.
 *
 * All logic is pure and build-time (Astro SSG) — no client parsing. The only runtime cost
 * is the small popover script; the measurement text is baked into the HTML.
 */

export interface StructuredItem {
  name: string;
  qty?: string;
  unit?: string;
}

export interface IngredientGroup {
  group?: string;
  items: StructuredItem[];
}

/** One place an ingredient name is measured — its amount and the group it belongs to. */
interface Occurrence {
  measurement: string;
  group?: string;
}

export interface IngredientIndex {
  /** Canonical name (prep-clause-stripped, lowercased) → every measurement it has. */
  lookup: Map<string, Occurrence[]>;
  /** Any matchable surface form (incl. plural/alias) → its canonical lookup key. */
  formToKey: Map<string, string>;
  /** Combined matcher over all surface forms, or null when nothing is indexable. */
  regex: RegExp | null;
}

/**
 * Leading words that describe *preparation* and are routinely dropped in step prose
 * ("softened butter" → "butter", "medium apples" → "apples"). Deliberately excludes
 * type/colour qualifiers ("brown", "white", "powdered", "dark") — those distinguish one
 * ingredient from another ("brown sugar" ≠ "sugar") and must NOT be stripped.
 */
const PREP_ADJECTIVES = new Set([
  'softened', 'melted', 'chopped', 'finely', 'coarsely', 'ground', 'packed', 'sifted',
  'diced', 'minced', 'shredded', 'grated', 'peeled', 'beaten', 'crushed', 'toasted',
  'sliced', 'halved', 'quartered', 'cubed', 'drained', 'rinsed', 'trimmed', 'thinly',
  'roughly', 'small', 'medium', 'large', 'ripe', 'cold', 'warm', 'boneless', 'skinless',
]);

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Collapse whitespace and lowercase — the normal form used for all name comparisons. */
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Ingredient's US measurement label, e.g. "½ cup", "8 tbsp", or "2" for count items. */
function measurementLabel(item: StructuredItem): string {
  return [item.qty, item.unit].map((v) => (v ?? '').trim()).filter(Boolean).join(' ');
}

/** Drop a trailing prep clause after the first comma: "butter, softened" → "butter". */
function stripNote(name: string): string {
  return norm(name.split(',')[0] ?? '');
}

/** Strip leading prep adjectives: "finely chopped medium apples" → "apples". */
function stripPrep(name: string): string {
  const words = name.split(' ');
  let i = 0;
  while (i < words.length - 1 && PREP_ADJECTIVES.has(words[i])) i++;
  return words.slice(i).join(' ');
}

/** Best-effort singular of an English word ("apples" → "apple", "cherries" → "cherry"). */
function singularize(word: string): string {
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y');
  if (/(ses|xes|zes|ches|shes|oes)$/.test(word)) return word.replace(/es$/, '');
  if (/ss$/.test(word)) return word;
  if (/s$/.test(word)) return word.replace(/s$/, '');
  return word;
}

/** Best-effort plural of an English word ("apple" → "apples", "cherry" → "cherries"). */
function pluralize(word: string): string {
  if (/[^aeiou]y$/.test(word)) return word.replace(/y$/, 'ies');
  if (/(s|x|z|ch|sh|o)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/**
 * Surface forms of a phrase to match in prose, varying only the last word's number so an
 * ingredient stored plural still matches singular usage and vice-versa. "cherry tomatoes"
 * → ["cherry tomatoes", "cherry tomato"].
 */
function phraseForms(phrase: string): string[] {
  const words = phrase.split(' ');
  const last = words[words.length - 1];
  const base = singularize(last);
  const lastForms = [...new Set([last, base, pluralize(base)])];
  const head = words.slice(0, -1);
  return lastForms.map((w) => [...head, w].join(' '));
}

/**
 * Build the name→measurement index for one recipe's ingredient groups. Items with no
 * measurement (e.g. "Oil spray") are skipped — an empty popover is worse than none, and
 * such items rarely appear verbatim in steps. A name appearing in multiple groups keeps
 * all its measurements (the ambiguity case), surfaced together in the popover.
 */
export function buildIngredientIndex(groups: IngredientGroup[]): IngredientIndex {
  const lookup = new Map<string, Occurrence[]>();

  for (const g of groups) {
    for (const item of g.items) {
      const measurement = measurementLabel(item);
      if (!measurement) continue;
      const key = stripNote(item.name);
      if (!key) continue;
      const list = lookup.get(key) ?? [];
      list.push({ measurement, group: g.group });
      lookup.set(key, list);
    }
  }

  const formToKey = new Map<string, string>();
  const forms = new Set<string>();

  // Full names win over prep-stripped aliases, so register them first and never let an
  // alias overwrite a real ingredient's own name (protects "sugar" from "brown sugar"'s alias).
  for (const key of lookup.keys()) {
    for (const f of phraseForms(key)) {
      formToKey.set(f, key);
      forms.add(f);
    }
  }
  for (const key of lookup.keys()) {
    const alias = stripPrep(key);
    if (!alias || alias === key) continue;
    for (const f of phraseForms(alias)) {
      if (formToKey.has(f)) continue;
      formToKey.set(f, key);
      forms.add(f);
    }
  }

  return { lookup, formToKey, regex: buildRegex([...forms]) };
}

/** Combined, word-boundary-anchored, longest-match-first regex over all surface forms. */
function buildRegex(forms: string[]): RegExp | null {
  if (forms.length === 0) return null;
  const alternation = forms
    .sort((a, b) => b.length - a.length) // longest first → "brown sugar" beats "sugar"
    .map((form) => form.split(' ').map(escapeRegex).join('\\s+'))
    .join('|');
  return new RegExp(`\\b(${alternation})\\b`, 'gi');
}

/** The interactive trigger + measurement popover for one matched ingredient mention. */
function buildTrigger(label: string, occurrences: Occurrence[], id: number): string {
  const popId = `ing-pop-${id}`;
  // A single measurement shows just the amount; the group label only earns its place when
  // it disambiguates between multiple measurements of the same name.
  const inner =
    occurrences.length === 1
      ? escapeHtml(occurrences[0].measurement)
      : occurrences
          .map((o) => {
            const amount = escapeHtml(o.measurement);
            const group = o.group
              ? ` <span class="ing-pop-group">· ${escapeHtml(o.group)}</span>`
              : '';
            return `<span class="ing-pop-row">${amount}${group}</span>`;
          })
          .join('');
  return (
    `<span class="ing-ref">` +
    `<button type="button" class="ing-ref-btn" aria-expanded="false" aria-describedby="${popId}">${escapeHtml(label)}</button>` +
    `<span role="tooltip" id="${popId}" class="ing-pop">${inner}</span>` +
    `</span>`
  );
}

/**
 * Rewrite already-rendered step HTML, wrapping ingredient mentions in popover triggers.
 *
 * Runs on the HTML produced by inlineMarkdown (markdown-first): the tokenizer only ever
 * touches plain-text runs, so it can't corrupt tags or entities, and it skips text inside
 * <a>/<code> to avoid nesting a button in a link or mangling code. `idState` threads a
 * per-page counter so every popover gets a unique id across all steps.
 */
export function linkIngredientsInHtml(
  html: string,
  index: IngredientIndex,
  idState: { n: number } = { n: 0 }
): string {
  const { regex, formToKey, lookup } = index;
  if (!regex) return html;

  let skipDepth = 0;
  // Split into tags, entities, and the text between them; odd matches are tags/entities.
  return html
    .split(/(<[^>]+>|&[^;\s]+;)/)
    .map((token) => {
      if (!token) return token;

      if (token[0] === '<') {
        if (/^<(a|code)[\s>]/i.test(token)) skipDepth++;
        else if (/^<\/(a|code)>/i.test(token) && skipDepth > 0) skipDepth--;
        return token;
      }
      if (token[0] === '&') return token; // HTML entity — leave untouched
      if (skipDepth > 0) return token; // inside <a>/<code>

      return token.replace(regex, (match) => {
        const key = formToKey.get(norm(match));
        const occurrences = key ? lookup.get(key) : undefined;
        if (!occurrences || occurrences.length === 0) return match;
        return buildTrigger(match, occurrences, idState.n++);
      });
    })
    .join('');
}
