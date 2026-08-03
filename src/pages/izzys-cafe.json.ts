import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';

// Build-time JSON feed of the Izzy's Cafe menu, parsed out of the markdown body of the
// `izzys-cafe` page entry. Consumed by external displays (e.g. the dizzyos LED-matrix sign)
// so they can render the menu without scraping HTML, keeping the markdown as the single
// source of truth.
//
// The markdown is a flat list of sections: a top-level "## Menu" wrapper, then one "####"
// heading per section (Drinks, Milks, Additions, Food) followed by "- " list items. We map
// each non-wrapper heading to a section and collect its bullet items.
interface MenuSection {
  heading: string;
  items: string[];
}

function parseMenu(body: string): MenuSection[] {
  const sections: MenuSection[] = [];
  let current: MenuSection | null = null;

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();

    const heading = line.match(/^#{2,6}\s+(.*\S)\s*$/);
    if (heading) {
      // "Menu" is just the wrapper heading, not a section of items.
      if (heading[1].toLowerCase() === 'menu') {
        current = null;
        continue;
      }
      current = { heading: heading[1], items: [] };
      sections.push(current);
      continue;
    }

    const item = line.match(/^[-*]\s+(.*\S)\s*$/);
    if (item && current) {
      current.items.push(item[1]);
    }
  }

  return sections.filter((section) => section.items.length > 0);
}

export const GET: APIRoute = async () => {
  const page = await getEntry('pages', 'izzys-cafe');
  if (!page) throw new Error('Missing "izzys-cafe" entry in the pages collection');

  const payload = {
    title: page.data.title,
    sections: parseMenu(page.body ?? ''),
  };

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
};
