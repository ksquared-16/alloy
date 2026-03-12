# Quote-Start Person Creation & Linking

## Summary

At quote/inquiry stage we now create or find a **Person**, then create or find the legacy **Contact**, set **`contacts.person_id`** to the resolved person, and create/update **Opportunity**. We do **not** create Customer at quote; Customer and `customer_persons` are created at payment/confirm (Pass 1 unchanged).

---

## 1. Files changed

- **`web/app/api/book-v2/quote-start/route.ts`**
  - Added `findOrCreatePerson()` helper.
  - In POST handler: `publicOrgId`, call to `findOrCreatePerson()` before contact resolution.
  - `ContactRow` and `contactSelectCols` include `person_id`; fallback contact select (when `org_id` errors) already included `person_id`.
  - Existing contact: set `person_id` only when `existingContact.person_id == null`.
  - New contact: set `contactInsert.person_id = personId` when `personId != null`.
  - Log line extended to include `person_id`.

---

## 2. Person matching / creation logic

- **Find (in order):**
  1. By **email** (normalized: trim + lowercase), scoped by `org_id` when `ALLOY_PUBLIC_ORG_ID` is set.
  2. If no match, by **phone** (trimmed), scoped by `org_id` when set.
- **Create:** If no match and `org_id` is set, insert into `persons` with `org_id`, `first_name`, `last_name`, `email`, `phone`.
- **Returns:** Person `id` or `null` if: no email and no phone; or no `org_id` (so we can’t create); or insert fails.
- **Conflict (23505):** On unique violation, re-query by email (with `org_id`), then by phone (with `org_id`), and return that id if found; otherwise return `null`.

---

## 3. How `contact.person_id` is linked

- **New contact:** On insert, `contactInsert.person_id = personId` when `personId != null`.
- **Existing contact:** We only **set** `person_id` when `existingContact.person_id == null`; if the contact already has a `person_id`, we leave it unchanged (conservative).

---

## 4. Manual test checklist

- [ ] **Quote-start with new email**
  - POST quote-start with name, email, phone.
  - Expect: one new row in `persons`, one new row in `contacts` with `contacts.person_id` = that person id; no Customer.
- [ ] **Quote-start with existing email (contact exists, no person_id)**
  - Ensure a contact exists with that email and `person_id` null.
  - POST quote-start with same email.
  - Expect: person found or created; contact updated so `contacts.person_id` is set; no Customer.
- [ ] **Quote-start with existing contact that already has person_id**
  - Contact has `person_id` set.
  - POST quote-start with same email.
  - Expect: no change to `contacts.person_id`; Opportunity updated as usual.
- [ ] **Quote-start with phone only (no email)**
  - POST with phone (and name), no email.
  - Expect: person found/created by phone; contact found/created and `person_id` set when applicable.
- [ ] **Payment/confirm (Pass 1 unchanged)**
  - Complete flow: quote-start then payment/confirm.
  - Expect: Customer created at confirm if needed; `customer_persons` created when person exists; no regression.

---

## 5. Edge cases deferred

- **No `ALLOY_PUBLIC_ORG_ID`:** We do not create a person (we return `null`); contact is still created/updated but without `person_id`. Multi-org or per-request org not implemented.
- **Existing contact has `person_id`:** We never overwrite it; no “very clear exact match” logic to change it.
- **Person insert fails for reasons other than 23505:** We log and return `null`; contact is still created/updated without `person_id`.
- **Fuzzy matching:** Matching is exact (normalized email, exact phone); no fuzzy or nickname matching.
