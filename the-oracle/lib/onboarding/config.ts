import type {
  OnboardingInterviewDomainId,
  SimulationHorizonPreset,
  SimulationMode,
} from "@/lib/types";

export type InterviewDomainDefinition = {
  id: OnboardingInterviewDomainId;
  label: string;
  starterQuestion: string;
  followUpQuestion: string;
  keywords: string[];
  questionBank: Array<{
    id: string;
    layer: "layer1" | "layer2" | "layer3";
    prompt: string;
  }>;
};

export const INTERVIEW_DOMAINS: InterviewDomainDefinition[] = [
  {
    id: "decision_archaeology",
    label: "Decision Archaeology",
    starterQuestion:
      "Tell me the story of your life, from childhood up to the life events that define you today.",
    followUpQuestion:
      "Thinking back, was there a crossroads moment where multiple paths were available and your choice significantly shaped who you are?",
    keywords: [
      "decision",
      "choose",
      "choice",
      "regret",
      "mistake",
      "lesson",
      "career switch",
      "moved",
      "college",
    ],
    questionBank: [
      {
        id: "q1_life_story",
        layer: "layer1",
        prompt:
          "Tell me the story of your life from childhood to any major life events that define you today.",
      },
      {
        id: "q2_crossroads",
        layer: "layer1",
        prompt:
          "Thinking back, was there a crossroads moment where multiple paths were available, and your choice significantly defined who you are?",
      },
      {
        id: "q3_conscious_choice",
        layer: "layer1",
        prompt:
          "In that crossroads moment, did you make a highly conscious decision, or did things mostly just happen?",
      },
      {
        id: "q6_future_change_and_stability",
        layer: "layer1",
        prompt:
          "Imagine yourself a few years from now. What do you hope will be different, and what do you hope stays exactly the same?",
      },
      {
        id: "q19_worldview_shift",
        layer: "layer3",
        prompt:
          "Have you experienced any recent shifts in your political views or in how you see the world?",
      },
      {
        id: "q30_intent_vs_outcome",
        layer: "layer3",
        prompt:
          "When evaluating someone who made a mistake at work, does intention matter more to you, or does the actual outcome matter more?",
      },
    ],
  },
  {
    id: "stress_response",
    label: "Stress Response",
    starterQuestion:
      "What do you value the absolute most in your life right now?",
    followUpQuestion:
      "Tell me a story about a recent time you were in a rough place or struggling emotionally.",
    keywords: [
      "stress",
      "anxiety",
      "overwhelmed",
      "burnout",
      "panic",
      "cope",
      "pressure",
      "deadline",
    ],
    questionBank: [
      {
        id: "q5_values_today",
        layer: "layer1",
        prompt:
          "What do you value the absolute most in your life right now?",
      },
      {
        id: "q17_rough_place",
        layer: "layer2",
        prompt:
          "Tell me a story about a time recently when you were in a rough place or struggling emotionally.",
      },
      {
        id: "q18_coping_strategies",
        layer: "layer2",
        prompt:
          "During tough times or when you are overwhelmed, what are your actual emotional coping strategies?",
      },
      {
        id: "q26_outgoing",
        layer: "layer3",
        prompt:
          "Do you consider yourself naturally outgoing and sociable in new environments?",
      },
      {
        id: "q27_assertive_team",
        layer: "layer3",
        prompt:
          "When working in a team, do you tend to have an assertive personality?",
      },
    ],
  },
  {
    id: "habits_rhythm",
    label: "Habits and Rhythm",
    starterQuestion:
      "Across a typical week, how do your days vary from when you wake up to when you go to sleep?",
    followUpQuestion:
      "How predictable is your work schedule, and how much flexibility do you really have?",
    keywords: [
      "habit",
      "routine",
      "schedule",
      "wake",
      "sleep",
      "day",
      "week",
      "time",
      "focus",
    ],
    questionBank: [
      {
        id: "q7_weekly_rhythm",
        layer: "layer2",
        prompt:
          "Right now, across a typical week, how do your days vary from when you wake up to when you go to sleep?",
      },
      {
        id: "q8_schedule_flexibility",
        layer: "layer2",
        prompt:
          "Tell me about how predictable your work schedule is. Do you have a lot of flexibility?",
      },
      {
        id: "q20_world_connection",
        layer: "layer3",
        prompt:
          "How do you usually stay connected with the wider world: heavy social media, local community, or a mix?",
      },
      {
        id: "q21_public_action_style",
        layer: "layer3",
        prompt:
          "When a major societal issue happens, do you keep your thoughts private, discuss with friends, or take public action?",
      },
      {
        id: "q23_public_goods_style",
        layer: "layer3",
        prompt:
          "In a group project where reward is shared equally, do you contribute heavily upfront or wait to see what others do first?",
      },
    ],
  },
  {
    id: "health",
    label: "Health",
    starterQuestion:
      "For you, what makes it easy or hard to stay healthy on a daily basis?",
    followUpQuestion:
      "Do you think the government should spend more, less, or the same on improving national health and education systems?",
    keywords: [
      "health",
      "sleep",
      "exercise",
      "workout",
      "energy",
      "diet",
      "recovery",
      "medical",
    ],
    questionBank: [
      {
        id: "q16_health_barriers",
        layer: "layer2",
        prompt:
          "For you, what makes it easy or hard to stay healthy on a daily basis?",
      },
      {
        id: "q28_spending_health_education",
        layer: "layer3",
        prompt:
          "Do you feel the government should spend more, less, or the same amount on improving the nation's health and education systems?",
      },
    ],
  },
  {
    id: "relationships",
    label: "Relationships",
    starterQuestion:
      "Tell me about the family members, close friends, or partners who are most important to you right now.",
    followUpQuestion:
      "How would you describe your relationships at work with both managers and coworkers?",
    keywords: [
      "relationship",
      "partner",
      "family",
      "friend",
      "parents",
      "kids",
      "community",
      "lonely",
    ],
    questionBank: [
      {
        id: "q4_helping_hand",
        layer: "layer1",
        prompt:
          "Do you think another person or organization could have lent a helping hand during a pivotal moment in your life?",
      },
      {
        id: "q9_important_people",
        layer: "layer2",
        prompt:
          "Tell me about the family members, friends, or romantic partners who are most important to you right now.",
      },
      {
        id: "q10_work_relationships",
        layer: "layer2",
        prompt:
          "How would you describe your relationships at work, both with your managers and your coworkers?",
      },
      {
        id: "q11_household_stability",
        layer: "layer2",
        prompt:
          "Are there people living with you right now who are temporary, or is everyone a permanent member of your household?",
      },
      {
        id: "q24_trust_strangers",
        layer: "layer3",
        prompt:
          "When interacting with strangers, do you generally trust them outright, or require proof of reliability first?",
      },
      {
        id: "q25_conflict_intervention",
        layer: "layer3",
        prompt:
          "If a friend was in a conflict, would you usually intervene to help, or stay out because of potential social cost?",
      },
    ],
  },
  {
    id: "money",
    label: "Money",
    starterQuestion:
      "Let's talk through your monthly budget and the biggest expenses you have been carrying recently.",
    followUpQuestion:
      "If an unexpected $400 emergency came up right now, how would you get the money?",
    keywords: [
      "money",
      "income",
      "salary",
      "savings",
      "debt",
      "rent",
      "mortgage",
      "invest",
      "financial",
    ],
    questionBank: [
      {
        id: "q12_budget",
        layer: "layer2",
        prompt:
          "Let's talk about your monthly budget. Tell me how you make ends meet and what your biggest recent expenses were.",
      },
      {
        id: "q13_financial_feeling",
        layer: "layer2",
        prompt:
          "Overall, how do you feel about your current financial situation?",
      },
      {
        id: "q14_400_emergency",
        layer: "layer2",
        prompt:
          "What would it be like if you had an unexpected $400 emergency right now? How would you get the money?",
      },
      {
        id: "q15_savings_style",
        layer: "layer2",
        prompt:
          "Some people save for big goals, some for a rainy day, and some do not save consistently. How about you?",
      },
      {
        id: "q22_bonus_sharing",
        layer: "layer3",
        prompt:
          "If you were given a small financial bonus at work, how much would you feel compelled to share with others versus keep for yourself?",
      },
      {
        id: "q29_success_attribution",
        layer: "layer3",
        prompt:
          "In your career and wealth journey, do you view success as mostly hard work, or mostly systemic factors and luck?",
      },
    ],
  },
];

export const DEFAULT_INTERVIEW_DOMAIN_ID: OnboardingInterviewDomainId =
  "decision_archaeology";

export const INTERVIEW_QUESTION_BANK = INTERVIEW_DOMAINS.flatMap((domain) =>
  domain.questionBank.map((question) => ({
    ...question,
    domainId: domain.id,
    domainLabel: domain.label,
  })),
);

export const SIMULATION_HORIZON_OPTIONS: Array<{
  id: SimulationHorizonPreset;
  label: string;
  description: string;
  horizonYears: number;
}> = [
  {
    id: "whole_life",
    label: "Simulate out whole life",
    description: "Long-range trajectory with longevity assumptions included.",
    horizonYears: 60,
  },
  {
    id: "10_years",
    label: "Simulate 10 years out",
    description: "Strategic horizon for career, money, and relationships.",
    horizonYears: 10,
  },
  {
    id: "1_year",
    label: "Simulate 1 year out",
    description: "Tactical planning around concrete near-term decisions.",
    horizonYears: 1,
  },
  {
    id: "1_week",
    label: "Simulate the next week",
    description: "Short horizon for immediate behavior and routine changes.",
    horizonYears: 1,
  },
];

export const SIMULATION_MODE_OPTIONS: Array<{
  id: SimulationMode;
  label: string;
  description: string;
}> = [
  {
    id: "auto_future",
    label: "Time Into The Future",
    description:
      "Auto-generate a long timeline of likely future outcomes using your full memory and interview context.",
  },
  {
    id: "manual_step",
    label: "Predict Your Future Manually",
    description:
      "Play story mode from right now, picking one of 3 options or entering your own action every step.",
  },
];

export function horizonPresetToYears(
  preset: SimulationHorizonPreset | null | undefined,
) {
  const match =
    SIMULATION_HORIZON_OPTIONS.find((option) => option.id === preset) ??
    SIMULATION_HORIZON_OPTIONS[1];
  return match.horizonYears;
}

export function interviewDomainById(
  domainId: OnboardingInterviewDomainId | null | undefined,
) {
  return (
    INTERVIEW_DOMAINS.find((domain) => domain.id === domainId) ??
    INTERVIEW_DOMAINS[0]
  );
}
