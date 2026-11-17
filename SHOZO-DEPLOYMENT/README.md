# SHOZO — deployment package

This archive is organized for **GitHub Pages (frontend)** plus a separate **Node.js backend**.

## Folder structure

- `frontend/` — six static website pages. GitHub Pages publishes this folder only.
- `backend/` — Express API, SQLite database layer, seed data, tests and backend README.
- `.github/workflows/deploy-pages.yml` — automatically deploys `frontend/` to GitHub Pages when you push to `main`.

## 1. Deploy the frontend to GitHub Pages

1. Extract this ZIP.
2. Upload the **contents** of this folder to the root of your GitHub repository (so `.github/`, `frontend/`, `backend/` and this README are at repository root).
3. In GitHub, open **Settings → Pages** and select **GitHub Actions** as the build/deployment source.
4. Push to the `main` branch (or run the workflow from **Actions**).
5. Wait for the `Deploy SHOZO website to GitHub Pages` workflow to finish. Your site URL will be shown in the workflow deployment.

The workflow publishes only `frontend/`, not the backend source.

## 2. Deploy the backend separately

GitHub Pages cannot run Node.js or SQLite. Deploy the `backend/` directory to a Node.js host that supports a persistent disk (for example, a VPS or a suitable PaaS).

Use Node.js 22 or newer. Configure these environment variables in the backend host:

- `NODE_ENV=production`
- `PORT` — normally supplied by the host
- `JWT_SECRET` — random secret, at least 32 characters
- `ADMIN_EMAIL` — your admin login email
- `ADMIN_PASSWORD` — at least 10 characters and at most 72 bytes
- `DB_PATH` — path on the host's persistent disk, e.g. `/var/data/shozo.db`
- `TRUST_PROXY=1` when running behind the host's reverse proxy
- `CORS_ORIGINS` — your exact GitHub Pages origin, e.g. `https://YOUR-USERNAME.github.io`

Then run:

```bash
cd backend
npm ci
npm run seed
npm start
```

Do not use an ephemeral filesystem for the SQLite database; it can be lost during redeploys. Keep the database on a persistent disk and back it up.

## 3. Connect the contact form to the backend

In `frontend/contact.html`, find:

```js
var API_BASE = ''; // same origin. If the API lives elsewhere: 'https://api.example.com'
```

After the backend is deployed, replace the empty string with your actual backend base URL, for example:

```js
var API_BASE = 'https://YOUR-BACKEND-HOST';
```

Use your real deployed backend URL, with no trailing slash. The backend's `CORS_ORIGINS` must match your GitHub Pages origin. Commit and push the change.

**Until this is configured, the contact form will not submit successfully from GitHub Pages.** The contact form is the only page currently connected to the API. Projects, journal, services and studio pages remain static and display their existing hard-coded content; the backend endpoints and seed data are present, but those pages have not yet been converted to load content dynamically.

## 4. Verify the backend

From `backend/`:

```bash
npm ci
npm test
npm run seed
npm start
```

Open `http://localhost:3000/api/health`; a working server returns `{"ok":true}`. The backend also serves its own copy of the six pages from `backend/public/` for local/same-origin use.

## Important security notes

- Never upload a real `.env` file, database file, admin password, SMTP password or JWT secret to GitHub.
- Copy `backend/.env.example` to `.env` only for local development and fill in private values locally.
- Set production secrets in your backend host's environment-variable settings, not in source code.
- The backend uses SQLite. Choose a host with persistent storage.
