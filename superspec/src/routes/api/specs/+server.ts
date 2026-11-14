import { json } from '@sveltejs/kit';
import { scanSpecs } from '$lib/server/discovery';

export async function GET() {
  return json(await scanSpecs());
}
