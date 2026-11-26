# Gutters Lead Capture - Implementation Guide

## Overview

This implementation adds a new "Gutters" vertical lead capture flow that writes to Supabase FIRST (source of truth). Leads are NOT pushed to GoHighLevel in this step.

## Database Schema

### New Tables

Two new tables were added for multi-vertical support:

1. **`verticals`** - Defines service verticals (cleaning, gutters, etc.)
2. **`contact_verticals`** - Many-to-many join table linking contacts to verticals

See `web/supabase/migrations/001_add_verticals_tables.sql` for the full migration.

### Migration Steps

1. Run the SQL migration in your Supabase SQL editor:
   ```bash
   # Copy contents of web/supabase/migrations/001_add_verticals_tables.sql
   # and run in Supabase Dashboard → SQL Editor
   ```

2. The migration will:
   - Create `verticals` table with default entries for "cleaning" and "gutters"
   - Create `contact_verticals` join table
   - Add necessary indexes

## Environment Variables

### Required for Vercel (Staging & Production)

Add these environment variables in Vercel:

1. **`SUPABASE_URL`** (Server-side only)
   - Your Supabase project URL
   - Example: `https://xxxxx.supabase.co`
   - Found in: Supabase Dashboard → Settings → API → Project URL

2. **`SUPABASE_SERVICE_ROLE_KEY`** (Server-side only)
   - ⚠️ **CRITICAL**: This is a service role key that bypasses RLS
   - **NEVER** expose this client-side
   - Found in: Supabase Dashboard → Settings → API → service_role key
   - Use only in Next.js API routes (server-side)

3. **`NEXT_PUBLIC_APP_ENV`** (Public, for staging banner)
   - Set to `"staging"` for staging environment
   - Set to `"production"` (or omit) for production
   - Used to show staging banner and tag leads in metadata

### Vercel Configuration

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add the variables above for:
   - **Production** environment
   - **Preview** environment (for staging)
   - **Development** environment (optional, for local dev)

## Files Created/Modified

### New Files

1. **`web/supabase/migrations/001_add_verticals_tables.sql`**
   - SQL migration for verticals and contact_verticals tables

2. **`web/lib/supabase.ts`**
   - Server-side Supabase client utilities
   - Functions for contact upsert, vertical management, opportunity creation

3. **`web/app/api/leads/gutters/route.ts`**
   - Next.js API route handler for gutter lead intake
   - Handles contact upsert, vertical association, opportunity creation

4. **`web/app/gutters/page.tsx`**
   - Gutters landing page with lead form

5. **`web/components/gutters/GutterLeadForm.tsx`**
   - Form component for gutter lead capture
   - Validates phone/email, handles submission

6. **`web/app/quote/page.tsx`**
   - Vertical selection page ("What do you need?")
   - Routes to cleaning or gutters

### Modified Files

1. **`web/app/page.tsx`**
   - Updated main CTAs to route to `/quote` instead of directly to cleaning

2. **`web/components/Navbar.tsx`**
   - Added "Gutters" link to navigation

## Data Flow

1. User submits gutter lead form on `/gutters`
2. Form POSTs to `/api/leads/gutters`
3. API route:
   - Upserts contact in `contacts` table (match by email, fallback phone)
   - Ensures "gutters" vertical exists in `verticals` table
   - Creates `contact_verticals` association
   - Creates opportunity in `opportunities` table with:
     - `vertical_id` = gutters vertical UUID
     - `primary_contact_id` = contact UUID
     - `name` = "First Last — Gutters Early Signup"
     - `status` = "open"
     - `source` = "website"
     - `metadata` = intake data + app_env + timestamp

## Testing

### Manual Test Steps

1. **Staging Environment**:
   ```bash
   # Visit staging site
   https://staging.workwithalloy.com/gutters
   
   # Verify staging banner is visible (red banner at top)
   # Submit form with test data
   # Check Supabase Dashboard:
   #   - contacts table: new contact created/updated
   #   - verticals table: "gutters" entry exists
   #   - contact_verticals: association created
   #   - opportunities: new opportunity with metadata
   ```

2. **Production Environment**:
   ```bash
   # Visit production site
   https://www.workwithalloy.com/gutters
   
   # Verify NO staging banner
   # Submit form
   # Verify records in Supabase
   ```

3. **Verify Existing Cleaning Flow**:
   ```bash
   # Visit /quote page
   # Click "Home Cleaning"
   # Verify existing cleaning flow still works
   # Verify no changes to /services/cleaning behavior
   ```

### Database Verification Queries

```sql
-- Check verticals exist
SELECT * FROM verticals;

-- Check contact_verticals associations
SELECT 
  c.first_name, 
  c.last_name, 
  v.key as vertical_key
FROM contact_verticals cv
JOIN contacts c ON cv.contact_id = c.id
JOIN verticals v ON cv.vertical_id = v.id;

-- Check opportunities with metadata
SELECT 
  o.name,
  o.status,
  o.source,
  v.key as vertical_key,
  o.metadata->>'app_env' as app_env,
  o.metadata->'intake' as intake_data
FROM opportunities o
LEFT JOIN verticals v ON o.vertical_id = v.id
WHERE o.source = 'website'
ORDER BY o.created_at DESC
LIMIT 10;
```

## Next Steps (Future)

- Push leads to GoHighLevel (not implemented in this step)
- Add more verticals (plumbing, HVAC, etc.)
- Add email notifications
- Add admin dashboard for viewing leads

## Notes

- **Staging-safe**: All changes are backward compatible
- **Production-safe**: Existing cleaning flows remain unchanged
- **No GHL push**: Leads are stored in Supabase only (as requested)
- **Idempotent**: Contact upserts are safe to run multiple times
- **Multi-vertical ready**: Schema supports contacts interested in multiple verticals

