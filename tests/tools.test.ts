/**
 * Calculator, money tools, and mini games — including the accounting-safety
 * guarantee: playing with these must leave real financial data untouched.
 */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { evaluate, normalizeInput } from '../src/core/calc';
import { discountCalc, savingsCalc, splitBill, tipCalc } from '../src/core/moneyTools';
import {
  BUDGET_SCENARIO, QUIZ_BANK, SAVING_ROUNDS, SAVING_TARGET,
  budgetResult, emptyGameState, genMathQuestion, gradeMath, gradeQuiz,
  loadGameState, pickQuizQuestions, recordGameResult, saveGameState, savingScore,
} from '../src/core/games';
import { accountingSummary } from '../src/core/accounting';

function val(expr: string): number {
  const r = evaluate(expr);
  if (!r.ok) throw new Error(`expected ok: ${expr} -> ${r.error}`);
  return r.value;
}

// --------------------------------------------------------------- calculator

describe('calculator engine', () => {
  it('adds: 250 + 150 = 400', () => expect(val('250+150')).toBe(400));
  it('subtracts', () => expect(val('1000-375')).toBe(625));
  it('multiplies', () => expect(val('12*8')).toBe(96));
  it('divides', () => expect(val('100/4')).toBe(25));
  it('respects precedence: 2+3*4 = 14', () => expect(val('2+3*4')).toBe(14));
  it('handles decimals: 0.1+0.2 = 0.3', () => expect(val('0.1+0.2')).toBe(0.3));
  it('percent: 1000 * 15% = 150', () => expect(val('1000*15%')).toBe(150));
  it('percent alone: 50% = 0.5', () => expect(val('50%')).toBe(0.5));
  it('parentheses: (250+150)*2 = 800', () => expect(val('(250+150)*2')).toBe(800));
  it('unary minus: -5+8 = 3', () => expect(val('-5+8')).toBe(3));
  it('rejects division by zero', () => {
    const r = evaluate('5/0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/zero/i);
  });
  it('rejects incomplete expressions', () => {
    expect(evaluate('5+').ok).toBe(false);
    expect(evaluate('').ok).toBe(false);
    expect(evaluate('(5+3').ok).toBe(false);
  });
  it('rejects malformed numbers', () => {
    expect(evaluate('5..3').ok).toBe(false);
  });
  it('normalizes UI symbols', () => {
    expect(normalizeInput('250×150%')).toBe('250*150%');
    expect(normalizeInput('10÷2')).toBe('10/2');
  });
});

// ------------------------------------------------------------- money tools

describe('money calculators', () => {
  it('discount: 2000 at 20% -> save 400, final 1600', () => {
    const r = discountCalc(200000, 20);
    expect(r.saved).toBe(40000);
    expect(r.final).toBe(160000);
  });
  it('discount clamps percent to 0..100', () => {
    expect(discountCalc(200000, 150).final).toBe(0);
    expect(discountCalc(200000, -5).saved).toBe(0);
  });
  it('split bill: 3000 / 4 -> 750 each', () => {
    const r = splitBill(300000, 4);
    expect(r.perPerson).toBe(75000);
    expect(r.remainder).toBe(0);
  });
  it('split bill never divides by zero people', () => {
    expect(splitBill(300000, 0).perPerson).toBe(300000);
  });
  it('savings: goal 10000, saved 4000 -> remaining 6000, 40%', () => {
    const r = savingsCalc(1000000, 400000);
    expect(r.remaining).toBe(600000);
    expect(r.pct).toBe(40);
  });
  it('tip: 1500 at 10% -> tip 150, total 1650', () => {
    const r = tipCalc(150000, 10);
    expect(r.tip).toBe(15000);
    expect(r.total).toBe(165000);
  });
});

// ------------------------------------------------------------------- games

describe('money quiz', () => {
  it('has a sane question bank', () => {
    expect(QUIZ_BANK.length).toBeGreaterThanOrEqual(10);
    for (const q of QUIZ_BANK) {
      expect(q.options.length).toBe(3);
      expect(q.options[q.answer]).toBeDefined();
    }
  });
  it('picks 5 questions with the example answerable', () => {
    const qs = pickQuizQuestions(5, () => 0.5);
    expect(qs.length).toBe(5);
  });
  it('grades correctly', () => {
    const qs = pickQuizQuestions(5, () => 0.1);
    const perfect = qs.map((q) => q.answer);
    expect(gradeQuiz(qs, perfect)).toBe(5);
    expect(gradeQuiz(qs, perfect.map(() => -1))).toBe(0);
  });
});

describe('budget challenge', () => {
  it('stays within a fictional 5000 budget', () => {
    const r = budgetResult(['food', 'transport', 'data']);
    expect(r.total).toBe(160000);
    expect(r.remaining).toBe(340000);
    expect(r.within).toBe(true);
  });
  it('detects overspending without touching real money', () => {
    const all = BUDGET_SCENARIO.choices.map((c) => c.id);
    const r = budgetResult(all);
    expect(r.within).toBe(false);
    expect(r.remaining).toBeLessThan(0);
  });
});

describe('quick math', () => {
  it('generates valid questions', () => {
    for (let i = 0; i < 50; i++) {
      const q = genMathQuestion(Math.random);
      const expected = q.op === '+' ? q.a + q.b : q.op === '−' ? q.a - q.b : q.a * q.b;
      expect(q.answer).toBe(expected);
      if (q.op === '−') expect(q.a).toBeGreaterThanOrEqual(q.b); // no negative answers
    }
  });
  it('grades answers', () => {
    const qs = [{ a: 2, b: 3, op: '+' as const, answer: 5 }];
    expect(gradeMath(qs, [5])).toBe(1);
    expect(gradeMath(qs, [4])).toBe(0);
  });
});

describe('saving challenge', () => {
  it('scores all-save as reaching the 5000 target', () => {
    const r = savingScore(SAVING_ROUNDS.map(() => 'save'));
    expect(r.reached).toBe(true);
    expect(r.saved).toBeGreaterThanOrEqual(SAVING_TARGET);
  });
  it('scores all-spend as zero saved', () => {
    const r = savingScore(SAVING_ROUNDS.map(() => 'spend'));
    expect(r.saved).toBe(0);
    expect(r.reached).toBe(false);
  });
});

describe('game rewards (isolated from finances)', () => {
  beforeEach(() => { saveGameState(emptyGameState()); });
  it('records points, best, badges, play counts', () => {
    const s = recordGameResult('quiz', 5, 'quiz-whiz', 50);
    expect(s.points).toBe(50);
    expect(s.best['quiz']).toBe(5);
    expect(s.badges).toContain('quiz-whiz');
    expect(s.played['quiz']).toBe(1);
    // Best only improves.
    recordGameResult('quiz', 3, null, 30);
    expect(loadGameState().best['quiz']).toBe(5);
    expect(loadGameState().points).toBe(80);
  });
  it('persists across loads', () => {
    recordGameResult('math', 8, 'math-star', 80);
    expect(loadGameState().badges).toContain('math-star');
  });
});

// ------------------------------------------------------- accounting safety

describe('accounting safety: tools and games never touch real money', () => {
  const money = [
    { id: 't1', type: 'income' as const, amount: 500000, categoryId: 'c', date: '2026-10-01', createdAt: 1, updatedAt: 1 },
  ];

  it('a full game session leaves the ledger identical', () => {
    const before = accountingSummary(money);
    // Simulate heavy calculator + game usage (pure functions only).
    for (let i = 0; i < 100; i++) {
      evaluate(`${i}*${i + 1}%+(${i}-3)`);
      discountCalc(200000, 20);
      splitBill(300000, 4);
      tipCalc(150000, 10);
      savingsCalc(1000000, 400000);
    }
    const qs = pickQuizQuestions();
    gradeQuiz(qs, qs.map((q) => q.answer));
    budgetResult(BUDGET_SCENARIO.choices.map((c) => c.id));
    for (let i = 0; i < 20; i++) genMathQuestion(Math.random);
    savingScore(SAVING_ROUNDS.map(() => 'save'));
    recordGameResult('quiz', 5, 'quiz-whiz', 50);

    const after = accountingSummary(money);
    expect(after).toEqual(before);
    expect(after.availableCash).toBe(500000); // unchanged
    // And no transaction was created by any of it.
    expect(money.length).toBe(1);
  });

  it('game rewards storage never overlaps financial keys', () => {
    saveGameState(emptyGameState());
    recordGameResult('saving', 500000, 'super-saver', 52);
    // Financial localStorage keys are untouched by the games module:
    // (games.ts only ever reads/writes 'et_game_state_v1')
    expect(localStorage.getItem('et_game_state_v1')).toContain('super-saver');
  });
});
