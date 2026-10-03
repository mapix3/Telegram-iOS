import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handle } from '../src/worker.mjs';

test('webhook setup requires its secret, checks the bot and uses the pinned service URL', async t => {
    const { env, request } = fixture(t);
    env.WEBHOOK_SECRET = 'a'.repeat(64);
    env.PUBLIC_BASE_URL = 'https://profiles.example.test';
    const calls = [];
    let username = env.BOT_USERNAME;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return Response.json({ ok: true, result: url.endsWith('/getMe') ? { username } : true });
    });
    assert.equal((await request('/admin/webhook/setup', { method: 'POST' })).status, 403);
    assert.equal(calls.length, 0);
    const setup = await request('/admin/webhook/setup', { method: 'POST', secret: env.WEBHOOK_SECRET });
    assert.equal(setup.status, 200);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].body, {
        url: 'https://profiles.example.test/telegram/webhook', secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query']
    });
    assert.equal(JSON.stringify(setup.json).includes(env.BOT_TOKEN), false);
    assert.equal(JSON.stringify(setup.json).includes(env.WEBHOOK_SECRET), false);
    username = 'OtherBot';
    assert.equal((await request('/admin/webhook/setup', { method: 'POST', secret: env.WEBHOOK_SECRET })).status, 409);
    assert.equal(calls.length, 3);
    env.PUBLIC_BASE_URL = 'http://profiles.example.test';
    assert.equal((await request('/admin/webhook/setup', { method: 'POST', secret: env.WEBHOOK_SECRET })).status, 503);
    assert.equal(calls.length, 3);
});

const NOW = 1790964000;
test('automatic membership needs no bot or session and never publishes Premium or roles', async t => {
    const { env, request, DB } = fixture(t);
    delete env.BOT_TOKEN; delete env.BOT_USERNAME;
    const registered = await request('/v2/members/register', { method: 'POST', body: { telegramId: '7930293778' } });
    assert.equal(registered.status, 200);
    assert.deepEqual(registered.json, { telegramId: '7930293778', registered: true });
    const lookup = await request('/v2/members/lookup', { method: 'POST', body: { ids: ['7930293778', '1272887902', '7930293778'] } });
    assert.deepEqual(lookup.json, { members: [{ telegramId: '7930293778', registered: true }, { telegramId: '1272887902', registered: false }] });
    assert.equal(lookup.headers.get('Cache-Control'), 'no-store');
    assert.equal(await DB.prepare('SELECT telegram_id FROM profiles WHERE telegram_id = ?1').bind('7930293778').first(), null);
    assert.equal((await request('/v2/members/register', { method: 'POST', body: { telegramId: '7930293778', fakePremium: true } })).status, 400);
    assert.equal((await request('/v2/members/register', { method: 'POST', body: { telegramId: '7930293778', badge: 'owner' } })).status, 400);
});

test('membership validates IDs, body size and lookup limits', async t => {
    const { request } = fixture(t);
    for (const id of [7930293778, '0', '-1', '01', '4503599627370496', 'x']) {
        assert.equal((await request('/v2/members/register', { method: 'POST', body: { telegramId: id } })).status, 400);
    }
    assert.equal((await request('/v2/members/lookup', { method: 'POST', body: { ids: [] } })).status, 400);
    assert.equal((await request('/v2/members/lookup', { method: 'POST', body: { ids: Array(101).fill('1') } })).status, 400);
    assert.equal((await request('/v2/members/register', { method: 'POST', rawBody: ' '.repeat(9000) })).status, 413);
});
function database() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys=ON;');
    sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
    return {
        prepare(sql) {
            let values = [];
            const statement = {
                bind(...args) { values = args; return statement; },
                async first() { return sqlite.prepare(sql).get(...values) || null; },
                async all() { return { results: sqlite.prepare(sql).all(...values) }; },
                async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; }
            };
            return statement;
        },
        async batch(statements) {
            sqlite.exec('BEGIN');
            try {
                const results = [];
                for (const statement of statements) results.push(await statement.run());
                sqlite.exec('COMMIT');
                return results;
            } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        },
        close() { sqlite.close(); }
    };
}
function fixture(t) {
    const DB = database();
    t.after(() => DB.close());
    const env = { DB, BOT_TOKEN: 'test-token-not-a-real-credential', BOT_USERNAME: 'AyuExampleBot',
        WEBHOOK_SECRET: 'test-webhook-secret', OWNER_TELEGRAM_ID: '1272887902' };
    async function request(path, { method = 'GET', body, token, secret, now = NOW, rawBody } = {}) {
        const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' };
        if (token) headers.Authorization = 'Bearer ' + token;
        if (secret) headers['X-Telegram-Bot-Api-Secret-Token'] = secret;
        const response = await handle(new Request('https://example.test' + path, {
            method, headers, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body))
        }), env, now);
        return { status: response.status, json: await response.json(), headers: response.headers };
    }
    async function link(id, { confirm = true } = {}) {
        const start = await request('/v1/auth/start', { method: 'POST', body: { telegramId: id } });
        assert.equal(start.status, 200);
        const challenge = new URL(start.json.startUrl).searchParams.get('start');
        const actor = { id: Number(id), is_bot: false, language_code: 'ru' };
        const bot = await request('/telegram/webhook', { method: 'POST', secret: env.WEBHOOK_SECRET,
            body: { message: { text: '/start ' + challenge, from: actor, chat: { id: Number(id), type: 'private' } } } });
        assert.equal(bot.json.method, 'sendMessage');
        assert.equal(bot.json.reply_markup.inline_keyboard[0][0].callback_data, challenge);
        if (confirm) {
            const approval = await request('/telegram/webhook', { method: 'POST', secret: env.WEBHOOK_SECRET,
                body: { callback_query: { id: 'callback', from: actor, data: challenge } } });
            assert.equal(approval.json.text, 'Аккаунт подключён. Вернись в AyuGram.');
        }
        const poll = () => request('/v1/auth/poll', { method: 'POST', body: { pollToken: start.json.pollToken } });
        return { start: start.json, challenge, actor, poll };
    }
    async function signIn(id) {
        const auth = await link(id);
        const result = await auth.poll();
        assert.equal(result.status, 200);
        assert.equal(result.json.telegramId, id);
        return result.json.token;
    }
    return { DB, env, request, link, signIn };
}

test('two installations of the same account share a profile; other clients see its member badge', async t => {
    const { request, signIn } = fixture(t);
    const first = await signIn('7930293778');
    const second = await signIn('7930293778');
    assert.notEqual(first, second);
    const update = await request('/v1/me', { method: 'PUT', token: first, body: {
        fakePremium: true, emojiId: '9223372036854775807', statusUntil: NOW + 600, expectedRevision: 0
    } });
    assert.equal(update.status, 200);
    assert.equal(update.json.badge, 'member');
    const fromOtherInstallation = await request('/v1/me', { token: second });
    assert.deepEqual(fromOtherInstallation.json, update.json);
    const viewer = await signIn('34567');
    const lookup = await request('/v1/profiles/lookup', { method: 'POST', token: viewer,
        body: { telegramIds: ['7930293778', '23456'] } });
    assert.equal(lookup.json.profiles[0].emojiId, '9223372036854775807');
    assert.equal(lookup.json.profiles[0].registered, true);
    assert.deepEqual(lookup.json.profiles[1], { telegramId: '23456', registered: false });
    assert.equal(lookup.headers.get('Cache-Control'), 'no-store');
    assert.equal('phone' in lookup.json.profiles[0], false);
});

test('knowing a Telegram ID or start link cannot approve it as another user', async t => {
    const { request, env, link } = fixture(t);
    const auth = await link('7930293778', { confirm: false });
    const pending = await auth.poll();
    assert.equal(pending.status, 202);
    const actor = { id: 34567, is_bot: false };
    const wrong = await request('/telegram/webhook', { method: 'POST', secret: env.WEBHOOK_SECRET,
        body: { callback_query: { id: 'wrong', from: actor, data: auth.challenge } } });
    assert.equal(wrong.json.text, 'This link belongs to another account or has expired.');
    assert.equal((await auth.poll()).status, 202);
    const forgedWebhook = await request('/telegram/webhook', { method: 'POST', secret: 'wrong',
        body: { callback_query: { id: 'fake', from: auth.actor, data: auth.challenge } } });
    assert.equal(forgedWebhook.status, 403);
    assert.equal((await auth.poll()).status, 202);
    assert.equal((await request('/v1/me')).status, 401);
});

test('owner role is issued only for the configured ID; client fields cannot grant it or edit another user', async t => {
    const { request, signIn } = fixture(t);
    const owner = await signIn('1272887902');
    assert.equal((await request('/v1/me', { token: owner })).json.badge, 'owner');
    const member = await signIn('34567');
    for (const extra of [{ badge: 'owner' }, { telegramId: '1272887902' }, { phone: '+123' }]) {
        const result = await request('/v1/me', { method: 'PUT', token: member, body: {
            fakePremium: true, emojiId: null, statusUntil: null, expectedRevision: 0, ...extra
        } });
        assert.equal(result.status, 400);
    }
    assert.equal((await request('/v1/me', { token: member })).json.fakePremium, false);
    assert.equal((await request('/v1/me', { token: owner })).json.revision, 0);
});

test('a stale installation cannot overwrite a newer choice, including simultaneous writes', async t => {
    const { request, signIn } = fixture(t);
    const token = await signIn('34567');
    const writes = await Promise.all(['111', '222'].map(emojiId => request('/v1/me', { method: 'PUT', token,
        body: { fakePremium: true, emojiId, statusUntil: null, expectedRevision: 0 } })));
    assert.deepEqual(writes.map(result => result.status).sort(), [200, 409]);
    const current = await request('/v1/me', { token });
    assert.equal(current.json.revision, 1);
    const newer = await request('/v1/me', { method: 'PUT', token,
        body: { fakePremium: true, emojiId: '333', statusUntil: null, expectedRevision: 1 } });
    assert.equal(newer.status, 200);
    const stale = await request('/v1/me', { method: 'PUT', token,
        body: { fakePremium: true, emojiId: '444', statusUntil: null, expectedRevision: 1 } });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.profile.emojiId, '333');
});

test('status expiry, session expiry, sign-out, removal and authentication retries', async t => {
    const { request, link } = fixture(t);
    const auth = await link('34567');
    const session = await auth.poll();
    assert.deepEqual((await auth.poll()).json, session.json);
    const token = session.json.token;
    await request('/v1/me', { method: 'PUT', token,
        body: { fakePremium: true, emojiId: '111', statusUntil: NOW + 60, expectedRevision: 0 } });
    const expired = await request('/v1/me', { token, now: NOW + 61 });
    assert.equal(expired.json.emojiId, null);
    assert.equal(expired.json.registered, true);
    assert.equal((await request('/v1/me', { token, now: session.json.expiresAt })).status, 401);
    assert.equal((await request('/v1/auth/poll', { method: 'POST', now: NOW + 301,
        body: { pollToken: auth.start.pollToken } })).status, 410);
    assert.equal((await request('/v1/me', { method: 'DELETE', token })).status, 200);
    assert.equal((await request('/v1/me', { token })).status, 401);
    assert.equal((await auth.poll()).status, 410);
    const again = await link('34567');
    const againToken = (await again.poll()).json.token;
    assert.equal((await request('/v1/me', { token: againToken })).json.fakePremium, false);
    assert.equal((await request('/v1/session', { method: 'DELETE', token: againToken })).status, 200);
    assert.equal((await request('/v1/me', { token: againToken })).status, 401);
});

test('invalid IDs, expiration, lookup limits, anonymous flooding and oversized bodies are rejected', async t => {
    const { request, signIn } = fixture(t);
    for (const telegramId of ['0', '-1', '1 OR 1=1', '9007199254740992', 34567]) {
        assert.equal((await request('/v1/auth/start', { method: 'POST', body: { telegramId } })).status, 400);
    }
    const token = await signIn('34567');
    for (const emojiId of ['9223372036854775808', '0', 'abc', 111]) {
        assert.equal((await request('/v1/me', { method: 'PUT', token,
            body: { fakePremium: true, emojiId, statusUntil: null, expectedRevision: 0 } })).status, 400);
    }
    assert.equal((await request('/v1/me', { method: 'PUT', token,
        body: { fakePremium: true, emojiId: '111', statusUntil: NOW - 1, expectedRevision: 0 } })).status, 400);
    assert.equal((await request('/v1/profiles/lookup', { method: 'POST', token,
        body: { telegramIds: new Array(101).fill('34567') } })).status, 400);
    assert.equal((await request('/v1/auth/start', { method: 'POST', rawBody: ' '.repeat(9000) })).status, 413);
    for (let i = 0; i < 9; i++) assert.equal((await request('/v1/auth/start', { method: 'POST', body: { telegramId: '34567' } })).status, 200);
    assert.equal((await request('/v1/auth/start', { method: 'POST', body: { telegramId: '34567' } })).status, 429);
});
