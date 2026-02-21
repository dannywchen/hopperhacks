import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Gemini 2.0 Flash — fast and cost efficient
export const gemini = genAI.getGenerativeModel({ model: 'gemini-3.0-flash' })

/**
 * Send a prompt to Gemini and get a text response back
 * @param {string} prompt - the full prompt string
 * @returns {string} - Gemini's response text
 */
export async function askGemini(prompt) {
  const result = await gemini.generateContent(prompt)
  const response = await result.response
  return response.text()
}

/**
 * Send a prompt and get a parsed JSON response back
 * Use this when you need structured data (decisions, inferences etc.)
 * @param {string} prompt - the full prompt string
 * @returns {object} - parsed JSON object
 */
export async function askGeminiJSON(prompt) {
  const fullPrompt = `
${prompt}

IMPORTANT: Respond with valid JSON only. No markdown, no backticks, no explanation. Just the raw JSON object.
  `.trim()

  const result   = await gemini.generateContent(fullPrompt)
  const response = await result.response
  const text     = response.text()

  try {
    return JSON.parse(text)
  } catch {
    // Strip any accidental markdown fences and retry
    const cleaned = text.replace(/```json|```/g, '').trim()
    return JSON.parse(cleaned)
  }
}