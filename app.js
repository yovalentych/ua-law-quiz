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
  studyFlatQuestions: [],
  studySectionFilter: null,
  studyAllExpanded: false,
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
  let totalQ = 0, bestSum = 0, secsDone = 0;
  subject.sections.forEach((sec, sIdx) => {
    totalQ += sec.questions.length;
    const p = getSectionProgress(subjectIdx, sIdx);
    if (p) { bestSum += p.best; secsDone++; }
  });
  const avgBest = secsDone ? Math.round(bestSum / secsDone) : 0;
  return { total: totalQ, secsDone, totalSecs: subject.sections.length, avgBest };
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  const doneSecs = Object.keys(State.progress.secs || {}).filter(k => !k.endsWith('_all')).length;

  const statsDiv = html(`<div class="total-stats" style="padding-top:16px">
    <div class="stat-card"><div class="stat-number">589</div><div class="stat-label">Питань всього</div></div>
    <div class="stat-card"><div class="stat-number" style="color:#d97706">${streakN > 0 ? '🔥 ' + streakN : '—'}</div><div class="stat-label">Днів поспіль</div></div>
    <div class="stat-card"><div class="stat-number" style="color:#16a34a">${doneSecs}/${allSecs}</div><div class="stat-label">Розділів</div></div>
  </div>`);
  screenContent.appendChild(statsDiv);

  const content = document.createElement('div');
  content.className = 'content';

  const lbl = document.createElement('div');
  lbl.className = 'section-label';
  lbl.style.marginTop = '16px';
  lbl.textContent = 'Оберіть розділ';
  content.appendChild(lbl);

  const grid = document.createElement('div');
  grid.className = 'subjects-grid';

  QUIZ_DATA.subjects.forEach((subject, idx) => {
    const prog = getTotalProgress(idx);
    const pct = prog.totalSecs ? Math.round(prog.secsDone / prog.totalSecs * 100) : 0;

    const card = document.createElement('button');
    card.className = 'subject-card';
    card.innerHTML = `
      <div class="card-accent" style="background:${subject.color}"></div>
      <div class="card-body">
        <div class="card-icon-wrap" style="background:${subject.color}20">${subject.icon}</div>
        <div class="card-info">
          <div class="card-title">${subject.title}</div>
          <div class="card-meta">${subject.sections.length} розділів · ${prog.total} питань${prog.secsDone > 0 ? ` · ${prog.avgBest}% найкращий` : ''}</div>
          <div class="card-progress-wrap">
            ${progressBar(pct, subject.color).outerHTML}
            <div class="progress-text"><span>${pct}% розділів</span><span>${prog.secsDone}/${prog.totalSecs}</span></div>
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
  const subject = QUIZ_DATA.subjects[subjectIdx];
  const prog = getTotalProgress(subjectIdx);
  const pct = prog.totalSecs ? Math.round(prog.secsDone / prog.totalSecs * 100) : 0;

  const screen = document.createElement('div');
  screen.id = 'screen-subject';
  screen.style.display = 'flex';
  screen.style.flexDirection = 'column';

  screen.appendChild(makeHeader(subject.title, `${prog.total} питань`, true));

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
      <div class="subject-stats">${subject.sections.length} розділів · ${prog.total} питань · ${pct}% розділів</div>
      <div class="subject-progress-bar">${progressBar(pct, subject.color).outerHTML}</div>
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

    const cleanTitle = section.title
      .replace(/^Питання \d+[–\-]\d+ — /, '')
      .replace(/\s*\(\d+[–\-]\d+\)\s*$/, '');

    const item = document.createElement('button');
    item.className = 'section-item';
    item.innerHTML = `<div class="section-item-inner">
      <div class="section-num" style="background:${subject.color}">${sIdx + 1}</div>
      <div class="section-content">
        <div class="section-title">${cleanTitle}</div>
        <div class="section-meta">${section.questions.length} питань${sp ? ` · ${fmtPct(sp.best)} ${sp.best}%${sp.n > 1 ? ` · ${sp.n} спроб` : ''}` : ''}</div>
      </div>
      <div class="section-progress-mini">
        ${sp ? `<div class="section-score" style="color:${scoreColor(sp.best)}">${sp.best}%</div>` : ''}
        <div class="progress-bar-mini"><div class="progress-fill-mini" style="width:${sp ? sp.best : 0}%;background:${subject.color}"></div></div>
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

  State.subjectIdx = subjectIdx;
  State.sectionIdx = sectionIdx;
  State.quizMode = mode;
  State.questions = questions;
  State.qIdx = 0;
  State.answered = null;
  State.score = 0;
  State.mistakes = [];

  renderQuiz();
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

  screen.appendChild(makeHeader(
    `Питання ${State.qIdx + 1} з ${total}`,
    `${subject.icon} ${subject.title.replace(/ЗУ "Про /, '').replace(/"$/, '')}`,
    false,
    actionsEl
  ));

  // Progress bar header
  const progHeader = html(`<div class="quiz-progress-header">
    <div class="quiz-progress-header-inner">
      <div class="quiz-counter">
        <span class="quiz-counter-left">${State.qIdx + 1} / ${total}</span>
        <span class="quiz-counter-right">✅ ${State.score} правильно</span>
      </div>
      <div class="quiz-bar"><div class="quiz-bar-fill" style="width:${pct}%"></div></div>
    </div>
  </div>`);
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

  render(screen);
}

function handleAnswer(i) {
  const q = State.questions[State.qIdx];
  if (State.answered !== null) return;

  State.answered = i;
  if (i === q.a) {
    State.score++;
  } else {
    State.mistakes.push({ q: q.q, correct: q.o[q.a], chosen: q.o[i] });
  }
  renderQuiz();
}

function nextQuestion() {
  if (State.qIdx < State.questions.length - 1) {
    State.qIdx++;
    State.answered = null;
    renderQuiz();
  } else {
    // Save progress
    updateProgress(
      State.subjectIdx,
      State.sectionIdx,
      State.score,
      State.questions.length
    );
    renderResults();
  }
}

/* ===== RESULTS SCREEN ===== */
function renderResults() {
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
  if (State.mistakes.length > 0) {
    const mistakesLabel = html(`<div class="section-label" style="text-align:left;margin-bottom:10px">Помилки (${State.mistakes.length})</div>`);
    rc.appendChild(mistakesLabel);

    const mistakesList = document.createElement('div');
    mistakesList.style.marginBottom = '20px';
    State.mistakes.slice(0, 10).forEach(m => {
      const item = html(`<div style="background:white;border-radius:12px;padding:12px 14px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.07);text-align:left">
        <div style="font-size:0.85rem;font-weight:600;margin-bottom:6px;color:#1e293b">${m.q}</div>
        <div style="font-size:0.78rem;color:#dc2626;margin-bottom:3px">❌ ${m.chosen}</div>
        <div style="font-size:0.78rem;color:#16a34a">✅ ${m.correct}</div>
      </div>`);
      mistakesList.appendChild(item);
    });
    rc.appendChild(mistakesList);
  }

  // Buttons
  const btns = document.createElement('div');
  btns.className = 'results-buttons';

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
  const toolbar = html(`<div style="background:white;border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <div style="display:flex;border:2px solid var(--border);border-radius:10px;overflow:hidden;flex-shrink:0">
      <button id="btn-list-mode" style="padding:7px 14px;font-size:0.8rem;font-weight:600;transition:all 0.15s;display:flex;align-items:center;gap:6px;border:none;cursor:pointer;${!isCards ? 'background:var(--ua-blue);color:white' : 'background:white;color:var(--text-muted)'}">
        ${Icons.list} Список
      </button>
      <button id="btn-card-mode" style="padding:7px 14px;font-size:0.8rem;font-weight:600;transition:all 0.15s;display:flex;align-items:center;gap:6px;border:none;cursor:pointer;${isCards ? 'background:var(--ua-blue);color:white' : 'background:white;color:var(--text-muted)'}">
        ${Icons.play} Картки
      </button>
    </div>
    ${!isCards ? `<button id="btn-expand-all" style="padding:7px 12px;font-size:0.8rem;font-weight:600;border:2px solid var(--border);border-radius:10px;background:white;color:var(--text);cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px">
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
  const pct = Math.round((idx / flat.length) * 100);

  // Progress bar
  const progBar = html(`<div style="background:white;border-bottom:1px solid var(--border);padding:10px 16px">
    <div style="max-width:700px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);margin-bottom:6px">
        <span>${q.sectionTitle}</span>
        <span>${idx + 1} / ${flat.length}</span>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${subject.color};border-radius:3px;transition:width 0.3s"></div>
      </div>
    </div>
  </div>`);
  screen.appendChild(progBar);

  const scrollArea = document.createElement('div');
  scrollArea.className = 'screen';

  const cardWrap = html(`<div style="padding:16px;max-width:700px;margin:0 auto;padding-bottom:90px"></div>`);

  // Question card
  const qCard = html(`<div style="background:white;border-radius:16px;padding:20px;margin-bottom:14px;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="display:inline-block;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:3px 10px;border-radius:20px;color:white;background:${subject.color};margin-bottom:12px">${q.sectionTitle}</div>
    <div style="font-size:1.05rem;font-weight:600;line-height:1.5;color:var(--text)">${q.q}</div>
  </div>`);
  cardWrap.appendChild(qCard);

  // Options — all shown, correct highlighted
  const optList = document.createElement('div');
  optList.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-bottom:14px';
  q.o.forEach((opt, i) => {
    const isCorrect = i === q.a;
    const optEl = html(`<div style="padding:14px 16px;border-radius:10px;display:flex;align-items:flex-start;gap:12px;font-size:0.95rem;line-height:1.4;
      ${isCorrect
        ? 'background:var(--success-bg);border:2px solid var(--success);color:#14532d'
        : 'background:white;border:2px solid var(--border);color:var(--text-muted)'}">
      <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;flex-shrink:0;
        ${isCorrect ? 'background:var(--success);color:white;border:2px solid var(--success)' : 'background:var(--bg);border:2px solid var(--border);color:var(--text-muted)'}">${LETTERS[i]}</span>
      <span style="flex:1">${opt}</span>
      ${isCorrect ? '<span style="font-size:1rem;flex-shrink:0">✅</span>' : ''}
    </div>`);
    optList.appendChild(optEl);
  });
  cardWrap.appendChild(optList);

  scrollArea.appendChild(cardWrap);
  screen.appendChild(scrollArea);

  // Fixed bottom nav
  const nav = html(`<div style="position:fixed;bottom:0;left:0;right:0;background:white;border-top:1px solid var(--border);padding:12px 16px;z-index:20">
    <div style="max-width:700px;margin:0 auto;display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center">
      <button id="btn-prev" style="padding:14px;border-radius:10px;font-size:0.95rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;transition:all 0.2s;
        ${idx === 0 ? 'background:var(--border);color:var(--text-muted);cursor:default' : 'background:var(--bg);color:var(--text);border:2px solid var(--border)'}">
        ${Icons.back} Назад
      </button>
      <span style="font-size:0.8rem;color:var(--text-muted);text-align:center;white-space:nowrap">${idx + 1} / ${flat.length}</span>
      <button id="btn-next" style="padding:14px;border-radius:10px;font-size:0.95rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;transition:all 0.2s;
        ${idx === flat.length - 1 ? 'background:var(--border);color:var(--text-muted);cursor:default' : 'background:var(--ua-blue);color:white'}">
        Далі ${Icons.chevronRight}
      </button>
    </div>
  </div>`);

  nav.querySelector('#btn-prev').addEventListener('click', () => {
    if (idx > 0) { State.studyCardIdx = idx - 1; renderStudy(); }
  });
  nav.querySelector('#btn-next').addEventListener('click', () => {
    if (idx < flat.length - 1) { State.studyCardIdx = idx + 1; renderStudy(); }
  });
  screen.appendChild(nav);

  // Keyboard navigation
  function onKeydown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (idx > 0) { State.studyCardIdx = idx - 1; document.removeEventListener('keydown', onKeydown); renderStudy(); }
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
      if (idx < flat.length - 1) { State.studyCardIdx = idx + 1; document.removeEventListener('keydown', onKeydown); renderStudy(); }
    }
  }
  document.addEventListener('keydown', onKeydown);

  // Swipe gestures
  let touchStartX = 0;
  scrollArea.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  scrollArea.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && idx < flat.length - 1) { State.studyCardIdx = idx + 1; renderStudy(); }
    else if (dx > 0 && idx > 0) { State.studyCardIdx = idx - 1; renderStudy(); }
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
