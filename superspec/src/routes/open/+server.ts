import { redirect, error } from '@sveltejs/kit';
import { locateDoc } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const raw = url.searchParams.get('path');
  if (!raw) throw error(400, 'missing path');
  try {
    await locateDoc(raw);
  } catch (e) {
    throw error((e as { status?: number }).status === 404 ? 404 : 400, (e as Error).message);
  }
  throw redirect(302, `/?path=${encodeURIComponent(raw)}`);
};
