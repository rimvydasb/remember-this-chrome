import { hostPermissionPattern } from './address';

/**
 * Asks for the host permission to call the server. Call it directly from a click handler,
 * before any `await`, because Chrome shows the permission prompt only during a user gesture.
 * `extraOrigins` are asked in the same prompt (Chrome shows one prompt per gesture).
 */
export function requestLlmPermission(baseUrl: string, extraOrigins: readonly string[] = []): Promise<boolean> {
  let origins: string[];
  try {
    origins = [hostPermissionPattern(baseUrl), ...extraOrigins];
  } catch (error) {
    return Promise.reject(error);
  }
  return chrome.permissions.request({ origins });
}

/** Tells whether the extension may call the server. Unlike `requestLlmPermission`, needs no user gesture. */
export async function hasLlmPermission(baseUrl: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [hostPermissionPattern(baseUrl)] });
  } catch {
    return false;
  }
}
