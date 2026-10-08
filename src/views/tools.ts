/**
 * Tools: calculator, money calculators, and mini games.
 *
 * HARD RULE (accounting safety): nothing here ever creates a transaction or
 * touches balances/goals/debt. Games use fictional money; rewards live in
 * their own localStorage key. The only bridge to real money is an explicit
 * "Use in transaction" tap, which opens the normal transaction flow.
 */
import { clear, el, field, textInput, toast } from '../ui/components';
import { icon } from '../ui/icons';
import { navigate } from '../ui/nav';
import { getSettings } from '../data/store';
import { formatMoney, parseAmount } from '../core/money';
import { evaluate, normalizeInput } from '../core/calc';
import { discountCalc, savingsCalc, splitBill, tipCalc } from '../core/moneyTools';
import {
  BADGES, BUDGET_SCENARIO, MATH_ROUND_SIZE, QUIZ_ROUND_SIZE, SAVING_ROUNDS,
  SAVING_TARGET, budgetResult, genMathQuestion, gradeMath, gradeQuiz,
  loadGameState, pickQuizQuestions, recordGameResult, savingScore,
  type MathQuestion, type QuizQuestion,
} from '../core/games';
import { openQuickAdd } from './add';

export type GameId = 'quiz' | 'budget' | 'math' | 'saving';

/** Re-render the currently shown tools screen (set by each screen export). */
let rerenderCurrent: ((root: HTMLElement) => void) | null = null;
function rerender(root: HTMLElement): void {
  rerenderCurrent?.(root);
}

// ------------------------------------------------------------ shared helpers

function moneyInput(placeholder: string, aria: string): HTMLInputElement {
  return textInput({ placeholder, inputmode: 'decimal', autocomplete: 'off', 'aria-label': aria });
}

function fmt(n: number): string {
  return formatMoney(n, getSettings().currency);
}

function parseMinorOr(input: HTMLInputElement, fallback = 0): number {
  const p = parseAmount(input.value.trim(), getSettings().currency);
  return p.ok ? p.minor : fallback;
}

function backToGames(): HTMLElement {
  return el('button', {
    class: 'btn btn-ghost', style: 'margin-bottom:12px',
    onclick: () => navigate('games'),
  }, el('span', { text: '← Back to games' }));
}

// =================================================================== screens

/** Tools hub: three clean cards — Calculator, Money Calculators, Mini Games. */
export function renderToolsHub(root: HTMLElement): void {
  rerenderCurrent = renderToolsHub;
  clear(root);

  const cards: Array<{ title: string; desc: string; ic: string; route: 'calculator' | 'money-tools' | 'games' }> = [
    { title: 'Calculator', desc: 'Quick everyday calculations', ic: 'tools', route: 'calculator' },
    { title: 'Money Calculators', desc: 'Discount · Split Bill · Savings · Tip', ic: 'coins', route: 'money-tools' },
    { title: 'Mini Games', desc: 'Quick money & math games', ic: 'play', route: 'games' },
  ];
  for (const c of cards) {
    root.appendChild(el('button', {
      class: 'card tool-card', type: 'button',
      onclick: () => navigate(c.route),
      'aria-label': c.title,
    },
      el('span', { class: 'tool-ic', html: icon(c.ic) }),
      el('span', { class: 'tool-text' },
        el('span', { class: 'tool-title', text: c.title }),
        el('span', { class: 'txn-sub', text: c.desc }),
      ),
      el('span', { class: 'tool-go', text: '→' }),
    ));
  }
  root.appendChild(el('p', { class: 'formula-note',
    text: 'Tools never touch your real money — they only do the math.' }));
}

/** Standalone calculator screen (its own route for proper Back behavior). */
export function renderCalculatorScreen(root: HTMLElement): void {
  rerenderCurrent = renderCalculatorScreen;
  clear(root);
  renderCalculator(root);
}

/** Standalone money-calculators screen. */
export function renderMoneyToolsScreen(root: HTMLElement): void {
  rerenderCurrent = renderMoneyToolsScreen;
  clear(root);
  renderMoneyTools(root);
}

/** Standalone games hub screen. */
export function renderGamesScreen(root: HTMLElement): void {
  rerenderCurrent = renderGamesScreen;
  clear(root);
  renderGamesHub(root);
}

/** Standalone single-game screen. Starts a fresh session on entry. */
export function renderGameRoute(root: HTMLElement, id: GameId): void {
  startGame(id);
  rerenderCurrent = (r) => renderGameRouteNoStart(r, id);
  clear(root);
  renderGameScreen(root, id);
}

function renderGameRouteNoStart(root: HTMLElement, id: GameId): void {
  clear(root);
  renderGameScreen(root, id);
}

// ================================================================ calculator

let calcExpr = '';
let calcJustEvaluated = false;

function calcPress(key: string, root: HTMLElement): void {
  const ops = ['+', '−', '×', '÷'];
  if (key === 'C') { calcExpr = ''; calcJustEvaluated = false; }
  else if (key === '⌫') { calcExpr = calcExpr.slice(0, -1); calcJustEvaluated = false; }
  else if (key === '=') {
    const r = evaluate(normalizeInput(calcExpr));
    if (r.ok) { calcExpr = trimNum(r.value); calcJustEvaluated = true; }
    else { calcExpr = ''; toast(r.error, 'error'); }
  } else {
    if (calcJustEvaluated && /[0-9.(]/.test(key)) { calcExpr = ''; }
    calcJustEvaluated = false;
    const last = calcExpr.slice(-1);
    if (ops.includes(key) && ops.includes(last) && key !== '−') {
      calcExpr = calcExpr.slice(0, -1) + key; // replace trailing operator
    } else if (key === ')') {
      const open = (calcExpr.match(/\(/g) ?? []).length;
      const close = (calcExpr.match(/\)/g) ?? []).length;
      if (open > close && !ops.includes(last) && last !== '(') calcExpr += key;
    } else {
      calcExpr += key;
    }
  }
  rerender(root);
}

function trimNum(v: number): string {
  return String(parseFloat(v.toPrecision(12)));
}

function renderCalculator(root: HTMLElement): void {
  const preview = evaluate(normalizeInput(calcExpr));
  const showPreview = calcExpr !== '' && !calcJustEvaluated && preview.ok;

  const display = el('div', { class: 'calc-display' },
    el('div', { class: 'calc-expr', text: calcExpr || '0' }),
    showPreview ? el('div', { class: 'calc-preview', text: `= ${trimNum(preview.value)}` }) : null,
  );

  const keys: string[][] = [
    ['C', '(', ')', '⌫'],
    ['7', '8', '9', '÷'],
    ['4', '5', '6', '×'],
    ['1', '2', '3', '−'],
    ['0', '.', '%', '+'],
  ];
  const pad = el('div', { class: 'calc-pad' });
  for (const row of keys) {
    for (const k of row) {
      const kind = k === 'C' || k === '⌫' ? 'fn' : '+-−×÷=%'.includes(k) ? 'op' : 'num';
      pad.appendChild(el('button', {
        class: `calc-key calc-${kind}`,
        text: k === '⌫' ? undefined : k,
        html: k === '⌫' ? icon('backspace') : undefined,
        'aria-label': k === '⌫' ? 'Delete' : k,
        onclick: () => calcPress(k, root),
      }));
    }
  }
  pad.appendChild(el('button', {
    class: 'calc-key calc-eq', text: '=', 'aria-label': 'Equals',
    onclick: () => calcPress('=', root),
  }));

  root.appendChild(el('section', { class: 'card calc-card' }, display, pad));

  // Explicit bridge to a real transaction — nothing automatic.
  const lastResult = evaluate(normalizeInput(calcExpr));
  if (lastResult.ok && calcJustEvaluated && lastResult.value > 0) {
    root.appendChild(el('button', {
      class: 'btn btn-ghost btn-block',
      text: `Use ${trimNum(lastResult.value)} in a transaction →`,
      onclick: () => {
        openQuickAdd(Math.round(lastResult.value * 100));
      },
    }));
  }
  root.appendChild(el('p', { class: 'formula-note', text: 'The calculator never creates transactions on its own.' }));
}

// ============================================================= money tools

function renderMoneyTools(root: HTMLElement): void {
  root.appendChild(el('p', { class: 'txn-sub', style: 'margin-bottom:12px',
    text: 'Quick planning math. Nothing here touches your real money.' }));

  // ---- discount
  {
    const price = moneyInput('Original price, e.g. 2000', 'Original price');
    const pct = moneyInput('Discount %, e.g. 20', 'Discount percent');
    const out = el('p', { class: 'txn-sub' });
    const card = el('section', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Discount calculator' }),
      field('Original price', price), field('Discount %', pct),
      el('button', { class: 'btn btn-primary btn-block', text: 'Calculate', onclick: () => {
        const p = parseFloat(pct.value);
        if (Number.isNaN(p) || p < 0 || p > 100) { out.textContent = 'Enter a discount between 0 and 100.'; return; }
        const r = discountCalc(parseMinorOr(price), p);
        out.innerHTML = '';
        out.append(`You save ${fmt(r.saved)} · `, el('strong', { text: `Final price ${fmt(r.final)}` }));
      }}),
      out,
    );
    root.appendChild(card);
  }

  // ---- split bill
  {
    const bill = moneyInput('Bill total, e.g. 3000', 'Bill total');
    const people = moneyInput('People, e.g. 4', 'Number of people');
    const out = el('p', { class: 'txn-sub' });
    const card = el('section', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Split bill' }),
      field('Bill total', bill), field('Number of people', people),
      el('button', { class: 'btn btn-primary btn-block', text: 'Calculate', onclick: () => {
        const n = Math.floor(parseFloat(people.value));
        if (Number.isNaN(n) || n < 1) { out.textContent = 'Enter at least 1 person.'; return; }
        const r = splitBill(parseMinorOr(bill), n);
        out.innerHTML = '';
        out.append(el('strong', { text: `Each pays ${fmt(r.perPerson)}` }));
        if (r.remainder !== 0) out.append(` (${fmt(Math.abs(r.remainder))} ${r.remainder > 0 ? 'left over' : 'short'})`);
      }}),
      out,
    );
    root.appendChild(card);
  }

  // ---- savings
  {
    const goal = moneyInput('Goal, e.g. 10000', 'Savings goal');
    const saved = moneyInput('Already saved, e.g. 4000', 'Already saved');
    const out = el('p', { class: 'txn-sub' });
    const card = el('section', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Savings calculator' }),
      field('Goal', goal), field('Already saved', saved),
      el('button', { class: 'btn btn-primary btn-block', text: 'Calculate', onclick: () => {
        const r = savingsCalc(parseMinorOr(goal), parseMinorOr(saved));
        out.innerHTML = '';
        out.append(`Remaining ${fmt(r.remaining)} · `, el('strong', { text: `${r.pct}% saved` }));
      }}),
      out,
    );
    root.appendChild(card);
  }

  // ---- tip
  {
    const bill = moneyInput('Bill, e.g. 1500', 'Bill amount');
    const pct = moneyInput('Tip %, e.g. 10', 'Tip percent');
    const out = el('p', { class: 'txn-sub' });
    const card = el('section', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Tip calculator' }),
      field('Bill', bill), field('Tip %', pct),
      el('button', { class: 'btn btn-primary btn-block', text: 'Calculate', onclick: () => {
        const p = parseFloat(pct.value);
        if (Number.isNaN(p) || p < 0) { out.textContent = 'Enter a valid tip percent.'; return; }
        const r = tipCalc(parseMinorOr(bill), p);
        out.innerHTML = '';
        out.append(`Tip ${fmt(r.tip)} · `, el('strong', { text: `Total ${fmt(r.total)}` }));
      }}),
      out,
    );
    root.appendChild(card);
  }
}

// ==================================================================== games

const GAME_META: Array<{ id: GameId; title: string; desc: string; ic: string }> = [
  { id: 'quiz', title: 'Money Quiz', desc: '5 quick questions about everyday money decisions.', ic: 'target' },
  { id: 'budget', title: 'Budget Challenge', desc: 'Plan a fictional Rs5,000 week without overspending.', ic: 'wallet' },
  { id: 'math', title: 'Quick Math', desc: '8 gentle mental-math questions. No timer, no pressure.', ic: 'plus' },
  { id: 'saving', title: 'Saving Challenge', desc: 'Make 6 choices and try to save a fictional Rs5,000.', ic: 'savings' },
];

function renderGamesHub(root: HTMLElement): void {
  const state = loadGameState();
  root.appendChild(el('p', { class: 'txn-sub wrap', style: 'margin-bottom:12px',
    text: 'Just for fun — fictional money only, no timers, no pressure. Your real balance is never touched.' }));

  const rewards = el('section', { class: 'card' },
    el('h3', { class: 'card-title', text: 'Your rewards' }),
    el('p', { class: 'txn-sub', text: `${state.points} points earned` }),
    el('div', { class: 'milestone-row' }),
  );
  const row = rewards.querySelector('.milestone-row')!;
  for (const b of BADGES) {
    const earned = state.badges.includes(b.id);
    row.appendChild(el('span', {
      class: `milestone-chip${earned ? '' : ' locked'}`,
      title: b.desc,
    }, el('span', { html: icon(earned ? 'check' : 'info') }), ` ${b.title}`));
  }
  root.appendChild(rewards);

  for (const g of GAME_META) {
    const best = state.best[g.id];
    root.appendChild(el('button', {
      class: 'card game-card', type: 'button',
      onclick: () => navigate(`game-${g.id}` as 'game-quiz' | 'game-budget' | 'game-math' | 'game-saving'),
      'aria-label': `Play ${g.title}`,
    },
      el('div', { class: 'row-between' },
        el('div', { style: 'flex:1;min-width:0' },
          el('h3', { class: 'card-title', text: g.title }),
          el('p', { class: 'txn-sub wrap', text: g.desc }),
          el('p', { class: 'txn-sub', text: best !== undefined ? `Personal best: ${best}` : 'Not played yet' }),
        ),
        el('span', { class: 'game-play', html: icon('play') }),
      ),
    ));
  }
}

function startGame(id: GameId): void {
  if (id === 'quiz') quizSession = { questions: pickQuizQuestions(), idx: 0, picks: [], picked: null };
  if (id === 'math') mathSession = { questions: Array.from({ length: MATH_ROUND_SIZE }, () => genMathQuestion()), idx: 0, answers: [], feedback: null };
  if (id === 'budget') budgetPicks = new Set();
  if (id === 'saving') savingChoices = [];
}

// ---- quiz

interface QuizSession { questions: QuizQuestion[]; idx: number; picks: number[]; picked: number | null }
let quizSession: QuizSession | null = null;

function renderQuiz(root: HTMLElement): void {
  const s = quizSession!;
  root.appendChild(backToGames());
  if (s.idx >= s.questions.length) {
    const score = gradeQuiz(s.questions, s.picks);
    const points = score * 10;
    const badge = score === QUIZ_ROUND_SIZE ? 'quiz-whiz' : null;
    recordGameResult('quiz', score, badge, points);
    root.appendChild(el('section', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Quiz complete!' }),
      el('p', { class: 'game-score', text: `You scored ${score}/${s.questions.length}` }),
      el('p', { class: 'txn-sub', text: `+${points} points${badge ? ' · Badge earned: Quiz Whiz!' : ''}` }),
      el('button', { class: 'btn btn-primary btn-block', text: 'Play again', onclick: () => { startGame('quiz'); rerender(root); } }),
    ));
    return;
  }
  const q = s.questions[s.idx];
  const card = el('section', { class: 'card' },
    el('p', { class: 'txn-sub', text: `Question ${s.idx + 1} of ${s.questions.length} · fictional money` }),
    el('h3', { class: 'card-title', text: q.q }),
  );
  q.options.forEach((opt, i) => {
    let cls = 'game-opt';
    if (s.picked !== null) {
      if (i === q.answer) cls += ' correct';
      else if (i === s.picked) cls += ' wrong';
    }
    card.appendChild(el('button', {
      class: cls, disabled: s.picked !== null,
      onclick: () => { s.picked = i; s.picks.push(i); rerender(root); },
    }, el('span', { text: opt })));
  });
  if (s.picked !== null) {
    card.appendChild(el('p', {
      class: s.picked === q.answer ? 'afford-ok' : 'afford-wait',
      text: s.picked === q.answer ? 'Correct! Nice.' : `Not quite — the answer is ${q.options[q.answer]}.`,
    }));
    card.appendChild(el('button', {
      class: 'btn btn-primary btn-block', text: s.idx + 1 === s.questions.length ? 'See score' : 'Next question',
      onclick: () => { s.idx++; s.picked = null; rerender(root); },
    }));
  }
  root.appendChild(card);
}

// ---- budget challenge

let budgetPicks = new Set<string>();

function renderBudget(root: HTMLElement): void {
  root.appendChild(backToGames());
  const card = el('section', { class: 'card' },
    el('h3', { class: 'card-title', text: 'Budget Challenge' }),
    el('p', { class: 'txn-sub wrap', text: `You have a fictional ${fmt(BUDGET_SCENARIO.budget)} for the week. Pick what you need — don't overspend!` }),
  );
  for (const c of BUDGET_SCENARIO.choices) {
    const on = budgetPicks.has(c.id);
    card.appendChild(el('button', {
      class: `game-opt${on ? ' selected' : ''}`,
      onclick: () => {
        if (on) budgetPicks.delete(c.id); else budgetPicks.add(c.id);
        rerender(root);
      },
    },
      el('span', { text: c.label }),
      el('strong', { text: fmt(c.cost) }),
    ));
  }
  const r = budgetResult([...budgetPicks]);
  card.appendChild(el('p', { class: 'txn-sub wrap', text: `Planned spending: ${fmt(r.total)} · Left: ${fmt(r.remaining)}` }));
  card.appendChild(el('button', {
    class: 'btn btn-primary btn-block', text: 'Finish week',
    onclick: () => {
      const res = budgetResult([...budgetPicks]);
      const points = res.within ? Math.min(50, Math.floor(res.remaining / 10000)) : 0;
      const badge = res.within && res.remaining >= 50000 ? 'budget-boss' : null;
      recordGameResult('budget', res.within ? res.remaining : 0, badge, points);
      const done = el('section', { class: 'card' },
        el('h3', { class: 'card-title', text: res.within ? 'Week planned!' : 'Over budget!' }),
        el('p', { class: res.within ? 'afford-ok' : 'afford-wait', text:
          res.within
            ? `You stayed within budget with ${fmt(res.remaining)} to spare.`
            : `You overspent by ${fmt(-res.remaining)}. Try dropping something!` }),
        el('p', { class: 'txn-sub', text: `+${points} points${badge ? ' · Badge earned: Budget Boss!' : ''}` }),
        el('button', { class: 'btn btn-primary btn-block', text: 'Play again', onclick: () => { startGame('budget'); rerender(root); } }),
      );
      clear(root);
      root.appendChild(backToGames());
      root.appendChild(done);
    },
  }));
  root.appendChild(card);
}

// ---- quick math

interface MathSession { questions: MathQuestion[]; idx: number; answers: number[]; feedback: boolean | null }
let mathSession: MathSession | null = null;

function renderMath(root: HTMLElement): void {
  const s = mathSession!;
  root.appendChild(backToGames());
  if (s.idx >= s.questions.length) {
    const score = gradeMath(s.questions, s.answers);
    const points = score * 10;
    const badge = score === MATH_ROUND_SIZE ? 'math-star' : null;
    recordGameResult('math', score, badge, points);
    root.appendChild(el('section', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Well done!' }),
      el('p', { class: 'game-score', text: `${score}/${s.questions.length} correct` }),
      el('p', { class: 'txn-sub', text: `+${points} points${badge ? ' · Badge earned: Math Star!' : ''}` }),
      el('button', { class: 'btn btn-primary btn-block', text: 'Play again', onclick: () => { startGame('math'); rerender(root); } }),
    ));
    return;
  }
  const q = s.questions[s.idx];
  const input = textInput({ inputmode: 'numeric', placeholder: '?', 'aria-label': 'Your answer', class: 'input math-input' });
  const card = el('section', { class: 'card' },
    el('p', { class: 'txn-sub', text: `Question ${s.idx + 1} of ${s.questions.length}` }),
    el('p', { class: 'game-score', text: `${q.a} ${q.op} ${q.b} = ?` }),
    field('Your answer', input),
  );
  const submit = (): void => {
    const v = parseInt(input.value.trim(), 10);
    if (Number.isNaN(v)) { toast('Enter a number.', 'error'); return; }
    s.answers.push(v);
    s.feedback = v === q.answer;
    rerender(root);
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  if (s.feedback === null) {
    card.appendChild(el('button', { class: 'btn btn-primary btn-block', text: 'Check', onclick: submit }));
  } else {
    card.appendChild(el('p', {
      class: s.feedback ? 'afford-ok' : 'afford-wait',
      text: s.feedback ? 'Correct!' : `The answer was ${q.answer}.`,
    }));
    card.appendChild(el('button', {
      class: 'btn btn-primary btn-block', text: s.idx + 1 === s.questions.length ? 'See score' : 'Next',
      onclick: () => { s.idx++; s.feedback = null; rerender(root); },
    }));
  }
  root.appendChild(card);
  if (s.feedback === null) input.focus({ preventScroll: true });
}

// ---- saving challenge

let savingChoices: Array<'save' | 'spend'> = [];

function renderSaving(root: HTMLElement): void {
  root.appendChild(backToGames());
  const idx = savingChoices.length;
  if (idx >= SAVING_ROUNDS.length) {
    const r = savingScore(savingChoices);
    const points = Math.floor(r.saved / 10000);
    const badge = r.reached ? 'super-saver' : null;
    recordGameResult('saving', r.saved, badge, points);
    root.appendChild(el('section', { class: 'card' },
      el('h3', { class: 'card-title', text: r.reached ? 'Goal reached!' : 'Challenge over' }),
      el('p', { class: 'game-score', text: `You saved a fictional ${fmt(r.saved)}` }),
      el('p', { class: r.reached ? 'afford-ok' : 'txn-sub', text: r.reached
        ? `Target of ${fmt(SAVING_TARGET)} reached. Brilliant saving!`
        : `Target was ${fmt(SAVING_TARGET)}. Saving beats spending!` }),
      el('p', { class: 'txn-sub', text: `+${points} points${badge ? ' · Badge earned: Super Saver!' : ''}` }),
      el('button', { class: 'btn btn-primary btn-block', text: 'Play again', onclick: () => { startGame('saving'); rerender(root); } }),
    ));
    return;
  }
  const round = SAVING_ROUNDS[idx];
  const savedSoFar = savingScore(savingChoices).saved;
  root.appendChild(el('section', { class: 'card' },
    el('p', { class: 'txn-sub wrap', text: `Round ${idx + 1} of ${SAVING_ROUNDS.length} · saved so far: ${fmt(savedSoFar)} · goal: ${fmt(SAVING_TARGET)}` }),
    el('h3', { class: 'card-title', text: 'What will you do?' }),
    el('div', { style: 'display:flex;gap:10px' },
      el('button', { class: 'btn btn-primary btn-block', text: `Save ${fmt(round.save)}`,
        onclick: () => { savingChoices.push('save'); rerender(root); } }),
      el('button', { class: 'btn btn-ghost btn-block', text: `Spend ${fmt(round.spend)}`,
        onclick: () => { savingChoices.push('spend'); rerender(root); } }),
    ),
    el('p', { class: 'formula-note', text: 'Fictional money — your real savings are safe.' }),
  ));
}

// ---- game screen router

function renderGameScreen(root: HTMLElement, id: GameId): void {
  if (id === 'quiz') renderQuiz(root);
  else if (id === 'budget') renderBudget(root);
  else if (id === 'math') renderMath(root);
  else renderSaving(root);
}
