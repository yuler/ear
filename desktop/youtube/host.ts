import { platform } from "nsh";

/** True outside the browser target — native host fetch has no CORS. */
export function isNativeHost(): boolean {
  return platform.os !== "web";
}

/**
 * Desktop / native YouTube fetch. Web rejects before the request so CORS
 * failures are not mistaken for product support of the browser target.
 */
export async function hostFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  if (!isNativeHost()) {
    throw new Error(
      "YouTube fetch needs the desktop/native host (no browser CORS). Run with: nsh run",
    );
  }
  return fetch(input, init);
}
