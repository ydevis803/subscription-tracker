import { reportOffline, reportOnline } from '@/lib/connectivity'
import { apiUrl } from '@/lib/apiBase'
export interface AccountUser {
  id: number
  email: string
  name: string
  createdAt: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export class OfflineError extends Error {
  constructor() {
    super('You appear to be offline. Check your connection and try again.')
    this.name = 'OfflineError'
  }
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  try {
    const res = await fetch(apiUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
    reportOnline()
    return res
  } catch {
    reportOffline()
    throw new OfflineError()
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await call(method, path, body)
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'The server could not complete that request')
  return data
}

export interface PullResult {
  snapshot: unknown | null
  updatedAt: string | null
  /** Server validator for this snapshot; send it back as `If-None-Match` to skip an unchanged download. */
  etag: string | null
  /** True when the server answered 304: nothing changed since `etag`, and `snapshot` is not included. */
  unchanged: boolean
}

/** Download the account snapshot unless the server still holds the version behind `etag`. */
async function pull(etag?: string | null): Promise<PullResult> {
  const res = await call('GET', '/api/data', undefined, etag ? { 'If-None-Match': etag } : {})
  if (res.status === 304) return { snapshot: null, updatedAt: null, etag: etag ?? null, unchanged: true }
  const data = (await res.json().catch(() => ({}))) as { error?: string; snapshot: unknown | null; updatedAt: string | null }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'The server could not complete that request')
  return { snapshot: data.snapshot, updatedAt: data.updatedAt, etag: res.headers.get('ETag'), unchanged: false }
}

let meInFlight: Promise<{ user: AccountUser }> | null = null

export const api = {
  /** Session lookup; concurrent callers (StrictMode, provider and page) share one request. */
  me: () => {
    if (!meInFlight) meInFlight = request<{ user: AccountUser }>('GET', '/api/auth/me').finally(() => (meInFlight = null))
    return meInFlight
  },
  signUp: (input: { email: string; password: string; name: string }) => request<{ user: AccountUser }>('POST', '/api/auth/sign-up', input),
  signIn: (input: { email: string; password: string }) => request<{ user: AccountUser }>('POST', '/api/auth/sign-in', input),
  signOut: () => request<{ ok: true }>('POST', '/api/auth/sign-out', {}),
  updateName: (name: string) => request<{ user: AccountUser }>('PATCH', '/api/auth/me', { name }),
  changePassword: (currentPassword: string, newPassword: string) => request<{ ok: true }>('POST', '/api/auth/change-password', { currentPassword, newPassword }),
  deleteAccount: (password: string) => request<{ ok: true }>('DELETE', '/api/auth/me', { password }),
  integrity: () => request<{ subscriptions: number; priceChanges: number; cancellationNotes: number; billingEvents: number; orphans: number }>('GET', '/api/data/integrity'),
  forgot: (email: string) => request<{ ok: true }>('POST', '/api/auth/forgot', { email }),
  reset: (token: string, password: string) => request<{ user: AccountUser }>('POST', '/api/auth/reset', { token, password }),
  pull,
  push: (snapshot: unknown) => request<{ updatedAt: string }>('PUT', '/api/data', { snapshot }),
}
