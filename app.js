/* ===== STATE ===== */
const State = {
  screen: 'home',         // home | subject | quiz | results | study
  subjectIdx: null,
  sectionIdx: null,       // null = all sections
  quizMode: 'quiz',       // quiz | study
  questions: [],          // current session questions (shuffled)
  qIdx: 0,
  answered: null,
  score: 0,
  mistakes: [],
  progress: loadProgress(),
  // study-mode extras
  studyViewMode: 'list',  // list | cards
  studyCardIdx: 0,
  studyCardRevealed: false,
  studyFlatQuestions: [],
  studySectionFilter: null,
  studyAllExpanded: false,
  isMistakesQuiz: false,
  answerResults: [],   // true=correct, false=wrong, undefined=not answered yet
  // exam simulation
  isExamMode: false,
  examStartTime: null,
  examDuration: 0,
};

/* ===== PROGRESS — localStorage schema v2 =====
  {
    v: 2,
    secs: {
      "0_0": { best: 90, last: 80, n: 3, ts: 1716000000000 },
      "0_all": { ... }
    },
    hist: [{ ts, si, sc, s, t }],   // last 30 sessions
    streak: { d: "2025-05-25", n: 3 }
  }
===== */
function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem('quizProgress') || '{}');
    if (raw.v === 2) return raw;
    // Migrate from v1 (flat {completed,correct,total})
    const p = { v: 2, secs: {}, hist: [], streak: { d: '', n: 0 } };
    Object.entries(raw).forEach(([k, v]) => {
      if (v && typeof v.correct === 'number' && v.total > 0) {
        const pct = Math.round(v.correct / v.total * 100);
        p.secs[k] = { best: pct, last: pct, n: v.completed || 1, ts: Date.now() };
      }
    });
    return p;
  } catch { return { v: 2, secs: {}, hist: [], streak: { d: '', n: 0 } }; }
}

function saveProgress() {
  localStorage.setItem('quizProgress', JSON.stringify(State.progress));
}

function secKey(subjectIdx, sectionIdx) {
  return `${subjectIdx}_${sectionIdx === null ? 'all' : sectionIdx}`;
}

function getSectionProgress(subjectIdx, sectionIdx) {
  return State.progress.secs?.[secKey(subjectIdx, sectionIdx)] || null;
}

function updateProgress(subjectIdx, sectionIdx, score, total) {
  const p = State.progress;
  if (!p.secs) p.secs = {};
  if (!p.hist) p.hist = [];
  if (!p.streak) p.streak = { d: '', n: 0 };

  const pct = Math.round(score / total * 100);
  const k = secKey(subjectIdx, sectionIdx);
  const ex = p.secs[k];
  p.secs[k] = { best: ex ? Math.max(ex.best, pct) : pct, last: pct, n: (ex?.n || 0) + 1, ts: Date.now() };

  p.hist.unshift({ ts: Date.now(), si: subjectIdx, sc: sectionIdx, s: score, t: total });
  if (p.hist.length > 30) p.hist.pop();

  // Streak: count consecutive calendar days with at least one session
  const today = new Date().toISOString().slice(0, 10);
  if (p.streak.d === today) {
    // already updated today
  } else {
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    p.streak = { d: today, n: p.streak.d === yesterday ? p.streak.n + 1 : 1 };
  }

  saveProgress();
}

function getTotalProgress(subjectIdx) {
  const subject = QUIZ_DATA.subjects[subjectIdx];
  let totalQ = 0, bestSum = 0, secsDone = 0, passedSecs = 0;
  subject.sections.forEach((sec, sIdx) => {
    totalQ += sec.questions.length;
    const p = getSectionProgress(subjectIdx, sIdx);
    if (p) { bestSum += p.best; secsDone++; if (p.best >= 80) passedSecs++; }
  });
  const avgBest = secsDone ? Math.round(bestSum / secsDone) : 0;
  return { total: totalQ, secsDone, totalSecs: subject.sections.length, avgBest, passedSecs };
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

function fmtPct(pct) {
  return pct >= 90 ? '🏆' : pct >= 75 ? '👍' : pct >= 60 ? '📚' : '💪';
}

function scoreColor(pct) {
  return pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';
}

function sectionStatus(p) {
  if (!p) return 'new';
  if (p.best >= 90) return 'top';
  if (p.best >= 80) return 'good';
  if (p.best >= 60) return 'mid';
  return 'low';
}

const STATUS_META = {
  new:  { color: '#94a3b8', icon: '○', label: 'Не пройдено' },
  low:  { color: '#dc2626', icon: '✕', label: 'Потрібна практика' },
  mid:  { color: '#d97706', icon: '◑', label: 'Майже' },
  good: { color: '#16a34a', icon: '✓', label: 'Пройдено' },
  top:  { color: '#0057B7', icon: '★', label: 'Відмінно' },
};

function findNextSection() {
  for (let si = 0; si < QUIZ_DATA.subjects.length; si++) {
    for (let secI = 0; secI < QUIZ_DATA.subjects[si].sections.length; secI++) {
      const p = getSectionProgress(si, secI);
      if (!p || p.best < 80) return { subjectIdx: si, sectionIdx: secI };
    }
  }
  return null;
}

function getOverallAccuracy() {
  const hist = State.progress.hist || [];
  if (!hist.length) return null;
  const totalT = hist.reduce((s, h) => s + h.t, 0);
  const totalS = hist.reduce((s, h) => s + h.s, 0);
  return totalT ? Math.round(totalS / totalT * 100) : null;
}

function detachQuizKeys() {
  if (_quizKeyHandler) { document.removeEventListener('keydown', _quizKeyHandler); _quizKeyHandler = null; }
  if (_examTimerInterval) { clearInterval(_examTimerInterval); _examTimerInterval = null; }
}

function getExamGrade(score) {
  return {
    'А': score >= 36 ? 2 : score >= 28 ? 1 : 0,
    'Б': score >= 34 ? 2 : score >= 26 ? 1 : 0,
    'В': score >= 32 ? 2 : score >= 24 ? 1 : 0,
  };
}

function fmtDuration(secs) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m} хв ${s.toString().padStart(2, '0')} с`;
}

function startExam() {
  let all = [];
  QUIZ_DATA.subjects.forEach((subj, si) => {
    subj.sections.forEach((sec, secI) => {
      sec.questions.forEach((q, qIdx) => all.push({ ...q, subjectIdx: si, sectionIdx: secI, qIdx }));
    });
  });
  const questions = shuffle(all).slice(0, 40).map(shuffleOptions);
  detachQuizKeys();
  State.isExamMode = true;
  State.examStartTime = Date.now();
  State.examDuration = 0;
  State.subjectIdx = 0;
  State.sectionIdx = null;
  State.quizMode = 'exam';
  State.questions = questions;
  State.qIdx = 0;
  State.answered = null;
  State.score = 0;
  State.mistakes = [];
  State.isMistakesQuiz = false;
  State.answerResults = [];
  renderQuiz();
}

function finishExam() {
  State.examDuration = Math.floor((Date.now() - State.examStartTime) / 1000);
  detachQuizKeys();
  renderExamResults();
}

function renderExamResults() {
  detachQuizKeys();
  const score = State.score;
  const total = State.questions.length;
  const pct = Math.round(score / total * 100);
  const duration = State.examDuration;
  const grades = getExamGrade(score);
  const savedMistakes = [...State.mistakes];

  const screen = document.createElement('div');
  screen.id = 'screen-results';
  screen.style.cssText = 'display:flex;flex-direction:column';

  screen.appendChild(makeHeader('Результати іспиту', '🎓 Симуляція офіційного іспиту', false));

  const scrollArea = document.createElement('div');
  scrollArea.className = 'screen';
  const rc = document.createElement('div');
  rc.className = 'results-content';

  const passAny = Object.values(grades).some(g => g >= 1);
  const heroColor = passAny ? '#16a34a' : '#dc2626';
  const heroBg = passAny ? '#dcfce7' : '#fee2e2';
  const heroBorder = passAny ? '#86efac' : '#fca5a5';
  const heroLabel = passAny ? '✅ Іспит складено' : '❌ Іспит не складено';
  const timeLimit = duration >= 2400 ? ' (час вийшов)' : '';

  const hero = html(`<div class="exam-hero" style="background:${heroBg};border:2px solid ${heroBorder}">
    <div class="exam-score" style="color:${heroColor}">${score}<span class="exam-score-total">/ ${total}</span></div>
    <div class="exam-pct" style="color:${heroColor}">${pct}%</div>
    <div class="exam-result-label" style="background:${heroColor}">${heroLabel}</div>
    <div class="exam-duration">⏱ Тривалість: ${fmtDuration(Math.min(duration, 2400))}${timeLimit}</div>
  </div>`);
  rc.appendChild(hero);

  const catMeta = {
    'А': { min1: 28, min2: 36, desc: 'Категорія А' },
    'Б': { min1: 26, min2: 34, desc: 'Категорія Б' },
    'В': { min1: 24, min2: 32, desc: 'Категорія В' },
  };

  const tableWrap = document.createElement('div');
  tableWrap.className = 'exam-grades-wrap';

  const tableLbl = html(`<div class="section-label" style="text-align:left;margin-bottom:12px">Результат за категоріями</div>`);
  tableWrap.appendChild(tableLbl);

  const table = document.createElement('div');
  table.className = 'exam-grades-table';

  const hdr = html(`<div class="exam-grade-header">
    <span>Кат.</span><span>Правильних</span><span>Балів</span><span>Статус</span>
  </div>`);
  table.appendChild(hdr);

  Object.entries(grades).forEach(([cat, pts]) => {
    const color = pts === 2 ? '#16a34a' : pts === 1 ? '#0284c7' : '#dc2626';
    const statusIcon = pts === 2 ? '★' : pts === 1 ? '✓' : '✗';
    const statusText = pts === 2 ? 'Відмінно' : pts === 1 ? 'Зараховано' : 'Не зараховано';
    const row = html(`<div class="exam-grade-row ${pts >= 1 ? 'grade-pass' : 'grade-fail'}">
      <span class="grade-cat" style="color:${color}">${cat}</span>
      <span class="grade-score">${score} / ${total}</span>
      <span class="grade-pts" style="color:${color}">${pts}</span>
      <span class="grade-status" style="color:${color}">${statusIcon} ${statusText}</span>
    </div>`);
    table.appendChild(row);
  });

  tableWrap.appendChild(table);
  const note = html(`<div class="exam-grade-note">Критерії прийому: А ≥28 (1 б.) / ≥36 (2 б.),&nbsp; Б ≥26 / ≥34,&nbsp; В ≥24 / ≥32</div>`);
  tableWrap.appendChild(note);
  rc.appendChild(tableWrap);

  if (savedMistakes.length > 0) {
    const ml = html(`<div class="section-label" style="text-align:left;margin-bottom:10px;margin-top:8px">Помилки (${savedMistakes.length})</div>`);
    rc.appendChild(ml);
    const mistakesList = document.createElement('div');
    mistakesList.style.marginBottom = '20px';
    savedMistakes.slice(0, 8).forEach(m => {
      const item = html(`<div style="background:var(--card);border-radius:12px;padding:12px 14px;margin-bottom:8px;box-shadow:var(--shadow);text-align:left;border-left:3px solid #dc2626">
        <div style="font-size:0.83rem;font-weight:600;margin-bottom:6px;color:var(--text)">${m.question.q}</div>
        <div style="font-size:0.78rem;color:var(--error-text);margin-bottom:3px">❌ ${m.chosen}</div>
        <div style="font-size:0.78rem;color:var(--success)">✅ ${m.correct}</div>
      </div>`);
      mistakesList.appendChild(item);
    });
    if (savedMistakes.length > 8) {
      mistakesList.appendChild(html(`<div style="text-align:center;font-size:0.8rem;color:var(--text-muted);padding:8px">… ще ${savedMistakes.length - 8} помилок</div>`));
    }
    rc.appendChild(mistakesList);
  }

  const btns = document.createElement('div');
  btns.className = 'results-buttons';

  if (savedMistakes.length > 0) {
    const mistakesBtn = html(`<button class="result-btn action-btn" style="background:#dc2626;color:white">${Icons.flag} Робота над помилками (${savedMistakes.length})</button>`);
    mistakesBtn.addEventListener('click', () => startMistakesQuiz(savedMistakes));
    btns.appendChild(mistakesBtn);
  }

  const retryBtn = html(`<button class="result-btn btn-primary action-btn">🎓 Пройти іспит знову</button>`);
  retryBtn.addEventListener('click', startExam);

  const homeBtn = html(`<button class="result-btn action-btn" style="background:#f1f5f9;color:#1e293b">${Icons.home} На головну</button>`);
  homeBtn.addEventListener('click', () => { State.isExamMode = false; State.screen = 'home'; renderHome(); });

  btns.appendChild(retryBtn);
  btns.appendChild(homeBtn);
  rc.appendChild(btns);

  scrollArea.appendChild(rc);
  screen.appendChild(scrollArea);
  render(screen);
}

/* ===== ICONS ===== */
const Icons = {
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
  shuffle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 21 12 17 16 21"/><line x1="12" y1="17" x2="12" y2="11"/><path d="M7 4H17v5a5 5 0 01-10 0V4z"/><path d="M7 9H4a2 2 0 01-2-2V6h5"/><path d="M17 9h3a2 2 0 002-2V6h-5"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  flag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
};

const LETTERS = ['А', 'Б', 'В', 'Г'];
let _quizKeyHandler = null;
let _examTimerInterval = null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleOptions(q) {
  const correctOpt = q.o[q.a];
  const shuffled = shuffle([...q.o]);
  return { ...q, o: shuffled, a: shuffled.indexOf(correctOpt) };
}

/* ===== RENDER HELPERS ===== */
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  });
  children.forEach(c => {
    if (c == null) return;
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c instanceof Node) e.appendChild(c);
  });
  return e;
}

function html(str) {
  const d = document.createElement('div');
  d.innerHTML = str;
  return d.firstElementChild || d;
}

function render(node) {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.appendChild(node);
}

/* ===== PROGRESS BAR ===== */
function progressBar(pct, color, height = 6) {
  const wrap = html(`<div class="progress-bar" style="height:${height}px"></div>`);
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.cssText = `width:${pct}%;background:${color}`;
  wrap.appendChild(fill);
  return wrap;
}

/* ===== HEADER ===== */
function makeHeader(title, subtitle, showBack, actions) {
  const header = document.createElement('div');
  header.className = 'app-header';
  const inner = document.createElement('div');
  inner.className = 'header-inner';

  if (showBack) {
    const btn = html(`<button class="back-btn" aria-label="Назад">${Icons.back}</button>`);
    btn.addEventListener('click', goBack);
    inner.appendChild(btn);
  }

  const titleWrap = document.createElement('div');
  titleWrap.style.flex = '1';
  titleWrap.innerHTML = `<div class="header-title">${title}</div>${subtitle ? `<div class="header-subtitle">${subtitle}</div>` : ''}`;
  inner.appendChild(titleWrap);

  if (actions) inner.appendChild(actions);
  header.appendChild(inner);
  return header;
}

/* ===== HOME SCREEN ===== */
function renderHome() {
  detachQuizKeys();
  State.isExamMode = false;
  const screen = document.createElement('div');
  screen.id = 'screen-home';
  screen.style.display = 'flex';
  screen.style.flexDirection = 'column';

  // Header
  screen.appendChild(makeHeader('Тести з законодавства', 'Підготовка до іспиту', false));

  // Hero
  const hero = html(`<div class="home-hero">
    <div class="home-hero-inner">
      <div class="hero-flag"><div class="flag-icon"><div class="flag-blue"></div><div class="flag-yellow"></div></div></div>
      <div class="hero-title">Підготовка до іспиту</div>
      <div class="hero-subtitle">Знання законодавства України<br>589 питань у 4 розділах</div>
    </div>
  </div>`);
  screen.appendChild(hero);

  const screenContent = document.createElement('div');
  screenContent.className = 'screen';

  // Stats
  const streak = State.progress.streak;
  const streakN = streak?.n || 0;
  const allSecs = QUIZ_DATA.subjects.reduce((s, subj) => s + subj.sections.length, 0);
  const passedCount = QUIZ_DATA.subjects.reduce((total, subj, si) =>
    total + subj.sections.filter((_, secI) => { const p = getSectionProgress(si, secI); return p && p.best >= 80; }).length, 0);
  const accuracy = getOverallAccuracy();

  const statsDiv = html(`<div class="total-stats" style="padding-top:16px">
    <div class="stat-card"><div class="stat-number" style="color:var(--ua-blue)">589</div><div class="stat-label">Питань всього</div></div>
    <div class="stat-card"><div class="stat-number" style="color:${accuracy !== null ? '#16a34a' : 'var(--text-muted)'}">${accuracy !== null ? accuracy + '%' : '—'}</div><div class="stat-label">Точність</div></div>
    <div class="stat-card"><div class="stat-number" style="color:${passedCount > 0 ? '#16a34a' : 'var(--text-muted)'}">${passedCount}/${allSecs}</div><div class="stat-label">Пройдено</div></div>
  </div>`);
  screenContent.appendChild(statsDiv);

  const content = document.createElement('div');
  content.className = 'content';

  // Continue card
  const next = findNextSection();
  const hasHistory = (State.progress.hist || []).length > 0;
  if (next !== null) {
    const nextSubj = QUIZ_DATA.subjects[next.subjectIdx];
    const nextSec = nextSubj.sections[next.sectionIdx];
    const continueCard = document.createElement('div');
    continueCard.className = 'continue-card';
    continueCard.innerHTML = `
      <div class="continue-label">${streakN > 0 ? '🔥 ' + streakN + ' днів · ' : ''}${hasHistory ? 'Продовжити' : 'Почати навчання'}</div>
      <div class="continue-section">${nextSubj.icon} ${nextSubj.title} — ${nextSec.title}</div>
      <div class="continue-actions">
        <button class="continue-btn-primary">▶ Тест</button>
        <button class="continue-btn-secondary">📖 Вчити</button>
      </div>`;
    continueCard.querySelector('.continue-btn-primary').addEventListener('click', () => startQuiz(next.subjectIdx, next.sectionIdx, 'quiz'));
    continueCard.querySelector('.continue-btn-secondary').addEventListener('click', () => startStudy(next.subjectIdx, next.sectionIdx));
    content.appendChild(continueCard);
  }

  // Exam promo card
  const examCard = html(`<div class="exam-promo-card">
    <div class="exam-promo-icon">🎓</div>
    <div class="exam-promo-info">
      <div class="exam-promo-title">Симуляція іспиту</div>
      <div class="exam-promo-desc">40 питань · 40 хвилин · Офіційні критерії КМУ</div>
    </div>
    <button class="exam-promo-btn">Старт</button>
  </div>`);
  examCard.querySelector('.exam-promo-btn').addEventListener('click', startExam);
  content.appendChild(examCard);

  const lbl = document.createElement('div');
  lbl.className = 'section-label';
  lbl.style.marginTop = '16px';
  lbl.textContent = 'Оберіть розділ';
  content.appendChild(lbl);

  const grid = document.createElement('div');
  grid.className = 'subjects-grid';

  QUIZ_DATA.subjects.forEach((subject, idx) => {
    const prog = getTotalProgress(idx);
    const passedPct = prog.totalSecs ? Math.round(prog.passedSecs / prog.totalSecs * 100) : 0;

    const card = document.createElement('button');
    card.className = 'subject-card';
    card.innerHTML = `
      <div class="card-accent" style="background:${subject.color}"></div>
      <div class="card-body">
        <div class="card-icon-wrap" style="background:${subject.color}20">${subject.icon}</div>
        <div class="card-info">
          <div class="card-title">${subject.title}</div>
          <div class="card-meta">${prog.passedSecs}/${prog.totalSecs} пройдено · ${prog.total} питань${prog.avgBest > 0 ? ` · ${prog.avgBest}% середнє` : ''}</div>
          <div class="card-progress-wrap">
            ${progressBar(passedPct, subject.color).outerHTML}
            <div class="progress-text"><span>${passedPct}% пройдено</span><span>${prog.passedSecs}/${prog.totalSecs}</span></div>
          </div>
        </div>
        <div class="card-arrow">${Icons.chevronRight}</div>
      </div>`;
    card.addEventListener('click', () => navigateTo('subject', idx));
    grid.appendChild(card);
  });

  content.appendChild(grid);
  screenContent.appendChild(content);
  screen.appendChild(screenContent);
  render(screen);
}

/* ===== SUBJECT SCREEN ===== */
function renderSubject(subjectIdx) {
  detachQuizKeys();
  const subject = QUIZ_DATA.subjects[subjectIdx];
  const prog = getTotalProgress(subjectIdx);
  const passedPct = prog.totalSecs ? Math.round(prog.passedSecs / prog.totalSecs * 100) : 0;

  const screen = document.createElement('div');
  screen.id = 'screen-subject';
  screen.style.display = 'flex';
  screen.style.flexDirection = 'column';

  screen.appendChild(makeHeader(subject.title, `${prog.passedSecs}/${prog.totalSecs} пройдено`, true));

  const screenContent = document.createElement('div');
  screenContent.className = 'screen';
  const content = document.createElement('div');
  content.className = 'content';

  // Subject header card
  const subCard = document.createElement('div');
  subCard.className = 'subject-header-card';
  subCard.innerHTML = `
    <div class="subject-icon-large" style="background:${subject.color}20">${subject.icon}</div>
    <div class="subject-info">
      <div class="subject-name">${subject.title}</div>
      <div class="subject-stats">${prog.passedSecs}/${prog.totalSecs} пройдено · ${prog.total} питань${prog.avgBest > 0 ? ` · середнє ${prog.avgBest}%` : ''}</div>
      <div class="subject-progress-bar">${progressBar(passedPct, subject.color).outerHTML}</div>
    </div>`;
  content.appendChild(subCard);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'action-buttons';

  const btnQuizAll = html(`<button class="action-btn btn-primary">${Icons.play} Тест</button>`);
  btnQuizAll.addEventListener('click', () => startQuiz(subjectIdx, null, 'quiz'));

  const btnStudyAll = html(`<button class="action-btn btn-secondary">${Icons.book} Вчити</button>`);
  btnStudyAll.addEventListener('click', () => startStudy(subjectIdx, null));

  const btnShuffle = html(`<button class="action-btn btn-secondary btn-full">${Icons.shuffle} Випадковий тест (20 питань)</button>`);
  btnShuffle.addEventListener('click', () => startQuiz(subjectIdx, null, 'quiz', true));

  actions.appendChild(btnQuizAll);
  actions.appendChild(btnStudyAll);
  actions.appendChild(btnShuffle);
  content.appendChild(actions);

  // Sections
  const lbl = document.createElement('div');
  lbl.className = 'section-label';
  lbl.textContent = 'Розділи';
  content.appendChild(lbl);

  const list = document.createElement('div');
  list.className = 'sections-list';

  subject.sections.forEach((section, sIdx) => {
    const sp = getSectionProgress(subjectIdx, sIdx);
    const status = sectionStatus(sp);
    const sm = STATUS_META[status];

    const cleanTitle = section.title
      .replace(/^Питання \d+[–\-]\d+ — /, '')
      .replace(/\s*\(\d+[–\-]\d+\)\s*$/, '');
    const displayTitle = cleanTitle || section.title;

    const item = document.createElement('button');
    item.className = 'section-item';
    item.innerHTML = `<div class="section-item-inner">
      <div class="section-num" style="background:${sm.color}">${sIdx + 1}</div>
      <div class="section-content">
        <div class="section-title">${displayTitle}</div>
        <div class="section-meta">${section.questions.length} питань${sp ? ` · ${fmtPct(sp.best)} ${sp.best}%${sp.n > 1 ? ` · ${sp.n} спроб` : ''}` : ` · ${sm.label}`}</div>
      </div>
      <div class="section-progress-mini">
        <div class="section-score" style="color:${sm.color}">${sp ? sp.best + '%' : sm.icon}</div>
        <div class="progress-bar-mini"><div class="progress-fill-mini" style="width:${sp ? sp.best : 0}%;background:${sm.color}"></div></div>
      </div>
      <div class="section-chevron">${Icons.chevronRight}</div>
    </div>`;

    item.addEventListener('click', () => showSectionModal(subjectIdx, sIdx));
    list.appendChild(item);
  });

  content.appendChild(list);
  screenContent.appendChild(content);
  screen.appendChild(screenContent);
  render(screen);
}

/* ===== SECTION MODAL ===== */
function showSectionModal(subjectIdx, sectionIdx) {
  const subject = QUIZ_DATA.subjects[subjectIdx];
  const section = subject.sections[sectionIdx];
  const cleanTitle = section.title
    .replace(/^Питання \d+[–\-]\d+ — /, '')
    .replace(/\s*\(\d+[–\-]\d+\)\s*$/, '');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const sheet = html(`<div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">${cleanTitle}</div>
    <div class="mode-options"></div>
  </div>`);

  const modeOpts = sheet.querySelector('.mode-options');

  const modes = [
    {
      icon: '🎯', bg: '#eff6ff', label: 'Тест',
      desc: `Відповіді приховані · ${section.questions.length} питань`,
      action: () => { overlay.remove(); startQuiz(subjectIdx, sectionIdx, 'quiz'); }
    },
    {
      icon: '📖', bg: '#f0fdf4', label: 'Вчити',
      desc: 'Переглянути питання з відповідями',
      action: () => { overlay.remove(); startStudy(subjectIdx, sectionIdx); }
    },
    {
      icon: '🔀', bg: '#faf5ff', label: 'Швидкий тест',
      desc: 'Довільні 10 питань з розділу',
      action: () => { overlay.remove(); startQuiz(subjectIdx, sectionIdx, 'quiz', true, 10); }
    },
  ];

  modes.forEach(m => {
    const btn = html(`<button class="mode-option-btn">
      <div class="mode-icon" style="background:${m.bg}">${m.icon}</div>
      <div class="mode-info">
        <div class="mode-label">${m.label}</div>
        <div class="mode-desc">${m.desc}</div>
      </div>
    </button>`);
    btn.addEventListener('click', m.action);
    modeOpts.appendChild(btn);
  });

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

/* ===== START QUIZ ===== */
function startQuiz(subjectIdx, sectionIdx, mode, randomize = false, limit = null) {
  const subject = QUIZ_DATA.subjects[subjectIdx];
  let questions = [];

  if (sectionIdx !== null) {
    questions = subject.sections[sectionIdx].questions.map((q, qIdx) => ({
      ...q, subjectIdx, sectionIdx, qIdx
    }));
  } else {
    subject.sections.forEach((sec, sIdx) => {
      sec.questions.forEach((q, qIdx) => {
        questions.push({ ...q, subjectIdx, sectionIdx: sIdx, qIdx });
      });
    });
  }

  if (randomize || limit) {
    questions = shuffle(questions);
    if (limit) questions = questions.slice(0, limit);
  }

  if (questions.length === 0) return;

  questions = questions.map(shuffleOptions);

  State.subjectIdx = subjectIdx;
  State.sectionIdx = sectionIdx;
  State.quizMode = mode;
  State.questions = questions;
  State.qIdx = 0;
  State.answered = null;
  State.score = 0;
  State.mistakes = [];
  State.isMistakesQuiz = false;
  State.answerResults = [];

  renderQuiz();
}

/* ===== SEGMENTED PROGRESS BAR ===== */
function buildSegmentedBar(questions, answerResults, currentIdx) {
  // Group consecutive questions that share the same section
  const groups = [];
  let curGroup = null;
  questions.forEach((q, i) => {
    const key = `${q.subjectIdx}_${q.sectionIdx}`;
    if (!curGroup || curGroup.key !== key) {
      curGroup = { key, startIdx: i, count: 0 };
      groups.push(curGroup);
    }
    curGroup.count++;
  });

  const bar = document.createElement('div');
  bar.className = 'quiz-seg-bar';

  groups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'quiz-seg-group';
    groupEl.style.flex = group.count;

    for (let i = 0; i < group.count; i++) {
      const absIdx = group.startIdx + i;
      const result = answerResults[absIdx];
      const seg = document.createElement('div');
      seg.className = 'quiz-seg';
      if (result === true) seg.classList.add('seg-correct');
      else if (result === false) seg.classList.add('seg-wrong');
      else if (absIdx === currentIdx) seg.classList.add('seg-current');
      groupEl.appendChild(seg);
    }

    bar.appendChild(groupEl);
  });

  return bar;
}

/* ===== QUIZ SCREEN ===== */
function renderQuiz() {
  const q = State.questions[State.qIdx];
  const subject = QUIZ_DATA.subjects[q.subjectIdx];
  const section = subject.sections[q.sectionIdx];
  const total = State.questions.length;
  const pct = Math.round((State.qIdx / total) * 100);
  const answered = State.answered !== null;

  const cleanSectionTitle = section.title
    .replace(/^Питання \d+[–\-]\d+ — /, '')
    .replace(/\s*\(\d+[–\-]\d+\)\s*$/, '');

  const screen = document.createElement('div');
  screen.id = 'screen-quiz';
  screen.style.display = 'flex';
  screen.style.flexDirection = 'column';

  const actionsEl = document.createElement('div');
  actionsEl.className = 'header-actions';
  const closeBtn = html(`<button class="icon-btn" title="Завершити">${Icons.close}</button>`);
  closeBtn.addEventListener('click', () => {
    if (confirm('Завершити тест?')) goBack();
  });
  actionsEl.appendChild(closeBtn);

  let headerSubtitle;
  if (State.isMistakesQuiz) {
    headerSubtitle = '🔴 Робота над помилками';
  } else if (State.isExamMode) {
    const examElapsed = Math.floor((Date.now() - State.examStartTime) / 1000);
    const examRemaining = Math.max(0, 2400 - examElapsed);
    const em = Math.floor(examRemaining / 60), es = examRemaining % 60;
    headerSubtitle = `🎓 Іспит &nbsp;⏱ <span id="exam-timer-display" style="font-variant-numeric:tabular-nums;font-weight:700">${em}:${es.toString().padStart(2, '0')}</span>`;
  } else {
    headerSubtitle = `${subject.icon} ${subject.title.replace(/ЗУ "Про /, '').replace(/"$/, '')}`;
  }

  screen.appendChild(makeHeader(
    `Питання ${State.qIdx + 1} з ${total}`,
    headerSubtitle,
    false,
    actionsEl
  ));

  // Progress bar header
  const progHeader = document.createElement('div');
  progHeader.className = 'quiz-progress-header';
  const progInner = document.createElement('div');
  progInner.className = 'quiz-progress-header-inner';
  const wrongCount = State.mistakes.length;
  progInner.appendChild(html(`<div class="quiz-counter">
    <span class="quiz-counter-left">${State.qIdx + 1} / ${total}</span>
    <span class="quiz-counter-right">${State.score > 0 ? `<span style="color:#16a34a">✅ ${State.score}</span>` : ''}${wrongCount > 0 ? `${State.score > 0 ? ' ' : ''}<span style="color:#dc2626">❌ ${wrongCount}</span>` : ''}${State.score === 0 && wrongCount === 0 ? '—' : ''}</span>
  </div>`));
  progInner.appendChild(buildSegmentedBar(State.questions, State.answerResults, State.qIdx));
  progHeader.appendChild(progInner);
  screen.appendChild(progHeader);

  const scrollArea = document.createElement('div');
  scrollArea.className = 'screen';

  const qContent = document.createElement('div');
  qContent.className = 'quiz-content';

  // Question card
  const qCard = document.createElement('div');
  qCard.className = 'question-card';
  qCard.innerHTML = `
    <div class="question-section-tag" style="background:${subject.color}">${cleanSectionTitle}</div>
    <div class="question-text">${q.q}</div>`;
  qContent.appendChild(qCard);

  // Options
  const optionsList = document.createElement('div');
  optionsList.className = 'options-list';

  q.o.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="option-letter">${LETTERS[i]}</span><span>${opt}</span>`;
    btn.disabled = answered;

    if (answered) {
      if (i === q.a) btn.classList.add(State.answered === i ? 'correct' : 'reveal-correct');
      else if (i === State.answered) btn.classList.add('wrong');
    }

    btn.addEventListener('click', () => handleAnswer(i));
    optionsList.appendChild(btn);
  });

  qContent.appendChild(optionsList);

  // Feedback
  if (answered) {
    const isCorrect = State.answered === q.a;
    const fb = document.createElement('div');
    fb.className = `feedback-box ${isCorrect ? 'correct-fb' : 'wrong-fb'}`;
    fb.innerHTML = `
      <div class="feedback-icon">${isCorrect ? '✅' : '❌'}</div>
      <div class="feedback-text">
        ${isCorrect
          ? `<strong>Правильно!</strong>`
          : `<strong>Неправильно.</strong> Правильна відповідь: <strong>${LETTERS[q.a]}) ${q.o[q.a]}</strong>`
        }
      </div>`;
    qContent.appendChild(fb);
  }

  scrollArea.appendChild(qContent);
  screen.appendChild(scrollArea);

  // Bottom nav
  const nav = document.createElement('div');
  nav.className = 'quiz-nav';
  const navInner = document.createElement('div');
  navInner.className = 'quiz-nav-inner';

  const isLast = State.qIdx === State.questions.length - 1;
  const nextBtn = html(`<button class="next-btn" ${!answered ? 'disabled' : ''}>
    ${isLast ? `${Icons.trophy} Результати` : `Далі ${Icons.chevronRight}`}
  </button>`);
  nextBtn.addEventListener('click', nextQuestion);
  navInner.appendChild(nextBtn);
  nav.appendChild(navInner);
  screen.appendChild(nav);

  if (_quizKeyHandler) document.removeEventListener('keydown', _quizKeyHandler);
  _quizKeyHandler = (e) => {
    if (State.answered !== null) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextQuestion(); }
    } else {
      const idx = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
      if (idx !== undefined) handleAnswer(idx);
    }
  };
  document.addEventListener('keydown', _quizKeyHandler);

  render(screen);

  if (State.isExamMode) {
    if (_examTimerInterval) clearInterval(_examTimerInterval);
    _examTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - State.examStartTime) / 1000);
      const remaining = Math.max(0, 2400 - elapsed);
      const timerEl = document.getElementById('exam-timer-display');
      if (!timerEl) { clearInterval(_examTimerInterval); _examTimerInterval = null; return; }
      const m = Math.floor(remaining / 60), s = remaining % 60;
      timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      timerEl.style.color = remaining < 300 ? '#ff4444' : '';
      timerEl.style.fontWeight = remaining < 300 ? '800' : '700';
      if (remaining === 0) { clearInterval(_examTimerInterval); _examTimerInterval = null; finishExam(); }
    }, 1000);
  }
}

function handleAnswer(i) {
  const q = State.questions[State.qIdx];
  if (State.answered !== null) return;

  State.answered = i;
  const isCorrect = i === q.a;
  State.answerResults[State.qIdx] = isCorrect;
  if (isCorrect) {
    State.score++;
  } else {
    State.mistakes.push({ question: q, correct: q.o[q.a], chosen: q.o[i] });
  }
  renderQuiz();
}

function nextQuestion() {
  if (State.qIdx < State.questions.length - 1) {
    State.qIdx++;
    State.answered = null;
    renderQuiz();
  } else {
    if (State.isExamMode) {
      finishExam();
    } else {
      if (!State.isMistakesQuiz) {
        updateProgress(
          State.subjectIdx,
          State.sectionIdx,
          State.score,
          State.questions.length
        );
      }
      renderResults();
    }
  }
}

/* ===== MISTAKES QUIZ ===== */
function startMistakesQuiz(mistakes) {
  const questions = mistakes.map(m => shuffleOptions(m.question));
  if (questions.length === 0) return;

  State.questions = questions;
  State.qIdx = 0;
  State.answered = null;
  State.score = 0;
  State.mistakes = [];
  State.isMistakesQuiz = true;
  State.isExamMode = false;
  State.answerResults = [];

  renderQuiz();
}

/* ===== RESULTS SCREEN ===== */
function renderResults() {
  detachQuizKeys();
  const total = State.questions.length;
  const score = State.score;
  const pct = Math.round((score / total) * 100);
  const subject = QUIZ_DATA.subjects[State.subjectIdx];

  let grade, gradeColor, gradeBg;
  if (pct >= 90) { grade = 'Відмінно! 🏆'; gradeColor = '#16a34a'; gradeBg = '#dcfce7'; }
  else if (pct >= 75) { grade = 'Добре! 👍'; gradeColor = '#0284c7'; gradeBg = '#e0f2fe'; }
  else if (pct >= 60) { grade = 'Задовільно 📚'; gradeColor = '#d97706'; gradeBg = '#fef3c7'; }
  else { grade = 'Потрібно більше практики 💪'; gradeColor = '#dc2626'; gradeBg = '#fee2e2'; }

  const circumference = 2 * Math.PI * 52;
  const dashOffset = circumference * (1 - pct / 100);

  const screen = document.createElement('div');
  screen.id = 'screen-results';
  screen.style.display = 'flex';
  screen.style.flexDirection = 'column';

  screen.appendChild(makeHeader('Результати', subject.title, false));

  const scrollArea = document.createElement('div');
  scrollArea.className = 'screen';
  const rc = document.createElement('div');
  rc.className = 'results-content';

  rc.innerHTML = `
    <div class="result-circle-wrap">
      <div class="result-circle">
        <svg><circle class="result-circle-bg" cx="70" cy="70" r="52"/><circle class="result-circle-fill" cx="70" cy="70" r="52" stroke="${gradeColor}" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"/></svg>
        <div class="result-percent" style="color:${gradeColor}">${pct}%</div>
        <div class="result-label">результат</div>
      </div>
    </div>
    <div class="result-grade" style="color:${gradeColor}">${grade}</div>
    <div class="result-subtitle">${score} правильних відповідей з ${total} питань</div>
    <div class="result-stats-grid">
      <div class="result-stat"><div class="result-stat-num" style="color:#16a34a">${score}</div><div class="result-stat-lbl">Правильно</div></div>
      <div class="result-stat"><div class="result-stat-num" style="color:#dc2626">${total - score}</div><div class="result-stat-lbl">Помилки</div></div>
      <div class="result-stat"><div class="result-stat-num" style="color:${gradeColor}">${pct}%</div><div class="result-stat-lbl">Відсоток</div></div>
    </div>`;

  // Mistakes
  const savedMistakes = [...State.mistakes];
  if (savedMistakes.length > 0) {
    const mistakesLabel = html(`<div class="section-label" style="text-align:left;margin-bottom:10px">Помилки (${savedMistakes.length})</div>`);
    rc.appendChild(mistakesLabel);

    const mistakesList = document.createElement('div');
    mistakesList.style.marginBottom = '20px';
    savedMistakes.slice(0, 10).forEach(m => {
      const item = html(`<div style="background:var(--card);border-radius:12px;padding:12px 14px;margin-bottom:8px;box-shadow:var(--shadow);text-align:left">
        <div style="font-size:0.85rem;font-weight:600;margin-bottom:6px;color:var(--text)">${m.question.q}</div>
        <div style="font-size:0.78rem;color:var(--error-text);margin-bottom:3px">❌ ${m.chosen}</div>
        <div style="font-size:0.78rem;color:var(--success)">✅ ${m.correct}</div>
      </div>`);
      mistakesList.appendChild(item);
    });
    rc.appendChild(mistakesList);
  }

  // Buttons
  const btns = document.createElement('div');
  btns.className = 'results-buttons';

  if (savedMistakes.length > 0) {
    const mistakesBtn = html(`<button class="result-btn action-btn" style="background:#dc2626;color:white">${Icons.flag} Робота над помилками (${savedMistakes.length})</button>`);
    mistakesBtn.addEventListener('click', () => startMistakesQuiz(savedMistakes));
    btns.appendChild(mistakesBtn);
  }

  const retryBtn = html(`<button class="result-btn btn-primary action-btn">${Icons.refresh} Пройти ще раз</button>`);
  retryBtn.addEventListener('click', () => {
    startQuiz(State.subjectIdx, State.sectionIdx, State.quizMode);
  });

  const shuffleBtn = html(`<button class="result-btn action-btn btn-secondary">${Icons.shuffle} Нові питання</button>`);
  shuffleBtn.addEventListener('click', () => {
    startQuiz(State.subjectIdx, State.sectionIdx, State.quizMode, true, Math.min(20, State.questions.length));
  });

  const homeBtn = html(`<button class="result-btn action-btn" style="background:#f1f5f9;color:#1e293b">${Icons.home} На головну</button>`);
  homeBtn.addEventListener('click', () => {
    State.screen = 'home';
    renderHome();
  });

  btns.appendChild(retryBtn);
  btns.appendChild(shuffleBtn);
  btns.appendChild(homeBtn);
  rc.appendChild(btns);

  scrollArea.appendChild(rc);
  screen.appendChild(scrollArea);
  render(screen);

  // Animate circle
  setTimeout(() => {
    const circle = document.querySelector('.result-circle-fill');
    if (circle) circle.style.strokeDashoffset = dashOffset;
  }, 100);
}

/* ===== STUDY SCREEN ===== */
function startStudy(subjectIdx, sectionIdx) {
  State.subjectIdx = subjectIdx;
  State.sectionIdx = sectionIdx;
  State.studyCardIdx = 0;
  State.studyCardRevealed = false;
  State.studySectionFilter = sectionIdx;
  State.studyAllExpanded = false;
  buildStudyFlat(subjectIdx, sectionIdx);
  renderStudy();
}

function buildStudyFlat(subjectIdx, sectionIdxFilter) {
  const subject = QUIZ_DATA.subjects[subjectIdx];
  const flat = [];
  const sections = sectionIdxFilter !== null
    ? [{ sec: subject.sections[sectionIdxFilter], sIdx: sectionIdxFilter }]
    : subject.sections.map((sec, sIdx) => ({ sec, sIdx }));
  sections.forEach(({ sec, sIdx }) => {
    const cleanTitle = sec.title
      .replace(/^Питання \d+[–\-]\d+ — /, '')
      .replace(/\s*\(\d+[–\-]\d+\)\s*$/, '');
    sec.questions.forEach((q, qIdx) => {
      flat.push({ ...q, subjectIdx, sectionIdx: sIdx, qIdx, sectionTitle: cleanTitle });
    });
  });
  State.studyFlatQuestions = flat;
}

function renderStudy() {
  const subject = QUIZ_DATA.subjects[State.subjectIdx];
  const sectionIdx = State.sectionIdx;
  const isCards = State.studyViewMode === 'cards';
  const flat = State.studyFlatQuestions;

  const title = sectionIdx !== null
    ? subject.sections[sectionIdx].title.replace(/^Питання \d+[–\-]\d+ — /, '').replace(/\s*\(\d+[–\-]\d+\)\s*$/, '')
    : 'Всі питання';

  const screen = document.createElement('div');
  screen.id = 'screen-study';
  screen.style.display = 'flex';
  screen.style.flexDirection = 'column';

  screen.appendChild(makeHeader('Режим вивчення', title, true));

  // Toolbar: view toggle + expand all (list mode only)
  const toolbar = html(`<div style="background:var(--card);border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <div style="display:flex;border:2px solid var(--border);border-radius:10px;overflow:hidden;flex-shrink:0">
      <button id="btn-list-mode" style="padding:7px 14px;font-size:0.8rem;font-weight:600;transition:all 0.15s;display:flex;align-items:center;gap:6px;border:none;cursor:pointer;${!isCards ? 'background:var(--ua-blue);color:white' : 'background:transparent;color:var(--text-muted)'}">
        ${Icons.list} Список
      </button>
      <button id="btn-card-mode" style="padding:7px 14px;font-size:0.8rem;font-weight:600;transition:all 0.15s;display:flex;align-items:center;gap:6px;border:none;cursor:pointer;${isCards ? 'background:var(--ua-blue);color:white' : 'background:transparent;color:var(--text-muted)'}">
        ${Icons.play} Картки
      </button>
    </div>
    ${!isCards ? `<button id="btn-expand-all" style="padding:7px 12px;font-size:0.8rem;font-weight:600;border:2px solid var(--border);border-radius:10px;background:var(--card);color:var(--text);cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px">
      ${State.studyAllExpanded ? Icons.chevronDown + ' Згорнути всі' : Icons.chevronDown + ' Розгорнути всі'}
    </button>` : `<span style="font-size:0.8rem;color:var(--text-muted)">${State.studyCardIdx + 1} / ${flat.length}</span>`}
  </div>`);

  toolbar.querySelector('#btn-list-mode').addEventListener('click', () => {
    State.studyViewMode = 'list';
    renderStudy();
  });
  toolbar.querySelector('#btn-card-mode').addEventListener('click', () => {
    State.studyViewMode = 'cards';
    renderStudy();
  });
  const expandBtn = toolbar.querySelector('#btn-expand-all');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      State.studyAllExpanded = !State.studyAllExpanded;
      // Toggle all open
      const allOptions = screen.querySelectorAll('.study-options');
      const allToggles = screen.querySelectorAll('.study-q-toggle');
      allOptions.forEach(o => State.studyAllExpanded ? o.classList.add('open') : o.classList.remove('open'));
      allToggles.forEach(t => State.studyAllExpanded ? t.classList.add('open') : t.classList.remove('open'));
      expandBtn.innerHTML = State.studyAllExpanded ? Icons.chevronDown + ' Згорнути всі' : Icons.chevronDown + ' Розгорнути всі';
    });
  }

  screen.appendChild(toolbar);

  if (isCards) {
    // ===== CARD MODE =====
    renderStudyCardView(screen, subject, flat);
  } else {
    // ===== LIST MODE =====
    const scrollArea = document.createElement('div');
    scrollArea.className = 'screen';

    // Section tabs when showing all
    if (sectionIdx === null) {
      const tabs = document.createElement('div');
      tabs.className = 'scroll-tabs';
      tabs.style.paddingTop = '10px';
      tabs.style.background = 'white';
      tabs.style.borderBottom = '1px solid var(--border)';

      function setTabFilter(filterIdx, activeTab) {
        tabs.querySelectorAll('.scroll-tab').forEach(t => t.classList.remove('active'));
        activeTab.classList.add('active');
        State.studySectionFilter = filterIdx;
        buildStudyFlat(State.subjectIdx, filterIdx);
        studyContent.innerHTML = '';
        renderStudyQuestions(studyContent, QUIZ_DATA.subjects[State.subjectIdx], filterIdx, State.studyAllExpanded);
      }

      const allTab = html(`<button class="scroll-tab active">Всі</button>`);
      allTab.addEventListener('click', () => setTabFilter(null, allTab));
      tabs.appendChild(allTab);

      subject.sections.forEach((sec, idx) => {
        const cleanT = sec.title.replace(/^Питання \d+[–\-]\d+ — /, '').replace(/\s*\(\d+[–\-]\d+\)\s*$/, '');
        const tab = html(`<button class="scroll-tab">${cleanT.length > 22 ? cleanT.slice(0, 22) + '…' : cleanT}</button>`);
        tab.addEventListener('click', () => setTabFilter(idx, tab));
        tabs.appendChild(tab);
      });

      scrollArea.appendChild(tabs);
    }

    const studyContent = document.createElement('div');
    studyContent.className = 'study-content';
    renderStudyQuestions(studyContent, subject, State.studySectionFilter, State.studyAllExpanded);
    scrollArea.appendChild(studyContent);
    screen.appendChild(scrollArea);
  }

  render(screen);
}

function renderStudyCardView(screen, subject, flat) {
  if (!flat.length) return;
  const idx = Math.max(0, Math.min(State.studyCardIdx, flat.length - 1));
  State.studyCardIdx = idx;
  const q = flat[idx];
  const pct = Math.round(((idx + 1) / flat.length) * 100);
  const revealed = State.studyCardRevealed;

  function goTo(newIdx) {
    State.studyCardIdx = newIdx;
    State.studyCardRevealed = false;
    renderStudy();
  }

  // Thin progress bar
  const progBar = html(`<div class="fc-progress-bar">
    <div class="fc-progress-fill" style="width:${pct}%;background:${subject.color}"></div>
  </div>`);
  screen.appendChild(progBar);

  const scrollArea = document.createElement('div');
  scrollArea.className = 'screen';

  const wrap = html(`<div class="fc-wrap"></div>`);

  // Counter chip
  const counter = html(`<div class="fc-counter">
    <span class="fc-counter-tag" style="background:${subject.color}20;color:${subject.color}">${q.sectionTitle}</span>
    <span class="fc-counter-num">${idx + 1} / ${flat.length}</span>
  </div>`);
  wrap.appendChild(counter);

  // Question card
  const card = html(`<div class="fc-card">
    <p class="fc-question">${q.q}</p>
  </div>`);
  wrap.appendChild(card);

  // Answer section
  const answerWrap = document.createElement('div');
  answerWrap.className = 'fc-answers' + (revealed ? ' fc-answers-visible' : '');

  q.o.forEach((opt, i) => {
    const isCorrect = i === q.a;
    const item = html(`<div class="fc-option ${isCorrect ? 'fc-option-correct' : 'fc-option-other'}">
      <span class="fc-opt-letter ${isCorrect ? 'fc-opt-letter-correct' : ''}">${LETTERS[i]}</span>
      <span class="fc-opt-text">${opt}</span>
      ${isCorrect ? '<span class="fc-opt-check">✅</span>' : ''}
    </div>`);
    answerWrap.appendChild(item);
  });
  wrap.appendChild(answerWrap);

  // Reveal / Next button
  if (!revealed) {
    const revealBtn = html(`<button class="fc-reveal-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      Показати відповідь
    </button>`);
    revealBtn.addEventListener('click', () => {
      State.studyCardRevealed = true;
      renderStudy();
    });
    wrap.appendChild(revealBtn);
  }

  scrollArea.appendChild(wrap);
  screen.appendChild(scrollArea);

  // Compact bottom nav
  const nav = html(`<div class="fc-nav">
    <div class="fc-nav-inner">
      <button class="fc-nav-btn ${idx === 0 ? 'fc-nav-btn-disabled' : 'fc-nav-btn-secondary'}" id="btn-prev">
        ${Icons.back} Назад
      </button>
      <div class="fc-nav-dots">
        ${Array.from({length: Math.min(flat.length, 7)}, (_, i) => {
          const dotIdx = flat.length <= 7 ? i : Math.round(i * (flat.length - 1) / 6);
          const active = Math.abs(dotIdx - idx) < (flat.length <= 7 ? 0.5 : flat.length / 14);
          return `<div class="fc-dot ${i === Math.round(idx / (flat.length - 1) * 6) ? 'fc-dot-active' : ''}"></div>`;
        }).join('')}
      </div>
      <button class="fc-nav-btn ${idx === flat.length - 1 ? 'fc-nav-btn-disabled' : 'fc-nav-btn-primary'}" id="btn-next">
        Далі ${Icons.chevronRight}
      </button>
    </div>
  </div>`);

  nav.querySelector('#btn-prev').addEventListener('click', () => { if (idx > 0) goTo(idx - 1); });
  nav.querySelector('#btn-next').addEventListener('click', () => { if (idx < flat.length - 1) goTo(idx + 1); });
  screen.appendChild(nav);

  // Keyboard
  function onKeydown(e) {
    if (e.key === 'ArrowLeft') { if (idx > 0) { document.removeEventListener('keydown', onKeydown); goTo(idx - 1); } }
    else if (e.key === 'ArrowRight') { if (idx < flat.length - 1) { document.removeEventListener('keydown', onKeydown); goTo(idx + 1); } }
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!State.studyCardRevealed) { State.studyCardRevealed = true; document.removeEventListener('keydown', onKeydown); renderStudy(); }
      else if (idx < flat.length - 1) { document.removeEventListener('keydown', onKeydown); goTo(idx + 1); }
    }
  }
  document.addEventListener('keydown', onKeydown);

  // Swipe
  let touchStartX = 0;
  scrollArea.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  scrollArea.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && idx < flat.length - 1) goTo(idx + 1);
    else if (dx > 0 && idx > 0) goTo(idx - 1);
  }, { passive: true });
}

function renderStudyQuestions(container, subject, sectionIdx, allExpanded = false) {
  let qNum = 1;
  const sections = sectionIdx !== null
    ? [{ sec: subject.sections[sectionIdx], sIdx: sectionIdx }]
    : subject.sections.map((sec, sIdx) => ({ sec, sIdx }));

  sections.forEach(({ sec, sIdx }) => {
    const cleanTitle = sec.title
      .replace(/^Питання \d+[–\-]\d+ — /, '')
      .replace(/\s*\(\d+[–\-]\d+\)\s*$/, '');

    if (sectionIdx === null) {
      const header = html(`<div class="section-label" style="margin-top:${sIdx > 0 ? '16px' : '0'}">${cleanTitle}</div>`);
      container.appendChild(header);
    }

    sec.questions.forEach((q, qIdx) => {
      const qDiv = document.createElement('div');
      qDiv.className = 'study-question';

      const qHeader = html(`<div class="study-q-header">
        <span class="study-q-num" style="background:${subject.color}">${qNum}</span>
        <span class="study-q-text">${q.q}</span>
        <span class="study-q-toggle${allExpanded ? ' open' : ''}">${Icons.chevronDown}</span>
      </div>`);

      const optDiv = document.createElement('div');
      optDiv.className = `study-options${allExpanded ? ' open' : ''}`;
      q.o.forEach((opt, i) => {
        const isCorrect = i === q.a;
        optDiv.innerHTML += `<div class="study-option ${isCorrect ? 'correct-ans' : 'other-ans'}">
          <span class="study-opt-letter">${LETTERS[i]})</span>
          <span>${opt}</span>
          ${isCorrect ? `<span class="study-check">✅</span>` : ''}
        </div>`;
      });

      qHeader.addEventListener('click', () => {
        const toggle = qHeader.querySelector('.study-q-toggle');
        optDiv.classList.toggle('open');
        toggle.classList.toggle('open');
      });

      qDiv.appendChild(qHeader);
      qDiv.appendChild(optDiv);
      container.appendChild(qDiv);
      qNum++;
    });
  });
}

/* ===== NAVIGATION ===== */
function navigateTo(screen, ...args) {
  State.screen = screen;
  if (screen === 'home') renderHome();
  else if (screen === 'subject') { State.subjectIdx = args[0]; renderSubject(args[0]); }
}

function goBack() {
  if (State.screen === 'subject' || State.screen === 'results') {
    State.screen = 'home';
    renderHome();
  } else if (State.screen === 'quiz' || State.screen === 'study') {
    State.screen = 'subject';
    renderSubject(State.subjectIdx);
  } else {
    renderHome();
  }
}

/* ===== INIT ===== */
window.addEventListener('DOMContentLoaded', () => {
  renderHome();
});

// Handle browser back
window.addEventListener('popstate', () => {
  goBack();
});
