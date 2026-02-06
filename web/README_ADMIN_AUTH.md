# Admin Authentication Setup

This document describes how admin authentication and role-based access work for the admin portal.

## Overview

- **Login Page**: `/login` – Email/password via Supabase Auth
- **Admin Portal**: `/admin/*` – Protected by session + role in `public.user_profiles`
- **Protection**: Middleware requires a valid session; server layout requires a `user_profiles` row with role `admin` or `ops`
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

- **`SUPABASE_URL`** (or `NEXT_PUBLIC_SUPABASE_URL`) – Supabase project URL
- **`SUPABASE_ANON_KEY`** (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) – Supabase anon/public key (for auth)
- **`SUPABASE_SERVICE_ROLE_KEY`** – Used server-side for admin API and reading `user_profiles` (do not expose to client)

### Not used for admin access

- **`ALLOWED_ADMIN_EMAILS`** – No longer used; access is determined by `user_profiles.role` only.

## How It Works

1. **Middleware** (`web/middleware.ts`): For `/admin/*`, checks for a valid Supabase session. If no user → redirect to `/login`.
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
