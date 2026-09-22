# Technical discovery questions

These are the things Alloy cannot determine from its own side. Each one changes
what the integration looks like, so the answers are worth more than they cost to
give — a short answer or *"we don't know yet"* is genuinely useful.

Grouped by what the answer decides.

---

## A. Shape of the integration

1. **Which direction does data need to move for each concept?** Alloy → you, you
   → Alloy, or both? (Worksheet column 7.)
2. **Is Alloy the system of record for enrollment and placement in this
   deployment, or is your system?** If both hold a version, which wins when they
   disagree?
3. **Does your system need to author attendance, consume it, or both?** This is
   the single biggest fork in the design.
4. **Is this a one-way mirror, a two-way sync, or an operational integration**
   that acts in the moment?

## B. Identity and correlation

5. **What identifies a child in your system**, and is that identifier stable
   across a year rollover or a room change?
6. **Do you already store an identifier for each child that came from a school
   management system**, or will you store Alloy's identifier?
7. **Is an adult one record in your system, or one record per child?** Alloy
   holds one person and a separate relationship per child.
8. **Are rooms durable in your system**, or recreated each term or year?
9. **Do you have a stable identifier for a single attendance event**, generated
   before the first send attempt and reused on retry?

## C. Synchronization

10. **How fresh does each concept need to be?** Roster at start of day is a very
    different integration from near-real-time.
11. **Can your system store a checkpoint per resource** and resume from it?
12. **What happens in your system when a child stops being enrolled?** Alloy
    signals this as a lifecycle change, not a deletion.
13. **Does anything in your product require push delivery** rather than polling?
    V1 has no webhooks; we want to know early if that is a blocker rather than a
    preference.
14. **What is your tolerance for a bounded backfill** — for example, re-reading a
    full collection periodically to reconcile?

## D. Attendance specifics

15. **Which of the four submittable kinds do you actually produce** — check-in,
    check-out, absence, room transfer?
16. **What time precision does your system record**, and in which timezone is it
    expressed?
17. **How does your system express a correction**, and does it keep the original?
18. **How does your system express that an event never happened**, as distinct
    from being corrected?
19. **What does your system do today when a submission times out?** Alloy's
    retries are safe, but only if your event identifier is stable.

## E. People, privacy and permissions

20. **Do you need adult contact details, and for which feature?** This is a
    stronger permission and operators may decline it.
21. **Do you perform collection or pickup verification?** If so, can your
    interface work with a yes/no that carries no reason?
22. **Do you need date of birth**, and what for? We ask because it is the field
    most often taken by default and least often used.
23. **Does your system hold any health, allergy or safeguarding information that
    you expect Alloy to supply?** Alloy does not expose any, under any
    permission, so a dependency here needs to be found now.

## F. Lifecycle operations

28. **Which of Alloy's governed operations do you need to perform?** Worksheet §7
    lists all nine. A roster-mirroring integration may need none of them.
29. **Do you expect to start or end enrollments**, or does the operator do that
    in Alloy while you observe the result?
30. **Do you expect to move a child's room**, or only to read where they are?
31. **Do you expect to set or change schedules**, or only to read them?
32. **Do any of your workflows assume you can delete something in Alloy?** There
    is no deletion on this API for any resource — endings are archive, effective
    end, supersession or reversal. If your design assumes a delete, we need to
    find that now.
33. **Do any of your workflows assume a field-level update** — setting a status,
    patching a record? Alloy accepts named intents only, and we would rather map
    your intent to an operation than have you discover the absence of `PATCH`
    during implementation.

## G. Operational

24. **How many sites and rooms would a typical deployment have?** This affects
    nothing about correctness and everything about your sync design.
25. **What is your deployment model** — one instance per organization, or
    multi-tenant? Alloy issues credentials per installation.
26. **Who operates the integration in production**, and how would they see that a
    sync has fallen behind?
27. **What is your expectation for sandbox access**, and on what timeline?

---

## What we are not asking

We have not asked you to describe your database, your API, or your internal
model. If a question above can be answered with *"our system does not work that
way"*, that is the answer we want — it tells us where the mapping needs design
rather than translation.
