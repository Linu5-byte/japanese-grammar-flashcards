(() => {
  "use strict";

  const STORAGE_KEY = "jp-grammar-srs-v1";
  const THEME_KEY = "jp-grammar-theme";
  // box -> days until next review after a "Good" grade
  const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 14, 30, 60];

  const el = (id) => document.getElementById(id);
  const $card = el("card");
  const $cardInner = el("card-inner");
  const $frontTag = el("front-tag");
  const $frontText = el("front-text");
  const $backTag = el("back-tag");
  const $backText = el("back-text");
  const $revealRow = el("reveal-row");
  const $revealBtn = el("reveal-btn");
  const $gradeRow = el("grade-row");
  const $progressFill = el("progress-fill");
  const $emptyState = el("empty-state");
  const $cardWrap = el("card-wrap");
  const $statDue = el("stat-due");
  const $statNew = el("stat-new");
  const $statMastered = el("stat-mastered");
  const $tagToggle = el("tag-toggle");
  const $tagToggleLabel = el("tag-toggle-label");
  const $tagPanel = el("tag-panel");
  const $resetBtn = el("reset-progress");
  const $themeToggle = el("theme-toggle");

  let CARDS = [];
  let progress = loadProgress();
  let activeTags = new Set(); // empty = all
  let mode = "due"; // "due" | "all"
  let queue = [];
  let queuePos = 0;
  let sessionTotal = 0;
  let isFlipped = false;

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {}
  }

  function cardState(id) {
    return progress[id] || { box: 0, due: 0 };
  }

  function today() {
    return Math.floor(Date.now() / 86400000);
  }

  function init() {
    fetch("cards.json")
      .then((r) => r.json())
      .then((data) => {
        CARDS = data.map((c, i) => ({ ...c, id: String(i) }));
        buildTagPanel();
        applyTheme(localStorage.getItem(THEME_KEY) || "auto");
        startSession();
      })
      .catch((err) => {
        $frontText.textContent = "Couldn't load cards.json — " + err.message;
      });
  }

  function buildTagPanel() {
    const tags = [...new Set(CARDS.map((c) => c.tag))].sort((a, b) =>
      a.localeCompare(b, "ja")
    );
    $tagPanel.innerHTML = "";
    tags.forEach((tag) => {
      const btn = document.createElement("button");
      btn.className = "tag-chip";
      btn.textContent = tag.replace(/_/g, " / ");
      btn.dataset.tag = tag;
      btn.addEventListener("click", () => {
        if (activeTags.has(tag)) activeTags.delete(tag);
        else activeTags.add(tag);
        btn.classList.toggle("active");
        updateTagLabel();
        startSession();
      });
      $tagPanel.appendChild(btn);
    });
  }

  function updateTagLabel() {
    $tagToggleLabel.textContent =
      activeTags.size === 0 ? "All topics" : `${activeTags.size} topic${activeTags.size > 1 ? "s" : ""}`;
  }

  function pool() {
    return activeTags.size === 0
      ? CARDS
      : CARDS.filter((c) => activeTags.has(c.tag));
    }

  function startSession() {
    const p = pool();
    const t = today();
    let list;
    if (mode === "due") {
      list = p.filter((c) => cardState(c.id).due <= t);
      // new cards (box 0, never studied) first, then reviews, both shuffled within group
      const brandNew = shuffle(list.filter((c) => !progress[c.id]));
      const reviews = shuffle(list.filter((c) => progress[c.id]));
      queue = [...brandNew, ...reviews];
    } else {
      queue = shuffle(p);
    }
    queuePos = 0;
    sessionTotal = queue.length;
    isFlipped = false;
    updateStats();
    render();
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function updateStats() {
    const t = today();
    const p = pool();
    const due = p.filter((c) => cardState(c.id).due <= t).length;
    const brandNew = p.filter((c) => !progress[c.id]).length;
    const mastered = p.filter((c) => cardState(c.id).box >= 4).length;
    $statDue.textContent = due;
    $statNew.textContent = brandNew;
    $statMastered.textContent = mastered;
  }

  function currentCard() {
    return queue[queuePos];
  }

  function render() {
    const c = currentCard();
    $card.classList.remove("flipped");
    isFlipped = false;
    $gradeRow.hidden = true;
    $revealRow.hidden = false;

    if (!c) {
      $cardWrap.querySelector(".card").style.display = "none";
      $emptyState.hidden = false;
      $revealRow.hidden = true;
      $progressFill.style.width = "100%";
      return;
    }
    $cardWrap.querySelector(".card").style.display = "";
    $emptyState.hidden = true;

    $frontTag.textContent = c.tag.replace(/_/g, " / ");
    $frontText.innerHTML = c.front;
    $backTag.textContent = c.tag.replace(/_/g, " / ");
    $backText.innerHTML = c.back;

    const done = sessionTotal - queue.length;
    const pct = sessionTotal ? Math.round((done / sessionTotal) * 100) : 0;
    $progressFill.style.width = pct + "%";
  }

  function flip() {
    if (!currentCard()) return;
    isFlipped = !isFlipped;
    $card.classList.toggle("flipped", isFlipped);
    $revealRow.hidden = isFlipped;
    $gradeRow.hidden = !isFlipped;
  }

  function grade(g) {
    const c = currentCard();
    if (!c) return;
    const st = cardState(c.id);
    let box = st.box;
    let dueOffset;

    if (g === 0) { // Again
      box = 0;
      dueOffset = 0;
    } else if (g === 1) { // Hard
      box = Math.max(0, box - 1);
      dueOffset = BOX_INTERVALS_DAYS[box] || 1;
    } else if (g === 2) { // Good
      box = Math.min(BOX_INTERVALS_DAYS.length - 1, box + 1);
      dueOffset = BOX_INTERVALS_DAYS[box];
    } else { // Easy
      box = Math.min(BOX_INTERVALS_DAYS.length - 1, box + 2);
      dueOffset = BOX_INTERVALS_DAYS[box];
    }

    progress[c.id] = { box, due: today() + dueOffset };
    saveProgress();

    // "Again" cards get requeued a few cards later in this session
    queue.splice(queuePos, 1);
    if (g === 0) {
      const reinsertAt = Math.min(queue.length, queuePos + 3);
      queue.splice(reinsertAt, 0, c);
      sessionTotal += 1; // count the requeue so the progress bar stays accurate
    }

    updateStats();
    render();
  }

  function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === "light") root.setAttribute("data-theme", "light");
    else if (mode === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    localStorage.setItem(THEME_KEY, mode);
  }

  // Events
  $card.addEventListener("click", flip);
  $revealBtn.addEventListener("click", flip);
  $gradeRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".grade-btn");
    if (btn) grade(Number(btn.dataset.grade));
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.mode;
      startSession();
    });
  });

  $tagToggle.addEventListener("click", () => {
    $tagPanel.hidden = !$tagPanel.hidden;
  });

  $resetBtn.addEventListener("click", () => {
    if (confirm("Reset all study progress on this device? This can't be undone.")) {
      progress = {};
      saveProgress();
      startSession();
    }
  });

  $themeToggle.addEventListener("click", () => {
    const current = localStorage.getItem(THEME_KEY) || "auto";
    const next = current === "dark" ? "light" : current === "light" ? "auto" : "dark";
    applyTheme(next);
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.code === "Space") {
      e.preventDefault();
      flip();
    } else if (["1", "2", "3", "4"].includes(e.key) && isFlipped) {
      grade(Number(e.key) - 1);
    }
  });

  init();
})();
