// Shared parser for the Izzy's Cafe menu. The markdown body of the `izzys-cafe` page entry is the
// single source of truth for the menu; this turns it into structured sections consumed by the JSON
// feed (`/izzys-cafe.json`, for the dizzyos LED-matrix sign) and the order form (`/order`).
//
// The markdown is a flat list of sections: a top-level "## Menu" wrapper, then one "####" heading per
// section (Drinks, Milks, Syrups, Food) followed by "- " list items. Each non-wrapper heading becomes
// a section and its bullets its items.
export interface MenuSection {
  heading: string;
  items: string[];
}

export function parseMenu(body: string): MenuSection[] {
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

// Pick a section's items by heading (case-insensitive), or [] if absent.
export function sectionItems(sections: MenuSection[], heading: string): string[] {
  const match = sections.find((s) => s.heading.toLowerCase() === heading.toLowerCase());
  return match ? match.items : [];
}
