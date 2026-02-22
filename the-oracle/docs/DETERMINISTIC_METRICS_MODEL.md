# Deterministic Metrics Model

This simulation uses a strict separation of concerns:

- LLM (`gemini-3-flash-preview`) is used for narrative, likely actions, and storyline text only.
- Metric transitions are computed deterministically in `/Users/dannywchen/Documents/GitHub/hopperhacks/the-oracle/lib/simulation-deterministic.ts`.
- No random jitter and no LLM-provided numeric deltas are used.

## 1. Action -> Feature Vector

Input action text (`label + details`) is normalized and mapped to a fixed feature vector:

- `work, learning, health, relationships, finance, leisure, risk, discipline, spending, social`

Each feature is an activation from keyword hits:

- `activation = 1 - exp(-keyword_score)`
- `feature = clamp01(base + 0.62 * activation)`

This makes action parsing deterministic and repeatable.

## 2. Daily State Transition

The engine advances one day at a time. Multi-day steps are repeated daily updates.

### Stress

- Built from a deterministic job-demand/recovery balance:
- `stress_target = 38 + 34*workload + 22*financial_strain + 16*social_conflict - 31*recovery - 9*discipline`
- `stress_next = stress + 0.18*(stress_target - stress)`

### Free Time

- Uses a weekly time-budget constraint (`168h`):
- `discretionary_hours = 168 - maintenance - work_hours - social_hours - health_hours`
- `free_time_target = 100 * discretionary_hours / 56`
- `free_time_next = free_time + 0.23*(free_time_target - free_time)`

### Health

- Uses deterministic allostatic-load style penalties from stress/burnout:
- `burnout = f(stress, workload, low_recovery, low_free_time)`
- `health_target = 46 + 30*recovery + 12*health_focus + 6*discipline - 22*stress - 12*burnout - 8*financial_strain`
- `health_next = health + 0.16*(health_target - health)`

### Relationships

- `relationships_target = 44 + 34*social_investment + 6*discipline + 5*free_time - 14*stress - 10*workload`
- `relationships_next = relationships + 0.18*(relationships_target - relationships)`

### Career

- `career_target = 45 + 28*learning + 20*work + 7*discipline + 6*confidence - 18*burnout - 10*stress`
- `career_next = career + 0.14*(career_target - career)`

### Salary (USD annual)

- `salary_target = 24000 + 1400*career + 22000*confidence + 18000*learning - 12000*burnout`
- `salary_next = salary + 0.0012*(salary_target - salary) + salary*market_drift_rate`

### Monthly Expenses (USD)

- `expenses_target = after_tax_monthly * (0.54 + 0.36*spending_impulse - 0.20*savings_intent) + 180 + 6*(100-money_score)`
- `monthly_expenses_next = monthly_expenses + clamp(0.12*(target-current), -140, 140)`

### Net Worth (USD)

- `cashflow_monthly = after_tax_monthly - monthly_expenses`
- `net_worth_next = net_worth + cashflow_monthly/30 + net_worth*(expected_return_annual/365)`
- If net worth is negative, return term switches to debt-like penalty APR.

### Money Score (0-100)

- Composite of wealth signal, salary signal, cashflow signal, and expense burden:
- `money_target = 18 + 40*wealth + 25*salary + 24*cashflow - 18*expense_burden`
- `money_next = money + 0.20*(money_target - money)`

### Fulfillment

- Weighted blend of life domains + action-to-need alignment:
- `fulfillment_target = 26 + 0.22*career + 0.22*relationships + 0.20*health + 0.14*money + 0.14*free_time - 0.18*stress + 10*(alignment - 0.5)`
- `fulfillment_next = fulfillment + 0.16*(fulfillment_target - fulfillment)`

### Confidence

- Depends on current domain quality + recent directional progress:
- `confidence_target = 22 + 0.30*career + 0.20*money + 0.16*health + 0.14*relationships + 0.18*fulfillment - 0.24*stress + 8*progress_signal`
- `confidence_next = confidence + 0.17*(confidence_target - confidence)`

## 3. Deterministic Financial Submodel

- Effective tax uses progressive U.S. brackets (piecewise function) from IRS schedule.
- Net worth updates from accounting identity:
  - `net_worth_{t+1} = net_worth_t + savings_flow + investment_or_debt_carry`

## 4. Research Anchors

- LLM interview-conditioned behavior imitation framing:
  - `https://arxiv.org/pdf/2411.10109`
- Job strain and control framing for stress drivers:
  - `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3486012/`
- Chronic stress and health burden framing:
  - `https://www.cdc.gov/mentalhealth/stress-coping/cope-with-stress/`
- Compound growth behavior for wealth carry:
  - `https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator`
- U.S. progressive tax schedule anchor:
  - `https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2025`

