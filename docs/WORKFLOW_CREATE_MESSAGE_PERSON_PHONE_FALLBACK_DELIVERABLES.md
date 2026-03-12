# Workflow create_message person.phone Fallback — Deliverables

## 1. File changed

| File | Change |
|------|--------|
| **web/lib/workflowRun.ts** | In the `create_message` action branch: after rendering `to_value` with the normal payload, if the result is empty and the original template string contains `person.phone` or `person.email`, re-render with a fallback payload where `person = payload.person ?? payload.contact`, and use the fallback value if non-empty. |

No DB workflow rows were changed. No other files modified.

---

## 2. Exact fallback logic added

**Location:** `create_message` case, immediately after `let toValue = renderTemplate(toValueRaw, payload);`.

**Code added:**

```ts
if (!toValue.trim() && (toValueRaw.includes("person.phone") || toValueRaw.includes("person.email"))) {
    const fallbackPayload = { ...payload, person: (payload.person ?? payload.contact) ?? null };
    const fallback = renderTemplate(toValueRaw, fallbackPayload);
    if (fallback != null && String(fallback).trim()) toValue = String(fallback).trim();
}
```

**Behavior:**

1. Render `to_value` as before: `toValue = renderTemplate(toValueRaw, payload)`.
2. If `toValue` is empty (after trim) **and** `toValueRaw` contains the substring `"person.phone"` or `"person.email"`:
   - Build `fallbackPayload = { ...payload, person: payload.person ?? payload.contact ?? null }`.
   - Re-render: `fallback = renderTemplate(toValueRaw, fallbackPayload)`.
   - If `fallback` is non-null and non-empty after trim, set `toValue = String(fallback).trim()`.
3. The rest of `create_message` is unchanged: `to_value` in the insert uses `toValue` (either the primary render or the fallback).

So when the template is `{{person.phone}}` and `payload.person` is null (legacy contact), the first render is empty; the fallback uses `person = contact`, so `{{person.phone}}` becomes `contact.phone`, and that value is used.

---

## 3. Why it is safe

- **Narrow:** Only runs when (a) the rendered `to_value` is empty, and (b) the template explicitly references `person.phone` or `person.email`. Other templates and non-empty primary renders are untouched.
- **No new syntax:** Same `{{path}}` templating; no new tokens or syntax.
- **No engine change:** `renderTemplate` is called the same way; we only call it again with a different payload when the conditions above hold.
- **Fallback payload is conservative:** `fallbackPayload` is a shallow copy of `payload` with `person` overridden to `payload.person ?? payload.contact`. So we only supply a fallback for `person` when it was missing; all other payload keys (contact, job, customer, etc.) are unchanged.
- **Use fallback only when non-empty:** We replace `toValue` only when the fallback render is non-empty. If contact also has no phone/email, we still end up with an empty value (same as before), and we do not overwrite a non-empty primary result.
- **DB and workflow config unchanged:** Workflow definitions (e.g. `to_value: "{{contact.phone}}"`) are not modified in code. After you change the two workflow actions in the DB to `to_value: "{{person.phone}}"`, legacy contacts without a linked person still get `contact.phone` via this fallback.

---

## 4. Manual test checklist

- [ ] **Booking with contact that has person_id**
  - Use a contact that has `person_id` and the person has a phone. Run a booking that triggers `booking_confirmed` and the “Booking: Customer Cancel Link + SMS” (or Reschedule) workflow.
  - In DB, set that workflow’s create_message action `to_value` to `{{person.phone}}`.
  - Trigger the workflow. Confirm the message is created with `to_value` = that person’s phone (no fallback needed).

- [ ] **Booking with contact that has no person_id (legacy)**
  - Use a contact with no `person_id` but with a phone. Run a booking that triggers the same workflow (create_message with `to_value: "{{person.phone}}"`).
  - Trigger the workflow. Confirm the message is created with `to_value` = contact’s phone (fallback: person = contact, so `person.phone` → contact.phone).

- [ ] **Template without person.phone / person.email**
  - Use a workflow create_message with `to_value: "{{contact.phone}}"`. Trigger it. Confirm behavior is unchanged (no fallback runs; primary render only).

- [ ] **person.phone present but empty**
  - If payload has `person` with no `phone`, primary render is empty; fallback runs. If contact has phone, final `to_value` should be contact’s phone. If contact also has no phone, final `to_value` remains empty (no regression).
