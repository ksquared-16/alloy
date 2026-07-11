# Platform Simplification — Authenticated Staging QA Checklist

**Environment:** staging deploy at or after `e9481191442d96ca543f45f2aa4839827f79f875`

**Prerequisites:** Operator admin session with location mutate permission.

Record each item: Pass / Fail / Blocked, screenshot path, notes.

---

## 1. Settings — `/settings/locations`

| # | Step | Expected | Result | Screenshot |
|---|------|----------|--------|------------|
| 1.1 | Navigate to `/settings/locations` | Locations Configuration Mode loads | | |
| 1.2 | Select an existing campus | Detail workspace shows selected site; URL has `?locationId=<id>` | | |
| 1.3 | Click **Add Location** | Inline `locations-site-create` panel opens | | |
| 1.4 | Create a new site | List refreshes; new site selected; URL updated | | |
| 1.5 | During 1.1–1.4 | **No** legacy entity drawer opens | | |

## 2. Global Search — Campus

| # | Step | Expected | Result | Screenshot |
|---|------|----------|--------|------------|
| 2.1 | Open Global Search | Dropdown opens | | |
| 2.2 | Search known campus | Campus hit under Campuses | | |
| 2.3 | Click campus result | `/settings/locations?locationId=<id>` | | |
| 2.4 | Verify workspace | Campus selected in list and detail | | |
| 2.5 | Observe drawer | **No** legacy location drawer | | |
| 2.6 | Browser Back | Prior context restored where supported | | |

## 3. Opportunity / Person / Child

| # | Step | Expected | Result | Screenshot |
|---|------|----------|--------|------------|
| 3.1 | Open Opportunity from queue | VM Focus Panel loads | | |
| 3.2 | Open Person from search | Person VM runtime loads | | |
| 3.3 | Open Child inquiry path | Child VM runtime loads | | |

## 4. Unsupported historical entity

| # | Step | Expected | Result | Screenshot |
|---|------|----------|--------|------------|
| 4.1 | Visit `/legacy-admin` | Redirects to `/workspace` | | |
| 4.2 | Legacy entity open affordances | Fail closed or absent; no blank drawer | | |
