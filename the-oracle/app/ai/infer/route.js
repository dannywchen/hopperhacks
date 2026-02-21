import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { loadGameState, loadLifeEvents, buildAIMemoryContext } from '@/lib/game-db'
import { askGeminiJSON } from '@/lib/gemini'
import { buildInferencePrompt, buildSummaryPrompt } from '@/lib/prompt'

/**
 * POST /ai/infer
 * Pulls the player's full data, builds a prompt, and asks Gemini
 * to generate inferences and decisions based on their life.
 *
 * Body: {
 *   question: string   ← the current situation or question to present to the AI
 *   type: 'inference' | 'summary'  ← what kind of response you want (default: inference)
 * }
 *
 * Returns: {
 *   inference: string         ← AI's insight about the player's life
 *   decisions: []             ← 3 decisions with stat deltas attached
 *   memory_updates: []        ← new memories the AI wants to save
 * }
 */
export async function POST(request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { question, type = 'inference' } = await request.json()

    if (!question) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 })
    }

    // Pull all player data in parallel
    const [state, events, memory] = await Promise.all([
      loadGameState(user.id),
      loadLifeEvents(user.id, 10),
      buildAIMemoryContext(user.id, 10),
    ])

    if (!state) {
      return NextResponse.json({ error: 'No game state found for this user' }, { status: 404 })
    }

    // Build the prompt based on type
    const prompt = type === 'summary'
      ? buildSummaryPrompt({ state, memory, events })
      : buildInferencePrompt({ state, memory, events, question })

    // Ask Gemini
    const aiResponse = await askGeminiJSON(prompt)

    return NextResponse.json(aiResponse)

  } catch (e) {
    console.error('AI inference error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}