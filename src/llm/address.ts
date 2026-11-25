import { LlmError } from './errors';

/**
 * Normalizes a server address to its root URL without a trailing slash or `/v1`.
 * Throws `LlmError` when the address is not an http(s) URL.
 */
export function normalizeBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new LlmError(`"${baseUrl}" is not a valid server address.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LlmError('The server address must start with http:// or https://.');
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '').replace(/\/v1$/, '');
}

/** The host permission pattern that lets the extension call the server (all ports of the host). */
export function hostPermissionPattern(baseUrl: string): string {
  const url = new URL(normalizeBaseUrl(baseUrl));
  return `${url.protocol}//${url.hostname}/*`;
}
