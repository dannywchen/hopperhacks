import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { loadLifeEvents } from '@/lib/game-db'

export async function GET(request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const limit    = parseInt(searchParams.get('limit') ?? '50')
    const category = searchParams.get('category')
    const data = await loadLifeEvents(user.id, limit, category)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
