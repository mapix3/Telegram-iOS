const encoder = new TextEncoder();
const LINK_TTL = 300;
const SESSION_TTL = 30 * 24 * 60 * 60;
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const memberSchema = new WeakMap();
const memberRequests = new Map();

async function members(request, env, path, now) {
    const value = await body(request);
    const registering = path === '/v2/members/register';
    keys(value, registering ? ['telegramId'] : ['ids']);
    const ids = registering ? [telegramId(value.telegramId)] : value.ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) fail(400, 'invalid_lookup');
    const unique = [...new Set(ids.map(telegramId))];
    const bucket = Math.floor(now / 300);
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const rateKey = bucket + ':' + await digest(ip);
    for (const [key, record] of memberRequests) if (record.bucket !== bucket) memberRequests.delete(key);
    const count = (memberRequests.get(rateKey)?.count || 0) + 1;
    if (count > 120 || (!memberRequests.has(rateKey) && memberRequests.size >= 4096)) fail(429, 'too_many_requests');
    memberRequests.set(rateKey, { bucket, count });
    if (!memberSchema.has(env.DB)) {
        const creation = env.DB.prepare('CREATE TABLE IF NOT EXISTS client_members (telegram_id TEXT PRIMARY KEY, registered_at INTEGER NOT NULL)').run();
        memberSchema.set(env.DB, creation);
        creation.catch(() => memberSchema.delete(env.DB));
    }
    await memberSchema.get(env.DB);
    if (registering) {
        await env.DB.prepare('INSERT OR IGNORE INTO client_members(telegram_id, registered_at) VALUES (?1, ?2)').bind(unique[0], now).run();
        return json({ telegramId: unique[0], registered: true });
    }
    const placeholders = unique.map((_, index) => '?' + (index + 1)).join(',');
    const rows = await env.DB.prepare('SELECT telegram_id FROM client_members WHERE telegram_id IN (' + placeholders + ')').bind(...unique).all();
    const found = new Set(rows.results.map(row => row.telegram_id));
    return json({ members: unique.map(id => ({ telegramId: id, registered: found.has(id) })) });
}

class HttpError extends Error {
    constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new HttpError(status, code); };
const json = (value, status = 200) => Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

function telegramId(value) {
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value) || BigInt(value) > 4503599627370495n) {
        fail(400, 'invalid_telegram_id');
    }
    return value;
}
function int64(value) {
    if (typeof value !== 'string' || !/^-?[1-9][0-9]{0,18}$/.test(value)) fail(400, 'invalid_emoji_id');
    const number = BigInt(value);
    if (number < -9223372036854775808n || number > 9223372036854775807n) fail(400, 'invalid_emoji_id');
    return value;
}
function secretEquals(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
    let mismatch = 0;
    for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
    return mismatch === 0;
}
async function hmac(key, message) {
    const imported = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', imported, encoder.encode(message)));
}
async function body(request, maxBytes = 8192) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) fail(415, 'json_required');
    if (Number(request.headers.get('Content-Length')) > maxBytes) fail(413, 'body_too_large');
    const reader = request.body?.getReader();
    if (!reader) fail(400, 'invalid_json');
    const decoder = new TextDecoder();
    let text = '', bytes = 0;
    while (true) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > maxBytes) { await reader.cancel(); fail(413, 'body_too_large'); }
        text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    try {
        const value = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'invalid_json');
        return value;
    } catch (error) {
        if (error instanceof HttpError) throw error;
        fail(400, 'invalid_json');
    }
}
function keys(value, allowed) {
    if (Object.keys(value).some(key => !allowed.includes(key))) fail(400, 'unknown_field');
}
function profile(row, env, now) {
    const active = row.fake_premium === 1 && (row.status_until === null || row.status_until > now);
    return {
        telegramId: row.telegram_id,
        registered: true,
        badge: row.telegram_id === env.OWNER_TELEGRAM_ID ? 'owner' : 'member',
        fakePremium: row.fake_premium === 1,
        emojiId: active ? row.emoji_id : null,
        statusUntil: active ? row.status_until : null,
        revision: row.revision,
        updatedAt: row.updated_at
    };
}
async function authenticate(request, env, now) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '');
    if (!match) fail(401, 'authentication_required');
    const tokenHash = await digest(match[1]);
    const row = await env.DB.prepare('SELECT telegram_id FROM sessions WHERE token_hash = ?1 AND expires_at > ?2')
        .bind(tokenHash, now).first();
    if (!row) fail(401, 'session_expired');
    return { telegramId: row.telegram_id, tokenHash };
}

const messages = {
    en: {
        link: 'Link this Telegram account to AyuGram? Your client badge and shared emoji status will be visible to users of this client.',
        confirm: 'Link account',
        wrong: 'This link belongs to another account or has expired.',
        done: 'Account linked. Return to AyuGram.'
    },
    ru: {
        link: 'Подключить этот аккаунт Telegram к AyuGram? Бейдж клиента и общий эмодзи-статус будут видны пользователям этого клиента.',
        confirm: 'Подключить аккаунт',
        wrong: 'Ссылка относится к другому аккаунту или уже истекла.',
        done: 'Аккаунт подключён. Вернись в AyuGram.'
    },
    uk: {
        link: 'Підключити цей акаунт Telegram до AyuGram? Значок клієнта та спільний емодзі-статус бачитимуть користувачі цього клієнта.',
        confirm: 'Підключити акаунт',
        wrong: 'Посилання стосується іншого акаунта або вже недійсне.',
        done: 'Акаунт підключено. Повернися в AyuGram.'
    }
};
function botActor(actor) {
    if (!actor || actor.is_bot || !Number.isSafeInteger(actor.id) || actor.id <= 0) fail(400, 'invalid_bot_actor');
    return telegramId(String(actor.id));
}
async function webhook(request, env, now) {
    if (!env.WEBHOOK_SECRET || !secretEquals(request.headers.get('X-Telegram-Bot-Api-Secret-Token'), env.WEBHOOK_SECRET)) {
        fail(403, 'invalid_webhook_secret');
    }
    const update = await body(request, 65536);
    if (update.message) {
        const message = update.message;
        if (message.chat?.type !== 'private') return json({ ok: true });
        const id = botActor(message.from);
        if (String(message.chat.id) !== id) fail(400, 'invalid_bot_actor');
        const text = messages[message.from.language_code?.split('-')[0]] || messages.en;
        const match = /^\/start(?:@[A-Za-z0-9_]+)? ([a-f0-9]{64})$/.exec(message.text || '');
        if (!match) return json({ ok: true });
        const hash = await digest(match[1]);
        const row = await env.DB.prepare('SELECT expected_id FROM links WHERE challenge_hash = ?1 AND expires_at > ?2')
            .bind(hash, now).first();
        if (!row || row.expected_id !== id) return json({ method: 'sendMessage', chat_id: id, text: text.wrong });
        return json({
            method: 'sendMessage', chat_id: id, text: text.link,
            reply_markup: { inline_keyboard: [[{ text: text.confirm, callback_data: match[1] }]] }
        });
    }
    if (update.callback_query) {
        const callback = update.callback_query;
        const id = botActor(callback.from);
        const text = messages[callback.from.language_code?.split('-')[0]] || messages.en;
        if (!/^[a-f0-9]{64}$/.test(callback.data || '')) return json({ ok: true });
        const result = await env.DB.prepare(
            'UPDATE links SET confirmed_id = ?1 WHERE challenge_hash = ?2 AND expected_id = ?1 AND expires_at > ?3'
        ).bind(id, await digest(callback.data), now).run();
        return json({ method: 'answerCallbackQuery', callback_query_id: callback.id,
            text: result.meta.changes ? text.done : text.wrong, show_alert: true });
    }
    return json({ ok: true });
}

async function setupWebhook(request, env) {
    if (!env.WEBHOOK_SECRET || env.WEBHOOK_SECRET.length < 32 || !secretEquals(
        request.headers.get('X-Telegram-Bot-Api-Secret-Token'), env.WEBHOOK_SECRET
    )) fail(403, 'invalid_setup_secret');
    const base = new URL(env.PUBLIC_BASE_URL || '');
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
        || (base.pathname !== '/' && base.pathname !== '')) fail(503, 'invalid_public_url');
    const botRequest = async (method, value) => {
        const response = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value)
        });
        const result = await response.json();
        if (!response.ok || result.ok !== true) fail(502, 'bot_setup_failed');
        return result.result;
    };
    const me = await botRequest('getMe', {});
    if (me.username.toLowerCase() !== env.BOT_USERNAME.toLowerCase()) fail(409, 'bot_username_mismatch');
    const url = new URL('/telegram/webhook', base).href;
    await botRequest('setWebhook', {
        url, secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query']
    });
    return json({ ok: true, botUsername: me.username, webhookUrl: url });
}

async function route(request, env, now) {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && ['/v2/members/register', '/v2/members/lookup'].includes(path)) return members(request, env, path, now);
    if (path === '/health' && request.method === 'GET') {
        await env.DB.prepare('SELECT telegram_id FROM profiles LIMIT 1').first();
        return json({ ok: true, version: 1 });
    }
    if (path === '/telegram/webhook' && request.method === 'POST') return webhook(request, env, now);
    if (!env.BOT_TOKEN || !/^[A-Za-z0-9_]{5,32}$/.test(env.BOT_USERNAME || '') || env.BOT_USERNAME.startsWith('REPLACE_')) {
        fail(503, 'service_not_configured');
    }
    if (path === '/admin/webhook/setup' && request.method === 'POST') return setupWebhook(request, env);
    if (path === '/v1/auth/start' && request.method === 'POST') {
        const value = await body(request);
        keys(value, ['telegramId']);
        const id = telegramId(value.telegramId);
        const challenge = randomToken(), pollToken = randomToken();
        const ip = request.headers.get('CF-Connecting-IP') || 'local';
        const ipHash = await hmac(env.BOT_TOKEN, 'rate:' + Math.floor(now / LINK_TTL) + ':' + ip);
        await env.DB.batch([
            env.DB.prepare('DELETE FROM links WHERE challenge_hash IN (SELECT challenge_hash FROM links WHERE expires_at <= ?1 LIMIT 100)').bind(now),
            env.DB.prepare('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at <= ?1 LIMIT 100)').bind(now)
        ]);
        const result = await env.DB.prepare(
            'INSERT INTO links(challenge_hash, poll_hash, expected_id, ip_hash, expires_at) '
            + 'SELECT ?1, ?2, ?3, ?4, ?5 WHERE (SELECT COUNT(*) FROM links WHERE ip_hash = ?4 AND expires_at > ?6) < 10'
        ).bind(await digest(challenge), await digest(pollToken), id, ipHash, now + LINK_TTL, now).run();
        if (!result.meta.changes) fail(429, 'too_many_link_requests');
        return json({ pollToken, startUrl: 'https://t.me/' + env.BOT_USERNAME + '?start=' + challenge, expiresAt: now + LINK_TTL });
    }
    if (path === '/v1/auth/poll' && request.method === 'POST') {
        const value = await body(request);
        keys(value, ['pollToken']);
        if (!/^[a-f0-9]{64}$/.test(value.pollToken || '')) fail(400, 'invalid_poll_token');
        const pollHash = await digest(value.pollToken);
        const row = await env.DB.prepare('SELECT confirmed_id, expires_at FROM links WHERE poll_hash = ?1 AND expires_at > ?2')
            .bind(pollHash, now).first();
        if (!row) fail(410, 'link_expired');
        if (!row.confirmed_id) return json({ status: 'pending' }, 202);
        const token = await hmac(env.BOT_TOKEN, 'session:v1:' + value.pollToken);
        const tokenHash = await digest(token), expiresAt = row.expires_at + SESSION_TTL;
        await env.DB.batch([
            env.DB.prepare('INSERT OR IGNORE INTO profiles(telegram_id, updated_at) SELECT confirmed_id, ?1 FROM links WHERE poll_hash = ?2 AND expires_at > ?1 AND confirmed_id IS NOT NULL')
                .bind(now, pollHash),
            env.DB.prepare('INSERT OR IGNORE INTO sessions(token_hash, telegram_id, expires_at) SELECT ?1, confirmed_id, ?2 FROM links WHERE poll_hash = ?3 AND expires_at > ?4 AND confirmed_id IS NOT NULL')
                .bind(tokenHash, expiresAt, pollHash, now)
        ]);
        const session = await env.DB.prepare('SELECT telegram_id, expires_at FROM sessions WHERE token_hash = ?1 AND expires_at > ?2')
            .bind(tokenHash, now).first();
        if (!session) fail(410, 'link_expired');
        return json({ status: 'ready', token, telegramId: session.telegram_id, expiresAt: session.expires_at });
    }
    const auth = await authenticate(request, env, now);
    if (path === '/v1/session' && request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(auth.tokenHash).run();
        return json({ ok: true });
    }
    if (path === '/v1/me' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT * FROM profiles WHERE telegram_id = ?1').bind(auth.telegramId).first();
        if (!row) fail(401, 'session_expired');
        return json(profile(row, env, now));
    }
    if (path === '/v1/me' && request.method === 'PUT') {
        const value = await body(request);
        keys(value, ['fakePremium', 'emojiId', 'statusUntil', 'expectedRevision']);
        if (typeof value.fakePremium !== 'boolean' || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) {
            fail(400, 'invalid_profile');
        }
        const emojiId = value.emojiId === null ? null : int64(value.emojiId);
        const until = value.statusUntil;
        if (until !== null && (!Number.isInteger(until) || until <= now || until > 2147483647)) fail(400, 'invalid_expiration');
        if ((!value.fakePremium || emojiId === null) && (emojiId !== null || until !== null)) fail(400, 'invalid_profile');
        const result = await env.DB.prepare(
            'UPDATE profiles SET fake_premium = ?1, emoji_id = ?2, status_until = ?3, revision = revision + 1, updated_at = ?4 '
            + 'WHERE telegram_id = ?5 AND revision = ?6'
        ).bind(value.fakePremium ? 1 : 0, emojiId, until, now, auth.telegramId, value.expectedRevision).run();
        const row = await env.DB.prepare('SELECT * FROM profiles WHERE telegram_id = ?1').bind(auth.telegramId).first();
        if (!row) fail(401, 'session_expired');
        if (!result.meta.changes) return json({ error: 'revision_conflict', profile: profile(row, env, now) }, 409);
        return json(profile(row, env, now));
    }
    if (path === '/v1/me' && request.method === 'DELETE') {
        await env.DB.batch([
            env.DB.prepare('DELETE FROM links WHERE expected_id = ?1').bind(auth.telegramId),
            env.DB.prepare('DELETE FROM sessions WHERE telegram_id = ?1').bind(auth.telegramId),
            env.DB.prepare('DELETE FROM profiles WHERE telegram_id = ?1').bind(auth.telegramId)
        ]);
        return json({ ok: true });
    }
    if (path === '/v1/profiles/lookup' && request.method === 'POST') {
        const value = await body(request);
        keys(value, ['telegramIds']);
        if (!Array.isArray(value.telegramIds) || value.telegramIds.length < 1 || value.telegramIds.length > 100) fail(400, 'invalid_lookup');
        const ids = [...new Set(value.telegramIds.map(telegramId))];
        const placeholders = ids.map((_, i) => '?' + (i + 1)).join(',');
        const rows = await env.DB.prepare('SELECT * FROM profiles WHERE telegram_id IN (' + placeholders + ')').bind(...ids).all();
        const found = new Map(rows.results.map(row => [row.telegram_id, profile(row, env, now)]));
        return json({ profiles: ids.map(id => found.get(id) || { telegramId: id, registered: false }), serverTime: now });
    }
    fail(404, 'not_found');
}

export async function handle(request, env, now = Math.floor(Date.now() / 1000)) {
    try { return await route(request, env, now); }
    catch (error) {
        return error instanceof HttpError ? json({ error: error.code }, error.status) : json({ error: 'service_unavailable' }, 503);
    }
}
export default { fetch: (request, env) => handle(request, env) };
