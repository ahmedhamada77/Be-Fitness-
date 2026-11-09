/* Be Healthy — app logic: language switch, exercise library, weekly plans, calorie calculator. */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bh." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("bh." + k, JSON.stringify(v)); } catch {} },
  };

  const MUSCLES = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core", "cardio", "full", "mobility"];
  const EQUIP = ["bodyweight", "dumbbell", "barbell", "machine", "cable", "band", "kettlebell"];
  const PAGE = 24;
  const byName = new Map(EXERCISES.map((e) => [e.name.en, e]));

  const state = {
    lang: store.get("lang", (navigator.language || "en").startsWith("ar") ? "ar" : "en"),
    level: "all",
    muscle: "all",
    equip: "all",
    query: "",
    shown: PAGE,
    plan: store.get("plan", "beginner"),
    done: store.get("done", { beginner: [], advanced: [] }),
  };

  const t = (key, vars) => {
    let s = (I18N[state.lang] && I18N[state.lang][key]) ?? I18N.en[key] ?? key;
    if (vars) for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
    return s;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Math.round(n).toLocaleString(state.lang === "ar" ? "ar-EG" : "en-US");

  // "3×30s" → "3×30 ث" in Arabic; minutes and meters likewise.
  const rx = (v) => v.replace(/(\d)(min|s|m)\b/g, (_, d, u) => d + t("unit." + u));

  const videoUrl = (e) =>
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(state.lang === "ar" ? `طريقة أداء تمرين ${e.name.ar} ${e.name.en}` : `how to do ${e.name.en} exercise proper form`);

  /* ---------------- Language ---------------- */
  function applyLang() {
    const html = document.documentElement;
    html.lang = state.lang;
    html.dir = state.lang === "ar" ? "rtl" : "ltr";
    $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
    $("#langBtn").textContent = state.lang === "ar" ? "English" : "العربية";
    document.title = state.lang === "ar"
      ? "Be Healthy — تمارين الجيم والخطط الأسبوعية وحاسبة السعرات"
      : "Be Healthy — Gym exercises, weekly plans & calorie calculator";
    renderFilters();
    renderExercises();
    renderPlan();
    if (lastCalc) showCalc(lastCalc);
  }

  $("#langBtn").addEventListener("click", () => {
    state.lang = state.lang === "ar" ? "en" : "ar";
    store.set("lang", state.lang);
    applyLang();
    if (modal.open && modal.dataset.id) openExercise(+modal.dataset.id);
  });

  // Mobile menu
  const menuBtn = $("#menuBtn");
  menuBtn.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  $$("#nav a").forEach((a) => a.addEventListener("click", () => document.body.classList.remove("menu-open")));

  /* ---------------- Exercise library ---------------- */
  function renderFilters() {
    const counts = {};
    EXERCISES.forEach((e) => {
      if (state.level !== "all" && e.level !== state.level) return;
      counts[e.muscle] = (counts[e.muscle] || 0) + 1;
    });
    $("#muscleChips").innerHTML = ["all", ...MUSCLES]
      .map((m) => `<button type="button" class="chip m-${m}${state.muscle === m ? " active" : ""}" data-muscle="${m}">
        ${esc(t("muscle." + m))}${m !== "all" ? `<span>${counts[m] || 0}</span>` : ""}</button>`)
      .join("");
    $("#equipSelect").innerHTML = ["all", ...EQUIP]
      .map((q) => `<option value="${q}"${state.equip === q ? " selected" : ""}>${esc(t("equip." + q))}</option>`)
      .join("");
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return EXERCISES.filter((e) =>
      (state.level === "all" || e.level === state.level) &&
      (state.muscle === "all" || e.muscle === state.muscle) &&
      (state.equip === "all" || e.equipment === state.equip) &&
      (!q || e.name.en.toLowerCase().includes(q) || e.name.ar.includes(q) ||
        t("muscle." + e.muscle).toLowerCase().includes(q)));
  }

  function card(e) {
    const L = state.lang;
    return `<article class="ex-card m-${e.muscle}">
      <div class="ex-top">
        <span class="ex-num">#${String(e.id).padStart(3, "0")}</span>
        <span class="badge lvl-${e.level}">${esc(t("level." + e.level))}</span>
      </div>
      <p class="ex-muscle"><i></i>${esc(t("muscle." + e.muscle))} · ${esc(t("equip." + e.equipment))}</p>
      <h3>${esc(e.name[L])}</h3>
      <p class="ex-alt">${esc(e.name[L === "ar" ? "en" : "ar"])}</p>
      <p class="ex-cue">${esc(e.cue[L])}</p>
      <div class="ex-foot">
        <span class="ex-rx" dir="ltr">${esc(rx(e.rx))}</span>
        <div class="ex-actions">
          <a class="icon-btn" href="${videoUrl(e)}" target="_blank" rel="noopener" aria-label="${esc(t("ex.video"))}" title="${esc(t("ex.video"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></a>
          <button type="button" class="btn btn-small" data-open="${e.id}">${esc(t("ex.how"))}</button>
        </div>
      </div>
    </article>`;
  }

  function renderExercises() {
    const list = filtered();
    $("#resultCount").textContent = t("ex.count", { n: list.length });
    $("#exGrid").innerHTML = list.length
      ? list.slice(0, state.shown).map(card).join("")
      : `<p class="empty">${esc(t("ex.none"))}</p>`;
    $("#loadMore").hidden = list.length <= state.shown;
  }

  function resetPaging() { state.shown = PAGE; }

  $("#levelTabs").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-level]");
    if (!b) return;
    state.level = b.dataset.level;
    $$("#levelTabs button").forEach((x) => x.classList.toggle("active", x === b));
    resetPaging(); renderFilters(); renderExercises();
  });
  $("#muscleChips").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-muscle]");
    if (!b) return;
    state.muscle = b.dataset.muscle;
    resetPaging(); renderFilters(); renderExercises();
  });
  $("#equipSelect").addEventListener("change", (ev) => { state.equip = ev.target.value; resetPaging(); renderExercises(); });
  $("#searchInput").addEventListener("input", (ev) => { state.query = ev.target.value; resetPaging(); renderExercises(); });
  $("#loadMore").addEventListener("click", () => { state.shown += PAGE; renderExercises(); });

  /* ---------------- Exercise modal ---------------- */
  const modal = $("#exModal");
  function openExercise(id) {
    const e = EXERCISES.find((x) => x.id === id);
    if (!e) return;
    const L = state.lang;
    const rest = e.muscle === "cardio" ? t("rest.cardio") : e.muscle === "mobility" ? t("rest.beginner") : t("rest." + e.level);
    const steps = [t("setup." + e.equipment), e.cue[L], t("step.tempo." + e.level), t("step.breath")];
    modal.dataset.id = id;
    $("#modalBody").innerHTML = `
      <div class="modal-head m-${e.muscle}">
        <p class="ex-muscle"><i></i>${esc(t("muscle." + e.muscle))} · ${esc(t("equip." + e.equipment))}
          <span class="badge lvl-${e.level}">${esc(t("level." + e.level))}</span></p>
        <h2>${esc(e.name[L])}</h2>
        <p class="ex-alt">${esc(e.name[L === "ar" ? "en" : "ar"])}</p>
      </div>
      <div class="modal-facts">
        <div><span>${esc(t("ex.rx"))}</span><b dir="ltr">${esc(rx(e.rx))}</b></div>
        <div><span>${esc(t("ex.rest"))}</span><b>${esc(rest)}</b></div>
      </div>
      <a class="video-cta" href="${videoUrl(e)}" target="_blank" rel="noopener">
        <span class="play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>
        <span><b>${esc(t("ex.video"))}</b><small>${esc(t("ex.videoNote"))}</small></span>
      </a>
      <h3>${esc(t("ex.steps"))}</h3>
      <ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      <div class="safety"><b>${esc(t("ex.safety"))}</b><p>${esc(t("safety." + e.muscle))}</p></div>`;
    if (!modal.open) modal.showModal();
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-open]");
    if (b) openExercise(+b.dataset.open);
  });
  $("#modalClose").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (ev) => { if (ev.target === modal) modal.close(); });

  /* ---------------- Weekly plans ---------------- */
  function renderPlan() {
    const plan = PLANS[state.plan];
    const done = state.done[state.plan] || [];
    $$("#planTabs button").forEach((b) => b.classList.toggle("active", b.dataset.plan === state.plan));
    $("#planGrid").innerHTML = plan.map((day, i) => {
      const isDone = done.includes(i);
      const items = day.list.map((n) => byName.get(n)).filter(Boolean);
      return `<article class="day-card${isDone ? " done" : ""}${items.length ? "" : " rest"}">
        <div class="day-head">
          <span class="day-num">${esc(t("plans.day", { n: i + 1 }))}</span>
          ${day.time ? `<span class="day-time">${esc(t("plans.min", { n: day.time }))}</span>` : ""}
        </div>
        <h3>${esc(day.title[state.lang])}</h3>
        ${items.length
          ? `<ul class="day-list">${items.map((e) => `<li><button type="button" data-open="${e.id}">
              <i class="dot m-${e.muscle}"></i><span>${esc(e.name[state.lang])}</span><em dir="ltr">${esc(rx(e.rx))}</em></button></li>`).join("")}</ul>`
          : `<p class="rest-text">${esc(t("plans.rest"))}</p>`}
        <button type="button" class="done-btn" data-day="${i}" aria-pressed="${isDone}">
          <span class="tick" aria-hidden="true">✓</span>${esc(isDone ? t("plans.done") : t("plans.markDone"))}
        </button>
      </article>`;
    }).join("");
    $("#progressText").textContent = `${done.length}/${plan.length}`;
    $("#progressBar").style.width = (done.length / plan.length) * 100 + "%";
  }

  $("#planTabs").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-plan]");
    if (!b) return;
    state.plan = b.dataset.plan;
    store.set("plan", state.plan);
    renderPlan();
  });
  $("#planGrid").addEventListener("click", (ev) => {
    const b = ev.target.closest(".done-btn");
    if (!b) return;
    const i = +b.dataset.day;
    const list = state.done[state.plan] || (state.done[state.plan] = []);
    const at = list.indexOf(i);
    at >= 0 ? list.splice(at, 1) : list.push(i);
    store.set("done", state.done);
    renderPlan();
  });
  $("#resetWeek").addEventListener("click", () => {
    state.done[state.plan] = [];
    store.set("done", state.done);
    renderPlan();
  });

  /* ---------------- Calorie calculator ---------------- */
  let lastCalc = null;
  const form = $("#calcForm");

  function calculate() {
    const f = new FormData(form);
    const age = +f.get("age"), h = +f.get("height"), w = +f.get("weight");
    const err = $("#calcError");
    if (!(age >= 14 && age <= 90 && h >= 120 && h <= 230 && w >= 35 && w <= 250)) {
      err.textContent = t("calc.error");
      err.hidden = false;
      return null;
    }
    err.hidden = true;
    const sex = f.get("sex"), act = +f.get("activity"), goal = f.get("goal");
    const bmr = 10 * w + 6.25 * h - 5 * age + (sex === "male" ? 5 : -161);
    const tdee = bmr * act;
    const target = Math.max(goal === "lose" ? tdee - 500 : goal === "gain" ? tdee + 300 : tdee, sex === "male" ? 1500 : 1200);
    const proteinPerKg = goal === "maintain" ? 1.6 : 2.0;
    const protein = w * proteinPerKg;
    const fat = (target * 0.25) / 9;
    const carbs = Math.max((target - protein * 4 - fat * 9) / 4, 0);
    const bmi = w / (h / 100) ** 2;
    return { bmr, tdee, target, protein, fat, carbs, bmi, water: w * 0.035 };
  }

  function showCalc(r) {
    lastCalc = r;
    const g = t("calc.g");
    $("#rTarget").textContent = fmt(r.target);
    $("#rBmr").textContent = fmt(r.bmr);
    $("#rTdee").textContent = fmt(r.tdee);
    $("#rBmi").textContent = r.bmi.toFixed(1);
    const cat = r.bmi < 18.5 ? "under" : r.bmi < 25 ? "normal" : r.bmi < 30 ? "over" : "obese";
    const catEl = $("#rBmiCat");
    catEl.textContent = t("bmi." + cat);
    catEl.className = "bmi-" + cat;
    $("#rWater").textContent = r.water.toFixed(1) + " " + t("calc.l");
    const kcal = { P: r.protein * 4, C: r.carbs * 4, F: r.fat * 9 };
    const total = kcal.P + kcal.C + kcal.F || 1;
    $("#mP").textContent = `${fmt(r.protein)} ${g}`;
    $("#mC").textContent = `${fmt(r.carbs)} ${g}`;
    $("#mF").textContent = `${fmt(r.fat)} ${g}`;
    $("#mPb").style.width = (kcal.P / total) * 100 + "%";
    $("#mCb").style.width = (kcal.C / total) * 100 + "%";
    $("#mFb").style.width = (kcal.F / total) * 100 + "%";
    $("#calcResult").classList.add("has-result");
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const r = calculate();
    if (r) {
      showCalc(r);
      if (window.innerWidth < 900) $("#calcResult").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  form.addEventListener("change", () => { const r = calculate(); if (r) showCalc(r); });

  /* ---------------- Init ---------------- */
  $("#statTotal").textContent = EXERCISES.length;
  applyLang();
  const first = calculate();
  if (first) showCalc(first);
})();
