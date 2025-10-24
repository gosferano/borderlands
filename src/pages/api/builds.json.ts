import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const builds = await getCollection('builds');

  const searchIndex = builds.map((b) => ({
    title: b.data.title,
    creator: b.data.creator,
    tags: b.data.tags,
    slug: b.id,
    excerpt: b.data.excerpt,
    mobbingRating: b.data.mobbingRating,
    bossingRating: b.data.bossingRating,
    uvhFallof: b.data.uvhFallof,
    redTree: b.data.redTree,
    greenTree: b.data.greenTree,
    blueTree: b.data.blueTree,
  }));

  return new Response(JSON.stringify(searchIndex), {
    headers: { 'Content-Type': 'application/json' },
  });
};
