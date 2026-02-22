import { getSupabaseServerAuth } from './supabase'

/**
 * Reads the Bearer token from the request Authorization header
 * and validates it with Supabase. Returns the user or null.
 */
export async function getAuthUser(request) {
  const supabase = getSupabaseServerAuth()
  const authHeader =
    request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return null
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null

  return user
}
