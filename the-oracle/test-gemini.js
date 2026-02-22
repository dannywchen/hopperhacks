// test-custom.js
// Tests the custom input option in isolation
// Usage:
//   Mac/Linux: node test-custom.js
//   Windows CMD: node test-custom.js (after setting GEMINI_API_KEY)
//   Windows PowerShell: node test-custom.js

import { GoogleGenerativeAI } from '@google/generative-ai'
import { buildCustomInputPrompt, sanitizeDecisions } from './lib/prompt.js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const gemini = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

// ─────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────

const mockState = {
  age: 28,
  stress: 65,
  free_time: 20,
  net_worth: 12000,
  monthly_income: 4500,
  monthly_expenses: 3800,
  salary: 54000,
  job_title: 'Junior Developer',
  career_stage: 'junior',
  education_level: 'bachelor',
  relationship_status: 'single',
  has_children: false,
  city: 'New York',
  expected_death_age: 85,
}

const mockMemory = `
[personality] User is ambitious but prone to burnout
[preference] Values financial security over free time
[goal] Wants to reach $100k salary by age 30
`.trim()

const mockEvents = [
  { player_age: 27, category: 'career',  title: 'Got first developer job' },
  { player_age: 28, category: 'finance', title: 'Paid off student loan' },
]

// ─────────────────────────────────────────────
// CUSTOM INPUT — change this to test anything
// ─────────────────────────────────────────────

const userInput = "I want to move to Shanghai and start a fish market"

// ─────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────

async function ask(prompt) {
  const result  = await gemini.generateContent(prompt)
  const text    = result.response.text()
  const cleaned = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}

// ─────────────────────────────────────────────
// TEST
// ─────────────────────────────────────────────

async function run() {
  try {
    console.log(`\nCustom input: "${userInput}"\n`)

    const prompt = buildCustomInputPrompt({
      state:  mockState,
      memory: mockMemory,
      events: mockEvents,
      input:  userInput,
    })

    const res = await ask(prompt)
    res.decisions = sanitizeDecisions(res.decisions)

      console.log('Inference:', res.inference)
    console.log('\nDecisions:')
    res.decisions.forEach((d, i) => {
      console.log(`\n  ${i + 1}. ${d.title}`)
      console.log(`     ${d.description}`)
      console.log(`     Outcome: ${d.outcome}`)
      console.log(`     Deltas:`, d.deltas)
    })

    console.log('\n✅ Done')
  } catch (e) {
    console.error('\n❌ Error:', e.message)
  }
}

run()