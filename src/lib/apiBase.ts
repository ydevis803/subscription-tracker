/**
 * Where the API lives. On the web the pages are served by the API itself, so paths stay relative and
 * VITE_API_URL is empty. The native iOS shell serves its pages from the app bundle, so its build sets
 * VITE_API_URL to the public server and every call is prefixed with it. Nothing else changes.
 */
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim().replace(/\/+$/, '')

export const apiUrl = (path: string): string => API_BASE + path
