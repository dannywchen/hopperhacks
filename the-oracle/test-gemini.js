// test-gemini.js
// Run this file directly to test Gemini without the full app
// Usage: node test-gemini.js
//
// Make sure you have your GEMINI_API_KEY set before running:
// export GEMINI_API_KEY=your-key-here

import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const gemini = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

// ─────────────────────────────────────────────
// FAKE PLAYER DATA — modify this to test different scenarios
// ─────────────────────────────────────────────
const mockState = {
  age: 28,
  health: 70,
  stress: 65,
  happiness: 45,
  free_time: 20,
  net_worth: 12000,
  monthly_income: 4500,
  monthly_expenses: 3800,
  job_title: 'Junior Developer',
  career_stage: 'junior',
  education_level: 'bachelor',
  relationship_status: 'single',
  has_children: false,
  city: 'New York',
}

const mockMemory = `
[personality] User is ambitious but prone to burnout
[preference] Values financial security over free time
[goal] Wants to reach $100k salary by age 30
`.trim()

const mockEvents = [
  { player_age: 27, category: 'career', title: 'Got first developer job' },
  { player_age: 28, category: 'finance', title: 'Paid off student loan' },
  { player_age: 28, category: 'health', title: 'Started skipping gym due to work stress' },
]

// ─────────────────────────────────────────────
// TEST 1 — Basic prompt test
// Just checks that Gemini responds at all
// ─────────────────────────────────────────────
async function testBasic() {
  console.log('\n── TEST 1: Basic Gemini connection ──')
  const result = await gemini.generateContent('Say hello in one sentence.')
  const text = result.response.text()
  console.log('Response:', text)
}

// ─────────────────────────────────────────────
// TEST 2 — Inference test
// Simulates what happens when a player asks for life decisions
// Modify the question variable to test different situations
// ─────────────────────────────────────────────
async function testInference() {
  console.log('\n── TEST 2: Life inference ──')

  const question = "I got a job offer for $90k but it means moving to another city"
  // ↑ MODIFY THIS to test different situations

  const prompt = `
You are a life simulation AI. Analyze this person's life data and generate decisions.

PLAYER STATS:
- Age: ${mockState.age}
- Health: ${mockState.health}/100
- Stress: ${mockState.stress}/100
- Happiness: ${mockState.happiness}/100
- Free Time: ${mockState.free_time}/100
- Net Worth: $${mockState.net_worth}
- Monthly Income: $${mockState.monthly_income}
- Monthly Expenses: $${mockState.monthly_expenses}
- Career: ${mockState.job_title} (${mockState.career_stage})
- City: ${mockState.city}

WHAT YOU KNOW ABOUT THIS PERSON:
${mockMemory}

RECENT EVENTS:
${mockEvents.map(e => `- Age ${e.player_age}: [${e.category}] ${e.title}`).join('\n')}

SITUATION: ${question}

Respond with valid JSON only — no markdown, no backticks:
{
  "inference": "2-3 sentence insight about where their life is heading",
  "decisions": [
    {
      "title": "Decision title",
      "description": "What this involves",
      "outcome": "Likely result",
      "deltas": { "stress": 0, "happiness": 0, "health": 0, "net_worth": 0, "salary": 0 }
    },
    {
      "title": "Decision title",
      "description": "What this involves",
      "outcome": "Likely result",
      "deltas": { "stress": 0, "happiness": 0, "health": 0, "net_worth": 0, "salary": 0 }
    },
    {
      "title": "Decision title",
      "description": "What this involves",
      "outcome": "Likely result",
      "deltas": { "stress": 0, "happiness": 0, "health": 0, "net_worth": 0, "salary": 0 }
    }
  ]
}
  `.trim()

  const result = await gemini.generateContent(prompt)
  const text = result.response.text()

  try {
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    console.log('\nInference:', parsed.inference)
    console.log('\nDecisions:')
    parsed.decisions.forEach((d, i) => {
      console.log(`\n  ${i + 1}. ${d.title}`)
      console.log(`     ${d.description}`)
      console.log(`     Outcome: ${d.outcome}`)
      console.log(`     Stat changes:`, d.deltas)
    })
  } catch (e) {
    console.log('Raw response (JSON parse failed):', text)
  }
}

// ─────────────────────────────────────────────
// TEST 3 — Summary test
// Simulates the getSummary() call
// ─────────────────────────────────────────────
async function testSummary() {
  console.log('\n── TEST 3: Life summary ──')

  const prompt = `
You are a life coach AI. Write a short honest summary of this person's life.

PLAYER STATS:
- Age: ${mockState.age}
- Stress: ${mockState.stress}/100
- Happiness: ${mockState.happiness}/100
- Net Worth: $${mockState.net_worth}
- Career: ${mockState.job_title}
- City: ${mockState.city}

WHAT YOU KNOW:
${mockMemory}

Respond with valid JSON only:
{
  "summary": "3-4 sentence life summary",
  "focus": "The one thing they should focus on right now"
}
  `.trim()

  const result = await gemini.generateContent(prompt)
  const text = result.response.text()

  try {
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    console.log('\nSummary:', parsed.summary)
    console.log('\nFocus:', parsed.focus)
  } catch (e) {
    console.log('Raw response (JSON parse failed):', text)
  }
}

// ─────────────────────────────────────────────
// RUN ALL TESTS
// Comment out any you don't want to run
// ─────────────────────────────────────────────
async function run() {
  try {
    await testBasic()
    await testInference()
    await testSummary()
    console.log('\n✅ All tests done')
  } catch (e) {
    console.error('\n❌ Error:', e.message)
  }
}

run()
