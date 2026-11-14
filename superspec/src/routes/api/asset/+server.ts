import { error } from '@sveltejs/kit';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { assertAssetPath } from '$lib/server/paths';
import { assetType, parseRange } from '$lib/server/assets';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, request }) => {
  const raw = url.searchParams.get('path');
  if (!raw) throw error(400, 'missing path');
  let path: string;
  try {
    path = assertAssetPath(raw);
  } catch (e) {
    throw error(400, (e as Error).message);
  }

  let size: number;
  try {
    const st = await stat(path);
    if (!st.isFile()) throw new Error('not a file');
    size = st.size;
  } catch {
    throw error(404, 'asset not found');
  }

  const headers: Record<string, string> = {
    // assertAssetPath only passes a path with a served asset type.
    'Content-Type': assetType(path)!,
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes'
  };
  const range = parseRange(request.headers.get('range'), size);

  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${size}` }
    });
  }
  if (range) {
    const body = Readable.toWeb(createReadStream(path, { start: range.start, end: range.end }));
    return new Response(body as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Content-Length': String(range.end - range.start + 1)
      }
    });
  }
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    status: 200,
    headers: { ...headers, 'Content-Length': String(size) }
  });
};
