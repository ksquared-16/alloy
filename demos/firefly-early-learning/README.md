# Firefly Early Learning — Demo Site

Lightweight demo childcare provider website for validating Alloy embedded forms, inquiry routing, lead creation, location routing, and mobile iframe behavior.

**Not a production marketing site.**

## Run locally

```bash
cd demos/firefly-early-learning
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

From this directory:

```bash
npm install
vercel
```

Or connect the repo in Vercel and set **Root Directory** to `demos/firefly-early-learning`.

**Framework Preset:** Next.js (leave **Output Directory** empty — do not set it to `public`).

No environment variables are required.

## Pages

| Route     | Purpose                          |
| --------- | -------------------------------- |
| `/`       | Home — hero, features, programs, locations |
| `/contact`| Choose a campus for tour inquiry |
| `/contact/west-campus` | West Campus — Alloy form iframe |
| `/contact/north-campus` | North Campus — Alloy form iframe |
| `/contact/south-campus` | South Campus — Alloy form iframe |

## Validation flow

Family → Website → Inquiry Form → Alloy → Opportunity → Enrollment Operations

After submitting a test inquiry on `/contact`, confirm in Alloy staging:

- Opportunity created with status `new_inquiry`
- Correct location routing
- Appears in New Leads
- Duplicate match review works for similar family/contact data

## Scope

This sprint covers only the proving-ground website. Out of scope: enrollment packets, parent portal, location detail pages, CMS, auth, database, admin tooling.
