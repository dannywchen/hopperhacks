const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_MODEL = 'gemini-3-flash-preview'

function extractText(payload) {
  return payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text ?? '')
    .join('')
    .trim()
}

function extractJsonText(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim()
  }
  return text.trim()
}

async function requestGemini(prompt, { responseMimeType = 'text/plain', maxOutputTokens = 1600 } = {}) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY.')
  }

  const response = await fetch(
    `${GEMINI_API_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens,
          responseMimeType,
        },
      }),
    }
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = payload?.error?.message ?? `Gemini request failed (${response.status}).`
    throw new Error(detail)
  }
  const text = extractText(payload)
  if (!text) {
    throw new Error('Gemini returned an empty response.')
  }
  return text
}

export async function askGemini(prompt) {
  return requestGemini(prompt, {
    responseMimeType: 'text/plain',
    maxOutputTokens: 1800,
  })
}

export async function askGeminiJSON(prompt) {
  const fullPrompt = `
${prompt}

IMPORTANT: Respond with valid JSON only. No markdown, no backticks, no explanation.
  `.trim()

  const text = await requestGemini(fullPrompt, {
    responseMimeType: 'application/json',
    maxOutputTokens: 1800,
  })

  try {
    return JSON.parse(text)
  } catch {
    const cleaned = extractJsonText(text)
    return JSON.parse(cleaned)
  }
}
