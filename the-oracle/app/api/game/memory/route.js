import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  deleteAgentMemory,
  loadAgentMemory,
  saveAgentMemory,
  updateAgentMemory,
} from '@/lib/game-db'

function cleanText(value, maxChars = 2000) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized
}

function normalizeImportance(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

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
    const key = cleanText(body?.key, 120)
    const content = cleanText(body?.content, 20_000)
    const category = cleanText(body?.category, 120)
    if (!key || !content || !category) {
      return NextResponse.json(
        { error: 'category, key, and content are required.' },
        { status: 400 }
      )
    }

    await saveAgentMemory({
      profile_id: user.id,
      category,
      key,
      content,
      importance: normalizeImportance(body?.importance),
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const key = cleanText(body?.key, 120)
    if (!key) {
      return NextResponse.json({ error: 'key is required.' }, { status: 400 })
    }

    const updates = {}
    if (typeof body?.content === 'string') {
      const content = cleanText(body.content, 20_000)
      if (!content) {
        return NextResponse.json({ error: 'content cannot be empty.' }, { status: 400 })
      }
      updates.content = content
    }
    if (typeof body?.category === 'string') {
      const category = cleanText(body.category, 120)
      if (!category) {
        return NextResponse.json({ error: 'category cannot be empty.' }, { status: 400 })
      }
      updates.category = category
    }
    if (body?.importance !== undefined) {
      updates.importance = normalizeImportance(body.importance)
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided.' }, { status: 400 })
    }

    const updated = await updateAgentMemory(user.id, key, updates)
    if (!updated) {
      return NextResponse.json({ error: 'Memory entry not found.' }, { status: 404 })
    }
    return NextResponse.json({ success: true, memory: updated })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const key = cleanText(searchParams.get('key'), 120)
    if (!key) {
      return NextResponse.json({ error: 'key is required.' }, { status: 400 })
    }
    await deleteAgentMemory(user.id, key)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
