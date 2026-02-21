import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Internal helper — attaches the Supabase JWT to every API call
async function authFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      ...options.headers,
    },
  }).then(r => r.json())
}

export function useGame() {
  const [state, setState]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [inference, setInference]   = useState(null)
  const [aiLoading, setAiLoading]   = useState(false)

  // Load game state on mount
  useEffect(() => {
    authFetch('/api/game/state')
      .then(data => setState(data))
      .catch(e   => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  /**
   * makeDecision — call this after every player choice
   * @param {object} deltas  - stat changes e.g. { stress: +10, net_worth: -500 }
   * @param {object} event   - { category, title, description }
   * @param {array}  memory  - optional AI memory updates [{ category, key, content, importance }]
   */
  const makeDecision = useCallback(async (deltas, event, memory = []) => {
    setLoading(true)
    try {
      const res = await authFetch('/api/game/decision', {
        method: 'POST',
        body: JSON.stringify({ deltas, event, memory }),
      })
      setState(res.state)
      return res.state
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * getInference — asks Gemini to analyze the player's life and return decisions
   * @param {string} question - the current situation e.g. "I'm thinking about changing careers"
   * @returns {{ inference, decisions, memory_updates }}
   */
  const getInference = useCallback(async (question) => {
    setAiLoading(true)
    try {
      const res = await authFetch('/ai/infer', {
        method: 'POST',
        body: JSON.stringify({ question, type: 'inference' }),
      })
      setInference(res)
      return res
    } catch (e) {
      setError(e.message)
    } finally {
      setAiLoading(false)
    }
  }, [])

  /**
   * getSummary — asks Gemini for a quick "your life at a glance" summary
   * @returns {{ summary, focus }}
   */
  const getSummary = useCallback(async () => {
    setAiLoading(true)
    try {
      const res = await authFetch('/ai/infer', {
        method: 'POST',
        body: JSON.stringify({ question: 'Summarize my life', type: 'summary' }),
      })
      return res
    } catch (e) {
      setError(e.message)
    } finally {
      setAiLoading(false)
    }
  }, [])

  const updateSettings = useCallback(async (settings) => {
    return authFetch('/api/game/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    })
  }, [])

  const loadEvents = useCallback(async (category = null, limit = 50) => {
    const params = new URLSearchParams({ limit })
    if (category) params.set('category', category)
    return authFetch(`/api/game/events?${params}`)
  }, [])

  const loadMemory = useCallback(async (category = null) => {
    const params = category ? `?category=${category}` : ''
    return authFetch(`/api/game/memory${params}`)
  }, [])

  return {
    state,           // current game state object
    loading,         // true while any request is in flight
    error,           // last error message or null
    makeDecision,    // primary function — call after every choice
    updateSettings,  // save game preferences
    loadEvents,      // fetch life events history
    loadMemory,      // fetch AI agent memories
  }
}
