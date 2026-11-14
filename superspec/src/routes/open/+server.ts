import { redirect, error } from '@sveltejs/kit';
import { assertSpecPath } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const raw = url.searchParams.get('path');
  if (!raw) throw error(400, 'missing path');
  try {
    assertSpecPath(raw);
  } catch (e) {
    throw error(400, (e as Error).message);
  }
  throw redirect(302, `/?path=${encodeURIComponent(raw)}`);
};
