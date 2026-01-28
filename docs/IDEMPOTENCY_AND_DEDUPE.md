# Idempotency and Deduplication

This document describes how the Alloy backend ensures idempotent operations and prevents duplicate records across Supabase, GHL, and Stripe integrations.

## Table of Contents

1. [External Mapping Upsert](#external-mapping-upsert)
2. [Opportunity Deduplication](#opportunity-deduplication)
3. [Contact Resolution](#contact-resolution)
4. [Customer Reuse](#customer-reuse)
5. [Discount Redemption](#discount-redemption)

---

## External Mapping Upsert

**Function:** `upsert_external_mapping()` in `backend/app/supabase_client.py`

**Purpose:** Create or update mappings between external system IDs (GHL) and internal Supabase UUIDs.

**Idempotency Strategy:**
- Uses PostgREST upsert with `Prefer: resolution=merge-duplicates,return=representation`
- Handles empty response bodies gracefully (201/204/empty JSON)
- Treats 409 Conflict (duplicate key violation) as success - fetches existing mapping
- Returns consistent dict: `{"status": "created"|"updated"|"already_exists", "mapping": {...}}`

**Logging:**
- `SUPA_MAPPING_UPSERT_ATTEMPT` - Before attempt
- `SUPA_MAPPING_UPSERT_SUCCESS` - On success (includes status)
- `SUPA_MAPPING_UPSERT_FAILED` - On failure (includes status_code and body)

**Example:**
```python
result = upsert_external_mapping(
    source="ghl",
    entity_type="contact",
    external_id="abc123",
    internal_id="uuid-456",
    internal_table="contacts"
)
# Returns: {"status": "created", "mapping": {"id": "...", ...}}
```

---

## Opportunity Deduplication

**Function:** `find_or_create_opportunity()` in `backend/app/supabase_client.py`

**Purpose:** Prevent duplicate opportunities when the same lead is submitted multiple times.

**Deduplication Strategy (in order):**

1. **Mapping-first (if GHL opportunity_id available):**
   - Check `external_mappings` for `source='ghl'`, `entity_type='opportunity'`, `external_id=<ghl_opp_id>`
   - If found → reuse existing Supabase opportunity

2. **Time-window fallback (if no mapping):**
   - Query opportunities by `primary_contact_id` = contact UUID
   - Filter: `status IN ('open','new','lead')` AND `created_at >= now() - 10 minutes`
   - If found → reuse most recent opportunity

3. **Create new:**
   - Only if neither strategy finds an existing opportunity

**Logging:**
- `SUPA_OPP_RESOLVE path=mapping|recent_contact_window|created opportunity_id=... contact_id=...`

**Usage:**
```python
opp_result = find_or_create_opportunity(
    opportunity_payload,
    ghl_opportunity_id=None,  # Optional - not available at lead time
    supabase_contact_id=contact_uuid
)
# Returns: {"status": "found"|"created", "opportunity": {...}}
```

**When GHL opportunity_id arrives later (dispatch webhook):**
- Creates external mapping linking GHL opportunity_id → Supabase opportunity UUID
- If mapping already exists, reuses the Supabase opportunity

---

## Contact Resolution

**Deterministic Order (applied in `/leads/cleaning`, `/discounts/*`, `/stripe/setup-intent`, Stripe webhooks):**

1. **Priority 1: GHL contact_id mapping**
   - Resolve via `external_mappings`: `source='ghl'`, `entity_type='contact'`, `external_id=<ghl_contact_id>`
   - If found → use `internal_id` (Supabase contact UUID)

2. **Priority 2: Email lookup**
   - Query `contacts` by `email` (case-insensitive, normalized to lowercase)
   - If found → use that contact

3. **Priority 3: Phone lookup**
   - Query `contacts` by `phone` (exact match, normalized)
   - If found → use that contact

4. **Priority 4: Create new**
   - Only if none of the above find an existing contact

**After resolution:**
- Always ensure external mapping exists: `upsert_external_mapping(ghl_contact_id → supabase_contact_id)`
- Treat duplicate mapping as success (idempotent)

**Logging:**
- `CONTACT_RESOLVE path=mapping|email|phone|created contact_id=...`

**Example:**
```python
# In leads.py
supabase_contact_id = resolve_contact_id_from_ghl(ghl_contact_id)  # Priority 1
if not supabase_contact_id:
    contact = find_contact_by_email(email)  # Priority 2
    if contact:
        supabase_contact_id = contact.get("id")
if not supabase_contact_id:
    contact = find_contact_by_phone(phone)  # Priority 3
    if contact:
        supabase_contact_id = contact.get("id")
if not supabase_contact_id:
    supabase_contact = upsert_contact(payload)  # Priority 4
    supabase_contact_id = supabase_contact.get("id")
```

---

## Customer Reuse

**Function:** `link_stripe_customer_to_supabase()` in `backend/app/supabase_client.py`

**Purpose:** Link Stripe customers to Supabase customers/contacts without creating duplicates.

**Customer Resolution Order:**

1. **Contact's existing customer_id:**
   - If `contacts.customer_id` is set → update that customer row
   - Do NOT create a new customer

2. **Stripe customer_id lookup:**
   - Query `customers` by `stripe_customer_id`
   - If found → reuse and attach to contact (`contacts.customer_id = customer.id`)

3. **Create new customer:**
   - Only if neither strategy finds an existing customer

**Logging:**
- `CUSTOMER_RESOLVE path=contact.customer_id|stripe_customer_id|created customer_id=...`

**Idempotency:**
- Safe to call multiple times with the same Stripe customer_id
- Updates existing customer if found, creates only if missing

---

## Discount Redemption

**Endpoints:** `POST /discounts/redeem`, `POST /discounts/unredeem`

**Contact Resolution:**
- Uses same deterministic order as above (mapping → email → phone)
- Does NOT fail if mapping is missing (falls back to email/phone)

**Idempotency:**
- `discount_redemptions` table has UNIQUE constraint on `(contact_id, discount_code_id)`
- If already redeemed → returns `{"success": false, "reason": "already_used"}`
- Still applies GHL tag even if already redeemed (idempotent tagging)

**GHL Tagging:**
- Uses `discount_codes.ghl_tag` if present, else `discount:<CODE_NORMALIZED>`
- Applied on successful redemption AND on "already_used" idempotent path
- Tagging is idempotent (safe if tag already exists)

**Unredeem:**
- Only removes redemption if `opportunity_id IS NULL` AND `job_id IS NULL`
- Does NOT remove GHL tag (TODO: implement if needed for clean UX)

---

## Testing Checklist

### Lead Submission Deduplication
- [ ] Submit same lead twice in a row → same Supabase contact + one opportunity
- [ ] Submit lead with existing email → reuses contact
- [ ] Submit lead with existing phone → reuses contact
- [ ] Submit lead with GHL contact_id that has mapping → reuses contact

### Mapping Upsert Idempotency
- [ ] Insert same mapping twice → no crash, no JSON decode error
- [ ] Insert mapping that already exists (409) → treated as success
- [ ] Empty response body → handled gracefully

### Opportunity Deduplication
- [ ] Submit lead twice within 10 minutes → reuses opportunity
- [ ] Submit lead, then dispatch with GHL opportunity_id → creates mapping
- [ ] Dispatch with GHL opportunity_id that has mapping → reuses opportunity

### Customer Reuse
- [ ] Link Stripe customer to contact with existing customer_id → updates customer
- [ ] Link Stripe customer_id that exists → reuses customer
- [ ] Link Stripe customer_id that doesn't exist → creates new customer

### Discount Flow
- [ ] Apply discount → redemption created, GHL tag applied
- [ ] Apply same discount twice → "already_used", tag still applied
- [ ] Remove discount → redemption deleted (if opportunity_id/job_id NULL)

### Stripe Setup Intent
- [ ] Card declined → logs show error_code, decline_code, type
- [ ] Setup intent succeeded → Supabase customer linked
- [ ] Stripe mode logged at startup (live/test)

---

## Key Principles

1. **Idempotency First:** All operations are safe to retry
2. **Mapping-First Resolution:** External IDs (GHL) are the primary keys for deduplication
3. **Graceful Degradation:** Fallback to email/phone if mapping missing
4. **Non-Blocking:** Supabase failures don't break GHL/Stripe flows
5. **Comprehensive Logging:** Every resolution path is logged for debugging

