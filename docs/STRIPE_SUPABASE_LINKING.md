# Stripe → Supabase Customer Linking

## Overview
When a user confirms payment info on `/payment`, the system links the Stripe customer to Supabase contact/customer records, storing "card on file" metadata for future charges.

## Implementation

### Backend Helper Function
**File:** `backend/app/supabase_client.py`

**Function:** `link_stripe_customer_to_supabase()`

**Behavior:**
1. Resolves Supabase `contact_id` from `ghl_contact_id` (via `external_mappings`) or email/phone fallback
2. Upserts `customers` row:
   - Uses existing `contact.customer_id` if present
   - Finds by `stripe_customer_id` if exists
   - Creates new customer if neither exists
3. Updates `contacts.customer_id` to link to customer
4. Updates address fields from Stripe `billing_details.address` if provided (only if `address_source` is None or 'book')
5. Idempotent - safe to call multiple times

**Logging:**
- `SUPA_STRIPE_LINK_ATTEMPT` - when function is called
- `SUPA_STRIPE_LINK_SUCCESS` - when linking succeeds
- `SUPA_STRIPE_LINK_FAILED` - when linking fails (with reason)

### Integration Points

#### 1. POST /stripe/setup-intent
**File:** `backend/app/routes/stripe.py` (line ~395)

Called after Stripe Customer is created/retrieved and SetupIntent is created (before user confirms card).

**Code snippet:**
```python
# Link Stripe customer to Supabase (non-blocking)
if stripe_customer_id:
    try:
        link_stripe_customer_to_supabase(
            ghl_contact_id=resolved_ghl_contact_id,
            email=email,
            phone=phone,
            stripe_customer_id=stripe_customer_id,
            setup_intent_id=setup_intent.id,
        )
    except Exception as e:
        logger.warning(
            "create_setup_intent: Failed to link Stripe customer to Supabase (non-blocking): %s",
            str(e)
        )
        # Continue - payment setup succeeds even if Supabase link fails
```

**Note:** At this point, payment method details are not yet available (user hasn't confirmed card).

#### 2. Stripe Webhook: setup_intent.succeeded
**File:** `backend/app/routes/stripe.py` (line ~656)

Called when SetupIntent succeeds (after user confirms card). Includes full payment method details.

**Code snippet:**
```python
# Extract payment method details
if hasattr(pm, 'card') and pm.card:
    payment_method_brand = getattr(pm.card, 'brand', None)
    payment_method_last4 = getattr(pm.card, 'last4', None)

# Extract billing address if available
if hasattr(pm, 'billing_details') and pm.billing_details:
    billing_details = pm.billing_details
    if hasattr(billing_details, 'address') and billing_details.address:
        addr = billing_details.address
        billing_address = {
            "line1": getattr(addr, 'line1', None),
            "line2": getattr(addr, 'line2', None),
            "city": getattr(addr, 'city', None),
            "state": getattr(addr, 'state', None),
            "postal_code": getattr(addr, 'postal_code', None),
            "country": getattr(addr, 'country', None),
        }
        # Remove None values
        billing_address = {k: v for k, v in billing_address.items() if v is not None}
        if not billing_address:
            billing_address = None

# 4. Link Stripe customer to Supabase (non-blocking)
if stripe_customer_id:
    try:
        link_stripe_customer_to_supabase(
            ghl_contact_id=ghl_contact_id,
            email=email,
            phone=phone,
            stripe_customer_id=stripe_customer_id,
            setup_intent_id=setup_intent_id,
            payment_method_id=payment_method_id,
            payment_method_brand=payment_method_brand,
            payment_method_last4=payment_method_last4,
            billing_address=billing_address,
        )
    except Exception as e:
        logger.warning(
            "stripe_webhook: Failed to link Stripe customer to Supabase (non-blocking): %s event_id=%s",
            str(e),
            event_id
        )
        # Continue - webhook succeeds even if Supabase link fails
```

### Address Capture Logic

**Rules:**
- Only updates address if `address_source` is `None` or `'book'`
- OR if `address_line1` is missing
- Sets `address_source='stripe'` when updating
- Maps Stripe `billing_details.address` fields:
  - `line1` → `address_line1`
  - `line2` → `address_line2`
  - `city` → `city`
  - `state` → `state`
  - `postal_code` → `postal_code`
  - `country` → `country`

### Failure Behavior

- **Non-blocking:** Supabase failures do NOT break payment setup
- **Logging:** All failures are logged with `SUPA_STRIPE_LINK_FAILED` prefix
- **GHL sync:** Existing GHL sync behavior remains untouched

## Testing Checklist

### 1. Submit payment on /payment
- Navigate to `/payment` with valid quote
- Enter card details and confirm
- Verify SetupIntent is created successfully

### 2. Verify customers.stripe_customer_id populated
```sql
SELECT id, stripe_customer_id, primary_contact_id, default_payment_method_id, payment_method_brand, payment_method_last4
FROM customers
WHERE stripe_customer_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;
```

### 3. Verify customers.primary_contact_id set
- Should match the Supabase contact UUID
- Check: `customers.primary_contact_id = contacts.id`

### 4. Verify contacts.customer_id set
```sql
SELECT id, customer_id, email, phone
FROM contacts
WHERE customer_id IS NOT NULL
ORDER BY updated_at DESC
LIMIT 1;
```

### 5. Verify default_payment_method_id + last4/brand stored
- Check `customers.default_payment_method_id` is populated
- Check `customers.payment_method_brand` (e.g., "visa", "mastercard")
- Check `customers.payment_method_last4` (last 4 digits)

### 6. Verify address fields populated if Stripe provides them
```sql
SELECT id, address_line1, address_line2, city, state, postal_code, country, address_source
FROM contacts
WHERE address_source = 'stripe'
ORDER BY updated_at DESC
LIMIT 1;
```

## Log Verification

### In Render logs, look for:

**SetupIntent creation:**
```
SUPA_STRIPE_LINK_ATTEMPT ghl_contact_id=*** email=*** phone=*** stripe_customer_id=cus_***
SUPA_STRIPE_LINK_SUCCESS contact_id=*** customer_id=*** stripe_customer_id=cus_*** payment_method_id=None last4=None brand=None
```

**Webhook (after card confirmation):**
```
SUPA_STRIPE_LINK_ATTEMPT ghl_contact_id=*** email=*** phone=*** stripe_customer_id=cus_***
SUPA_STRIPE_LINK_SUCCESS contact_id=*** customer_id=*** stripe_customer_id=cus_*** payment_method_id=pm_*** last4=1234 brand=visa
```

**Failures:**
```
SUPA_STRIPE_LINK_FAILED reason=contact_not_found ghl_contact_id=*** email=*** phone=***
SUPA_STRIPE_LINK_FAILED reason=exception ghl_contact_id=*** error=***
```

## Frontend

No changes required - `/payment` already sends `ghl_contact_id` in the request body to `/stripe/setup-intent`.

## Database Schema

### customers table
- `id` (UUID, primary key)
- `stripe_customer_id` (text, unique where not null)
- `primary_contact_id` (UUID, FK -> contacts.id)
- `default_payment_method_id` (text, nullable)
- `payment_method_brand` (text, nullable)
- `payment_method_last4` (text, nullable)
- `setup_intent_id` (text, nullable)
- `name` (text, nullable)
- `org_id`, `vertical_id` (UUID, nullable)

### contacts table
- `id` (UUID, primary key)
- `customer_id` (UUID, FK -> customers.id, nullable)
- `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country` (text, nullable)
- `address_source` (text, nullable) - values: 'stripe', 'book', etc.

