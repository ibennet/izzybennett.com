import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const recipes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/recipes' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      category: z.enum(['breakfast', 'main', 'dessert', 'side', 'sauce', 'drink', 'other']),
      tags: z.array(z.string()).default([]),
      prepTime: z.number().int().nonnegative().optional(),
      cookTime: z.number().int().nonnegative().optional(),
      servings: z.number().int().positive().optional(),
      tools: z.array(z.string()).default([]),
      ingredients: z.array(
        z.object({
          group: z.string().optional(),
          items: z.array(z.string()),
        })
      ),
      steps: z.array(z.string()),
      notes: z.array(z.string()).default([]),
      image: image().optional(),
      draft: z.boolean().default(false),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { recipes, pages };
