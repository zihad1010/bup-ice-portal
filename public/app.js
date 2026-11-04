const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let appState = { notices: [], settings: {}, isAdmin: false, filter: "all", editingId: null };
let toastTimer;
const safeText = (value) => String(value ?? "");
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2800); }
function showModal(id) { $("#" + id).classList.remove("hidden"); document.body.style.overflow = "hidden"; }
function closeModal(id) { $("#" + id).classList.add("hidden"); if ($$(".modal:not(.hidden)").length === 0) document.body.style.overflow = ""; }
function prettyDate(value, withTime = false) {
  if (!value) return "Date not specified";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", withTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" } : { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(d);
}
function formatCreated(value) {
  if (!value) return "Recently published";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  return "Posted " + prettyDate(normalized, true);
}
function currentMonthLabel() { return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date()); }
const CT_SLOTS = 4;
const CT_SYLLABUS_MAX = 1500;
const CT_AUTO_MS = 6000;
let ctSig = "";
let ctRefs = [], ctDotEls = [], ctIndex = 0, ctAutoTimer = null, ctHold = 0, ctScrollTimer;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function getCts() {
  const s = appState.settings || {};
  let list = [];
  try {
    const parsed = JSON.parse(s.syllabus_text || "");
    if (parsed && parsed.v === 2 && Array.isArray(parsed.cts)) list = parsed.cts; else throw new Error("legacy");
  } catch {
    list = (s.ct_datetime || s.syllabus_title || s.syllabus_text) ? [{ title: s.syllabus_title || "", datetime: s.ct_datetime || "", syllabus: s.syllabus_text || "" }] : [];
  }
  return Array.from({ length: CT_SLOTS }, (_, i) => { const c = list[i] || {}; return { title: safeText(c.title), datetime: safeText(c.datetime), syllabus: safeText(c.syllabus) }; });
}
function ctSorted() {
  const now = Date.now();
  const rank = (c) => Number.isNaN(c.t) ? 2 : (c.t > now ? 0 : 1);
  return getCts().map((c, i) => ({ ...c, t: c.datetime ? new Date(c.datetime).getTime() : NaN, i }))
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? b.t - a.t : a.t - b.t) || a.i - b.i);
}
const ctSigOf = (cts) => cts.map((c) => `${c.title}|${c.datetime}|${c.t > Date.now() ? 1 : 0}`).join("~");
function openSyllabus(ct, i) {
  ct = ct || {};
  $("#sylTitle").textContent = ct.title || `CT ${i + 1}`;
  $("#sylDate").textContent = "CT date: " + (ct.datetime ? prettyDate(ct.datetime, true) : "Not scheduled");
  $("#sylBody").textContent = ct.syllabus || "Syllabus will be posted here soon.";
  showModal("sylModal");
}
function buildCtSlider() {
  const track = $("#ctSlider"), dots = $("#ctDots");
  track.innerHTML = ""; dots.innerHTML = ""; ctRefs = []; ctDotEls = [];
  for (let i = 0; i < CT_SLOTS; i++) {
    const slide = el("article", "ct-slide");
    slide.setAttribute("role", "group"); slide.setAttribute("aria-roledescription", "slide"); slide.setAttribute("aria-label", `CT ${i + 1} of ${CT_SLOTS}`);
    const card = el("div", "ct-card");
    const top = el("div", "ct-top"); const head = el("div", "ct-heading");
    const title = el("h2"); const meta = el("p", "ct-date");
    head.append(title, meta);
    const status = el("span", "pill"); status.hidden = true;
    top.append(head);
    const countdown = el("div", "countdown"); const nums = {};
    [["days", "Days"], ["hours", "Hours"], ["minutes", "Minutes"], ["seconds", "Seconds"]].forEach(([key, label]) => {
      const box = el("div"); const num = el("strong", "", "--"); box.append(num, el("span", "", label)); countdown.append(box); nums[key] = num;
    });
    const syllabusToggle = el("button", "ct-syllabus-toggle", "See syllabus");
    syllabusToggle.type = "button"; syllabusToggle.setAttribute("aria-haspopup", "dialog");
    const ref = { title, meta, status, nums, ct: null };
    syllabusToggle.addEventListener("click", () => openSyllabus(ref.ct, i));
    card.append(top, countdown, syllabusToggle); slide.append(card); track.append(slide);
    ctRefs.push(ref);
    const dot = el("button", "ct-dot"); dot.type = "button"; dot.setAttribute("aria-label", `Show CT ${i + 1}`);
    dot.addEventListener("click", () => { goToCt(i, true); startCtAuto(); });
    dots.append(dot); ctDotEls.push(dot);
  }
  updateCtDots();
}
function updateCtDots() { ctDotEls.forEach((d, i) => { d.classList.toggle("active", i === ctIndex); d.setAttribute("aria-current", i === ctIndex ? "true" : "false"); }); }
function goToCt(i, smooth = true) {
  const track = $("#ctSlider"); ctIndex = i; updateCtDots();
  track.scrollTo({ left: i * track.clientWidth, behavior: smooth && !reduceMotion.matches ? "smooth" : "auto" });
}
function startCtAuto() {
  clearInterval(ctAutoTimer);
  if (reduceMotion.matches) return;
  ctAutoTimer = setInterval(() => { if (ctHold === 0 && !document.hidden) goToCt((ctIndex + 1) % CT_SLOTS); }, CT_AUTO_MS);
}
function initCtSlider() {
  buildCtSlider();
  const track = $("#ctSlider"), wrap = $("#ctWrap");
  track.addEventListener("scroll", () => {
    clearTimeout(ctScrollTimer);
    ctScrollTimer = setTimeout(() => { ctIndex = Math.round(track.scrollLeft / track.clientWidth) || 0; updateCtDots(); }, 80);
  }, { passive: true });
  const hold = () => { ctHold++; }, release = () => { ctHold = Math.max(0, ctHold - 1); };
  wrap.addEventListener("mouseenter", hold); wrap.addEventListener("mouseleave", release);
  wrap.addEventListener("focusin", hold); wrap.addEventListener("focusout", release);
  wrap.addEventListener("touchstart", () => { clearInterval(ctAutoTimer); }, { passive: true });
  wrap.addEventListener("touchend", () => { startCtAuto(); }, { passive: true });
  window.addEventListener("resize", () => goToCt(ctIndex, false));
  reduceMotion.addEventListener("change", startCtAuto);
  startCtAuto();
}
function renderCountdown() {
  const cts = ctSorted(); ctSig = ctSigOf(cts);
  cts.forEach((ct, i) => {
    const r = ctRefs[i]; if (!r) return;
    r.title.textContent = ct.title || `CT ${i + 1}`;
    r.meta.textContent = "CT date: " + (ct.datetime ? prettyDate(ct.datetime, true) : "Not scheduled");
    r.ct = ct;
  });
  tickCountdown();
}
function tickCountdown() {
  const cts = ctSorted();
  if (ctSigOf(cts) !== ctSig) { renderCountdown(); return; }
  cts.forEach((ct, i) => {
    const r = ctRefs[i]; if (!r) return;
    const setAll = (v) => ["days", "hours", "minutes", "seconds"].forEach(k => r.nums[k].textContent = v);
    const target = ct.datetime ? new Date(ct.datetime).getTime() : NaN;
    if (Number.isNaN(target)) { r.status.textContent = "Schedule TBD"; setAll("--"); return; }
    const diff = target - Date.now();
    if (diff <= 0) { r.status.textContent = "Time reached"; setAll("00"); return; }
    r.status.textContent = "Counting down";
    const units = { days: 86400000, hours: 3600000, minutes: 60000, seconds: 1000 };
    let remaining = diff;
    for (const [key, unit] of Object.entries(units)) { const n = Math.floor(remaining / unit); r.nums[key].textContent = String(n).padStart(2, "0"); remaining -= n * unit; }
  });
}
function noticeCard(n) {
  const article = el("article", "notice-card" + (n.pinned ? " is-pinned" : "")); article.dataset.noticeId = n.id;
  const meta = el("div", "notice-meta"); meta.append(el("span", "category", n.category), el("span", "pinned", n.pinned ? "Pinned" : ""));
  const footer = el("div", "notice-footer"); footer.append(el("span", "", formatCreated(n.created_at)), el("span", "notice-date", n.relevant_date ? prettyDate(n.relevant_date) : ""));
  article.append(meta, el("h3", "", n.title), el("div", "notice-body", n.body), footer);
  return article;
}
function renderNotices() {
  const list = $("#noticeList"), filtered = appState.notices.filter(n => appState.filter === "all" || n.category === appState.filter);
  list.innerHTML = ""; $("#emptyState").classList.toggle("hidden", filtered.length > 0); list.classList.toggle("hidden", filtered.length === 0);
  filtered.forEach(n => list.append(noticeCard(n)));
  const pins = appState.notices.filter(n => n.pinned), pl = $("#pinnedList"); pl.innerHTML = "";
  pins.forEach(n => pl.append(noticeCard(n))); $("#pinnedEmpty").classList.toggle("hidden", pins.length > 0);
}
const CAT_ICON = { "Class": "i-book", "Assignment": "i-feed", "Quiz / CT": "i-clock", "Exam": "i-exam", "Other": "i-spark" };
function icon(id) { const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), u = document.createElementNS(ns, "use"); s.setAttribute("class", "ic"); s.setAttribute("aria-hidden", "true"); u.setAttribute("href", "#" + id); s.append(u); return s; }
function iconBtn(cls, label, id, fn) { const b = el("button", "mini-button ic-only " + cls); b.type = "button"; b.title = label; b.setAttribute("aria-label", label); b.append(icon(id)); b.addEventListener("click", fn); return b; }
function syncChips() { $$("#catChips .chip").forEach(c => c.classList.toggle("active", c.dataset.cat === $("#noticeCategory").value)); }
function buildChips() {
  const box = $("#catChips"); box.innerHTML = "";
  Object.keys(CAT_ICON).forEach(cat => { const b = el("button", "chip"); b.type = "button"; b.dataset.cat = cat; b.append(icon(CAT_ICON[cat]), document.createTextNode(cat)); b.addEventListener("click", () => { $("#noticeCategory").value = cat; syncChips(); }); box.append(b); });
  syncChips();
}
async function togglePin(n) {
  try { await api(`/api/notices/${n.id}`, { method: "PUT", body: JSON.stringify({ title: n.title, category: n.category, relevant_date: n.relevant_date || "", body: n.body, pinned: !n.pinned }) }); showToast(n.pinned ? "Unpinned." : "Pinned to top."); await loadData(); }
  catch (error) { showToast(error.message); }
}
function renderAdminNotices() {
  const list = $("#adminNoticeList"); list.innerHTML = "";
  if (!appState.notices.length) { list.append(el("div", "info-empty", "No notices published yet.")); return; }
  for (const n of appState.notices) {
    const row = el("div", "admin-notice"), ic = el("span", "an-ic"), info = el("div", "an-text"), actions = el("div", "admin-actions");
    ic.append(icon(CAT_ICON[n.category] || "i-spark"));
    info.append(el("strong", "", n.title), el("small", "", `${n.category}${n.pinned ? " · Pinned" : ""} · ${formatCreated(n.created_at)}`));
    actions.append(iconBtn(n.pinned ? "on" : "", n.pinned ? "Unpin" : "Pin to top", "i-pin", () => togglePin(n)), iconBtn("", "Edit", "i-edit", () => startEdit(n)), iconBtn("danger", "Delete", "i-trash", () => deleteNotice(n.id)));
    row.append(ic, info, actions); list.append(row);
  }
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error("Backend server-এর সাথে সংযোগ করা যাচ্ছে না। পরে আবার চেষ্টা করুন।");
  }

  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401) appState.isAdmin = false;
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}
async function loadData(silent = false) {
  try {
    const data = await api("/api/bootstrap");
    appState.notices = data.notices || []; appState.settings = data.settings || {}; appState.isAdmin = Boolean(data.isAdmin);
    renderCountdown(); renderNotices(); consumePending(); pendingNotice = null; renderInfoPanels(); updateProfile(); updateNotifs();
    if (appState.isAdmin) { renderAdminNotices(); fillCtForm(); fillStoreForms(); }
  } catch (error) {
    if (silent) return;
    $("#noticeList").innerHTML = "";
    const box = document.createElement("div"); box.className = "loading-card"; box.textContent = "Could not load updates. Please refresh in a moment."; $("#noticeList").append(box);
    showToast(error.message);
  }
}
function buildCtFields() {
  const box = $("#ctFields"); box.innerHTML = "";
  for (let i = 0; i < CT_SLOTS; i++) {
    const d = document.createElement("details"); d.className = "ct-fieldset"; if (i === 0) d.open = true;
    d.innerHTML = `<summary>CT ${i + 1}</summary>
      <label for="ctTitle${i}">CT title</label><input id="ctTitle${i}" maxlength="80" placeholder="e.g. CT-2 · Discrete Mathematics">
      <label for="ctDate${i}">Date & time</label><input id="ctDate${i}" type="datetime-local">
      <label for="ctSyllabus${i}">Syllabus</label><textarea id="ctSyllabus${i}" rows="5" maxlength="${CT_SYLLABUS_MAX}" placeholder="Write chapters, topics or instructions. New lines are preserved."></textarea>`;
    box.append(d);
  }
}
function fillCtForm() {
  getCts().forEach((c, i) => {
    let local = "";
    if (c.datetime) {
      const d = new Date(c.datetime);
      if (!Number.isNaN(d.getTime())) local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(" ", "T");
    }
    $("#ctTitle" + i).value = c.title; $("#ctDate" + i).value = local; $("#ctSyllabus" + i).value = c.syllabus;
  });
  $$("#ctFields details").forEach((d, i) => { const t = $("#ctTitle" + i).value.trim(); d.querySelector("summary").textContent = `CT ${i + 1}` + (t ? " — " + t : ""); });
}
function resetNoticeForm() {
  appState.editingId = null; $("#noticeForm").reset(); syncChips(); $("#editingId").value = ""; $("#cancelEdit").classList.add("hidden"); $("#noticeForm button[type=submit]").textContent = "Publish notice"; $("#noticeFormMessage").textContent = "";
}
function startEdit(n) {
  appState.editingId = n.id; $("#editingId").value = n.id; $("#noticeTitle").value = n.title; $("#noticeCategory").value = n.category; syncChips(); $("#noticeDate").value = n.relevant_date || ""; $("#noticeBody").value = n.body; $("#noticePinned").checked = Boolean(n.pinned); $("#cancelEdit").classList.remove("hidden"); $("#noticeForm button[type=submit]").textContent = "Save changes"; $("#noticeFormMessage").textContent = "Editing: " + n.title; $("#noticeEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function deleteNotice(id) {
  if (!confirm("Delete this notice? This cannot be undone.")) return;
  try { await api(`/api/notices/${id}`, { method: "DELETE" }); showToast("Notice deleted."); await loadData(); }
  catch (error) { showToast(error.message); }
}
function showAdmin() { $("#loginModal").classList.add("hidden"); showModal("adminModal"); renderAdminNotices(); fillCtForm(); fillStoreForms(); }
$("#adminOpen").addEventListener("click", () => appState.isAdmin ? showAdmin() : showModal("loginModal"));
$$("[data-close]").forEach(el => el.addEventListener("click", () => closeModal(el.dataset.close)));
$$(".filter").forEach(btn => btn.addEventListener("click", () => { $$(".filter").forEach(b => b.classList.remove("active")); btn.classList.add("active"); appState.filter = btn.dataset.filter; renderNotices(); }));
$("#refreshBtn").addEventListener("click", async () => { await loadData(); showToast("Updates refreshed."); });
$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault(); $("#loginError").textContent = "";
  try { await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#adminPassword").value }) }); $("#adminPassword").value = ""; appState.isAdmin = true; await loadData(); showAdmin(); showToast("Logged in successfully."); }
  catch (error) { $("#loginError").textContent = error.message; }
});
$("#logoutBtn").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST", body: JSON.stringify({}) }); } catch {}
  appState.isAdmin = false; closeModal("adminModal"); resetNoticeForm(); showToast("Logged out."); await loadData();
});
$$(".admin-tab[data-tab]").forEach(btn => btn.addEventListener("click", () => {
  $$(".admin-tab[data-tab]").forEach(b => b.classList.toggle("active", b === btn));
  $$(".admin-pane").forEach(p => p.classList.toggle("hidden", p.id !== btn.dataset.tab));
}));
$("#noticeForm").addEventListener("submit", async event => {
  event.preventDefault(); const button = $("#noticeForm button[type=submit]"); button.disabled = true;
  const payload = { title: $("#noticeTitle").value, category: $("#noticeCategory").value, relevant_date: $("#noticeDate").value, body: $("#noticeBody").value, pinned: $("#noticePinned").checked };
  try {
    if (appState.editingId) await api(`/api/notices/${appState.editingId}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/notices", { method: "POST", body: JSON.stringify(payload) });
    resetNoticeForm(); await loadData(); $("#noticeFormMessage").textContent = "Saved successfully."; showToast("Notice saved and published.");
  } catch (error) { $("#noticeFormMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
$("#cancelEdit").addEventListener("click", resetNoticeForm);
$("#ctForm").addEventListener("submit", async event => {
  event.preventDefault(); const button = $("#ctForm button[type=submit]"); button.disabled = true;
  try {
    const raw = [];
    const cts = Array.from({ length: CT_SLOTS }, (_, i) => {
      const v = $("#ctDate" + i).value; raw.push(v);
      return { title: $("#ctTitle" + i).value.trim(), datetime: v ? new Date(v + ":00+06:00").toISOString() : "", syllabus: $("#ctSyllabus" + i).value.trim() };
    });
    const st = readStore(); const json = packStore({ cts, up: st.up, ex: st.ex });
    if (json.length > 7800) throw new Error("Too much text in the CT cards. Shorten some syllabus text and save again.");
    const payload = { ct_datetime: raw.find(Boolean) || "", syllabus_title: cts[0].title, syllabus_text: json };
    await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
    $("#ctFormMessage").textContent = "CT cards saved."; await loadData(); showToast("CT cards updated.");
  } catch (error) { $("#ctFormMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
/* ---------- Upcoming CT, Exam routine and the 4 pills ---------- */
const STORE_LIMIT = 7800;
let exSeq = 0;
function readStore() {
  let p = null;
  try { p = JSON.parse((appState.settings || {}).syllabus_text || ""); } catch {}
  const ok = p && p.v === 2;
  const up = ok && Array.isArray(p.up) ? p.up : [];
  const exRaw = ok ? p.ex : null;
  let exTitle = "", exItems = [];
  if (Array.isArray(exRaw)) { exTitle = safeText((exRaw[0] || {}).t); exItems = exRaw; }
  else if (exRaw && typeof exRaw === "object") { exTitle = safeText(exRaw.t); exItems = Array.isArray(exRaw.i) ? exRaw.i : []; }
  return {
    cts: getCts(),
    up: up.map(r => ({ course: safeText(r.c), ct: safeText(r.n), date: safeText(r.d) })),
    ex: { title: exTitle, items: exItems.map(r => ({ date: safeText(r.d), course: safeText(r.c), time: safeText(r.m), syllabus: safeText(r.s) })) }
  };
}
function packStore(st) {
  return JSON.stringify({
    v: 2, cts: st.cts,
    up: st.up.map(r => ({ c: r.course, n: r.ct, d: r.date })),
    ex: { t: st.ex.title, i: st.ex.items.map(r => ({ d: r.date, c: r.course, m: r.time, s: r.syllabus })) }
  });
}
async function saveStore(patch) {
  const s = appState.settings || {}, cur = readStore();
  const json = packStore({ cts: cur.cts, up: cur.up, ex: cur.ex, ...patch });
  if (json.length > STORE_LIMIT) throw new Error(`Too much saved text (${json.length}/${STORE_LIMIT}). Shorten some entries or CT syllabus text and save again.`);
  await api("/api/settings", { method: "PUT", body: JSON.stringify({ ct_datetime: s.ct_datetime || "", syllabus_title: s.syllabus_title || "", syllabus_text: json }) });
}
function dhakaToday() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function daysLeft(dateStr) { const t = Date.parse(dateStr + "T00:00:00Z"), n = Date.parse(dhakaToday() + "T00:00:00Z"); return Number.isNaN(t) ? null : Math.round((t - n) / 86400000); }
function leftLabel(d) { if (d === null) return "—"; if (d < 0) return "Passed"; if (d === 0) return "Today"; if (d === 1) return "Tomorrow"; return d + " days left"; }
function isPast(d) { return d === null || d < 0; }
function withDays(list) {
  return list.map(r => ({ ...r, d: daysLeft(r.date) })).sort((a, b) => {
    const ap = isPast(a.d), bp = isPast(b.d);
    if (ap !== bp) return ap ? 1 : -1;
    return ap ? (b.d ?? -1e9) - (a.d ?? -1e9) : a.d - b.d;
  });
}
function renderUpcoming() {
  const box = $("#upBody"); box.innerHTML = "";
  const rows = withDays(readStore().up);
  if (!rows.length) { box.append(el("div", "info-empty", "No upcoming CT has been added yet.")); return; }
  const wrap = el("div", "table-wrap"), table = el("table", "info-table"), thead = el("thead"), hr = el("tr");
  ["Course", "CT", "Date", "Remaining"].forEach(h => { const th = el("th", "", h); th.scope = "col"; hr.append(th); });
  thead.append(hr);
  const tbody = el("tbody");
  rows.forEach(r => {
    const tr = el("tr", isPast(r.d) ? "is-past" : "");
    const badge = el("span", "left-badge" + (isPast(r.d) ? " past" : r.d <= 3 ? " soon" : ""), leftLabel(r.d));
    const last = el("td"); last.append(badge);
    tr.append(el("td", "c-course", r.course), el("td", "", r.ct || "—"), el("td", "c-date", prettyDate(r.date)), last);
    tbody.append(tr);
  });
  table.append(thead, tbody); wrap.append(table); box.append(wrap);
}
function renderExams() {
  const box = $("#exBody"); box.innerHTML = "";
  const ex = readStore().ex, rows = withDays(ex.items);
  if (!ex.title && !rows.length) { box.append(el("div", "info-empty", "No exam routine has been added yet.")); return; }
  if (ex.title) box.append(el("h3", "exam-heading", ex.title));
  const field = (label, val, cls) => { const f = el("div", "exam-field" + (cls ? " " + cls : "")); f.append(el("span", "", label), el("div", "v", val)); return f; };
  const list = el("div", "exam-list");
  rows.forEach(r => {
    const card = el("article", "exam-card" + (isPast(r.d) ? " is-past" : ""));
    card.append(el("div", "exam-date", prettyDate(r.date)), field("Course", r.course || "—"), field("Exam time", r.time || "—"), field("Syllabus", r.syllabus || "—", "exam-syllabus"));
    list.append(card);
  });
  box.append(list);
}
function renderInfoPanels() {
  const st = readStore();
  const live = (arr) => arr.filter(r => !isPast(daysLeft(r.date))).length;
  const u = live(st.up), x = live(st.ex.items);
  $("#upCount").textContent = u ? `${u} upcoming` : "Course, CT & date";
  $("#exCount").textContent = x ? `${x} scheduled` : "Dates & syllabus";
  renderUpcoming(); renderExams(); renderCalendar();
}
function setMsg(node, text, isError) { node.textContent = text; node.style.color = isError ? "var(--err)" : ""; }

function addUpRow(r = {}) {
  const row = el("div", "up-row");
  const course = el("input", "up-course"); course.maxLength = 60; course.placeholder = "Course name"; course.setAttribute("aria-label", "Course name"); course.value = r.course || "";
  const ct = el("input", "up-ct"); ct.maxLength = 12; ct.placeholder = "CT-1"; ct.setAttribute("aria-label", "CT number"); ct.value = r.ct || "";
  const date = el("input", "up-date"); date.type = "date"; date.setAttribute("aria-label", "CT date"); date.value = r.date || "";
  const rm = el("button", "mini-button danger", "Remove"); rm.type = "button"; rm.addEventListener("click", () => row.remove());
  row.append(course, ct, date, rm); $("#upRows").append(row);
  return row;
}
function addExItem(r = {}, open = true) {
  const id = ++exSeq;
  const d = el("details", "ct-fieldset ex-item"); d.open = open;
  d.innerHTML = `<summary></summary>
    <label for="exDate${id}">Date</label><input id="exDate${id}" class="ex-date" type="date">
    <label for="exCourse${id}">Course name</label><input id="exCourse${id}" class="ex-course" maxlength="60" placeholder="e.g. Discrete Mathematics">
    <label for="exTime${id}">Exam time</label><input id="exTime${id}" class="ex-time" maxlength="40" placeholder="e.g. 10:00 AM – 12:00 PM">
    <label for="exSyl${id}">Syllabus</label><textarea id="exSyl${id}" class="ex-syl" rows="4" maxlength="500" placeholder="Chapters or topics. New lines are preserved."></textarea>
    <div class="ex-actions"><button type="button" class="mini-button danger">Remove this course</button></div>`;
  const q = (c) => d.querySelector(c), sum = q("summary");
  q(".ex-date").value = r.date || ""; q(".ex-course").value = r.course || ""; q(".ex-time").value = r.time || ""; q(".ex-syl").value = r.syllabus || "";
  const upd = () => { const c = q(".ex-course").value.trim(), dt = q(".ex-date").value; sum.textContent = (c || "New course") + (dt ? " — " + prettyDate(dt) : ""); };
  d.addEventListener("input", upd); upd();
  q(".ex-actions button").addEventListener("click", () => d.remove());
  $("#exRows").append(d);
  return d;
}
function fillStoreForms() {
  const st = readStore();
  $("#upRows").innerHTML = ""; (st.up.length ? st.up : [{}]).forEach(r => addUpRow(r));
  $("#exMainTitle").value = st.ex.title;
  $("#exRows").innerHTML = ""; st.ex.items.forEach(r => addExItem(r, false)); if (!st.ex.items.length) addExItem({}, true);
}
/* ---------- Unlucky Calendar: filled automatically from CT, exam and assignment dates ---------- */
let calYear = null, calMonth = 0, calSelected = "";
const CAL_FACE = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M8.2 9.2v1.2M15.8 9.2v1.2"/><path d="M8.5 16.4c1-1.3 2.2-1.9 3.5-1.9s2.5.6 3.5 1.9"/><path d="M17 12.8c.6.9.9 1.4.9 1.9a.9.9 0 0 1-1.8 0c0-.5.3-1 .9-1.9z" fill="currentColor" stroke="none"/></svg>';
const pad2 = (n) => String(n).padStart(2, "0");
function dhakaKey(value) {
  const d = new Date(value); if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function calEvents() {
  const map = {}, seen = new Set();
  const add = (date, type, title, sub) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return;
    const key = [date, type, title, sub].join("|").toLowerCase(); if (seen.has(key)) return; seen.add(key);
    (map[date] = map[date] || []).push({ type, title: title || type, sub: sub || "" });
  };
  const st = readStore();
  st.up.forEach(r => add(r.date, "CT", r.course, r.ct));
  st.cts.forEach((c, i) => {
    if (!c.datetime) return;
    const t = new Date(c.datetime); if (Number.isNaN(t.getTime())) return;
    add(dhakaKey(t), "CT", c.title || `CT ${i + 1}`, new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }).format(t));
  });
  st.ex.items.forEach(r => add(r.date, "Exam", r.course, [st.ex.title, r.time].filter(Boolean).join(" · ")));
  const noticeType = { "Assignment": "Assignment", "Quiz / CT": "CT / Quiz", "Exam": "Exam" };
  (appState.notices || []).forEach(n => { const type = noticeType[n.category]; if (type && n.relevant_date) add(String(n.relevant_date).slice(0, 10), type, n.title, ""); });
  return map;
}
function openCalendar() { const t = dhakaToday().split("-"); calYear = +t[0]; calMonth = +t[1] - 1; calSelected = ""; renderCalendar(); }
function shiftCalMonth(delta) { const d = new Date(Date.UTC(calYear, calMonth + delta, 1)); calYear = d.getUTCFullYear(); calMonth = d.getUTCMonth(); calSelected = ""; renderCalendar(); }
function selectCalDay(key) { calSelected = calSelected === key ? "" : key; renderCalendar(); const b = $(`#calBody [data-key="${key}"]`); if (b) b.focus(); }
function renderCalendar() {
  if (calYear === null) { const t = dhakaToday().split("-"); calYear = +t[0]; calMonth = +t[1] - 1; }
  const box = $("#calBody"); box.innerHTML = "";
  const events = calEvents(), today = dhakaToday();
  const nav = el("div", "cal-nav"), btns = el("div", "cal-nav-btns");
  const mk = (label, aria, fn) => { const b = el("button", "mini-button", label); b.type = "button"; b.setAttribute("aria-label", aria); b.addEventListener("click", fn); return b; };
  btns.append(mk("‹", "Previous month", () => shiftCalMonth(-1)), mk("Today", "Go to current month", openCalendar), mk("›", "Next month", () => shiftCalMonth(1)));
  nav.append(el("strong", "", new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(calYear, calMonth, 1)))), btns);
  const grid = el("div", "cal-grid");
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(w => grid.append(el("div", "cal-wd", w)));
  const first = new Date(Date.UTC(calYear, calMonth, 1)).getUTCDay(), days = new Date(Date.UTC(calYear, calMonth + 1, 0)).getUTCDate();
  for (let i = 0; i < first; i++) { const b = el("div", "cal-day blank"); b.setAttribute("aria-hidden", "true"); grid.append(b); }
  for (let d = 1; d <= days; d++) {
    const key = `${calYear}-${pad2(calMonth + 1)}-${pad2(d)}`, list = events[key], isToday = key === today;
    if (list) {
      const b = el("button", "cal-day has-ev" + (isToday ? " today" : "") + (key === calSelected ? " selected" : ""));
      b.type = "button"; b.dataset.key = key; b.setAttribute("aria-pressed", key === calSelected ? "true" : "false");
      b.setAttribute("aria-label", `${prettyDate(key)}, ${list.length} item${list.length === 1 ? "" : "s"}`);
      const emo = el("span", "emo"); emo.innerHTML = CAL_FACE; emo.setAttribute("aria-hidden", "true");
      b.append(el("span", "num", String(d)), emo);
      if (list.length > 1) b.append(el("span", "cnt", String(list.length)));
      b.addEventListener("click", () => selectCalDay(key)); grid.append(b);
    } else {
      const c = el("div", "cal-day" + (isToday ? " today" : "")); c.append(el("span", "num", String(d))); grid.append(c);
    }
  }
  const detail = el("div", "cal-detail"); detail.setAttribute("aria-live", "polite");
  if (calSelected && events[calSelected]) {
    detail.append(el("h3", "", prettyDate(calSelected)));
    events[calSelected].forEach(e => {
      const row = el("div", "cal-item"), txt = el("div"); txt.append(el("div", "t", e.title)); if (e.sub) txt.append(el("div", "s", e.sub));
      row.append(el("span", "cal-type", e.type), txt); detail.append(row);
    });
  } else detail.append(el("div", "cal-hint", "Tap a marked date to see what is on that day."));
  box.append(nav, grid, detail);
}
$$("[data-open]").forEach(btn => btn.addEventListener("click", () => {
  const id = btn.dataset.open;
  if (id === "upModal") renderUpcoming();
  if (id === "exModal") renderExams();
  if (id === "calModal") openCalendar();
  showModal(id);
  const close = $("#" + id + " .modal-close"); if (close) close.focus();
}));
$("#soonPill").addEventListener("click", () => showToast("Coming soon."));
$("#upAdd").addEventListener("click", () => addUpRow().querySelector(".up-course").focus());
$("#exAdd").addEventListener("click", () => { const d = addExItem({}, true); d.querySelector(".ex-date").focus(); });
$("#upForm").addEventListener("submit", async event => {
  event.preventDefault(); const btn = $("#upForm button[type=submit]"), msg = $("#upFormMessage"); btn.disabled = true; setMsg(msg, "", false);
  try {
    const up = [];
    $$("#upRows .up-row").forEach((row, i) => {
      const course = row.querySelector(".up-course").value.trim(), ct = row.querySelector(".up-ct").value.trim(), date = row.querySelector(".up-date").value;
      if (!course && !ct && !date) return;
      if (!course || !date) throw new Error(`Row ${i + 1}: course name and date are required.`);
      up.push({ course, ct, date });
    });
    await saveStore({ up });
    await loadData(); setMsg(msg, "Upcoming CT list saved.", false); showToast("Upcoming CT updated.");
  } catch (error) { setMsg(msg, error.message, true); }
  finally { btn.disabled = false; }
});
$("#exForm").addEventListener("submit", async event => {
  event.preventDefault(); const btn = $("#exForm button[type=submit]"), msg = $("#exFormMessage"); btn.disabled = true; setMsg(msg, "", false);
  try {
    const title = $("#exMainTitle").value.trim(), items = [];
    $$("#exRows .ex-item").forEach((d, i) => {
      const v = (c) => d.querySelector(c).value.trim();
      const item = { date: d.querySelector(".ex-date").value, course: v(".ex-course"), time: v(".ex-time"), syllabus: v(".ex-syl") };
      if (!item.date && !item.course && !item.time && !item.syllabus) return;
      if (!item.date || !item.course) throw new Error(`Entry ${i + 1}: date and course name are required.`);
      items.push(item);
    });
    if (items.length && !title) throw new Error("Please write the exam title first.");
    await saveStore({ ex: { title, items } });
    await loadData(); setMsg(msg, "Exam routine saved.", false); showToast("Exam routine updated.");
  } catch (error) { setMsg(msg, error.message, true); }
  finally { btn.disabled = false; }
});

/* ---------- Navigation, theme, profile, notifications ---------- */
const VIEWS = ["home", "feed", "materials", "profile"];
function showView(name, push = true) {
  if (!VIEWS.includes(name)) name = "home";
  VIEWS.forEach(v => $("#view-" + v).classList.toggle("hidden", v !== name));
  $$(".nav-btn").forEach(b => { const on = b.dataset.view === name; b.classList.toggle("active", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (push) history.replaceState(null, "", "#" + name);
  window.scrollTo(0, 0);
  if (name === "home") goToCt(ctIndex, false);
}
$$(".nav-btn").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
let pendingNotice = null;
function focusNotice(id) {
  const card = $(`#noticeList [data-notice-id="${id}"]`);
  if (!card) return false;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 2800);
  return true;
}
function consumePending() { if (pendingNotice && appState.notices.length && focusNotice(pendingNotice)) pendingNotice = null; }
function routeHash() {
  const h = location.hash.slice(1), m = /^notice-(\d+)$/.exec(h);
  if (!m) { showView(h, false); return; }
  appState.filter = "all"; $$(".filter").forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));
  showView("feed", false); renderNotices(); pendingNotice = m[1]; consumePending();
  history.replaceState(null, "", "#feed");
}
window.addEventListener("hashchange", routeHash);
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("bupTheme", t); } catch {}
  $("meta[name=theme-color]").content = t === "dark" ? "#0c1511" : "#f4f2ec";
  $("#themeToggle use").setAttribute("href", t === "dark" ? "#i-sun" : "#i-moon");
  $$("[data-theme-set]").forEach(b => b.classList.toggle("active", b.dataset.themeSet === t));
}
$("#themeToggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$$("[data-theme-set]").forEach(b => b.addEventListener("click", () => setTheme(b.dataset.themeSet)));
$("#userLogin").addEventListener("click", () => showToast("User login is coming soon."));
function updateProfile() {
  $("#adminOpen").textContent = appState.isAdmin ? "Open admin panel" : "Login as Admin";
  $("#profileName").textContent = appState.isAdmin ? "Class representative" : "Guest";
  $("#profileSub").textContent = appState.isAdmin ? "You can publish notices and update CT details." : "You are not signed in.";
}
let notifItems = [], freshIds = new Set(), notifReady = false;
const alerted = new Set();
const noticeTime = (n) => { const v = String(n.created_at || ""), t = Date.parse(v.includes("T") ? v : v.replace(" ", "T") + "Z"); return Number.isNaN(t) ? 0 : t; };
const seenSet = () => { try { const a = JSON.parse(localStorage.getItem("bupSeen")); return Array.isArray(a) ? new Set(a) : null; } catch { return null; } };
const saveSeen = (s) => { try { localStorage.setItem("bupSeen", JSON.stringify([...s])); } catch {} };
function loadExtra() { try { return JSON.parse(localStorage.getItem("bupExtra")) || []; } catch { return []; } }
function scheduleChanges() {
  const st = readStore(), out = [];
  [["ct", "CT cards updated", st.cts], ["up", "Upcoming CT list updated", st.up], ["ex", "Exam routine updated", st.ex]].forEach(([k, title, val]) => {
    const sig = JSON.stringify(val), key = "bupSig_" + k; let prev = null;
    try { prev = localStorage.getItem(key); } catch {}
    if (prev !== null && prev !== sig) out.push({ id: "s-" + k + "-" + Date.now(), kind: "schedule", category: "Schedule", title, t: Date.now() });
    try { localStorage.setItem(key, sig); } catch {}
  });
  return out;
}
function timeAgo(t) { if (!t) return "Earlier"; const m = Math.round((Date.now() - t) / 60000); if (m < 1) return "Just now"; if (m < 60) return m + " min ago"; if (m < 1440) return Math.round(m / 60) + " h ago"; return Math.round(m / 1440) + " d ago"; }
function popAlert(i) {
  showToast("New from CR: " + i.title);
  if ("Notification" in window && Notification.permission === "granted") { try { new Notification("BUP ICE · " + i.category, { body: i.title, icon: "./icons/icon-192.png" }); } catch {} }
}
function updateNotifs() {
  let extra = loadExtra(); const added = scheduleChanges();
  if (added.length) { extra = [...added, ...extra].slice(0, 15); try { localStorage.setItem("bupExtra", JSON.stringify(extra)); } catch {} }
  const items = [...appState.notices.map(n => ({ id: "n" + n.id, kind: "notice", category: n.category, title: n.title, t: noticeTime(n) })), ...extra].sort((a, b) => b.t - a.t).slice(0, 25);
  let seen = seenSet(); if (!seen) { seen = new Set(items.map(i => i.id)); saveSeen(seen); }
  const fresh = items.filter(i => !seen.has(i.id));
  notifItems = items; freshIds = new Set(fresh.map(i => i.id));
  const b = $("#notifBadge"); b.textContent = fresh.length > 9 ? "9+" : String(fresh.length); b.classList.toggle("hidden", !fresh.length);
  if (!notifReady) fresh.forEach(i => alerted.add(i.id));
  else fresh.filter(i => !alerted.has(i.id)).forEach(i => { alerted.add(i.id); popAlert(i); });
  notifReady = true;
}
function openNotifs() {
  const box = $("#notifBody"); box.innerHTML = "";
  if (!notifItems.length) box.append(el("div", "info-empty", "No notifications yet. New CR updates will appear here."));
  notifItems.forEach(i => {
    const b = el("button", "notif-item" + (freshIds.has(i.id) ? " unread" : "")); b.type = "button";
    const tx = el("div"); tx.append(el("div", "t", i.title), el("div", "s", i.category + " · " + timeAgo(i.t)));
    b.append(el("span", "notif-dot"), tx);
    b.addEventListener("click", () => { closeModal("notifModal"); if (i.kind === "notice") location.hash = "notice-" + i.id.slice(1); else showView("home"); });
    box.append(b);
  });
  saveSeen(new Set([...(seenSet() || []), ...notifItems.map(i => i.id)])); freshIds = new Set(); $("#notifBadge").classList.add("hidden");
  showModal("notifModal");
}
$("#notifOpen").addEventListener("click", openNotifs);
function urlBase64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function refreshPushBtn() {
  const b = $("#alertBtn"); if (!b) return false; let on = false;
  try { if (pushSupported() && Notification.permission === "granted") { const reg = await navigator.serviceWorker.ready; on = !!(await reg.pushManager.getSubscription()); } } catch {}
  b.textContent = on ? "Phone alerts are on ✓" : "Turn on phone alerts";
  b.classList.toggle("button-primary", !on); b.classList.toggle("button-soft", on);
  return on;
}
async function enablePush(silent = false) {
  if (!pushSupported()) { if (!silent) showToast("Phone alerts are not supported here. On iPhone, add this site to the Home Screen first."); return false; }
  const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (p !== "granted") { if (!silent) showToast("Alerts are blocked in browser settings."); return false; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api("/api/push/key");
    if (!key) { if (!silent) showToast("Push is not configured yet."); return false; }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub) });
    await refreshPushBtn(); if (!silent) showToast("Phone alerts are on.");
    return true;
  } catch (err) { if (!silent) showToast("Could not turn on alerts. Please try again."); return false; }
}
$("#alertBtn")?.addEventListener("click", () => enablePush());
$("#pushTestBtn")?.addEventListener("click", async () => {
  const msg = $("#pushTestMsg"); msg.textContent = "Sending…";
  try {
    const { report } = await api("/api/push/test", { method: "POST", body: JSON.stringify({}) });
    if (!report.length) { msg.textContent = "No phone has turned on alerts yet."; return; }
    const bad = report.filter(r => r.status !== 201);
    msg.textContent = `${report.length - bad.length} of ${report.length} device(s) accepted the alert.` + (bad.length ? " Problem: " + bad.map(r => (r.status || "error") + " " + (r.reply || r.error || "")).join("; ") : " It should appear on the phone within seconds.");
  } catch (e) { msg.textContent = e.message; }
});
$("#pushAllow")?.addEventListener("click", async () => { if (await enablePush()) closeModal("pushModal"); });
async function firstVisitPrompt() {
  if (!pushSupported()) return;
  if (Notification.permission === "granted") {
    try { const reg = await navigator.serviceWorker.ready; if (!(await reg.pushManager.getSubscription())) enablePush(true); } catch {}
    return;
  }
  if (Notification.permission !== "default") return;
  try { if (localStorage.getItem("bupAsked") === "1") return; localStorage.setItem("bupAsked", "1"); } catch {}
  setTimeout(() => showModal("pushModal"), 1200);
}
setInterval(() => { if (!document.hidden) loadData(true); }, 60000);
setTheme(document.documentElement.dataset.theme || "light");
routeHash();

buildCtFields(); buildChips();
initCtSlider();
setInterval(() => tickCountdown(), 1000);
loadData(); firstVisitPrompt(); refreshPushBtn();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "open" && e.data.hash) location.hash = e.data.hash; });
