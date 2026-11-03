// BUP ICE Class Update Portal - Cloudflare Worker backend
// Bindings needed: DB (D1), ASSETS (static files), secret ADMIN_PASSWORD
// Optional secret: SESSION_SECRET (if not set, ADMIN_PASSWORD is used to sign sessions)
// Push notifications: secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)

import { buildPushPayload } from "@block65/webcrypto-web-push";

const CATEGORIES = ["Class", "Assignment", "Quiz / CT", "Exam", "Other"];
const SESSION_SECONDS = 7 * 24 * 60 * 60; // 7 days
const enc = new TextEncoder();

// Works with both a plain Worker secret (string) and a Secrets Store binding (object with .get()).
async function getSecret(env, name) {
  const v = env[name];
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v.get === "function") return String((await v.get()) ?? "");
  return "";
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sessionSecret(env) {
  return (await getSecret(env, "SESSION_SECRET")) || (await getSecret(env, "ADMIN_PASSWORD"));
}

async function makeSessionToken(env) {
  const exp = Date.now() + SESSION_SECONDS * 1000;
  const sig = await hmacHex(await sessionSecret(env), "session:" + exp);
  return `${exp}.${sig}`;
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return "";
}

async function isAdmin(request, env) {
  const token = getCookie(request, "session");
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  const expected = await hmacHex(await sessionSecret(env), "session:" + exp);
  return safeEqual(sig, expected);
}

function sessionCookie(token, maxAge) {
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function readBody(request) {
  try {
    const data = await request.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function validateNotice(body) {
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  const category = String(body.category ?? "");
  const rawDate = String(body.relevant_date ?? "").trim();
  if (!title) return { error: "Please enter a title." };
  if (title.length > 140) return { error: "Title is too long (max 140 characters)." };
  if (!text) return { error: "Please write the notice details." };
  if (text.length > 6000) return { error: "Details are too long (max 6000 characters)." };
  if (!CATEGORIES.includes(category)) return { error: "Invalid category." };
  if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return { error: "Invalid date." };
  return {
    value: {
      title,
      body: text,
      category,
      relevant_date: rawDate || null,
      pinned: body.pinned ? 1 : 0,
    },
  };
}

// The admin form sends a datetime-local value in Bangladesh time (UTC+6).
// We store it as a full UTC ISO string so the countdown is correct everywhere.
function parseCtDatetime(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { value: "" };
  let iso = value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) iso = value + ":00+06:00";
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) iso = value + "+06:00";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { error: "Invalid class test date/time." };
  return { value: d.toISOString() };
}


// ---------- Web Push ----------
async function sendPushToAll(env, message) {
  const publicKey = await getSecret(env, "VAPID_PUBLIC_KEY");
  const privateKey = await getSecret(env, "VAPID_PRIVATE_KEY");
  const subject = (await getSecret(env, "VAPID_SUBJECT")) || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return;
  const vapid = { subject, publicKey, privateKey };

  const { results } = await env.DB.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions`).all();
  await Promise.all(
    (results || []).map(async (row) => {
      const subscription = { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } };
      try {
        const payload = await buildPushPayload(
          { data: JSON.stringify(message), options: { ttl: 86400 } },
          subscription,
          vapid
        );
        const res = await fetch(subscription.endpoint, payload);
        if (res.status === 404 || res.status === 410) {
          await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(row.endpoint).run();
        }
      } catch (err) {
        console.error("push failed", err);
      }
    })
  );
}

async function handleApi(request, env, url, ctx) {
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;

  if (path === "/api/test" && method === "GET") {
    return json({ success: true, message: "BUP ICE API is working!" });
  }

  if (!env.DB) return json({ error: "Database is not connected." }, 500);
  const adminPassword = await getSecret(env, "ADMIN_PASSWORD");
  if (!adminPassword) return json({ error: "Admin password is not configured." }, 500);

  // Basic CSRF protection for state-changing requests
  if (method !== "GET" && method !== "HEAD") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return json({ error: "Forbidden." }, 403);
  }

  // ---------- Public ----------
  if (path === "/api/bootstrap" && method === "GET") {
    const [notices, settings] = await Promise.all([
      env.DB.prepare(
        `SELECT id, title, category, body, relevant_date, pinned, created_at
         FROM notices ORDER BY pinned DESC, created_at DESC, id DESC`
      ).all(),
      env.DB.prepare(
        `SELECT ct_datetime, syllabus_title, syllabus_text FROM settings WHERE id = 1`
      ).first(),
    ]);
    return json({
      notices: notices.results || [],
      settings: settings || {},
      isAdmin: await isAdmin(request, env),
    });
  }

  if (path === "/api/push/key" && method === "GET") {
    return json({ key: await getSecret(env, "VAPID_PUBLIC_KEY") });
  }

  if (path === "/api/push/subscribe" && method === "POST") {
    const sub = await readBody(request);
    const endpoint = String(sub?.endpoint ?? "");
    const p256dh = String(sub?.keys?.p256dh ?? "");
    const auth = String(sub?.keys?.auth ?? "");
    if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !p256dh || !auth) {
      return json({ error: "Invalid subscription." }, 400);
    }
    await env.DB.prepare(
      `INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)`
    ).bind(endpoint, p256dh, auth).run();
    return json({ ok: true });
  }

  if (path === "/api/login" && method === "POST") {
    const { password } = await readBody(request);
    const a = await hmacHex("password-check", String(password ?? ""));
    const b = await hmacHex("password-check", adminPassword);
    if (!safeEqual(a, b)) {
      await new Promise((r) => setTimeout(r, 500)); // slow down guessing
      return json({ error: "Incorrect password." }, 401);
    }
    const token = await makeSessionToken(env);
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, SESSION_SECONDS) });
  }

  if (path === "/api/logout" && method === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }

  // ---------- Admin only ----------
  const noticeMatch = path.match(/^\/api\/notices\/(\d+)$/);
  const isAdminRoute =
    (path === "/api/notices" && method === "POST") ||
    (noticeMatch && (method === "PUT" || method === "DELETE")) ||
    (path === "/api/settings" && method === "PUT");

  if (!isAdminRoute) return json({ error: "Not found." }, 404);
  if (!(await isAdmin(request, env))) return json({ error: "Please log in as CR first." }, 401);

  if (path === "/api/notices" && method === "POST") {
    const { error, value } = validateNotice(await readBody(request));
    if (error) return json({ error }, 400);
    const result = await env.DB.prepare(
      `INSERT INTO notices (title, category, body, relevant_date, pinned) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(value.title, value.category, value.body, value.relevant_date, value.pinned)
      .run();
    ctx.waitUntil(
      sendPushToAll(env, { title: "BUP ICE · " + value.category, body: value.title, url: "/#feed" })
    );
    return json({ ok: true, id: result.meta?.last_row_id }, 201);
  }

  if (noticeMatch && method === "PUT") {
    const id = Number(noticeMatch[1]);
    const { error, value } = validateNotice(await readBody(request));
    if (error) return json({ error }, 400);
    const result = await env.DB.prepare(
      `UPDATE notices
       SET title = ?, category = ?, body = ?, relevant_date = ?, pinned = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(value.title, value.category, value.body, value.relevant_date, value.pinned, id)
      .run();
    if (!result.meta?.changes) return json({ error: "Notice not found." }, 404);
    return json({ ok: true });
  }

  if (noticeMatch && method === "DELETE") {
    const id = Number(noticeMatch[1]);
    const result = await env.DB.prepare(`DELETE FROM notices WHERE id = ?`).bind(id).run();
    if (!result.meta?.changes) return json({ error: "Notice not found." }, 404);
    return json({ ok: true });
  }

  if (path === "/api/settings" && method === "PUT") {
    const body = await readBody(request);
    const ct = parseCtDatetime(body.ct_datetime);
    if (ct.error) return json({ error: ct.error }, 400);
    const title = String(body.syllabus_title ?? "").trim();
    const text = String(body.syllabus_text ?? "").trim();
    if (title.length > 140) return json({ error: "Syllabus heading is too long (max 140)." }, 400);
    if (text.length > 8000) return json({ error: "Syllabus details are too long (max 8000)." }, 400);
    await env.DB.prepare(
      `INSERT INTO settings (id, ct_datetime, syllabus_title, syllabus_text, updated_at)
       VALUES (1, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         ct_datetime = excluded.ct_datetime,
         syllabus_title = excluded.syllabus_title,
         syllabus_text = excluded.syllabus_text,
         updated_at = datetime('now')`
    )
      .bind(ct.value, title, text)
      .run();
    return json({ ok: true });
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/api") {
      return env.ASSETS.fetch(request);
    }
    try {
      return await handleApi(request, env, url, ctx);
    } catch (err) {
      console.error(err);
      return json({ error: "Server error. Please try again." }, 500);
    }
  },
};
