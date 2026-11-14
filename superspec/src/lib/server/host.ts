/** Hostnames the app answers to (DNS-rebinding defence). The port is not checked. */
export const ALLOWED_HOSTNAMES: readonly string[] = ['127.0.0.1', 'localhost'];

export function isAllowedHost(host: string | null): boolean {
  if (!host) return false;
  const hostname = host.toLowerCase().replace(/:\d+$/, '');
  return ALLOWED_HOSTNAMES.includes(hostname);
}
