# SHOZO backend

Node.js + Express + SQLite backend for the SHOZO Interior Designs site. It serves the six HTML pages
from `public/` **and** a JSON API under `/api`, so one process runs the whole site.

```
npm install
cp .env.example .env     # set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed             # loads the projects / journal / services / team shown on your pages
npm start                # http://localhost:3000
npm test                 # 26 tests
```

Needs Node 22+ (a dependency, better-sqlite3 13, requires it). No database server: data lives in one file (`DB_PATH`).

## What changed in the HTML

Only `public/contact.html`. The form used to fake a success message; it now POSTs to `/api/inquiries`,
shows server errors inline, and includes a hidden spam-trap field. The other five pages are untouched
and still static. The API is ready for them (see "Next steps").

## API

Errors are always `{ "error": "<code>", "message": "...", "details": [{ "path", "message" }] }`.

### Public

| Method | Path | Notes |
|---|---|---|
| POST | `/api/inquiries` | Contact form. Body: `name, email, space, budget, message?`. `space`/`budget` must be one of the dropdown texts in `contact.html`. 5 per 15 min per IP. |
| POST | `/api/newsletter/subscribe` | `{ email }`. Always replies `{ok:true}` (no way to probe who is subscribed). |
| POST | `/api/newsletter/unsubscribe` | `{ token }` |
| GET | `/api/projects` | `?category=living\|kitchen\|bedroom\|hospitality\|office&featured=true&limit=&offset=` → `{ data, meta: { total } }` |
| GET | `/api/projects/:slug` | |
| GET | `/api/posts` | Journal, newest first. `?featured=true&limit=&offset=`. List omits `body`. |
| GET | `/api/posts/:slug` | Includes `body`. |
| GET | `/api/services` | Includes `priceFrom` (number) and `priceFromLabel` (`"From ₹8,50,000"`). |
| GET | `/api/process` | The five process steps. |
| GET | `/api/team` | |
| GET | `/api/health` | |

### Admin (`Authorization: Bearer <token>`)

```
curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"you@shozo.studio","password":"..."}'          # -> { "token": "..." }
```

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/inquiries` | `?status=new\|read\|replied\|archived&page=&limit=` |
| GET | `/api/admin/inquiries/export.csv` | Same `status` filter. Opens cleanly in Excel (UTF-8 BOM, `₹` intact). |
| GET/PATCH/DELETE | `/api/admin/inquiries/:id` | PATCH body: `{ "status": "replied" }` |
| GET | `/api/admin/subscribers` | |
| GET/POST | `/api/admin/{projects,posts,services,process-steps,team}` | Slugs are generated from the title and made unique. |
| GET/PATCH/DELETE | `/api/admin/{...}/:id` | PATCH only changes the fields you send. |

Set `"published": false` on a project or post to hide it from the public API without deleting it.

## Configuration

See `.env.example`; every variable is commented. Notable ones:

- **`JWT_SECRET`**: required in production (the server refuses to start without it).
- **Email**: without `SMTP_HOST` nothing is sent, so local development just works. With it, each inquiry is
  emailed to `STUDIO_INBOX` with `Reply-To` set to the visitor, so you can answer straight from your mail app.
  `SEND_AUTOREPLY=true` also emails the visitor. It is off by default because a public form that sends mail to
  any address typed into it can be misused to pester third parties.
- **`TRUST_PROXY=1`** when deployed behind a proxy/PaaS, otherwise every visitor looks like one IP to the rate limiter.
- **`CORS_ORIGINS`** only if the HTML is hosted elsewhere (then also set `API_BASE` at the top of the contact
  form script in `contact.html`).

## Deploying

Any host that runs Node and has a **persistent disk** (Render, Railway, Fly.io, a VPS). Put `DB_PATH` on that disk.
Set `NODE_ENV=production`, `JWT_SECRET`, admin credentials and `TRUST_PROXY=1`, and serve over HTTPS.
Hosts with an ephemeral filesystem will lose the SQLite file on every deploy.
Back up by copying the `.db` file (with `sqlite3 shozo.db ".backup copy.db"` if the server is running).

## Install notes

`.npmrc` sets `ignore-scripts=true` on purpose. `better-sqlite3` ships ready-made binaries for Windows, macOS and
Linux (x64/arm64), so nothing has to be compiled, but npm's lockfile forgets that and would otherwise try to build it
from source on `npm ci` or a repeat `npm install`, which needs Python and a C++ compiler. Keep the file when deploying.

## Security notes

- Passwords are bcrypt-hashed; login and the contact form are rate limited; login timing doesn't reveal valid emails.
- All input is validated with zod; SQL is parameterised; emails are plain text; names can't contain newlines.
- The Content-Security-Policy allows inline scripts/styles because your pages use them. Moving them into `.js`/`.css`
  files would let you remove `'unsafe-inline'`.
- Inquiries store the visitor's IP (for abuse tracking). Mention this in a privacy notice, and delete old inquiries
  via the admin API when you no longer need them.

## Not included (deliberately)

- **Image uploads.** Images are URLs (https or `/path`). Hosting them is a separate decision (disk, S3, Cloudinary).
- **Sending newsletters, and double opt-in.** Subscribers are collected, not mailed. Before sending real mail you
  should add a confirmation email so nobody can sign up someone else.
- **An admin UI.** The admin API works today with curl/Postman; a small dashboard page would sit on top of it.
- **The seed's journal dates and bodies.** Your journal page shows only month/year, so seeded posts are dated the 1st,
  and only the featured post has an excerpt. Nothing was invented to fill the rest.

## Next steps (easy)

1. Make `projects.html` fetch `/api/projects` and render the cards instead of hard-coding them (the filter buttons map 1:1 to `?category=`).
2. Same for `journal.html` → `/api/posts`, `services.html` → `/api/services` + `/api/process`, `studio.html` → `/api/team`.
3. Add an email field to the journal page's "Subscribe" block and POST it to `/api/newsletter/subscribe`.

## Layout

```
src/server.js          boot, graceful shutdown
src/app.js             middleware, security headers, route mounting
src/config.js          env parsing
src/db.js              schema
src/seed.js            content taken from your pages
src/validate.js        zod schemas (dropdown values live here)
src/crud.js            generic admin CRUD
src/routes/            public.js, auth.js, admin.js
src/services/mailer.js
public/                your six pages
test/api.test.js
```
