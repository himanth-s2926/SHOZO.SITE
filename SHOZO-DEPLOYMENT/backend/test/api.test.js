'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const { loadConfig } = require('../src/config');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { ensureAdmin } = require('../src/routes/auth');
const { createApp } = require('../src/app');

const ADMIN = { email: 'admin@shozo.test', password: 'correct-horse-battery' };

function start(extraEnv = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'x'.repeat(40),
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    RATE_INQUIRY_MAX: '1000',
    RATE_NEWSLETTER_MAX: '1000',
    RATE_LOGIN_MAX: '1000',
    ...extraEnv,
  });
  const db = openDb(':memory:');
  seed(db);
  ensureAdmin(db, config);
  const mails = [];
  const mailer = {
    notifyNewInquiry: async (i) => { mails.push(['studio', i]); },
    sendAutoReply: async (i) => { mails.push(['autoreply', i]); },
  };
  const server = createApp({ db, config, mailer }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, url, { body, token, raw } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + url, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const type = res.headers.get('content-type') || '';
    const data = res.status === 204 ? null : type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()).toString('utf8');
    return { status: res.status, data, headers: res.headers };
  }
  const close = () => new Promise((r) => server.close(() => { db.close(); r(); }));
  return { api, db, mails, close, config };
}

let t; // main app
let token;
before(async () => {
  t = start();
  const res = await t.api('POST', '/api/auth/login', { body: ADMIN });
  token = res.data.token;
});
after(() => t.close());

const goodInquiry = (over = {}) => ({
  name: 'Asha Reddy', email: 'Asha@Example.com', space: 'Home / Residential',
  budget: 'Under ₹5,00,000', message: '3BHK in Jubilee Hills, west light is harsh.', ...over,
});

/* ------------------------------------------------------------------ public content */

test('health check', async () => {
  const r = await t.api('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true });
});

test('projects: list, category filter, featured filter, pagination, single', async () => {
  const all = await t.api('GET', '/api/projects');
  assert.equal(all.data.meta.total, 9);
  assert.equal(all.data.data[0].title, 'Ashgrove Residence');
  assert.equal(all.data.data[0].featured, true);

  const kitchens = await t.api('GET', '/api/projects?category=kitchen');
  assert.deepEqual(kitchens.data.data.map((p) => p.slug), ['ashgrove-residence', 'marlow-residence']);

  const featured = await t.api('GET', '/api/projects?featured=true');
  assert.equal(featured.data.meta.total, 3);

  const page = await t.api('GET', '/api/projects?limit=2&offset=2');
  assert.equal(page.data.data.length, 2);
  assert.equal(page.data.meta.total, 9);

  const one = await t.api('GET', '/api/projects/cedar-and-salt');
  assert.equal(one.data.data.title, 'Cedar & Salt');

  assert.equal((await t.api('GET', '/api/projects/nope')).status, 404);
  assert.equal((await t.api('GET', '/api/projects?category=garage')).status, 400);
  assert.equal((await t.api('GET', '/api/projects?limit=9999')).status, 400);
});

test('services come back with Indian-format price labels; process and team are ordered', async () => {
  const s = await t.api('GET', '/api/services');
  assert.equal(s.data.data.length, 5);
  assert.equal(s.data.data[0].priceFromLabel, 'From ₹8,50,000');
  assert.equal(s.data.data[1].priceFromLabel, 'From ₹35,000');

  const p = await t.api('GET', '/api/process');
  assert.deepEqual(p.data.data.map((x) => x.stepNo), [1, 2, 3, 4, 5]);

  const team = await t.api('GET', '/api/team');
  assert.equal(team.data.data[0].name, 'Aiko Mori');
});

test('journal: newest first, featured filter, list hides body, single post by slug', async () => {
  const list = await t.api('GET', '/api/posts');
  assert.equal(list.data.meta.total, 6);
  assert.equal(list.data.data[0].publishedAt, '2026-03-01');
  assert.equal('body' in list.data.data[0], false);

  const feat = await t.api('GET', '/api/posts?featured=true');
  assert.equal(feat.data.data.length, 1);

  const one = await t.api('GET', '/api/posts/japanese-joinery-and-restraint');
  assert.equal(one.status, 200);
  assert.ok('body' in one.data.data);
});

/* ------------------------------------------------------------------ contact form */

test('every dropdown option in contact.html is accepted by the API', async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'contact.html'), 'utf8');
  const options = (id) => {
    const block = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1];
    return [...block.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((m) => m[1].trim());
  };
  const spaces = options('space');
  const budgets = options('budget');
  assert.equal(spaces.length, 4);
  assert.equal(budgets.length, 4);
  for (const space of spaces) {
    for (const budget of budgets) {
      const r = await t.api('POST', '/api/inquiries', { body: goodInquiry({ space, budget }) });
      assert.equal(r.status, 201, `rejected: ${space} / ${budget} -> ${JSON.stringify(r.data)}`);
    }
  }
});

test('inquiry is stored (email normalised) and the studio is notified', async () => {
  const before = t.mails.length;
  const r = await t.api('POST', '/api/inquiries', { body: goodInquiry({ name: 'Ravi Teja' }) });
  assert.deepEqual(r.data, { ok: true });
  const row = t.db.prepare("SELECT * FROM inquiries WHERE name = 'Ravi Teja'").get();
  assert.equal(row.email, 'asha@example.com');
  assert.equal(row.status, 'new');
  assert.equal(t.mails.length, before + 1);
  assert.equal(t.mails.at(-1)[0], 'studio');
});

test('message is optional', async () => {
  const body = goodInquiry({ name: 'No Message' });
  delete body.message;
  assert.equal((await t.api('POST', '/api/inquiries', { body })).status, 201);
});

test('invalid inquiries get field-level errors', async () => {
  const r = await t.api('POST', '/api/inquiries', { body: { name: '', email: 'not-an-email', space: 'Garage', budget: 5 } });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'validation_error');
  assert.deepEqual(r.data.details.map((d) => d.path).sort(), ['budget', 'email', 'name', 'space']);
});

test('newline in name is rejected (email header injection)', async () => {
  const r = await t.api('POST', '/api/inquiries', { body: goodInquiry({ name: 'Eve\r\nBcc: victim@example.com' }) });
  assert.equal(r.status, 400);
});

test('honeypot: fake success, nothing stored, no email', async () => {
  const count = () => t.db.prepare('SELECT COUNT(*) n FROM inquiries').get().n;
  const [n, m] = [count(), t.mails.length];
  const r = await t.api('POST', '/api/inquiries', { body: goodInquiry({ name: 'Bot', website: 'http://spam.example' }) });
  assert.equal(r.status, 201);
  assert.equal(count(), n);
  assert.equal(t.mails.length, m);
});

test('malformed JSON and oversized bodies get clean errors', async () => {
  assert.equal((await t.api('POST', '/api/inquiries', { raw: '{oops', body: {} })).data.error, 'invalid_json');
  const big = await t.api('POST', '/api/inquiries', { body: goodInquiry({ message: 'x'.repeat(30_000) }) });
  assert.equal(big.status, 413);
  const long = await t.api('POST', '/api/inquiries', { body: goodInquiry({ message: 'x'.repeat(4001) }) });
  assert.equal(long.status, 400);
});

test('inquiry endpoint is rate limited', async () => {
  const small = start({ RATE_INQUIRY_MAX: '2' });
  try {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await small.api('POST', '/api/inquiries', { body: goodInquiry() })).status);
    assert.deepEqual(codes, [201, 201, 429, 429]);
  } finally { await small.close(); }
});

test('auto-reply is only sent when SEND_AUTOREPLY is on', async () => {
  const on = start({ SEND_AUTOREPLY: 'true' });
  try {
    await on.api('POST', '/api/inquiries', { body: goodInquiry() });
    assert.deepEqual(on.mails.map((m) => m[0]), ['studio', 'autoreply']);
  } finally { await on.close(); }
  const before = t.mails.filter((m) => m[0] === 'autoreply').length;
  await t.api('POST', '/api/inquiries', { body: goodInquiry() });
  assert.equal(t.mails.filter((m) => m[0] === 'autoreply').length, before);
});

test('a failing mail server does not fail the visitor request', async () => {
  const bad = start();
  bad.mails.length = 0;
  // swap in a mailer that throws
  await bad.close();
  const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40) });
  const db = openDb(':memory:');
  const server = createApp({ db, config, mailer: { notifyNewInquiry: async () => { throw new Error('smtp down'); } } }).listen(0);
  const orig = console.error; console.error = () => {};
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/inquiries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(goodInquiry()),
    });
    assert.equal(res.status, 201);
    await new Promise((r) => setTimeout(r, 20));
  } finally { console.error = orig; server.close(); db.close(); }
});

test('newsletter: idempotent subscribe (no enumeration), unsubscribe by token', async () => {
  const a = await t.api('POST', '/api/newsletter/subscribe', { body: { email: 'Reader@Example.com' } });
  const b = await t.api('POST', '/api/newsletter/subscribe', { body: { email: 'reader@example.com' } });
  assert.deepEqual(a.data, b.data);
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM subscribers WHERE email = 'reader@example.com'").get().n, 1);
  assert.equal((await t.api('POST', '/api/newsletter/subscribe', { body: { email: 'nope' } })).status, 400);

  const { token: tok } = t.db.prepare("SELECT token FROM subscribers WHERE email = 'reader@example.com'").get();
  await t.api('POST', '/api/newsletter/unsubscribe', { body: { token: tok } });
  assert.equal(t.db.prepare("SELECT status FROM subscribers WHERE email = 'reader@example.com'").get().status, 'unsubscribed');
  await t.api('POST', '/api/newsletter/subscribe', { body: { email: 'reader@example.com' } });
  assert.equal(t.db.prepare("SELECT status FROM subscribers WHERE email = 'reader@example.com'").get().status, 'unsubscribed');
});

/* ------------------------------------------------------------------ auth */

test('admin routes reject missing, bad and wrongly-signed tokens', async () => {
  assert.equal((await t.api('GET', '/api/admin/inquiries')).status, 401);
  assert.equal((await t.api('GET', '/api/admin/inquiries', { token: 'garbage' })).status, 401);
  const forged = jwt.sign({ sub: '1', email: ADMIN.email }, 'y'.repeat(40));
  assert.equal((await t.api('GET', '/api/admin/inquiries', { token: forged })).status, 401);
  const expired = jwt.sign({ sub: '1', email: ADMIN.email }, 'x'.repeat(40), { expiresIn: -10 });
  assert.equal((await t.api('GET', '/api/admin/inquiries', { token: expired })).status, 401);
  const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' + Buffer.from('{"sub":"1"}').toString('base64url') + '.';
  assert.equal((await t.api('GET', '/api/admin/inquiries', { token: none })).status, 401);
});

test('login: wrong password and unknown email look identical; correct one works', async () => {
  const wrong = await t.api('POST', '/api/auth/login', { body: { email: ADMIN.email, password: 'nope-nope-nope' } });
  const unknown = await t.api('POST', '/api/auth/login', { body: { email: 'who@shozo.test', password: 'nope-nope-nope' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.data, unknown.data);
  const me = await t.api('GET', '/api/auth/me', { token });
  assert.equal(me.data.data.email, ADMIN.email);
  const long = await t.api('POST', '/api/auth/login', { body: { email: ADMIN.email, password: 'a'.repeat(200) } });
  assert.equal(long.status, 401);
});

test('login is rate limited', async () => {
  const small = start({ RATE_LOGIN_MAX: '3' });
  try {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await small.api('POST', '/api/auth/login', { body: { email: ADMIN.email, password: 'wrong-wrong-1' } })).status);
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  } finally { await small.close(); }
});

test('changing ADMIN_PASSWORD in the environment rotates the login', () => {
  const db = openDb(':memory:');
  const cfg = (password) => loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: password });
  const log = console.log; console.log = () => {};
  try {
    ensureAdmin(db, cfg('first-password-1'));
    ensureAdmin(db, cfg('second-password-2'));
  } finally { console.log = log; }
  const bcrypt = require('bcryptjs');
  const { password_hash: h } = db.prepare('SELECT password_hash FROM admins').get();
  assert.equal(bcrypt.compareSync('second-password-2', h), true);
  assert.equal(bcrypt.compareSync('first-password-1', h), false);
  assert.throws(() => ensureAdmin(db, cfg('short')), /10 characters/);
  db.close();
});

/* ------------------------------------------------------------------ admin */

test('admin: inquiries list, filter, status update, delete', async () => {
  const list = await t.api('GET', '/api/admin/inquiries?limit=5', { token });
  assert.equal(list.status, 200);
  assert.ok(list.data.meta.total >= 16);
  assert.equal(list.data.data.length, 5);

  const id = list.data.data[0].id;
  const patched = await t.api('PATCH', `/api/admin/inquiries/${id}`, { token, body: { status: 'replied' } });
  assert.equal(patched.data.data.status, 'replied');
  assert.equal((await t.api('PATCH', `/api/admin/inquiries/${id}`, { token, body: { status: 'weird' } })).status, 400);

  const filtered = await t.api('GET', '/api/admin/inquiries?status=replied', { token });
  assert.ok(filtered.data.data.every((i) => i.status === 'replied'));

  assert.equal((await t.api('DELETE', `/api/admin/inquiries/${id}`, { token })).status, 204);
  assert.equal((await t.api('GET', `/api/admin/inquiries/${id}`, { token })).status, 404);
  assert.equal((await t.api('GET', '/api/admin/inquiries/abc', { token })).status, 400);
});

test('admin: CSV export is spreadsheet-formula safe and not captured by /:id', async () => {
  await t.api('POST', '/api/inquiries', { body: goodInquiry({ name: '=HYPERLINK("http://evil")', message: 'Line one\nLine, two' }) });
  const r = await t.api('GET', '/api/admin/inquiries/export.csv', { token });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.ok(r.data.startsWith('\uFEFFid,received_at_utc,status,name,email'));
  assert.ok(r.data.includes(`"'=HYPERLINK(""http://evil"")"`), 'formula cell must be neutralised and quoted');
  assert.ok(r.data.includes('"Line one\nLine, two"'));
  assert.equal((await t.api('GET', '/api/admin/inquiries/export.csv')).status, 401);
});

test('admin: subscribers list never exposes tokens', async () => {
  const r = await t.api('GET', '/api/admin/subscribers', { token });
  assert.ok(r.data.meta.total >= 1);
  assert.equal('token' in r.data.data[0], false);
});

test('admin: project CRUD, unique slugs, PATCH does not reset other fields, unpublished stays hidden', async () => {
  const mk = (over = {}) => t.api('POST', '/api/admin/projects', {
    token, body: { title: 'Lotus Court', category: 'living', year: 2026, imageUrl: 'https://example.com/a.jpg', featured: true, ...over },
  });
  const a = await mk();
  const b = await mk();
  assert.equal(a.status, 201);
  assert.equal(a.data.data.slug, 'lotus-court');
  assert.equal(b.data.data.slug, 'lotus-court-2');

  const p = await t.api('PATCH', `/api/admin/projects/${a.data.data.id}`, { token, body: { title: 'Lotus Court II' } });
  assert.equal(p.data.data.title, 'Lotus Court II');
  assert.equal(p.data.data.featured, true, 'featured must survive a PATCH that does not mention it');
  assert.equal(p.data.data.published, true);

  const clash = await t.api('PATCH', `/api/admin/projects/${b.data.data.id}`, { token, body: { slug: 'lotus-court' } });
  assert.equal(clash.status, 409);

  await t.api('PATCH', `/api/admin/projects/${b.data.data.id}`, { token, body: { published: false } });
  const pub = await t.api('GET', '/api/projects?category=living');
  assert.ok(pub.data.data.some((x) => x.slug === 'lotus-court'));
  assert.ok(!pub.data.data.some((x) => x.slug === 'lotus-court-2'));
  assert.equal((await t.api('GET', '/api/projects/lotus-court-2')).status, 404);
  const adminList = await t.api('GET', '/api/admin/projects', { token });
  assert.ok(adminList.data.data.some((x) => x.slug === 'lotus-court-2'));

  assert.equal((await t.api('PATCH', `/api/admin/projects/${a.data.data.id}`, { token, body: {} })).status, 400);
  assert.equal((await t.api('DELETE', `/api/admin/projects/${a.data.data.id}`, { token })).status, 204);
});

test('admin: image URLs must be https or a site path (no javascript: / protocol-relative)', async () => {
  const base = { title: 'X', category: 'office', year: 2026 };
  for (const imageUrl of ['javascript:alert(1)', 'http://insecure.example/a.jpg', '//evil.example/a.jpg', 'data:image/png;base64,AAAA']) {
    const r = await t.api('POST', '/api/admin/projects', { token, body: { ...base, imageUrl } });
    assert.equal(r.status, 400, imageUrl);
  }
  const ok = await t.api('POST', '/api/admin/projects', { token, body: { ...base, imageUrl: '/img/x.jpg' } });
  assert.equal(ok.status, 201);
});

test('admin: posts, services, process steps and team CRUD', async () => {
  const post = await t.api('POST', '/api/admin/posts', { token, body: { title: 'Teak & Sal: a comparison', body: 'Hello', publishedAt: '2026-04-01' } });
  assert.equal(post.status, 201);
  assert.equal(post.data.data.slug, 'teak-and-sal-a-comparison');
  assert.equal((await t.api('GET', '/api/posts/teak-and-sal-a-comparison')).data.data.body, 'Hello');
  assert.equal((await t.api('POST', '/api/admin/posts', { token, body: { title: 'Bad date', publishedAt: '1 April' } })).status, 400);

  const svc = await t.api('POST', '/api/admin/services', { token, body: { code: 'F', title: 'Lighting Design', description: 'Layered light.', priceFrom: 45000, sortOrder: 5 } });
  assert.equal(svc.status, 201);
  assert.equal((await t.api('POST', '/api/admin/services', { token, body: { code: 'F', title: 'Dup', description: 'x', priceFrom: 1 } })).status, 409);
  assert.equal((await t.api('GET', '/api/services')).data.data.at(-1).priceFromLabel, 'From ₹45,000');

  assert.equal((await t.api('PATCH', '/api/admin/process-steps/1', { token, body: { title: 'Walkthrough' } })).data.data.title, 'Walkthrough');
  const member = await t.api('POST', '/api/admin/team', { token, body: { name: 'New Person', role: 'Intern', imageUrl: 'https://example.com/p.jpg' } });
  assert.equal(member.status, 201);
  assert.equal((await t.api('DELETE', `/api/admin/team/${member.data.data.id}`, { token })).status, 204);
});

/* ------------------------------------------------------------------ app shell */

test('unknown /api routes return JSON 404; static pages are served with security headers', async () => {
  const nf = await t.api('GET', '/api/does-not-exist');
  assert.equal(nf.status, 404);
  assert.equal(nf.data.error, 'not_found');

  const page = await t.api('GET', '/contact.html');
  assert.equal(page.status, 200);
  assert.ok(page.data.includes('/api/inquiries'));
  const csp = page.headers.get('content-security-policy');
  assert.ok(csp.includes('https://fonts.googleapis.com') && csp.includes('https://fonts.gstatic.com'));
  assert.equal(page.headers.get('x-powered-by'), null);
  assert.equal((await t.api('GET', '/')).status, 200);
});
