import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Build-time JSON index of every recipe's frontmatter, keyed by slug. Consumed client-side
// by the uploader (/upload) to populate its "load existing recipe" picker and to pre-fill the
// form when editing. Recipes carry no markdown body — all content lives in frontmatter — so
// `data` + slug is the complete record.
//
// Drafts are intentionally included so they remain editable via the picker. That does make a
// draft's *data* fetchable at this URL (it is neither linked nor indexed, and no detail page
// renders drafts). If that's ever unwanted, filter with `({ data }) => !data.draft` below —
// at the cost of drafts no longer being editable here.
export const GET: APIRoute = async () => {
  const recipes = await getCollection('recipes');
  const payload = recipes
    .map((recipe) => ({ slug: recipe.id, ...recipe.data }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
};
