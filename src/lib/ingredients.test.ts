import { describe, it, expect } from 'vitest';
import { buildIngredientIndex, linkIngredientsInHtml, type IngredientGroup } from './ingredients';

// Mirrors chocochip-cookies.md (single unnamed group).
const cookies: IngredientGroup[] = [
  {
    items: [
      { name: 'Oil spray' },
      { name: 'butter, softened', qty: '½', unit: 'cup' },
      { name: 'brown sugar', qty: '½', unit: 'cup' },
      { name: 'white sugar', qty: '6', unit: 'tbsp' },
      { name: 'vanilla extract', qty: '1', unit: 'tsp' },
      { name: 'egg', qty: '1' },
      { name: 'flour', qty: '1 ½', unit: 'cup' },
      { name: 'chocolate chips', qty: '6', unit: 'oz' },
    ],
  },
];

// Mirrors apple-bread.md (grouped, with duplicate names across groups + prep-prefixed names).
const appleBread: IngredientGroup[] = [
  {
    group: 'Bread layer',
    items: [
      { name: 'softened butter', qty: '8', unit: 'tbsp' },
      { name: 'sugar', qty: '⅔', unit: 'cup' },
      { name: 'eggs', qty: '2' },
      { name: 'vanilla extract', qty: '1 ½', unit: 'tsp' },
      { name: 'oat milk', qty: '½', unit: 'cup' },
    ],
  },
  {
    group: 'Apple layer',
    items: [
      { name: 'brown sugar', qty: '½', unit: 'cup' },
      { name: 'ground cinnamon', qty: '2', unit: 'tsp' },
      { name: 'medium apples', qty: '2' },
    ],
  },
  {
    group: 'Icing',
    items: [
      { name: 'oat milk', qty: '2', unit: 'tbsp' },
      { name: 'vanilla extract', qty: '½', unit: 'tsp' },
    ],
  },
];

/** Render a step and strip it back to "label→popover-text" pairs for easy assertions. */
function linked(step: string, groups: IngredientGroup[]): Array<[string, string]> {
  const html = linkIngredientsInHtml(step, buildIngredientIndex(groups), { n: 0 });
  const out: Array<[string, string]> = [];
  const re = /<button[^>]*>([^<]*)<\/button><span[^>]*class="ing-pop"[^>]*>(.*?)<\/span><\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push([m[1], m[2].replace(/<[^>]+>/g, '').trim()]);
  }
  return out;
}

describe('buildIngredientIndex', () => {
  it('excludes items with no measurement', () => {
    const { lookup } = buildIngredientIndex(cookies);
    expect(lookup.has('oil spray')).toBe(false);
    expect(lookup.get('flour')).toEqual([{ measurement: '1 ½ cup', group: undefined }]);
  });

  it('keeps a count-only measurement (no unit)', () => {
    const { lookup } = buildIngredientIndex(cookies);
    expect(lookup.get('egg')).toEqual([{ measurement: '1', group: undefined }]);
  });

  it('collects every measurement for a name repeated across groups', () => {
    const { lookup } = buildIngredientIndex(appleBread);
    expect(lookup.get('vanilla extract')).toEqual([
      { measurement: '1 ½ tsp', group: 'Bread layer' },
      { measurement: '½ tsp', group: 'Icing' },
    ]);
    expect(lookup.get('oat milk')).toHaveLength(2);
  });
});

describe('linkIngredientsInHtml — matching', () => {
  it('matches a plain single-word name', () => {
    expect(linked('mix the flour well', cookies)).toEqual([['flour', '1 ½ cup']]);
  });

  it('prefers the longest name (brown sugar, not sugar)', () => {
    const hits = linked('add brown sugar and white sugar', cookies);
    expect(hits).toEqual([
      ['brown sugar', '½ cup'],
      ['white sugar', '6 tbsp'],
    ]);
  });

  it('does not match a plain "sugar" mention as brown/white sugar', () => {
    // apple-bread has a standalone "sugar" ingredient.
    expect(linked('cream the butter and sugar', appleBread)).toEqual([
      ['butter', '8 tbsp'], // matched via prep-stripped alias of "softened butter"
      ['sugar', '⅔ cup'],
    ]);
  });

  it('matches through a leading prep adjective (medium apples → apples)', () => {
    expect(linked('peel the apples', appleBread)).toEqual([['apples', '2']]);
  });

  it('matches a prose singular against a plural-stored name (apple → apples)', () => {
    expect(linked('chop one apple', appleBread)).toEqual([['apple', '2']]);
  });

  it('is case-insensitive', () => {
    expect(linked('Add the Flour', cookies)).toEqual([['Flour', '1 ½ cup']]);
  });

  it('respects word boundaries (no match inside "salted")', () => {
    const salt: IngredientGroup[] = [{ items: [{ name: 'salt', qty: '½', unit: 'tsp' }] }];
    expect(linked('use salted butter', salt)).toEqual([]);
  });

  it('renders an ambiguous name as rows with group labels', () => {
    const html = linkIngredientsInHtml('stir in the oat milk', buildIngredientIndex(appleBread), { n: 0 });
    expect(html).toContain('½ cup <span class="ing-pop-group">· Bread layer</span>');
    expect(html).toContain('2 tbsp <span class="ing-pop-group">· Icing</span>');
  });

  it('wraps every occurrence with a unique id', () => {
    const html = linkIngredientsInHtml('flour, then more flour', buildIngredientIndex(cookies), { n: 0 });
    expect(html).toContain('id="ing-pop-0"');
    expect(html).toContain('id="ing-pop-1"');
  });
});

describe('linkIngredientsInHtml — HTML safety', () => {
  const idx = () => buildIngredientIndex(cookies);

  it('leaves markdown tags intact and still matches text inside them', () => {
    const html = linkIngredientsInHtml('mix the <strong>flour</strong>', idx(), { n: 0 });
    expect(html).toContain('<strong>');
    expect(html).toContain('</strong>');
    expect(html).toContain('class="ing-ref"');
  });

  it('does not wrap text inside a link', () => {
    const html = linkIngredientsInHtml('<a href="/x">flour</a>', idx(), { n: 0 });
    expect(html).toBe('<a href="/x">flour</a>');
  });

  it('does not wrap text inside code', () => {
    const html = linkIngredientsInHtml('<code>flour</code>', idx(), { n: 0 });
    expect(html).toBe('<code>flour</code>');
  });

  it('leaves entities untouched', () => {
    const html = linkIngredientsInHtml('350&deg; then flour', idx(), { n: 0 });
    expect(html).toContain('350&deg;');
    expect(html).toContain('class="ing-ref"');
  });

  it('returns the html unchanged when nothing is indexable', () => {
    const empty = buildIngredientIndex([{ items: [{ name: 'Oil spray' }] }]);
    expect(linkIngredientsInHtml('spray the pan', empty)).toBe('spray the pan');
  });
});
