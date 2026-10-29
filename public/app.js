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
function renderCountdown() {
  const s = appState.settings || {};
  $("#monthLabel").textContent = currentMonthLabel();
  $("#ctMeta").textContent = s.ct_datetime ? "Scheduled for " + prettyDate(s.ct_datetime, true) + " (Bangladesh time)" : "The CR will update the CT schedule.";
  const status = $("#ctStatus");
  if (!s.ct_datetime) {
    status.textContent = "SCHEDULE TBD";
    ["days", "hours", "minutes", "seconds"].forEach(id => $("#" + id).textContent = "--");
  } else {
    const target = new Date(s.ct_datetime).getTime();
    const diff = target - Date.now();
    if (diff <= 0) {
      status.textContent = "TIME REACHED";
      ["days", "hours", "minutes", "seconds"].forEach(id => $("#" + id).textContent = "00");
    } else {
      status.textContent = "COUNTING DOWN";
      const units = { days: 86400000, hours: 3600000, minutes: 60000, seconds: 1000 };
      let remaining = diff;
      for (const [id, unit] of Object.entries(units)) { const n = Math.floor(remaining / unit); $("#" + id).textContent = String(n).padStart(2, "0"); remaining -= n * unit; }
    }
  }
  $("#syllabusTitle").textContent = s.syllabus_title || "Syllabus will appear here";
  $("#syllabusText").textContent = s.syllabus_text || "The CR can publish the class test syllabus from the admin panel.";
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
function fillCtForm() {
  const s = appState.settings || {};
  if (s.ct_datetime) {
    const d = new Date(s.ct_datetime);
    const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(" ", "T");
    $("#ctDate").value = parts;
  } else $("#ctDate").value = "";
  $("#ctSyllabusTitle").value = s.syllabus_title || ""; $("#ctSyllabus").value = s.syllabus_text || "";
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
  const payload = { ct_datetime: $("#ctDate").value, syllabus_title: $("#ctSyllabusTitle").value, syllabus_text: $("#ctSyllabus").value };
  try { await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) }); $("#ctFormMessage").textContent = "CT schedule and syllabus saved."; await loadData(); showToast("CT details updated."); }
  catch (error) { $("#ctFormMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
setInterval(() => renderCountdown(), 1000);
loadData();
