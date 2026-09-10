---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Alloy API — Locations

> ✅ **Implemented and callable.** `GET /api/v1/locations` is live and described by
> the governed contract at
> [`alloy-public-api.v1.json`](../../openapi/alloy-public-api.v1.json).

## What a Location is

A Location is a place your organization operates: a **site**, or a **unit**
inside one.

```text
Site — "Downtown"
 ├── unit / physical_space     "Room 1"        a licensed room
 │    └── unit / operational_group "Toddler 1"  a group with ratio and staffing
 └── unit / shared_space       "Playground"
```

`unit_role` tells you which kind of unit you are looking at. **A null role means
unknown, not a default** — Alloy never back-filled legacy rooms to a value it
could not verify, and the API does not invent one either.

**Customer and vendor premises are never returned.** Alloy stores service
addresses on the same table, and those describe private homes. No scope reaches
them.

## Authorization

```text
access token → installation → organization + location boundary
```

You never send an organization. Which locations you can read is decided entirely
by your installation:

| Installation boundary | What you can read |
|---|---|
| **Org-wide** | Every site and unit in your organization |
| **Restricted to a site** | That site **and the units under it** |
| **Restricted, empty** | **Nothing.** An empty boundary never means "all" |

A restricted boundary admits descendants because a site's rooms are part of the
site. If you need a location that is not under a granted site, the operator adds
it to your installation — nothing you send can grant it.

## Scope

```text
locations.read
```

Exact match. `locations`, `locations.readwrite` and `locations.read.all` do **not**
satisfy it. Without it you get `403 forbidden_scope`.

## Reading them

```bash
curl "https://<alloy-host>/api/v1/locations?limit=100" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "type": "site",
      "unit_role": null,
      "name": "Downtown",
      "parent_id": null,
      "site_id": "11111111-1111-4111-8111-111111111111",
      "active": true,
      "timezone": "America/Los_Angeles",
      "updated_at": "2026-01-01T00:00:00.000Z"
    }
  ],
  "next_cursor": "eyJzb3J0S2V5IjoiMjAyNi0wMS0wMSJ9"
}
```

`site_id` is resolved by Alloy's own site-resolution authority, so you never have
to walk `parent_id` yourself to find out which site a room belongs to.

## Filters

Filters **narrow what you are already allowed to see**. They never grant
anything.

| Parameter | Effect |
|---|---|
| `type` | `site` or `unit` |
| `parent_id` | Direct children of that location |
| `location_id` | Just that one location — **use this for a single-resource read** |
| `limit` | Page size, default 50, clamped to 200 |
| `cursor` | Continue from `next_cursor` |

Asking for a location outside your boundary returns an **empty page**, not an
error and not the location. That is deliberate: an error would confirm the
location exists.

## Pagination

```bash
curl "https://<alloy-host>/api/v1/locations?limit=100" -H "Authorization: Bearer $TOKEN"
# → use next_cursor
curl "https://<alloy-host>/api/v1/locations?limit=100&cursor=<next_cursor>" -H "Authorization: Bearer $TOKEN"
```

Stop when `next_cursor` is `null` — you never need an extra request to discover
there is nothing left. A malformed cursor returns `400 invalid_cursor` rather
than silently restarting, because a silent restart is an infinite loop you cannot
see.

Cursors are positions, not permissions. Replaying one from a different context
cannot widen what you receive.

## Identifiers

`id` is **Alloy's canonical identity** for the location. It is an opaque string —
do not parse it, and do not expect Alloy to store yours in its place.

If you hold your own location identifiers, correlate them on your side. Alloy
does not accept a partner identifier as a substitute for canonical identity, and
no provider alias appears on this resource.

## What is not here yet

No `POST`, `PATCH` or `DELETE` — this resource is read-only. No children, people,
households or enrolment. Those are described in
[Conventions](conventions.md) as contract only, and no endpoint serves them.
