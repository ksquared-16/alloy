# Booking workflow person.phone verification report

**Scope:** Confirm whether `booking_confirmed` includes `person` / `person.phone` and whether create_message can use `{{person.phone}}`; recommend safest migration for the two contact-based workflows (Booking: Customer Cancel Link + SMS, Booking: Customer Reschedule Link + SMS) that use `"to_value": "{{contact.phone}}"`.

---

## 1. Is `person.phone` present in the booking_confirmed workflow payload?

**Yes, when the contact is linked to a person.**

**Source:** `web/app/api/book-v2/confirm/route.ts` (lines 1202–1231).

- Contact is loaded: `contacts.select("*").eq("id", contactId).single()`.
- If `contact.person_id` is set, person is loaded:  
  `persons.select("id, first_name, last_name, email, phone").eq("id", contactWithPerson.person_id).maybeSingle()`.
- `eventPayload` includes:
  - `contact: contactRow ?? null`
  - `person: personRow ?? null`
- So **`person`** is present when the booking contact has `person_id`, and **`person.phone`** is present when that person row has `phone` (it’s in the select).

**When `person` is missing:**  
If the contact has no `person_id` (legacy or not backfilled), `personRow` stays `null` and `eventPayload.person` is `null`. Then `person.phone` is not present (any path through `person` yields `undefined`).

---

## 2. Can create_message payload templating safely use `{{person.phone}}`?

**Yes.** Templating supports any dot-path from the payload.

**Source:** `web/lib/workflowRun.ts` (create_message, lines 768–770), `web/lib/workflowTemplate.ts`.

- `create_message` uses:
  - `toValue = renderTemplate(toValueRaw, payload)`
- `renderTemplate` (workflowTemplate.ts) replaces `{{path}}` with `getByPath(eventPayload, path)`.
- `getByPath` does a dot-path lookup (e.g. `person.phone` → `payload.person?.phone`).
- So **`{{person.phone}}`** is valid and resolves to `payload.person?.phone` when `person` exists and has `phone`.

**Behavior when `person` is null:**  
`getByPath(payload, "person.phone")` returns `undefined`; `renderTemplate` turns null/undefined into empty string. So **if you switch to `{{person.phone}}` only**, and the contact has no `person_id`, the recipient `to_value` becomes **empty** and the message would have no destination.

---

## 3. Is a fallback pattern like `{{contact.phone}}` still needed?

**Yes, for safety**, until every booking contact is guaranteed to have a linked person (and that person has a phone when you need SMS).

- **Today:** `{{contact.phone}}` always comes from `payload.contact` (the contact row from the booking), so it works even when there is no `person_id`.
- **If you move to `{{person.phone}}` only:** Contacts without `person_id` (or with person but no phone) get an empty `to_value`.
- The current template engine does **not** support fallback syntax (e.g. `{{person.phone || contact.phone}}` or similar). So you either keep a fallback in code or keep using `contact.phone` where person might be missing.

---

## 4. Exact safest migration plan (no changes made)

1. **Confirm payload shape (done)**  
   - `booking_confirmed` from book-v2/confirm includes `person` (and thus `person.phone` when present) alongside `contact`.  
   - create_message’s `to_value` is rendered with `renderTemplate`, so `{{person.phone}}` is valid and safe to use when `person` exists.

2. **Decide migration strategy (pick one).**

   - **Option A – No workflow change until data is ready**  
     - Keep `to_value`: `{{contact.phone}}` for “Booking: Customer Cancel Link + SMS” and “Booking: Customer Reschedule Link + SMS”.  
     - After all booking-relevant contacts have `person_id` (and persons have phone where needed), switch both workflows to `to_value`: `{{person.phone}}`.  
     - No code changes; safe; migration is only config once data is ready.

   - **Option B – Prefer person, fall back to contact in code (recommended if you want to switch now)**  
     - In `workflowRun.ts`, in the create_message branch, when resolving `to_value`:
       - Compute `toValue = renderTemplate(toValueRaw, payload)` as today.
       - If `toValue` is empty **and** `toValueRaw` contains the substring `"person.phone"` (or `"person.phone"` appears in the template), compute a fallback:  
         e.g. `renderTemplate(toValueRaw, { ...payload, person: payload.contact ?? null })` (so `person.phone` resolves to `contact.phone` when `person` was null), and use that result when non-empty.
     - Then update the two workflows to use `to_value`: `{{person.phone}}`.  
     - Legacy contacts without `person_id` still get `contact.phone` via the fallback; contacts with person get `person.phone`.

   - **Option C – Add template fallback syntax**  
     - Extend `renderTemplate` / template syntax to support a fallback (e.g. `{{person.phone||contact.phone}}` or `{{person.phone|contact.phone}}`) and use it in the two workflows.  
     - More invasive; only worth it if you want a generic pattern for many workflows.

3. **If you choose Option B**  
   - Change the two workflow definitions (Booking: Customer Cancel Link + SMS, Booking: Customer Reschedule Link + SMS) so the create_message action uses `to_value`: `{{person.phone}}`.  
   - Implement the single fallback in create_message (when rendered `to_value` is empty and template references `person.phone`, re-render with `person` defaulting to `contact`).  
   - No change to send_message (which uses `recipients` and path-based resolution, not `to_value`).

4. **Do not**  
   - Rely on `{{person.phone}}` alone in production without either (a) ensuring all booking contacts have `person_id` and phone, or (b) adding the fallback in code (Option B) or in template syntax (Option C).

---

## Summary

| Question | Answer |
|----------|--------|
| Is `person.phone` in the booking_confirmed payload? | Yes, when the contact has `person_id`; person is loaded with `id, first_name, last_name, email, phone` and set as `payload.person`. |
| Can create_message use `{{person.phone}}`? | Yes; `to_value` is template-rendered with the full payload; `person.phone` resolves when `person` exists. |
| Is fallback still needed? | Yes, for contacts without `person_id` (or without person.phone). Either keep `{{contact.phone}}` until data is ready, or add a code fallback when template uses `person.phone` but result is empty (Option B above). |

**Recommended:** Option B (prefer `{{person.phone}}` in the two workflows and add a one-time fallback in create_message when the rendered value is empty and the template references `person.phone`). That gives person-first behavior without breaking legacy contacts.
