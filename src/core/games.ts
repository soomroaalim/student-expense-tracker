/**
 * Mini games — lightweight, offline, fictional money only.
 * Pure game logic here; rewards live in localStorage under their own key
 * and NEVER touch real financial data (no transactions, no balances).
 */

// ------------------------------------------------------------------ helpers

export type Rng = () => number;

export function shuffled<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- money quiz

export interface QuizQuestion {
  q: string;
  options: string[];
  /** Index into options. */
  answer: number;
}

export const QUIZ_BANK: QuizQuestion[] = [
  { q: 'You have Rs1,000 and spend Rs350. How much is left?', options: ['Rs550', 'Rs650', 'Rs750'], answer: 1 },
  { q: 'You save Rs200 every week. How much after 4 weeks?', options: ['Rs600', 'Rs800', 'Rs1,000'], answer: 1 },
  { q: 'A Rs500 shirt is 20% off. How much do you save?', options: ['Rs50', 'Rs100', 'Rs150'], answer: 1 },
  { q: 'You split a Rs900 bill equally with 2 friends (3 people). Each pays?', options: ['Rs250', 'Rs300', 'Rs450'], answer: 1 },
  { q: 'You have Rs2,000. Rent is Rs1,200 and food is Rs500. Left?', options: ['Rs200', 'Rs300', 'Rs500'], answer: 1 },
  { q: 'You borrow Rs1,000 and repay Rs400. How much do you still owe?', options: ['Rs400', 'Rs600', 'Rs1,400'], answer: 1 },
  { q: 'A 10% tip on a Rs800 bill is?', options: ['Rs8', 'Rs80', 'Rs160'], answer: 1 },
  { q: 'You get Rs5,000 allowance and spend Rs4,200. You saved?', options: ['Rs500', 'Rs800', 'Rs1,200'], answer: 1 },
  { q: 'An emergency fund is for…', options: ['a new phone', 'unexpected expenses', 'shopping sales'], answer: 1 },
  { q: 'A Rs1,500 course: you have Rs1,000 and save Rs250/week. Weeks needed?', options: ['1', '2', '3'], answer: 1 },
  { q: 'Which habit helps most with money?', options: ['never checking your balance', 'tracking your spending', 'borrowing often'], answer: 1 },
  { q: 'Rs2,500 budget, you spent Rs1,800. Safe to spend?', options: ['Rs900', 'Rs700', 'Rs500'], answer: 1 },
];

export const QUIZ_ROUND_SIZE = 5;

/** Pick N questions with shuffled options (answer index corrected). */
export function pickQuizQuestions(count = QUIZ_ROUND_SIZE, rng: Rng = Math.random): QuizQuestion[] {
  return shuffled(QUIZ_BANK, rng).slice(0, count).map((q) => {
    const order = shuffled(q.options.map((_, i) => i), rng);
    return {
      q: q.q,
      options: order.map((i) => q.options[i]),
      answer: order.indexOf(q.answer),
    };
  });
}

/** Count correct picks (picks[i] is the chosen option index, -1 = skipped). */
export function gradeQuiz(questions: QuizQuestion[], picks: number[]): number {
  let score = 0;
  questions.forEach((q, i) => { if (picks[i] === q.answer) score++; });
  return score;
}

// ------------------------------------------------------------ budget challenge

export interface BudgetChoice {
  id: string;
  label: string;
  /** Fictional cost, minor units. */
  cost: number;
}

/** All fictional — this money exists only inside the game. */
export const BUDGET_SCENARIO = {
  title: 'Fictional week',
  budget: 500000, // Rs5,000 of game money
  choices: [
    { id: 'food', label: 'Food for the week', cost: 80000 },
    { id: 'transport', label: 'Bus pass', cost: 50000 },
    { id: 'data', label: 'Mobile data top-up', cost: 30000 },
    { id: 'books', label: 'Books', cost: 60000 },
    { id: 'movie', label: 'Movie with friends', cost: 70000 },
    { id: 'snacks', label: 'Snacks with friends', cost: 40000 },
    { id: 'gaming', label: 'Gaming', cost: 90000 },
    { id: 'shoes', label: 'New shoes', cost: 150000 },
  ] as BudgetChoice[],
};

export interface BudgetResult {
  total: number;
  remaining: number;
  within: boolean;
}

export function budgetResult(pickIds: string[]): BudgetResult {
  const total = BUDGET_SCENARIO.choices
    .filter((c) => pickIds.includes(c.id))
    .reduce((s, c) => s + c.cost, 0);
  const remaining = BUDGET_SCENARIO.budget - total;
  return { total, remaining, within: remaining >= 0 };
}

// ----------------------------------------------------------------- quick math

export interface MathQuestion {
  a: number;
  b: number;
  op: '+' | '−' | '×';
  answer: number;
}

export const MATH_ROUND_SIZE = 8;

export function genMathQuestion(rng: Rng = Math.random): MathQuestion {
  const kind = Math.floor(rng() * 3);
  if (kind === 2) {
    const a = 2 + Math.floor(rng() * 11);
    const b = 2 + Math.floor(rng() * 11);
    return { a, b, op: '×', answer: a * b };
  }
  const a = 10 + Math.floor(rng() * 90);
  const b = 10 + Math.floor(rng() * 90);
  if (kind === 0) return { a, b, op: '+', answer: a + b };
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return { a: hi, b: lo, op: '−', answer: hi - lo };
}

/** Count correct answers (answers[i] vs questions[i].answer). */
export function gradeMath(questions: MathQuestion[], answers: number[]): number {
  let score = 0;
  questions.forEach((q, i) => { if (answers[i] === q.answer) score++; });
  return score;
}

// ------------------------------------------------------------ saving challenge

export interface SavingRound {
  /** Fictional amounts, minor units. */
  save: number;
  spend: number;
}

export const SAVING_TARGET = 500000; // Rs5,000 of game money

export const SAVING_ROUNDS: SavingRound[] = [
  { save: 100000, spend: 40000 },
  { save: 80000, spend: 60000 },
  { save: 120000, spend: 50000 },
  { save: 50000, spend: 80000 },
  { save: 100000, spend: 30000 },
  { save: 70000, spend: 70000 },
];

export interface SavingScore {
  saved: number;
  reached: boolean;
}

export function savingScore(choices: Array<'save' | 'spend'>): SavingScore {
  const saved = choices.reduce((s, c, i) => s + (c === 'save' ? SAVING_ROUNDS[i].save : 0), 0);
  return { saved, reached: saved >= SAVING_TARGET };
}

// ------------------------------------------------------------------- rewards

export interface Badge {
  id: string;
  title: string;
  desc: string;
}

export const BADGES: Badge[] = [
  { id: 'quiz-whiz', title: 'Quiz Whiz', desc: 'Scored 5/5 in the Money Quiz.' },
  { id: 'budget-boss', title: 'Budget Boss', desc: 'Finished the Budget Challenge with Rs500+ to spare.' },
  { id: 'math-star', title: 'Math Star', desc: 'Answered 8/8 in Quick Math.' },
  { id: 'super-saver', title: 'Super Saver', desc: 'Reached the Rs5,000 goal in the Saving Challenge.' },
];

export interface GameState {
  points: number;
  /** gameId -> best score */
  best: Record<string, number>;
  /** earned badge ids */
  badges: string[];
  /** gameId -> times played */
  played: Record<string, number>;
}

const GAME_STATE_KEY = 'et_game_state_v1';

export function emptyGameState(): GameState {
  return { points: 0, best: {}, badges: [], played: {} };
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Rewards live in their own localStorage key — isolated from finances. */
export function loadGameState(): GameState {
  const s = storage();
  if (!s) return emptyGameState();
  try {
    const raw = s.getItem(GAME_STATE_KEY);
    if (!raw) return emptyGameState();
    const parsed = JSON.parse(raw) as Partial<GameState>;
    return {
      points: typeof parsed.points === 'number' ? parsed.points : 0,
      best: parsed.best ?? {},
      badges: Array.isArray(parsed.badges) ? parsed.badges : [],
      played: parsed.played ?? {},
    };
  } catch {
    return emptyGameState();
  }
}

export function saveGameState(state: GameState): void {
  storage()?.setItem(GAME_STATE_KEY, JSON.stringify(state));
}

/** Record a finished game: points, personal best, play count, badges. */
export function recordGameResult(
  gameId: string,
  score: number,
  badgeId: string | null,
  pointsEarned: number,
): GameState {
  const state = loadGameState();
  state.points += pointsEarned;
  state.played[gameId] = (state.played[gameId] ?? 0) + 1;
  if (score > (state.best[gameId] ?? 0)) state.best[gameId] = score;
  if (badgeId && !state.badges.includes(badgeId)) state.badges.push(badgeId);
  saveGameState(state);
  return state;
}
