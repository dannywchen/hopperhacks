import { supabaseAdmin } from './supabase'

const clamp = (val, min = 0, max = 100) => Math.min(max, Math.max(min, val))

// ─────────────────────────────────────────────
// GAME STATE
// ─────────────────────────────────────────────

export async function loadGameState(profileId) {
  const { data, error } = await supabaseAdmin
    .from('game_state')
    .select('*')
    .eq('profile_id', profileId)
    .single()
  if (error) throw error
  return data
}

export async function saveGameState(profileId, updates) {
  const { data: current } = await supabaseAdmin
    .from('game_state')
    .select('decision_count')
    .eq('profile_id', profileId)
    .single()

  const { data, error } = await supabaseAdmin
    .from('game_state')
    .upsert({
      profile_id: profileId,
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
    age: deltas.age !== undefined ? clamp(current.age + deltas.age) : current.age,
    stress:    deltas.stress    !== undefined ? clamp(current.stress    + deltas.stress)    : current.stress,
    expected_death_age: deltas.expected_death_age !== undefined ? current.expected_death_age + deltas.expected_death_age : current.expected_death_age,
    health:    deltas.health    !== undefined ? clamp(current.health    + deltas.health)    : current.health,
    free_time: deltas.free_time !== undefined ? clamp(current.free_time + deltas.free_time) : current.free_time,
    net_worth: deltas.net_worth !== undefined ? current.net_worth + deltas.net_worth        : current.net_worth,
    salary:    deltas.salary    !== undefined ? current.salary    + deltas.salary           : current.salary,
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
  const { error } = await supabaseAdmin
    .from('agent_memory')
    .upsert(memory, { onConflict: 'profile_id, key' })
  if (error) throw error
}

// ─────────────────────────────────────────────
// LIFE EVENTS
// ─────────────────────────────────────────────

export async function logLifeEvent(event) {
  const { error } = await supabaseAdmin.from('life_events').insert(event)
  if (error) throw error
}

export async function loadLifeEvents(profileId, limit = 50, category = null) {
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
  const { data, error } = await supabaseAdmin
    .from('game_settings')
    .select('*')
    .eq('profile_id', profileId)
    .single()
  if (error) throw error
  return data
}

export async function saveGameSettings(profileId, settings) {
  const { error } = await supabaseAdmin
    .from('game_settings')
    .upsert({ profile_id: profileId, ...settings }, { onConflict: 'profile_id' })
  if (error) throw error
}
