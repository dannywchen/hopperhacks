/**
 * prompt.js
 * Builds formatted prompts for Gemini from the player's live data.
 * Modify this file to change how the AI understands and talks about the player.
 */

/**
 * Formats the player's current stats into a readable block for the AI
 */
export function formatPlayerStats(state) {
  return `
PLAYER STATS:
- Age: ${state.age}
- Health: ${state.health}/100
- Stress: ${state.stress}/100
- Free Time: ${state.free_time}/100
- Net Worth: $${Number(state.net_worth).toLocaleString()}
- Monthly Income: $${Number(state.monthly_income).toLocaleString()}
- Monthly Expenses: $${Number(state.monthly_expenses).toLocaleString()}
- Career: ${state.job_title ?? 'Unemployed'} (${state.career_stage})
- Education: ${state.education_level}
- Relationship: ${state.relationship_status}
- Has Children: ${state.has_children ? 'Yes' : 'No'}
- City: ${state.city ?? 'Unknown'}
  `.trim()
}

/**
 * Formats recent life events into a readable timeline for the AI
 */
export function formatLifeEvents(events) {
  if (!events?.length) return 'No recent events.'
  return events
    .slice(0, 10)
    .map(e => `- Age ${e.player_age}: [${e.category}] ${e.title}`)
    .join('\n')
}

/**
 * Builds the full inference prompt — what the AI uses to analyze the player's life
 * and generate meaningful decisions or insights
 */
export function buildInferencePrompt({ state, memory, events, question }) {
  return `
You are a life simulation AI. You are analyzing a real person's life data to generate 
meaningful, realistic inferences and decisions. Be thoughtful, specific, and grounded 
in the data provided. Do not be generic. Consider all meaningfull events and decisions
the user makes, this is crutial to expecting their future.

${formatPlayerStats(state)}

WHAT YOU KNOW ABOUT THIS PERSON:
${memory || 'No memory context yet.'}

RECENT LIFE EVENTS:
${formatLifeEvents(events)}

CURRENT QUESTION OR SITUATION:
${question}

Based on everything above, respond with a JSON object in this exact format:
{
  "inference": "A 2-3 sentence insight about where this person's life is heading based on their data",
  "decisions": [
    {
      "title": "Short decision title",
      "description": "What this decision involves",
      "outcome": "What is likely to happen if they choose this",
      "deltas": {
        "stress": 0,
        "health": 0,
        "free_time": 0,
        "net_worth": 0,
        "salary": 0,
        "career_xp": 0
      }
    },
    {
      "title": "Short decision title",
      "description": "What this decision involves", 
      "outcome": "What is likely to happen if they choose this",
      "deltas": {
        "stress": 0,
        "health": 0,
        "free_time": 0,
        "net_worth": 0,
        "salary": 0,
        "career_xp": 0
      }
    },
    {
      "title": "Short decision title",
      "description": "What this decision involves",
      "outcome": "What is likely to happen if they choose this",
      "deltas": {
        "stress": 0,
        "health": 0,
        "free_time": 0,
        "net_worth": 0,
        "salary": 0,
        "career_xp": 0
      }
    }
  ],
  "memory_updates": [
    {
      "category": "fact|preference|trait|goal|context",
      "key": "unique_key_for_this_memory",
      "content": "What the AI learned about this person from this interaction",
      "importance": 5
    }
  ]
}
  `.trim()
}

/**
 * Builds a simpler prompt for a quick life summary
 * Use this for a dashboard "Your life at a glance" feature
 */
export function buildSummaryPrompt({ state, memory, events }) {
  return `
You are a life coach AI. Given this person's data, write a short, honest, 
and encouraging 3-4 sentence summary of where they are in life right now 
and one thing they should focus on. Be specific, not generic.

${formatPlayerStats(state)}

WHAT YOU KNOW ABOUT THIS PERSON:
${memory || 'No memory context yet.'}

RECENT LIFE EVENTS:
${formatLifeEvents(events)}

Respond with a JSON object:
{
  "summary": "3-4 sentence life summary",
  "focus": "The one thing they should focus on right now"
}
  `.trim()
}