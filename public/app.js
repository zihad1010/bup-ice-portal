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
function buildCtSlider() {
  const track = $("#ctSlider"), dots = $("#ctDots");
  track.innerHTML = ""; dots.innerHTML = ""; ctRefs = []; ctDotEls = [];
  for (let i = 0; i < CT_SLOTS; i++) {
    const slide = el("article", "ct-slide");
    slide.setAttribute("role", "group"); slide.setAttribute("aria-roledescription", "slide"); slide.setAttribute("aria-label", `CT ${i + 1} of ${CT_SLOTS}`);
    const card = el("div", "ct-card");
    const top = el("div", "ct-top"); const head = el("div");
    const eyebrow = el("div", "eyebrow light", `CLASS TEST ${i + 1}`); const title = el("h2"); const meta = el("p");
    head.append(eyebrow, title, meta);
    const status = el("span", "pill"); top.append(head, status);
    const countdown = el("div", "countdown"); const nums = {};
    [["days", "Days"], ["hours", "Hours"], ["minutes", "Minutes"], ["seconds", "Seconds"]].forEach(([key, label]) => {
      const box = el("div"); const num = el("strong", "", "--"); box.append(num, el("span", "", label)); countdown.append(box); nums[key] = num;
    });
    const syllabus = el("div", "syllabus"); const sHead = el("div", "syllabus-heading");
    sHead.append(el("span", "mini-label", "SYLLABUS"), el("span", "syllabus-icon", "✓"));
    const sText = el("div", "syllabus-text"); sText.tabIndex = 0;
    syllabus.append(sHead, sText);
    card.append(top, countdown, syllabus); slide.append(card); track.append(slide);
    ctRefs.push({ title, meta, status, nums, sText });
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
  $("#monthLabel").textContent = currentMonthLabel();
  const cts = getCts();
  cts.forEach((ct, i) => {
    const r = ctRefs[i]; if (!r) return;
    r.title.textContent = ct.title || `CT ${i + 1}`;
    r.meta.textContent = ct.datetime ? "Scheduled for " + prettyDate(ct.datetime, true) + " (Bangladesh time)" : "The CR has not scheduled this CT yet.";
    r.sText.textContent = ct.syllabus || "Syllabus will appear here.";
  });
  tickCountdown();
}
function tickCountdown() {
  const cts = getCts();
  cts.forEach((ct, i) => {
    const r = ctRefs[i]; if (!r) return;
    const setAll = (v) => ["days", "hours", "minutes", "seconds"].forEach(k => r.nums[k].textContent = v);
    const target = ct.datetime ? new Date(ct.datetime).getTime() : NaN;
    if (Number.isNaN(target)) { r.status.textContent = "SCHEDULE TBD"; setAll("--"); return; }
    const diff = target - Date.now();
    if (diff <= 0) { r.status.textContent = "TIME REACHED"; setAll("00"); return; }
    r.status.textContent = "COUNTING DOWN";
    const units = { days: 86400000, hours: 3600000, minutes: 60000, seconds: 1000 };
    let remaining = diff;
    for (const [key, unit] of Object.entries(units)) { const n = Math.floor(remaining / unit); r.nums[key].textContent = String(n).padStart(2, "0"); remaining -= n * unit; }
  });
}
function renderNotices() {
  const list = $("#noticeList");
  const filtered = appState.notices.filter(n => appState.filter === "all" || n.category === appState.filter);
  $("#noticeCount").textContent = `${appState.notices.length} update${appState.notices.length === 1 ? "" : "s"}`;
  list.innerHTML = "";
  $("#emptyState").classList.toggle("hidden", filtered.length > 0);
  list.classList.toggle("hidden", filtered.length === 0);
  if (!filtered.length) return;
  for (const n of filtered) {
    const article = document.createElement("article"); article.className = "notice-card";
    const meta = document.createElement("div"); meta.className = "notice-meta";
    const category = document.createElement("span"); category.className = "category"; category.textContent = n.category;
    const pinned = document.createElement("span"); pinned.className = "pinned"; pinned.textContent = n.pinned ? "📌 PINNED" : "";
    meta.append(category, pinned);
    const title = document.createElement("h3"); title.textContent = n.title;
    const body = document.createElement("div"); body.className = "notice-body"; body.textContent = n.body;
    const footer = document.createElement("div"); footer.className = "notice-footer";
    const posted = document.createElement("span"); posted.textContent = formatCreated(n.created_at);
    const date = document.createElement("span"); date.className = "notice-date"; date.textContent = n.relevant_date ? prettyDate(n.relevant_date) : "";
    footer.append(posted, date); article.append(meta, title, body, footer); list.append(article);
  }
}
function renderAdminNotices() {
  const list = $("#adminNoticeList"); list.innerHTML = "";
  if (!appState.notices.length) { list.textContent = "No notices have been published."; return; }
  for (const n of appState.notices) {
    const row = document.createElement("div"); row.className = "admin-notice";
    const info = document.createElement("div"); const title = document.createElement("strong"); title.textContent = n.title;
    const detail = document.createElement("small"); detail.textContent = `${n.category}${n.pinned ? " · Pinned" : ""} · ${formatCreated(n.created_at)}`; info.append(title, detail);
    const actions = document.createElement("div"); actions.className = "admin-actions";
    const edit = document.createElement("button"); edit.className = "mini-button"; edit.textContent = "Edit"; edit.addEventListener("click", () => startEdit(n));
    const del = document.createElement("button"); del.className = "mini-button danger"; del.textContent = "Delete"; del.addEventListener("click", () => deleteNotice(n.id));
    actions.append(edit, del); row.append(info, actions); list.append(row);
  }
}
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  let data = {}; try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
async function loadData() {
  try {
    const data = await api("/api/bootstrap");
    appState.notices = data.notices || []; appState.settings = data.settings || {}; appState.isAdmin = Boolean(data.isAdmin);
    renderCountdown(); renderNotices();
    if (appState.isAdmin) { renderAdminNotices(); fillCtForm(); }
  } catch (error) {
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
  appState.editingId = null; $("#noticeForm").reset(); $("#editingId").value = ""; $("#cancelEdit").classList.add("hidden"); $("#noticeForm button[type=submit]").textContent = "Publish notice"; $("#noticeFormMessage").textContent = "";
}
function startEdit(n) {
  appState.editingId = n.id; $("#editingId").value = n.id; $("#noticeTitle").value = n.title; $("#noticeCategory").value = n.category; $("#noticeDate").value = n.relevant_date || ""; $("#noticeBody").value = n.body; $("#noticePinned").checked = Boolean(n.pinned); $("#cancelEdit").classList.remove("hidden"); $("#noticeForm button[type=submit]").textContent = "Save changes"; $("#noticeFormMessage").textContent = "Editing: " + n.title; $("#noticeEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function deleteNotice(id) {
  if (!confirm("Delete this notice? This cannot be undone.")) return;
  try { await api(`/api/notices/${id}`, { method: "DELETE" }); showToast("Notice deleted."); await loadData(); }
  catch (error) { showToast(error.message); }
}
function showAdmin() { $("#loginModal").classList.add("hidden"); showModal("adminModal"); renderAdminNotices(); fillCtForm(); }
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
    const json = JSON.stringify({ v: 2, cts });
    if (json.length > 7800) throw new Error("Too much text in the CT cards. Shorten some syllabus text and save again.");
    const payload = { ct_datetime: raw.find(Boolean) || "", syllabus_title: cts[0].title, syllabus_text: json };
    await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
    $("#ctFormMessage").textContent = "CT cards saved."; await loadData(); showToast("CT cards updated.");
  } catch (error) { $("#ctFormMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
buildCtFields();
initCtSlider();
setInterval(() => tickCountdown(), 1000);
loadData();
