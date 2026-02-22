import { createClient } from '@supabase/supabase-js'

let supabaseClient
let supabaseServerAuthClient
let supabaseAdminClient

const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required.`)
  return value
}

// Browser / client-side — respects RLS
export function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      requireValue(PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
      requireValue(PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    )
  }
  return supabaseClient
}

// Server-side auth verification with anon key.
export function getSupabaseServerAuth() {
  if (!supabaseServerAuthClient) {
    supabaseServerAuthClient = createClient(
      requireValue(PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
      requireValue(PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )
  }
  return supabaseServerAuthClient
}

// Server-side admin — bypasses RLS. NEVER import in components.
export function getSupabaseAdmin() {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      requireValue(PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
      requireValue(
        SUPABASE_SERVICE_ROLE_KEY,
        'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)'
      ),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )
  }
  return supabaseAdminClient
}
