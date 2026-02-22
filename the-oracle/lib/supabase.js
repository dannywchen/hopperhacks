import { createClient } from '@supabase/supabase-js'

let supabaseClient
let supabaseAdminClient

function requireEnvVar(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required.`)
  }
  return value
}

// Browser / client-side — respects RLS
export function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      requireEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    )
  }
  return supabaseClient
}

// Server-side admin — bypasses RLS. NEVER import in components.
export function getSupabaseAdmin() {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      requireEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnvVar('SUPABASE_SERVICE_ROLE_KEY')
    )
  }
  return supabaseAdminClient
}
