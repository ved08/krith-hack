/**
 * Typed access to Vite env. VITE_-prefixed vars are the only ones exposed
 * to the browser bundle — keep secrets server-side.
 */
export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:3000",
};
