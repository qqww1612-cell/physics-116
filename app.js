/* =========================================================
   فيزياء المسارات — المنطق
   ========================================================= */

(function () {
  "use strict";

  const els = {
    bookTabs: document.getElementById("bookTabs"),
    bookInfo: document.getElementById("bookInfo"),
    chapters: document.getElementById("chapters"),
    search: document.getElementById("searchInput"),
    clearSearch: document.getElementById("clearSearch"),
    resultInfo: document.getElementById("resultInfo"),
    empty: document.getElementById("emptyState"),
    fontInc: document.getElementById("fontInc"),
    fontDec: document.getElementById("fontDec"),
    fontValue: document.getElementById("fontValue"),
    themeToggle: document.getElementById("themeToggle"),
    toTop: document.getElementById("toTop"),
    modal: document.getElementById("modal"),
    modalChapter: document.getElementById("modalChapter"),
    modalLesson: document.getElementById("modalLesson"),
    modalTitle: document.getElementById("modalTitle"),
    modalSummary: document.getElementById("modalSummary"),
    modalConcepts: document.getElementById("modalConcepts"),
    modalFormulas: document.getElementById("modalFormulas"),
    modalExample: document.getElementById("modalExample"),
    modalTip: document.getElementById("modalTip"),
  };

  const SCALES = [0.85, 1, 1.15, 1.3, 1.5];

  const state = {
    bookId: "p1",
    query: "",
    openChapters: new Set(),
    done: loadSet("physics:done"),
    scaleIndex: loadScale(),
  };

  /* ---------- أدوات التخزين ---------- */
  function loadSet(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (_) {
      return new Set();
    }
  }

  function saveSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch (_) {}
  }

  function loadScale() {
    let idx = 1;
    try {
      const raw = localStorage.getItem("physics:scale");
      const parsed = raw === null ? NaN : parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed < SCALES.length) idx = parsed;
    } catch (_) {}
    return idx;
  }

  /* ---------- حجم الخط ---------- */
  function applyScale() {
    const val = SCALES[state.scaleIndex];
    document.documentElement.style.setProperty("--fs", val);
    els.fontValue.textContent = Math.round(val * 100) + "٪";
    els.fontDec.disabled = state.scaleIndex === 0;
    els.fontInc.disabled = state.scaleIndex === SCALES.length - 1;
    try { localStorage.setItem("physics:scale", String(state.scaleIndex)); } catch (_) {}
  }

  /* ---------- الثيم ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("physics:theme", theme); } catch (_) {}
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("physics:theme"); } catch (_) {}
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  /* ---------- أدوات نصية ---------- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalize(str) {
    return String(str)
      .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
      .replace(/[أإآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function currentBook() {
    return BOOKS.find((b) => b.id === state.bookId) || BOOKS[0];
  }

  function lessonKey(bookId, chapterNum, lessonNum) {
    return `${bookId}:${chapterNum}:${lessonNum}`;
  }

  /* ---------- شريط الكتب ---------- */
  function renderBookTabs() {
    els.bookTabs.innerHTML = "";
    BOOKS.forEach((book) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "book-tab" + (book.id === state.bookId ? " active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", book.id === state.bookId ? "true" : "false");
      const totalLessons = book.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0);
      btn.innerHTML = `
        <span>${escapeHtml(book.label)}</span>
        <span class="tab-sub">${escapeHtml(book.grade)} · ${totalLessons} درساً</span>`;
      btn.addEventListener("click", () => {
        state.bookId = book.id;
        state.query = "";
        els.search.value = "";
        state.openChapters.clear();
        renderBookTabs();
        renderBookInfo();
        render();
      });
      els.bookTabs.appendChild(btn);
    });
  }

  /* ---------- بطاقة الكتاب ---------- */
  function renderBookInfo() {
    const book = currentBook();
    els.bookInfo.innerHTML = `
      <div class="book-info-icon" aria-hidden="true">⚛</div>
      <div>
        <h3>كتاب ${escapeHtml(book.label)}</h3>
        <p>${escapeHtml(book.grade)} — ${escapeHtml(book.audience)}</p>
      </div>`;
  }

  /* ---------- التصفية ---------- */
  function matchesQuery(chapter, lesson, q) {
    if (!q) return true;
    const haystack = normalize(
      [
        chapter.title,
        chapter.desc,
        lesson.num,
        lesson.title,
        lesson.summary,
        lesson.tip || "",
        ...lesson.concepts.map((c) => `${c.t} ${c.d}`),
        ...lesson.formulas.map((f) => `${f.e} ${f.d}`),
        lesson.example ? `${lesson.example.q} ${lesson.example.steps.join(" ")} ${lesson.example.answer}` : "",
      ].join(" ")
    );
    return haystack.includes(q);
  }

  function getFiltered() {
    const book = currentBook();
    const q = normalize(state.query);
    const result = [];
    book.chapters.forEach((chapter) => {
      const lessons = chapter.lessons.filter((l) => matchesQuery(chapter, l, q));
      if (lessons.length) result.push({ chapter, lessons });
    });
    return result;
  }

  /* ---------- عرض الفصول ---------- */
  function render() {
    const list = getFiltered();
    const q = state.query.trim();
    els.chapters.innerHTML = "";

    list.forEach(({ chapter, lessons }) => {
      const isOpen = state.openChapters.has(chapter.num) || !!q;
      const doneCount = chapter.lessons.filter((l) => state.done.has(lessonKey(state.bookId, chapter.num, l.num))).length;

      const wrap = document.createElement("article");
      wrap.className = "chapter" + (isOpen ? " open" : "");

      const head = document.createElement("button");
      head.type = "button";
      head.className = "chapter-head";
      head.setAttribute("aria-expanded", isOpen ? "true" : "false");
      head.innerHTML = `
        <span class="chapter-num">${escapeHtml(chapter.num)}</span>
        <span class="chapter-title-wrap">
          <h3 class="chapter-title">${escapeHtml(chapter.title)}</h3>
          <p class="chapter-desc">${escapeHtml(chapter.desc)} — ${chapter.lessons.length} دروس</p>
        </span>
        <span class="chapter-progress">${doneCount}/${chapter.lessons.length} ✓</span>
        <svg class="chapter-chevron" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

      head.addEventListener("click", () => {
        if (state.openChapters.has(chapter.num)) state.openChapters.delete(chapter.num);
        else state.openChapters.add(chapter.num);
        wrap.classList.toggle("open");
        head.setAttribute("aria-expanded", wrap.classList.contains("open") ? "true" : "false");
      });

      const body = document.createElement("div");
      body.className = "chapter-body";

      const lessonsWrap = document.createElement("div");
      lessonsWrap.className = "lessons";

      lessons.forEach((lesson) => {
        const key = lessonKey(state.bookId, chapter.num, lesson.num);
        const isDone = state.done.has(key);

        const card = document.createElement("div");
        card.className = "lesson-card" + (isDone ? " is-done" : "");
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.innerHTML = `
          <span class="lesson-num">${escapeHtml(lesson.num)}</span>
          <span class="lesson-main">
            <h4 class="lesson-title">${escapeHtml(lesson.title)}</h4>
            <p class="lesson-preview">${escapeHtml(lesson.summary).slice(0, 90)}…</p>
          </span>
          <span class="lesson-meta">
            ${lesson.formulas.length ? `<span class="lesson-f-count">${lesson.formulas.length} قانون</span>` : ""}
            <button class="done-btn ${isDone ? "done" : ""}" data-done="${key}" title="${isDone ? "إلغاء الإنجاز" : "تحديد كمُنجَز"}" aria-label="إنجاز الدرس">
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path d="m5 13 4 4 10-11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </span>`;

        const open = () => openModal(chapter, lesson);
        card.addEventListener("click", (e) => {
          if (e.target.closest("[data-done]")) return;
          open();
        });
        card.addEventListener("keydown", (e) => {
          if ((e.key === "Enter" || e.key === " ") && !e.target.closest("[data-done]")) {
            e.preventDefault();
            open();
          }
        });
        card.querySelector("[data-done]").addEventListener("click", (e) => {
          e.stopPropagation();
          const btn = e.currentTarget;
          if (state.done.has(key)) state.done.delete(key);
          else state.done.add(key);
          saveSet("physics:done", state.done);
          btn.classList.toggle("done", state.done.has(key));
          card.classList.toggle("is-done", state.done.has(key));
          btn.title = state.done.has(key) ? "إلغاء الإنجاز" : "تحديد كمُنجَز";
          const doneNow = chapter.lessons.filter((l) => state.done.has(lessonKey(state.bookId, chapter.num, l.num))).length;
          const prog = wrap.querySelector(".chapter-progress");
          if (prog) prog.textContent = `${doneNow}/${chapter.lessons.length} ✓`;
        });

        lessonsWrap.appendChild(card);
      });

      body.appendChild(lessonsWrap);
      wrap.appendChild(head);
      wrap.appendChild(body);
      els.chapters.appendChild(wrap);
    });

    // شريط المعلومات
    const book = currentBook();
    const totalLessons = list.reduce((sum, item) => sum + item.lessons.length, 0);
    const allLessons = book.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0);
    let info = totalLessons === allLessons
      ? `${allLessons} درساً — ${book.chapters.length} فصول`
      : `${totalLessons} نتيجة من ${allLessons} درساً`;
    if (q) info += ` — البحث عن «${state.query.trim()}»`;
    els.resultInfo.textContent = info;

    els.empty.classList.toggle("hidden", list.length > 0);
    els.clearSearch.classList.toggle("hidden", !q);
  }

  /* ---------- النافذة ---------- */
  function openModal(chapter, lesson) {
    const book = currentBook();
    els.modalChapter.textContent = `${book.label} — الفصل ${chapter.num}: ${chapter.title}`;
    els.modalLesson.textContent = `الدرس ${lesson.num}`;
    els.modalTitle.textContent = lesson.title;
    els.modalSummary.textContent = lesson.summary;

    // المفاهيم
    els.modalConcepts.innerHTML = lesson.concepts.length
      ? `<h3>المفاهيم الأساسية</h3>` +
        lesson.concepts.map((c) => `<div class="concept"><b>${escapeHtml(c.t)}:</b><p>${escapeHtml(c.d)}</p></div>`).join("")
      : "";

    // القوانين
    els.modalFormulas.innerHTML = lesson.formulas.length
      ? `<h3>القوانين والمعادلات</h3>` +
        lesson.formulas
          .map((f) => `<div class="formula"><span class="formula-e">${f.e}</span><span class="formula-d">${escapeHtml(f.d)}</span></div>`)
          .join("")
      : "";

    // المثال المحلول
    if (lesson.example) {
      els.modalExample.innerHTML =
        `<h3>مثال محلول</h3>` +
        `<div class="example-q"><b>المسألة: </b>${escapeHtml(lesson.example.q)}</div>` +
        `<ol class="example-steps">${lesson.example.steps.map((s) => `<li>${s}</li>`).join("")}</ol>` +
        `<div class="example-answer"><b>الإجابة: </b>${escapeHtml(lesson.example.answer)}</div>`;
    } else {
      els.modalExample.innerHTML = "";
    }

    // التنبيه
    els.modalTip.innerHTML = lesson.tip ? `<b>تنبيه: </b>${escapeHtml(lesson.tip)}` : "";
    els.modalTip.style.display = lesson.tip ? "" : "none";

    els.modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    els.modal.querySelector(".modal-card").scrollTop = 0;
  }

  function closeModal() {
    els.modal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  /* ---------- الأحداث ---------- */
  els.modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.modal.classList.contains("hidden")) closeModal();
    if (e.key === "/" && document.activeElement !== els.search && els.modal.classList.contains("hidden")) {
      e.preventDefault();
      els.search.focus();
    }
  });

  els.search.addEventListener("input", (e) => {
    state.query = e.target.value;
    render();
  });

  els.clearSearch.addEventListener("click", () => {
    state.query = "";
    els.search.value = "";
    render();
    els.search.focus();
  });

  els.fontInc.addEventListener("click", () => {
    if (state.scaleIndex < SCALES.length - 1) {
      state.scaleIndex += 1;
      applyScale();
    }
  });

  els.fontDec.addEventListener("click", () => {
    if (state.scaleIndex > 0) {
      state.scaleIndex -= 1;
      applyScale();
    }
  });

  els.themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  window.addEventListener("scroll", () => {
    els.toTop.classList.toggle("show", window.scrollY > 500);
  }, { passive: true });

  els.toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  /* ---------- التشغيل ---------- */
  initTheme();
  applyScale();
  renderBookTabs();
  renderBookInfo();
  render();
})();
