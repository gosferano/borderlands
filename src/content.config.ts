import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const builds = defineCollection({
  loader: glob({ base: './src/content/builds', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      character: z.string(),
      excerpt: z.string().optional(),
      actionSkill: z.string(),
      videoLink: z.string().url().optional(),
      buildLink: z.string().url().optional(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date(),
      redTree: z.number(),
      greenTree: z.number(),
      blueTree: z.number(),
      requiredDLCs: z.array(z.string()).optional(),
      creator: z.string(),
      reviewer: z.string(),
      mobbingRating: z.number().min(0).max(4),
      bossingRating: z.number().min(0).max(4),
      uvhFallof: z.number().min(0).max(5),
      tags: z.array(z.string()).optional(),
      heroImage: image().optional(),
    }),
});

export const collections = { builds };
