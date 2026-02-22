/**
 * prompt.js
 * ─────────────────────────────────────────────────────────────
 * All AI prompt templates for the life simulation.
 * Each life area has its own decision template with specific
 * stats it can change. Modify the templates here to adjust
 * what the AI returns — never touch the route or useGame for this.
 *
 * STATS THAT CAN CHANGE:
 * - stress          (0–100, clamped)
 * - free_time       (0–100, clamped)
 * - net_worth       (open, can go negative)
 * - salary          (open, annual)
 * - age             (increments over time)
 * - expected_death_age (open, AI can adjust based on decisions)
 * - city            (string, e.g. "New York")
 * - relationship_status (string, e.g. "single", "dating", "married")
 * ─────────────────────────────────────────────────────────────
 */


// ─────────────────────────────────────────────
// PLAYER DATA FORMATTERS
// These turn raw DB data into readable text for the AI
// ─────────────────────────────────────────────

export function formatPlayerStats(state) {
  return `
PLAYER STATS:
- Age: ${state.age}
- Stress: ${state.stress}/100
- Free Time: ${state.free_time}/100 hours per week
- Net Worth: $${Number(state.net_worth).toLocaleString()}
- Monthly Income: $${Number(state.monthly_income).toLocaleString()}
- Monthly Expenses: $${Number(state.monthly_expenses).toLocaleString()}
- Salary: $${Number(state.salary).toLocaleString()} per year
- Career: ${state.job_title ?? 'Unemployed'} (${state.career_stage})
- Education: ${state.education_level}
- Relationship: ${state.relationship_status}
- Has Children: ${state.has_children ? 'Yes' : 'No'}
- City: ${state.city ?? 'Unknown'}
- Expected Death Age: ${state.expected_death_age ?? 85}
  `.trim()
}

export function formatLifeEvents(events) {
  if (!events?.length) return 'No recent events.'
  return events
    .slice(0, 10)
    .map(e => `- Age ${e.player_age}: [${e.category}] ${e.title}`)
    .join('\n')
}

// ─────────────────────────────────────────────
// STRICT DELTA RULES — injected into every prompt
// Tells the AI exactly what it can and cannot return
// ─────────────────────────────────────────────

const DELTA_RULES = `
STRICT RULES FOR DELTAS:
- The deltas object MUST only contain keys from this list: stress, free_time, net_worth, salary, age, expected_death_age, city, relationship_status
- stress and free_time are numbers between -100 and 100
- net_worth and salary are numbers (can be negative)
- age is always a positive number
- expected_death_age is a number (e.g. 82)
- city is a string (e.g. "Chicago") or null if unchanged
- relationship_status is a string (e.g. "dating", "married", "single") or null if unchanged
- Only include a key in deltas if it actually changes — omit unchanged ones
- Do NOT add any other keys like happiness, health, career_xp or anything else
- Respond with valid JSON only — no markdown, no backticks, no explanation
- If a custom input is given and a value you need to determine is ambigous, use the average of said data.
`.trim()


// ─────────────────────────────────────────────
// DELTA SANITIZER
// Strips any keys Gemini adds that aren't allowed
// Always run this on the AI response before saving
// ─────────────────────────────────────────────

const ALLOWED_DELTA_KEYS = [
  'stress',
  'free_time',
  'net_worth',
  'salary',
  'age',
  'expected_death_age',
  'city',
  'relationship_status',
]

export function sanitizeDeltas(deltas) {
  return Object.fromEntries(
    Object.entries(deltas).filter(([key]) => ALLOWED_DELTA_KEYS.includes(key))
  )
}

export function sanitizeDecisions(decisions) {
  return decisions.map(d => ({
    title:       d.title,
    description: d.description,
    outcome:     d.outcome,
    deltas:      sanitizeDeltas(d.deltas ?? {}),
  }))
}


// ─────────────────────────────────────────────
// DECISION TEMPLATES
// One per life area. Each defines what stats the
// AI should focus on changing for that category.
// ─────────────────────────────────────────────

const TEMPLATES = {

  // ── Career & Work ──────────────────────────
  career: {
    label: 'Career & Work',
    focusStats: ['stress', 'salary', 'free_time'],
    instructions: `
Focus decisions on career progression, job changes, promotions, entrepreneurship, 
or work-life balance. Salary and stress should be the primary stats that change.
Consider the player's current career stage, education, and financial situation.
A risky move might spike stress but increase salary. A safe move keeps stress low but limits growth.
    `.trim(),
  },

  // ── Finance & Wealth ───────────────────────
  finance: {
    label: 'Finance & Wealth',
    focusStats: ['net_worth', 'stress', 'free_time'],
    instructions: `
Focus decisions on investments, savings, spending, debt, or financial planning.
Net worth should be the primary stat that changes.
Consider the player's current net worth, income vs expenses, and risk tolerance from memory.
A high risk investment could dramatically change net worth positively or negatively.
A conservative choice preserves wealth but grows slowly.
    `.trim(),
  },

  // ── Health & Wellness ──────────────────────
  health: {
    label: 'Health & Wellness',
    focusStats: ['stress', 'free_time', 'expected_death_age'],
    instructions: `
Focus decisions on physical health, mental health, lifestyle habits, and longevity.
Expected death age and stress should be the primary stats that change.
Consider that chronic stress, poor sleep, and bad habits reduce expected death age.
Exercise, therapy, and rest increase it. Free time is often the trade-off.
    `.trim(),
  },

  // ── Relationships & Social ─────────────────
  relationships: {
    label: 'Relationships & Social',
    focusStats: ['relationship_status', 'stress', 'free_time'],
    instructions: `
Focus decisions on romantic relationships, friendships, family, and social life.
Relationship status and stress should be the primary stats that change.
Consider the player's current relationship status and life stage.
Getting into a relationship might reduce free time but reduce stress.
A breakup might spike stress short term but free up time.
    `.trim(),
  },

  // ── Life Balance & Time ────────────────────
  balance: {
    label: 'Life Balance & Time',
    focusStats: ['free_time', 'stress', 'net_worth'],
    instructions: `
Focus decisions on how the player spends their time — hobbies, travel, rest, 
side projects, or cutting back on work. Free time should be the primary stat that changes.
Consider that more free time often comes at a financial cost.
Moving to a cheaper city could free up money and reduce stress.
Taking a sabbatical increases free time but reduces net worth.
    `.trim(),
  },
}


// ─────────────────────────────────────────────
// MAIN INFERENCE PROMPT BUILDER
// Called by app/ai/infer/route.js
// Pass a category to get a focused template,
// or omit it for a general life inference
// ─────────────────────────────────────────────

export function buildInferencePrompt({ state, memory, events, question, category = null }) {
  const template = TEMPLATES[category] ?? null
  const templateBlock = template ? `
DECISION FOCUS AREA: ${template.label}
FOCUS STATS: ${template.focusStats.join(', ')}
INSTRUCTIONS: ${template.instructions}
  `.trim() : ''

  return `
You are a life simulation AI making inferences about a real person's life.
Be specific, grounded in their data, and realistic — not generic.

${formatPlayerStats(state)}

WHAT YOU KNOW ABOUT THIS PERSON:
${memory || 'No memory context yet.'}

RECENT LIFE EVENTS:
${formatLifeEvents(events)}

${templateBlock}

CURRENT SITUATION:
${question}

${DELTA_RULES}

Respond with this exact JSON structure:
{
  "inference": "2-3 sentence insight about where this person's life is heading based on their specific data",
  "decisions": [
    {
      "title": "Short decision title",
      "description": "What this decision involves",
      "outcome": "What is likely to happen",
      "deltas": { "stress": 0, "net_worth": 0, "salary": 0 }
    },
    {
      "title": "Short decision title",
      "description": "What this decision involves",
      "outcome": "What is likely to happen",
      "deltas": { "stress": 0, "net_worth": 0, "salary": 0 }
    },
    {
      "title": "Short decision title",
      "description": "What this decision involves",
      "outcome": "What is likely to happen",
      "deltas": { "stress": 0, "net_worth": 0, "salary": 0 }
    }
  ],
  "memory_updates": [
    {
      "category": "fact|preference|trait|goal|context",
      "key": "unique_key",
      "content": "What the AI learned about this person",
      "importance": 5
    }
  ]
}
  `.trim()
}


// ─────────────────────────────────────────────
// SUMMARY PROMPT
// Quick life snapshot — used on dashboard / home screen
// ─────────────────────────────────────────────

export function buildSummaryPrompt({ state, memory, events }) {
  return `
You are a life coach AI. Give an honest, specific, encouraging summary of this person's life right now.

${formatPlayerStats(state)}

WHAT YOU KNOW:
${memory || 'No memory context yet.'}

RECENT EVENTS:
${formatLifeEvents(events)}

${DELTA_RULES}

Respond with valid JSON only:
{
  "summary": "3-4 sentence honest summary of where they are in life",
  "focus": "The single most important thing they should focus on right now",
  "outlook": "positive | neutral | concerning"
}
  `.trim()
}






// ─────────────────────────────────────────────
// MILESTONE PROMPT
// Triggered at key life moments — birthday, retirement,
// major life event. Gives a reflective AI response.
// ─────────────────────────────────────────────

export function buildMilestonePrompt({ state, memory, events, milestone }) {
  return `
You are a life simulation AI reflecting on a significant life milestone for this person.

${formatPlayerStats(state)}

WHAT YOU KNOW:
${memory || 'No memory context yet.'}

RECENT EVENTS:
${formatLifeEvents(events)}

MILESTONE: ${milestone}

${DELTA_RULES}

Respond with valid JSON only:
{
  "reflection": "2-3 sentence reflection on this milestone given their specific life data",
  "decisions": [
    {
      "title": "Short decision title",
      "description": "What this decision involves",
      "outcome": "What is likely to happen",
      "deltas": { "stress": 0, "net_worth": 0, "free_time": 0 }
    },
    {
      "title": "Short decision title",
      "description": "What this decision involves",
      "outcome": "What is likely to happen",
      "deltas": { "stress": 0, "net_worth": 0, "free_time": 0 }
    },
    {
      "title": "Short decision title",
      "description": "What this decision involves",
      "outcome": "What is likely to happen",
      "deltas": { "stress": 0, "net_worth": 0, "free_time": 0 }
    }
  ]
}
  `.trim()
}


// ─────────────────────────────────────────────
// WHAT IF PROMPT
// Player asks "what if I had done X differently"
// AI simulates an alternate life path
// ─────────────────────────────────────────────

export function buildWhatIfPrompt({ state, memory, events, scenario }) {
  return `
You are a life simulation AI exploring an alternate life path for this person.

${formatPlayerStats(state)}

WHAT YOU KNOW:
${memory || 'No memory context yet.'}

RECENT EVENTS:
${formatLifeEvents(events)}

WHAT IF SCENARIO: ${scenario}

${DELTA_RULES}

Respond with valid JSON only:
{
  "alternate_path": "3-4 sentence description of how their life would look in this alternate scenario",
  "key_differences": ["list of 3 key ways their life would be different"],
  "deltas": { "stress": 0, "net_worth": 0, "salary": 0, "free_time": 0 }
}
  `.trim()
}

export function buildCustomInputPrompt({ state, memory, events, input }) {
  return `
You are a life simulation AI. A person has typed something freely about their life.
Categorize it into one of these areas: career, finance, health, relationships, balance.
Then treat it exactly like a normal life decision for that category.

${formatPlayerStats(state)}

WHAT YOU KNOW ABOUT THIS PERSON:
${memory || 'No memory context yet.'}

RECENT LIFE EVENTS:
${formatLifeEvents(events)}

WHAT THE PLAYER TYPED:
"${input}"

${DELTA_RULES}

Respond with this exact JSON structure:
{
  "inference": "2-3 sentence insight about this situation given their specific data",
  "decisions": [
    { "title": "", "description": "", "outcome": "", "deltas": { "stress": 0, "net_worth": 0, "salary": 0 } },
    { "title": "", "description": "", "outcome": "", "deltas": { "stress": 0, "net_worth": 0, "salary": 0 } },
    { "title": "", "description": "", "outcome": "", "deltas": { "stress": 0, "net_worth": 0, "salary": 0 } }
  ],
  "memory_updates": [
    { "category": "fact|preference|trait|goal|context", "key": "unique_key", "content": "", "importance": 5 }
  ]
}
  `.trim()
}