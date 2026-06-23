import { json, error } from '@sveltejs/kit';
import { resolveDoc } from '$lib/server/resolve';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'missing q');
  const group = await resolveDoc(q);
  if (!group) throw error(404, 'no matching doc');
  return json(group);
};
