import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { applyStatDeltas, ensureUserBootstrap, saveAgentMemory } from '@/lib/game-db'

export async function POST(request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureUserBootstrap(user.id)
    const { deltas, event, memory } = await request.json()

    if (!deltas || !event) {
      return NextResponse.json({ error: 'Missing deltas or event' }, { status: 400 })
    }

    const newState = await applyStatDeltas(user.id, deltas, event)

    if (memory?.length) {
      await Promise.all(
        memory.map(m => saveAgentMemory({ profile_id: user.id, ...m }))
      )
    }

    return NextResponse.json({ state: newState })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
