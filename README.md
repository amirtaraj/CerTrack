# Certification tracker

MongoDB + Express API + React UI. Admins see coverage and what is about to lapse; everyone else adds and edits their own certifications, by hand or from their Credly profile.

## Run it

**With Docker** (app + MongoDB):

```bash
export JWT_SECRET=$(openssl rand -hex 32)
export ADMIN_PASSWORD='pick-a-starting-password1'
# Serving over plain http (no TLS)? Also: export COOKIE_SECURE=false
docker compose up --build -d
docker compose exec app node src/seed.js      # loads Active_Certifications.xlsx
```
Open http://localhost:4000 and sign in as the admin (employee ID `1000` unless you changed `ADMIN_EMP_ID`).

**Locally** (needs Node 20+ and a MongoDB):

```bash
cp .env.example server/.env        # then edit it
npm run setup
npm run seed                       # optional: loads server/seed/Active_Certifications.xlsx
npm run dev:server                 # API on :4000
npm run dev:client                 # UI on :5173 (proxies /api)
```

## How people sign in
Employee ID + password. Imported people get `DEFAULT_PASSWORD` and are forced to set their own at first sign-in. Admins can reset a password from **People**.

## Importing your spreadsheet
`npm run seed` or **Admin > Import spreadsheet** (it has a "Check file first" mode that writes nothing). It copes with Excel dates, serial numbers, `DD/MM/YYYY` text, "No expiry", and blanks; fixes "Last, First" names and specialization spelling (`TOSCA`/`Tosca`, `AZURE`/`Azure`, `Perfromance`); merges duplicate rows (keeping the later expiry); and reports anything it could not read. People and certifications already in the database are never overwritten, so re-importing is safe.

On your current file this gives 87 people and 154 certifications, and flags: `31/09/2025` for emp 6216 (September has 30 days), 13 certifications with no expiry date and not marked "No expiry", 3 duplicate rows merged, and two people listed under two spellings.

## Credly
People paste their public Credly profile link (**My certifications > Add from Credly**), see their badges, tick the ones to add, and the server creates them with issue/expiry dates and a verification link. Adding is de-duplicated by Credly badge ID and by certification name.

- It reads `https://www.credly.com/users/<profile>/badges.json`, the feed behind public profile pages. This is **not a documented, versioned Credly API**, so Credly could change it. If you need something contractual, Credly's Organization API (issuer-side, token-based) is the supported route; it would slot in next to `server/src/lib/credly.js`.
- Profiles must be public. Only accepted badges are listed.
- The host is fixed and the profile name is validated, so the feature can't be used to make the server fetch arbitrary URLs.

## Layout
```
server/src/lib/importer.js   spreadsheet parsing + cleanup
server/src/lib/credly.js     Credly fetch/mapping
server/src/lib/status.js     valid / expiring / lapsed logic (one place, used by API and filters)
server/src/routes/           auth.js, me.js (members), admin.js
client/src/pages/            Overview (expiry runway), AdminCerts, People, ImportSheet, MyCerts, Profile
```
`npm test` runs the logic and HTTP-layer tests (no database needed).

## Before real use
- Set a strong `JWT_SECRET`, and serve behind HTTPS (cookies are `Secure` by default).
- Back up the `mongo-data` volume.
- Sessions last 8 hours; sign-in is rate-limited to 20 attempts per 15 minutes per IP.
