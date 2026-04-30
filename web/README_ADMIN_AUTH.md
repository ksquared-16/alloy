# Admin Authentication Setup

This document describes how admin authentication and role-based access work for the admin portal.

## Overview

- **Login Page**: `/login` – Email/password via Supabase Auth
- **Admin Portal**: `/admin/*`, `/adminV2/*` (and `/admin/v2/*` rewrite) – Protected by session + role (`user_profiles`, `user_roles`, or `app_users`)
- **Protection**: Middleware requires a valid Supabase session on admin routes; server layout requires an allowed role (`admin` or `ops`)
- **Unauthorized**: Users without a valid profile or allowed role are redirected to `/unauthorized`

## Roles (V1)

| Role   | Access | Mutations (create/edit/delete) |
|--------|--------|--------------------------------|
| `admin` | Full access to all admin pages | Yes (discounts, verticals, etc.) |
| `ops`   | View all admin pages and records | No (read-only) |

Roles are stored in `public.user_profiles.role`. Only `admin` and `ops` are allowed to access the admin portal.

## Database: user_profiles

Ensure the table exists and has a row per admin/ops user:

- **`id`** (uuid, PK) – matches `auth.users.id`
- **`role`** (text) – `admin` or `ops`

Example (after creating a user in Supabase Auth):

```sql
insert into public.user_profiles (id, role)
values ('<auth.users.id>', 'admin');
```

## Environment Variables

### Required

- **`SUPABASE_URL`** (optional if `NEXT_PUBLIC_SUPABASE_URL` is set) – Same project URL; server-only clients fall back to `NEXT_PUBLIC_SUPABASE_URL`
- **`SUPABASE_ANON_KEY`** (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) – Supabase anon/public key (for auth)
- **`SUPABASE_SERVICE_ROLE_KEY`** – Used server-side for admin API and reading `user_profiles` (do not expose to client)

### Not used for admin access

- **`ALLOWED_ADMIN_EMAILS`** – Removed. Admin access is controlled only by `user_profiles.role` (admin/ops). Do not use email allowlists.

## How It Works

1. **Middleware** (`web/middleware.ts`): For `/admin*` and `/adminV2*`, checks for a valid Supabase session. If no user → redirect to `/login`.
2. **Admin layout** (`web/app/admin/layout.tsx`): Calls `getAdminAuth()` (user + `user_profiles.role`). If no profile or role not in `admin`/`ops` → redirect to `/unauthorized`.
3. **API mutations**: POST/PATCH/DELETE on admin routes (e.g. `/api/admin/discounts`, `/api/admin/verticals`) use `requireAdmin()` and return 403 if role is not `admin`. GET routes allow both `admin` and `ops`.
4. **UI**: `AdminAuthContext` exposes `canMutate` (true only for `admin`). Create/edit buttons are hidden for `ops`; drawers show read-only forms for `ops`.

## Creating Admin Users

1. In Supabase Dashboard: **Authentication** → **Users** → **Add user** → create user (email/password, confirm).
2. In SQL or Table Editor: insert a row into `public.user_profiles` with that user’s `id` and `role` = `admin` or `ops`.

The user signs in at `/login`; after that, access is determined by their `user_profiles.role`.

## Files

- `web/lib/adminAuth.ts` – `getAdminAuth()`, `requireAdmin()` for server layout and API routes
- `web/contexts/AdminAuthContext.tsx` – Client context for `userEmail`, `role`, `canMutate`
- `web/middleware.ts` – Session check for `/admin/*`
- `web/app/admin/layout.tsx` – Role check and redirect to `/unauthorized`
- `web/app/unauthorized/page.tsx` – “Access denied” page
