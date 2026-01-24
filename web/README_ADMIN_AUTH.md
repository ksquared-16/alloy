# Admin Authentication Setup

This document describes how to set up admin authentication for the staging environment.

## Overview

- **Login Page**: `/login` - Email/password authentication
- **Admin Page**: `/admin` - Protected route (placeholder UI)
- **Auth Provider**: Supabase Auth
- **Protection**: Middleware-based route protection with email allowlist

## Environment Variables

Add these to your Vercel project (staging environment):

### Required

The code supports both naming conventions (with fallbacks):

1. **`SUPABASE_URL`** (or `NEXT_PUBLIC_SUPABASE_URL`)
   - Your Supabase project URL
   - Example: `https://xxxxx.supabase.co`
   - **Note**: Code checks `NEXT_PUBLIC_SUPABASE_URL` first, then falls back to `SUPABASE_URL`

2. **`SUPABASE_ANON_KEY`** (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - Your Supabase anonymous/public key (NOT the service role key)
   - Found in: Supabase Dashboard → Settings → API → Project API keys → `anon` `public`
   - **Note**: Code checks `NEXT_PUBLIC_SUPABASE_ANON_KEY` first, then falls back to `SUPABASE_ANON_KEY`
   - **Important**: Do NOT use `SUPABASE_SERVICE_ROLE_KEY` for auth - that's for admin database operations

### Optional (for allowlist protection)

3. **`ALLOWED_ADMIN_EMAILS`** (recommended for staging)
   - Comma-separated list of allowed admin email addresses
   - Example: `admin@example.com,another@example.com`
   - **Staging**: Required for access
   - **Production**: If not set, `/admin` redirects to homepage. If set, only listed emails can access.

4. **`NEXT_PUBLIC_APP_ENV`**
   - Set to `"staging"` for staging environment
   - Used to determine if allowlist should be enforced

## Creating Admin Users in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Users**
3. Click **"Add user"** → **"Create new user"**
4. Enter:
   - **Email**: The admin email address
   - **Password**: A secure password (user can change this later)
   - **Auto Confirm User**: ✅ Check this box (or manually confirm via email)
5. Click **"Create user"**

The user can now sign in at `/login` with their email and password.

## How It Works

1. **Login Flow**:
   - User visits `/login`
   - Enters email/password
   - Supabase Auth validates credentials
   - On success, redirects to `/admin`

2. **Route Protection**:
   - Middleware intercepts requests to `/admin/*`
   - Checks for valid Supabase session
   - If no session → redirects to `/login`
   - If session exists:
     - **Staging**: Checks email against `ALLOWED_ADMIN_EMAILS`
     - **Production**: Checks email against `ALLOWED_ADMIN_EMAILS` (if set), otherwise denies access
   - If email not in allowlist → redirects to `/login?error=unauthorized`

3. **Sign Out**:
   - Click "Sign Out" button on `/admin` page
   - Clears Supabase session
   - Redirects to `/login`

## Security Notes

- **Staging**: Allowlist is enforced when `NEXT_PUBLIC_APP_ENV=staging`
- **Production**: 
  - If `ALLOWED_ADMIN_EMAILS` is set, only listed emails can access
  - If `ALLOWED_ADMIN_EMAILS` is not set, `/admin` redirects to homepage (denied)
  - This prevents accidental exposure in production

## Troubleshooting

### "You are not authorized" error
- Check that the user's email is in `ALLOWED_ADMIN_EMAILS`
- Verify email is lowercase and matches exactly (case-insensitive comparison)

### "Server configuration error" or config error message
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are set
- Check that values are correct in Vercel environment variables
- Ensure you're using the **anon key**, not the service role key

### Can't sign in
- Verify user exists in Supabase Auth
- Check that user is confirmed (not pending email confirmation)
- Verify email/password are correct

## Files Created

- `web/lib/supabaseClient.ts` - Client-side Supabase auth helper
- `web/lib/supabaseServer.ts` - Server-side Supabase auth helper
- `web/middleware.ts` - Route protection middleware
- `web/app/login/page.tsx` - Login page
- `web/app/admin/page.tsx` - Admin page (server component)
- `web/app/admin/AdminClient.tsx` - Admin page (client component)

