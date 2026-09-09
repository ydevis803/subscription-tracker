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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new OfflineError()
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong')
  return data
}

export const api = {
  me: () => request<{ user: AccountUser }>('GET', '/api/auth/me'),
  signUp: (input: { email: string; password: string; name: string }) => request<{ user: AccountUser }>('POST', '/api/auth/sign-up', input),
  signIn: (input: { email: string; password: string }) => request<{ user: AccountUser }>('POST', '/api/auth/sign-in', input),
  signOut: () => request<{ ok: true }>('POST', '/api/auth/sign-out', {}),
  updateName: (name: string) => request<{ user: AccountUser }>('PATCH', '/api/auth/me', { name }),
  changePassword: (currentPassword: string, newPassword: string) => request<{ ok: true }>('POST', '/api/auth/change-password', { currentPassword, newPassword }),
  deleteAccount: (password: string) => request<{ ok: true }>('DELETE', '/api/auth/me', { password }),
  integrity: () => request<{ subscriptions: number; priceChanges: number; cancellationNotes: number; billingEvents: number; orphans: number }>('GET', '/api/data/integrity'),
  forgot: (email: string) => request<{ ok: true }>('POST', '/api/auth/forgot', { email }),
  reset: (token: string, password: string) => request<{ user: AccountUser }>('POST', '/api/auth/reset', { token, password }),
  pull: () => request<{ snapshot: unknown | null; updatedAt: string | null }>('GET', '/api/data'),
  push: (snapshot: unknown) => request<{ updatedAt: string }>('PUT', '/api/data', { snapshot }),
}
