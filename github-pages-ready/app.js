const STORAGE_KEY = "pharm-law-quiz-progress-copy-2-v1";
const TIMER_STORAGE_KEY = `${STORAGE_KEY}-timer`;
const DB_NAME = "gomingi-final-quiz-copy-2";
const DB_VERSION = 1;

const data = window.QUIZ_DATA || { source: "알 수 없음", questions: [] };
const subjects = data.subjects || [
  {
    id: "law",
    label: "약법",
    source: data.source || "약사법규 기말",
    questions: data.questions || [],
  },
];

const defaultTimer = { activeStart: null, sessions: [] };

const state = {
  subjectId: subjects[0]?.id || "law",
  categoryId: "all",
  mode: "due",
  index: 0,
  selected: new Set(),
  order: [],
  progress: {},
  timer: defaultTimer,
  syncQueue: [],
};

const els = {
  subjectTabs: document.querySelector("#subjectTabs"),
  categoryTabs: document.querySelector("#categoryTabs"),
  sourceMeta: document.querySelector("#sourceMeta"),
  chapterProgress: document.querySelector("#chapterProgress"),
  totalCount: document.querySelector("#totalCount"),
  correctCount: document.querySelector("#correctCount"),
  wrongCount: document.querySelector("#wrongCount"),
  timerDisplay: document.querySelector("#timerDisplay"),
  timerStartBtn: document.querySelector("#timerStartBtn"),
  timerEndBtn: document.querySelector("#timerEndBtn"),
  timerLog: document.querySelector("#timerLog"),
  progressLabel: document.querySelector("#progressLabel"),
  questionText: document.querySelector("#questionText"),
  choices: document.querySelector("#choices"),
  answerBox: document.querySelector("#answerBox"),
  showAnswerBtn: document.querySelector("#showAnswerBtn"),
  explanationBtn: document.querySelector("#explanationBtn"),
  explanationBox: document.querySelector("#explanationBox"),
  markWrongBtn: document.querySelector("#markWrongBtn"),
  markCorrectBtn: document.querySelector("#markCorrectBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  shuffleBtn: document.querySelector("#shuffleBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  questionList: document.querySelector("#questionList"),
  listTitle: document.querySelector("#listTitle"),
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise = openDatabase().catch(() => null);

async function idbGet(key, fallback) {
  const db = await dbPromise;
  if (!db) return fallback;
  return new Promise((resolve) => {
    const tx = db.transaction("kv", "readonly");
    const request = tx.objectStore("kv").get(key);
    request.onsuccess = () => resolve(request.result ?? fallback);
    request.onerror = () => resolve(fallback);
  });
}

async function idbSet(key, value) {
  const db = await dbPromise;
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function readLocalJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

async function loadState() {
  const legacyProgress = readLocalJSON(STORAGE_KEY, {});
  const legacyTimer = readLocalJSON(TIMER_STORAGE_KEY, defaultTimer);
  state.progress = await idbGet("progress", legacyProgress);
  state.timer = await idbGet("timer", legacyTimer);
  state.syncQueue = await idbGet("syncQueue", []);
  await Promise.all([save(), saveTimer(), saveSyncQueue()]);
}

function currentSubject() {
  return subjects.find((subject) => subject.id === state.subjectId) || subjects[0];
}

function questionsForSubject() {
  return currentSubject()?.questions || [];
}

function categoryOf(question) {
  const subject = currentSubject();
  const source = `${question.stem || ""} ${question.explanation || ""}`;

  if (subject.id === "law") {
    if (question.trueFalse || ["T", "F"].includes(String(question.answer || "").trim())) return "T/F";
    if (source.includes("마약류")) return "마약류";
    if (source.includes("약사법")) return "약사법";
    return "나머지";
  }

  if (subject.id === "clinical" && source.includes("(심화)")) {
    const deepChapter = source.match(/Ch\.\s*(\d+)/i);
    if (deepChapter) return `Ch.${deepChapter[1]}(심화)`;
  }

  const chapter = source.match(/Ch\.\s*(\d+)/i) || source.match(/\(Ch\.\s*(\d+)/i);
  if (chapter) return `Ch.${chapter[1]}`;

  if (subject.id === "pharmacopeia") return "나머지";

  return subject.label;
}

function categoriesForSubject() {
  const subject = currentSubject();
  const preferred = {
    law: ["약사법", "마약류", "T/F", "나머지"],
    pharmacopeia: ["Ch.5", "Ch.6", "Ch.7", "Ch.8", "Ch.9", "Ch.10", "나머지"],
    clinical: ["Ch.48", "Ch.49", "Ch.52", "Ch.53", "Ch.48(심화)", "Ch.49(심화)", "Ch.52(심화)", "Ch.53(심화)"],
  };
  const found = [...new Set(questionsForSubject().map(categoryOf))];
  const ordered = preferred[subject.id] || [];
  const extras = found.filter((category) => !ordered.includes(category)).sort();
  return ["all", ...ordered, ...extras];
}

function questionsForCategory() {
  const questions = questionsForSubject();
  if (state.categoryId === "all") return questions;
  return questions.filter((question) => categoryOf(question) === state.categoryId);
}

async function save() {
  await idbSet("progress", state.progress);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

async function saveTimer() {
  await idbSet("timer", state.timer);
  localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state.timer));
}

async function saveSyncQueue() {
  await idbSet("syncQueue", state.syncQueue);
}

function statusOf(question) {
  return state.progress[question.id]?.status || "new";
}

function chapterOf(question) {
  const category = categoryOf(question);
  if (category !== currentSubject().label) return category;
  const source = `${question.stem || ""} ${question.explanation || ""}`;
  const chapter = source.match(/Ch\.\s*\d+/i);
  if (chapter) return chapter[0].replace(/\s+/g, "");
  const section = source.match(/\[제[^\]]+\]/);
  if (section) return section[0].replace(/^\[|\]$/g, "");
  return currentSubject().label;
}

function filteredQuestions() {
  const questions = questionsForCategory();
  if (state.mode === "wrong") return questions.filter((q) => statusOf(q) === "wrong");
  if (state.mode === "correct") return questions.filter((q) => statusOf(q) === "correct");
  if (state.mode === "due") return questions.filter((q) => statusOf(q) === "new");
  return questions;
}

function rebuildOrder(keepCurrent = false) {
  const current = currentQuestion();
  const pool = filteredQuestions();
  state.order = pool.map((q) => q.id);
  if (keepCurrent && current) {
    const idx = state.order.indexOf(current.id);
    state.index = idx >= 0 ? idx : 0;
  } else {
    state.index = 0;
  }
}

function currentQuestion() {
  const id = state.order[state.index];
  return questionsForCategory().find((q) => q.id === id);
}

function shuffle() {
  for (let i = state.order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
  }
  state.index = 0;
  render();
}

function isAutoGradable(question) {
  return question.correctLabels.length > 0 || question.trueFalse;
}

function selectedAnswer() {
  return [...state.selected].sort().join(",");
}

function correctAnswer(question) {
  if (question.trueFalse) return question.trueFalse;
  return [...question.correctLabels].sort().join(",");
}

function gradeSelected(question) {
  if (!isAutoGradable(question)) return null;
  return selectedAnswer() === correctAnswer(question);
}

async function queueProgressSync(question, status) {
  state.syncQueue.push({
    type: "progress",
    questionId: question.id,
    subjectId: state.subjectId,
    chapter: chapterOf(question),
    status,
    answeredAt: state.progress[question.id].answeredAt,
  });
  state.syncQueue = state.syncQueue.slice(-500);
  await saveSyncQueue();
  if ("serviceWorker" in navigator && "SyncManager" in window && location.protocol !== "file:") {
    navigator.serviceWorker.ready
      .then((registration) => registration.sync.register("quiz-progress-sync"))
      .catch(() => {});
  }
}

async function mark(question, status) {
  const previousIndex = state.index;
  state.progress[question.id] = {
    status,
    subjectId: state.subjectId,
    chapter: chapterOf(question),
    answeredAt: new Date().toISOString(),
  };
  await save();
  await queueProgressSync(question, status);
  rebuildOrder();
  if (state.order.length) {
    const remainingIndex = state.order.indexOf(question.id);
    state.index = remainingIndex >= 0 ? (remainingIndex + 1) % state.order.length : Math.min(previousIndex, state.order.length - 1);
  }
  render();
}

async function reveal(autoMark = false) {
  const question = currentQuestion();
  if (!question) return;
  els.answerBox.classList.remove("hidden");
  paintChoiceResults(question);
  if (autoMark) {
    const result = gradeSelected(question);
    if (result !== null) {
      state.progress[question.id] = {
        status: result ? "correct" : "wrong",
        subjectId: state.subjectId,
        chapter: chapterOf(question),
        answeredAt: new Date().toISOString(),
      };
      await save();
      await queueProgressSync(question, state.progress[question.id].status);
      renderStats();
      renderChapterProgress();
      renderList();
    }
  }
}

function paintChoiceResults(question) {
  document.querySelectorAll(".choice").forEach((button) => {
    const label = button.dataset.label;
    button.classList.toggle("correct", question.correctLabels.includes(label) || question.trueFalse === label);
    button.classList.toggle("wrong", state.selected.has(label) && !button.classList.contains("correct"));
  });
}

function selectChoice(label) {
  const question = currentQuestion();
  if (!question) return;
  if (question.correctLabels.length > 1) {
    if (state.selected.has(label)) state.selected.delete(label);
    else state.selected.add(label);
  } else {
    state.selected = new Set([label]);
  }
  renderQuestion(question);
  if (question.correctLabels.length <= 1) {
    els.answerBox.classList.remove("hidden");
    paintChoiceResults(question);
  }
}

function renderChoice(label, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice";
  button.dataset.label = label;
  button.innerHTML = `<strong>${label}</strong><span>${escapeHtml(text)}</span>`;
  button.classList.toggle("selected", state.selected.has(label));
  button.addEventListener("click", () => selectChoice(label));
  return button;
}

function renderQuestion(question) {
  els.answerBox.classList.add("hidden");
  els.explanationBox.classList.add("hidden");
  els.questionText.innerHTML = formatStem(question.stem || "문제를 표시할 수 없습니다.");
  els.choices.innerHTML = "";

  if (question.choices.length) {
    question.choices.forEach((choice) => {
      els.choices.appendChild(renderChoice(choice.label, choice.text));
    });
  } else if (question.trueFalse) {
    els.choices.appendChild(renderChoice("T", "맞음"));
    els.choices.appendChild(renderChoice("F", "틀림"));
  } else {
    const note = document.createElement("p");
    note.textContent = "이 문항은 자동 선택지가 없어 정답 확인 후 직접 맞힘/틀림을 눌러주세요.";
    els.choices.appendChild(note);
  }

  els.answerBox.textContent = `정답: ${question.answer}`;
  els.explanationBox.textContent = question.explanation || "해설 없음";
  els.progressLabel.textContent = `${state.index + 1} / ${state.order.length} · ${question.page ? `${question.page}쪽` : chapterOf(question)}`;
}

function formatStem(stem) {
  const markerPattern = /\s+([ㄱ-ㅎ])\.\s+/g;
  const markers = [...stem.matchAll(markerPattern)];
  if (!markers.length) return escapeHtml(stem);

  const title = stem.slice(0, markers[0].index).trim();
  const items = markers.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < markers.length ? markers[index + 1].index : stem.length;
    return {
      label: match[1],
      text: stem.slice(start, end).trim(),
    };
  });

  return `
    <div class="prompt-title">${escapeHtml(title)}</div>
    <div class="stem-box">
      <strong>&lt;보기&gt;</strong>
      ${items
        .map(
          (item) => `
            <div class="stem-item">
              <span>${escapeHtml(item.label)}.</span>
              <p>${escapeHtml(item.text)}</p>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStats() {
  const subject = currentSubject();
  const questions = questionsForCategory();
  const correct = questions.filter((q) => statusOf(q) === "correct").length;
  const wrong = questions.filter((q) => statusOf(q) === "wrong").length;
  const categoryLabel = state.categoryId === "all" ? "전체" : state.categoryId;
  els.sourceMeta.textContent = `${subject.label} · ${categoryLabel} · ${questions.length}문항`;
  els.totalCount.textContent = questions.length;
  els.correctCount.textContent = correct;
  els.wrongCount.textContent = wrong;
}

function renderChapterProgress() {
  const byChapter = new Map();
  questionsForCategory().forEach((question) => {
    const chapter = chapterOf(question);
    const entry = byChapter.get(chapter) || { total: 0, done: 0, wrong: 0 };
    const status = statusOf(question);
    entry.total += 1;
    if (status !== "new") entry.done += 1;
    if (status === "wrong") entry.wrong += 1;
    byChapter.set(chapter, entry);
  });

  els.chapterProgress.innerHTML = "";
  [...byChapter.entries()].slice(0, 12).forEach(([chapter, entry]) => {
    const item = document.createElement("span");
    item.textContent = `${chapter} ${entry.done}/${entry.total}${entry.wrong ? ` · 오답 ${entry.wrong}` : ""}`;
    els.chapterProgress.appendChild(item);
  });
}

function renderList() {
  const titles = { due: "풀 문제", wrong: "틀린 문제", correct: "맞힌 문제", all: "전체 문제" };
  els.listTitle.textContent = titles[state.mode];
  els.questionList.innerHTML = "";
  const pool = filteredQuestions();
  if (!pool.length) {
    els.questionList.textContent = "이 묶음에 남은 문제가 없습니다.";
    return;
  }
  pool.forEach((question) => {
    const button = document.createElement("button");
    const status = statusOf(question);
    button.type = "button";
    button.className = "list-item";
    button.innerHTML = `<span class="badge ${status}">${statusLabel(status)}</span><span>${escapeHtml(question.stem)}</span><small>${escapeHtml(chapterOf(question))}</small>`;
    button.addEventListener("click", () => {
      const idx = state.order.indexOf(question.id);
      state.index = idx >= 0 ? idx : 0;
      state.selected = new Set();
      render();
    });
    els.questionList.appendChild(button);
  });
}

function statusLabel(status) {
  if (status === "correct") return "맞힘";
  if (status === "wrong") return "오답";
  return "미풀이";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSubjectTabs() {
  els.subjectTabs.innerHTML = "";
  subjects.forEach((subject) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${subject.label} ${subject.questions.length}`;
    button.classList.toggle("active", subject.id === state.subjectId);
    button.addEventListener("click", () => {
      state.subjectId = subject.id;
      state.categoryId = "all";
      state.index = 0;
      state.selected = new Set();
      rebuildOrder();
      render();
    });
    els.subjectTabs.appendChild(button);
  });
}

function renderCategoryTabs() {
  els.categoryTabs.innerHTML = "";
  categoriesForSubject().forEach((category) => {
    const questions = category === "all" ? questionsForSubject() : questionsForSubject().filter((question) => categoryOf(question) === category);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${category === "all" ? "전체" : category} ${questions.length}`;
    button.classList.toggle("active", category === state.categoryId);
    button.addEventListener("click", () => {
      state.categoryId = category;
      state.index = 0;
      state.selected = new Set();
      rebuildOrder();
      render();
    });
    els.categoryTabs.appendChild(button);
  });
}

function render() {
  if (!state.order.length) rebuildOrder();
  renderSubjectTabs();
  renderCategoryTabs();
  renderStats();
  renderChapterProgress();
  const question = currentQuestion();
  state.selected = new Set();
  if (question) renderQuestion(question);
  else {
    els.questionText.textContent = "문제가 없습니다.";
    els.choices.innerHTML = "";
    els.answerBox.classList.add("hidden");
    els.explanationBox.classList.add("hidden");
    els.progressLabel.textContent = "-";
  }
  renderList();
  document.querySelectorAll(".tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderTimer() {
  const activeStart = state.timer.activeStart ? new Date(state.timer.activeStart).getTime() : null;
  const elapsed = activeStart ? Date.now() - activeStart : 0;
  els.timerDisplay.textContent = formatDuration(elapsed);
  els.timerStartBtn.disabled = Boolean(activeStart);
  els.timerEndBtn.disabled = !activeStart;

  const lastSession = state.timer.sessions[state.timer.sessions.length - 1];
  if (activeStart) {
    els.timerLog.textContent = `${formatTime(state.timer.activeStart)}에 공부 시작`;
  } else if (lastSession) {
    els.timerLog.textContent = `최근 기록: ${formatTime(lastSession.start)} - ${formatTime(lastSession.end)} · ${formatDuration(lastSession.durationMs)}`;
  } else {
    els.timerLog.textContent = "아직 기록된 공부 시간이 없습니다.";
  }
}

async function startTimer() {
  if (state.timer.activeStart) return;
  state.timer.activeStart = new Date().toISOString();
  await saveTimer();
  renderTimer();
}

async function endTimer() {
  if (!state.timer.activeStart) return;
  const end = new Date();
  const start = new Date(state.timer.activeStart);
  state.timer.sessions.push({
    start: state.timer.activeStart,
    end: end.toISOString(),
    durationMs: end.getTime() - start.getTime(),
  });
  state.timer.sessions = state.timer.sessions.slice(-20);
  state.timer.activeStart = null;
  await saveTimer();
  renderTimer();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    rebuildOrder();
    render();
  });
});

els.showAnswerBtn.addEventListener("click", () => reveal(true));
els.explanationBtn.addEventListener("click", () => {
  const question = currentQuestion();
  if (!question) return;
  els.explanationBox.classList.toggle("hidden");
});
els.markWrongBtn.addEventListener("click", () => {
  const question = currentQuestion();
  if (question) mark(question, "wrong");
});
els.markCorrectBtn.addEventListener("click", () => {
  const question = currentQuestion();
  if (question) mark(question, "correct");
});
els.nextBtn.addEventListener("click", () => {
  rebuildOrder(true);
  state.index = state.order.length ? (state.index + 1) % state.order.length : 0;
  state.selected = new Set();
  render();
});
els.shuffleBtn.addEventListener("click", shuffle);
els.resetBtn.addEventListener("click", async () => {
  const subject = currentSubject();
  const categoryLabel = state.categoryId === "all" ? "전체" : state.categoryId;
  const scopedQuestions = questionsForCategory();
  if (!confirm(`${subject.label} ${categoryLabel}의 풀이 기록만 지울까요?`)) return;
  const resetIds = new Set(scopedQuestions.map((question) => question.id));
  state.progress = Object.fromEntries(
    Object.entries(state.progress).filter(([questionId]) => !resetIds.has(questionId))
  );
  state.syncQueue = state.syncQueue.filter((item) => !resetIds.has(item.questionId));
  await Promise.all([save(), saveSyncQueue()]);
  rebuildOrder();
  render();
});
els.timerStartBtn.addEventListener("click", startTimer);
els.timerEndBtn.addEventListener("click", endTimer);

loadState().then(() => {
  rebuildOrder();
  render();
  renderTimer();
  registerServiceWorker();
  setInterval(renderTimer, 1000);
});
