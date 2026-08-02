import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Build-time JSON index of every published recipe's frontmatter, keyed by slug. Consumed
// client-side by the uploader (/upload) to populate its "load existing recipe" picker and to
// pre-fill the form when editing. Recipes carry no markdown body — all content lives in
// frontmatter — so `data` + slug is the complete record.
//
// Drafts are excluded so a draft's data isn't publicly fetchable at this URL (this file is
// static and unauthenticated, like the rest of the site). The trade-off: drafts can't be
// edited through /upload — edit them directly in the repo. Drafts have no detail page or
// index card either, so they have no UI edit surface anyway.
export const GET: APIRoute = async () => {
  const recipes = await getCollection('recipes', ({ data }) => !data.draft);
  const payload = recipes
    .map((recipe) => ({ slug: recipe.id, ...recipe.data }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
};
