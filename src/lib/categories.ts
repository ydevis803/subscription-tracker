import { CATEGORIES, type Category, type CategoryId } from '@/db/schema'

const byId = new Map<CategoryId, Category>(CATEGORIES.map((c) => [c.id, c]))

export function categoryOf(id: CategoryId): Category {
  return byId.get(id) ?? byId.get('other')!
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/)
  if (words.length === 0 || !words[0]) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export const REASON_LABEL = {
  'too-expensive': 'Too expensive',
  'not-using': 'Not using it enough',
  switching: 'Switching to something else',
  'trial-ending': 'Trial ending',
  other: 'Other',
} as const
