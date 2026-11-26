# Round 4 evidence

## Authenticated screenshots

Capture deferred earlier when port 3012 was unhealthy. Re-capture when healthy:

1. Conversation empty + compact help
2. Help popover
3. Form section cards closed
4. Family open (single parent)
5. Family with two parents
6. Children with two children
7. Placement open
8. Pinned Form
9. Review with multi-person cards
10. Success

## Punch-list evidence (multi-person / multi-child)

Automated coverage (2026-07-27):

```bash
cd web && npm run test -- tests/bos/commandSession/createLeadMultiPersonRepeaters.test.ts
```

Certifies:

- two parents with different emails/phones
- two children with different programs/start dates
- add/remove adult (last adult protected)
- add/remove child
- parse household → Form selection hydrate
- Form repeaters → Review groups + draft restoration
- `household_commit_v1` on execute payload

Relationship label presentation (no migration):

```bash
cd web && npm run test -- tests/bos/commandSession/createLeadMultiPersonRepeaters.test.ts -t "relationship vocabulary"
```

Settings → Data Model → Relationships: singular/plural/description/preview/reset via vocabulary PATCH + `metadata.plural_label`.
