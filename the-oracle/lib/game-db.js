import { getSupabaseAdmin } from './supabase'

const clamp = (val, min = 0, max = 100) => Math.min(max, Math.max(min, val))
const NO_ROWS_CODE = 'PGRST116'

function isNoRowsError(error) {
  return error?.code === NO_ROWS_CODE
}

function baseGameState(profileId) {
  return {
    profile_id: profileId,
    age: 18,
    stress: 50,
    free_time: 50,
    net_worth: 0,
    salary: 0,
    decision_count: 0,
    last_saved_at: new Date().toISOString(),
  }
}

function getSetupPayload(row) {
  const value = row?.setup_json
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value
}

export async function ensureUserBootstrap(profileId) {
  const supabaseAdmin = getSupabaseAdmin()
  const defaultState = baseGameState(profileId)

  const [stateResult, settingsResult, setupResult] = await Promise.all([
    supabaseAdmin
      .from('game_state')
      .upsert(defaultState, { onConflict: 'profile_id', ignoreDuplicates: true }),
    supabaseAdmin
      .from('game_settings')
      .upsert({ profile_id: profileId }, { onConflict: 'profile_id', ignoreDuplicates: true }),
    supabaseAdmin
      .from('user_setups')
      .upsert({ profile_id: profileId }, { onConflict: 'profile_id', ignoreDuplicates: true }),
  ])

  if (stateResult.error) throw stateResult.error
  if (settingsResult.error) throw settingsResult.error
  if (setupResult.error) throw setupResult.error
}

// ─────────────────────────────────────────────
// GAME STATE
// ─────────────────────────────────────────────

export async function loadGameState(profileId) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('game_state')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error && !isNoRowsError(error)) throw error
  return data ?? baseGameState(profileId)
}

export async function saveGameState(profileId, updates) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: current, error: currentError } = await supabaseAdmin
    .from('game_state')
    .select('decision_count')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (currentError && !isNoRowsError(currentError)) throw currentError

  const { data, error } = await supabaseAdmin
    .from('game_state')
    .upsert({
      ...baseGameState(profileId),
      ...updates,
      decision_count: (current?.decision_count ?? 0) + 1,
      last_saved_at: new Date().toISOString(),
    }, { onConflict: 'profile_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function applyStatDeltas(profileId, deltas, event) {
  const current = await loadGameState(profileId)

  const updated = {
    stress: deltas.stress !== undefined ? clamp(current.stress + deltas.stress) : current.stress,
    free_time: deltas.free_time !== undefined ? clamp(current.free_time + deltas.free_time) : current.free_time,
    net_worth: deltas.net_worth !== undefined ? current.net_worth + deltas.net_worth : current.net_worth,
    salary: deltas.salary !== undefined ? current.salary + deltas.salary : current.salary,
    age: deltas.age !== undefined ? current.age + deltas.age : current.age,
    expected_death_age: deltas.expected_death_age !== undefined ? deltas.expected_death_age : current.expected_death_age,
    city: deltas.city !== undefined ? deltas.city : current.city,
    relationship_status: deltas.relationship_status !== undefined ? deltas.relationship_status : current.relationship_status,
  }

  await Promise.all([
    saveGameState(profileId, updated),
    logLifeEvent({ profile_id: profileId, player_age: current.age, stat_deltas: deltas, ...event }),
  ])

  return loadGameState(profileId)
}

// ─────────────────────────────────────────────
// AGENT MEMORY
// ─────────────────────────────────────────────

export async function loadAgentMemory(profileId, category = null) {
  const supabaseAdmin = getSupabaseAdmin()
  let query = supabaseAdmin
    .from('agent_memory')
    .select('*')
    .eq('profile_id', profileId)
    .order('importance', { ascending: false })

  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function buildAIMemoryContext(profileId, topN = 10) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('agent_memory')
    .select('category, key, content')
    .eq('profile_id', profileId)
    .order('importance', { ascending: false })
    .limit(topN)

  if (error || !data) return ''
  return data.map(m => `[${m.category}${m.key ? `/${m.key}` : ''}] ${m.content}`).join('\n')
}

export async function saveAgentMemory(memory) {
  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('agent_memory')
    .upsert(memory, { onConflict: 'profile_id, key' })
  if (error) throw error
}

export async function updateAgentMemory(profileId, key, updates = {}) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('agent_memory')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', profileId)
    .eq('key', key)
    .select('*')
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function deleteAgentMemory(profileId, key) {
  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('agent_memory')
    .delete()
    .eq('profile_id', profileId)
    .eq('key', key)

  if (error) throw error
}

// ─────────────────────────────────────────────
// LIFE EVENTS
// ─────────────────────────────────────────────

export async function logLifeEvent(event) {
  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin.from('life_events').insert(event)
  if (error) throw error
}

export async function loadLifeEvents(profileId, limit = 50, category = null) {
  const supabaseAdmin = getSupabaseAdmin()
  let query = supabaseAdmin
    .from('life_events')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) throw error
  return data
}

// ─────────────────────────────────────────────
// GAME SETTINGS
// ─────────────────────────────────────────────

export async function loadGameSettings(profileId) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('game_settings')
    .select('settings, updated_at')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error && !isNoRowsError(error)) throw error
  return data?.settings ?? {}
}

export async function saveGameSettings(profileId, settings) {
  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('game_settings')
    .upsert(
      {
        profile_id: profileId,
        settings: settings ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' }
    )
  if (error) throw error
}

// ─────────────────────────────────────────────
// USER SETUP
// ─────────────────────────────────────────────

export async function loadUserSetup(profileId) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('user_setups')
    .select('setup_json, updated_at')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error && !isNoRowsError(error)) throw error
  return {
    setup: getSetupPayload(data),
    updatedAt: data?.updated_at ?? null,
  }
}

export async function saveUserSetup(profileId, setup) {
  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('user_setups')
    .upsert(
      {
        profile_id: profileId,
        setup_json: setup,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' }
    )
  if (error) throw error
}

export async function loadOnboardingStatus(profileId) {
  const { setup } = await loadUserSetup(profileId)
  return { completedOnboarding: !!setup }
}
