import { getSupabase } from './supabase'

/**
 * Reads the Bearer token from the request Authorization header
 * and validates it with Supabase. Returns the user or null.
 */
export async function getAuthUser(request) {
  const supabase = getSupabase()
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null

  return user
}
