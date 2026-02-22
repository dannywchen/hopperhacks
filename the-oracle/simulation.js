// simulation.js
// Two modes:
//   PASSIVE — AI predicts your life X years forward based on your data
//   ACTIVE  — Play through life making decisions each year
//
// Usage:
//   node simulation.js passive 10    ← predict 10 years forward
//   node simulation.js active        ← play through interactively

import { GoogleGenerativeAI } from '@google/generative-ai'
import readline from 'readline'
import {
  buildInferencePrompt,
  buildCustomInputPrompt,
  sanitizeDecisions,
  sanitizeDeltas,
  formatPlayerStats,
} from './lib/prompt.js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const gemini = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

// ─────────────────────────────────────────────
// STARTING STATE — replace with real user data
// ─────────────────────────────────────────────

/*
[personality] — how they think and behave
[preference] — what they value and prioritize
[goal] — what they're working toward
[fact] — fixed truths about their life
[trait] — specific strengths or weaknesses
[context] — current temporary situation
*/


const initialState = {
  age:                  28,
  stress:               65,
  free_time:            20,
  net_worth:            12000,
  monthly_income:       4500,
  monthly_expenses:     3800,
  salary:               54000,
  job_title:            'Junior Developer',
  career_stage:         'junior',
  education_level:      'bachelor',
  relationship_status:  'single',
  has_children:         false,
  city:                 'New York',
  expected_death_age:   85,
}

const initialMemory = `
[personality] Ambitious but prone to burnout
[preference] Values financial security over free time
[goal] Wants to reach $100k salary by age 30
`.trim()

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const clamp = (val, min = 0, max = 100) => Math.min(max, Math.max(min, val))

function applyDeltas(state, deltas) {
  const d = sanitizeDeltas(deltas)
  return {
    ...state,
    stress:             d.stress             !== undefined ? clamp(state.stress    + d.stress)             : state.stress,
    free_time:          d.free_time          !== undefined ? clamp(state.free_time + d.free_time)          : state.free_time,
    net_worth:          d.net_worth          !== undefined ? state.net_worth           + d.net_worth       : state.net_worth,
    salary:             d.salary             !== undefined ? state.salary               + d.salary         : state.salary,
    age:                d.age                !== undefined ? state.age                  + d.age            : state.age,
    expected_death_age: d.expected_death_age !== undefined ? d.expected_death_age : state.expected_death_age,
    city:               d.city               !== undefined ? d.city                                        : state.city,
    relationship_status:d.relationship_status!== undefined ? d.relationship_status                         : state.relationship_status,
  }
}

async function ask(prompt) {
  const result  = await gemini.generateContent(prompt)
  const text    = result.response.text()
  const cleaned = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}

function printDivider(label) {
  console.log(`\n${'─'.repeat(50)}`)
  if (label) console.log(label)
  console.log('─'.repeat(50))
}

function printState(state) {
  console.log(formatPlayerStats(state))
}

// ─────────────────────────────────────────────
// PASSIVE MODE
// AI predicts life X years forward year by year
// based purely on the user's data — no random events
// ─────────────────────────────────────────────

async function passiveSimulation(years) {
  console.log(`\n🔮 PASSIVE SIMULATION — Predicting ${years} years forward\n`)

  let state  = { ...initialState }
  let memory = initialMemory
  const events = []

  for (let year = 1; year <= years; year++) {
    printDivider(`Year ${year} — Age ${state.age + 1}`)

    const prompt = `
You are a life prediction AI. Based strictly on this person's data and trajectory,
predict what will realistically happen to them over the next year.
Do NOT invent random events. Base everything on patterns in their current data.
For example: high stress + low free time → likely burnout, declining health metrics.
Ambition + junior career stage → likely promotion or job switch within 1-2 years.

${formatPlayerStats(state)}

WHAT YOU KNOW:
${memory}

RECENT EVENTS:
${events.slice(-5).map(e => `- Age ${e.age}: ${e.summary}`).join('\n') || 'None yet.'}

${`
STRICT RULES FOR DELTAS:
- Only include keys that actually change: stress, free_time, net_worth, salary, age, expected_death_age, city, relationship_status
- stress and free_time are numbers between -100 and 100
- net_worth and salary are numbers
- age always increases by 1 each year
- Do NOT add any other keys
- Respond with valid JSON only — no markdown, no backticks
`}

Respond with valid JSON only:
{
  "summary": "2-3 sentence realistic prediction of what happens this year based on their data",
  "deltas": { "age": 1, "stress": 0, "net_worth": 0, "salary": 0 }
}
    `.trim()

    const res = await ask(prompt)
    const deltas = sanitizeDeltas({ age: 1, ...res.deltas })

    state = applyDeltas(state, deltas)
    events.push({ age: state.age, summary: res.summary })

    console.log(`\n📋 ${res.summary}`)
    console.log(`\nStat changes:`, deltas)
    console.log(`\nCurrent state:`)
    printState(state)

    // Stop if player reaches expected death age
    if (state.age >= state.expected_death_age) {
      printDivider('END OF SIMULATION')
      console.log(`\n💀 Simulation ended — reached expected death age of ${state.expected_death_age}`)
      break
    }
  }

  printDivider('FINAL STATE')
  printState(state)
  console.log('\n✅ Passive simulation complete')
}


// ─────────────────────────────────────────────
// ACTIVE MODE
// Player makes decisions each year
// 4 options: career, finance, health, custom
// ─────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const prompt_user = (q) => new Promise(resolve => rl.question(q, resolve))

async function activeSimulation() {
  console.log('\n🎮 ACTIVE SIMULATION — Make decisions each year\n')

  let state  = { ...initialState }
  let memory = initialMemory
  const events = []
  let playing = true

  while (playing) {
    printDivider(`Age ${state.age}`)
    printState(state)

    console.log('\nWhat do you want to focus on this year?')
    console.log('  1. Career & Work')
    console.log('  2. Finance & Wealth')
    console.log('  3. Health & Wellness')
    console.log('  4. Relationships & Social')
    console.log('  5. Custom — describe your own situation')
    console.log('  q. Quit\n')

    const choice = await prompt_user('Your choice: ')

    if (choice.toLowerCase() === 'q') {
    playing = false
    break
    }

    let inferencePrompt
    let question

    if (choice === '5') {
    question = await prompt_user('\nWhat is your situation? Describe it freely:\n> ')
    console.log('\n⏳ Analyzing your situation...')
    inferencePrompt = buildCustomInputPrompt({
        state, memory, events, input: question,
    })
    } else {
    const categories = { '1': 'career', '2': 'finance', '3': 'health', '4': 'relationships' }
    const category   = categories[choice]
    if (!category) { console.log('Invalid choice, try again.'); continue }

    const questions = {
        career:        'What is happening in my career this year?',
        finance:       'What financial decisions am I facing this year?',
        health:        'What health decisions am I facing this year?',
        relationships: 'What relationship decisions am I facing this year?',
    }
    question        = questions[category]
    inferencePrompt = buildInferencePrompt({ state, memory, events, question, category })
    }

    // Get AI decisions
    let res
    try {
      res = await ask(inferencePrompt)
      res.decisions = sanitizeDecisions(res.decisions)
    } catch (e) {
      console.log('AI error, skipping this year:', e.message)
      continue
    }

    // Show inference and decisions
    console.log(`\n💭 ${res.inference}\n`)
    console.log('Your options:\n')
    res.decisions.forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.title}`)
      console.log(`     ${d.description}`)
      console.log(`     Outcome: ${d.outcome}`)
      console.log(`     Stat changes: ${JSON.stringify(d.deltas)}\n`)
    })

    // Player picks a decision
    const pick = await prompt_user('Pick a decision (1, 2, or 3): ')
    const decision = res.decisions[parseInt(pick) - 1]

    if (!decision) { console.log('Invalid pick, skipping year.'); continue }

    // Apply deltas + age by 1
    state = applyDeltas(state, { ...decision.deltas, age: 1 })
    events.push({ age: state.age, summary: decision.title })

    console.log(`\n✅ ${decision.title} — ${decision.outcome}`)
    console.log(`Stat changes applied:`, decision.deltas)

    // Update memory from AI suggestions
    if (res.memory_updates?.length) {
      const newMemories = res.memory_updates.map(m => `[${m.category}] ${m.content}`).join('\n')
      memory = `${memory}\n${newMemories}`.trim()
    }

    // Check death age
    if (state.age >= state.expected_death_age) {
      printDivider('GAME OVER')
      console.log(`\n💀 You reached your expected death age of ${state.expected_death_age}`)
      playing = false
    }
  }

  printDivider('FINAL STATE')
  printState(state)
  rl.close()
  console.log('\n✅ Active simulation complete')
}


// ─────────────────────────────────────────────
// ENTRY POINT
// node simulation.js passive 10
// node simulation.js active
// ─────────────────────────────────────────────

const mode  = process.argv[2]
const years = parseInt(process.argv[3]) || 10

if (mode === 'passive') {
  passiveSimulation(years).catch(console.error)
} else if (mode === 'active') {
  activeSimulation().catch(console.error)
} else {
  console.log('\nUsage:')
  console.log('  node simulation.js passive 10   ← predict 10 years forward')
  console.log('  node simulation.js active       ← play through interactively\n')
  process.exit(1)
}