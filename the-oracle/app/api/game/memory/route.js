import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { loadAgentMemory, saveAgentMemory } from '@/lib/game-db'

export async function GET(request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const data = await loadAgentMemory(user.id, category)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    await saveAgentMemory({ profile_id: user.id, ...body })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
