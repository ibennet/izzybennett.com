import type { APIRoute } from 'astro';
import densities from '../data/densities.json';

// Build-time JSON copy of the shared ingredient → grams-per-cup ratio list. Consumed
// client-side by the uploader (/upload) to know which ingredients already have a known
// gram conversion (so it only prompts for the ones that don't). The recipe pages import
// the same src/data/densities.json directly at build time; this endpoint just exposes it
// at a fetchable URL. Mirrors recipes.json.ts.
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(densities), {
    headers: { 'Content-Type': 'application/json' },
  });
};
