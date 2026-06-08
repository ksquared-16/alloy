# ChatGPT project thread imports

This folder is a holding area for exported or manually summarized ChatGPT project-thread context for Alloy.

These files are historical/imported context, not active doctrine. Durable decisions should be distilled into the existing active source pack listed in `docs/README.md`.

## How to import a thread

Create one markdown file per important thread using this filename shape:

`YYYY-MM-DD-short-topic.md`

Use this structure:

```md
# Thread: Short topic

- Source: ChatGPT project thread
- Exported: YYYY-MM-DD
- Original date range: YYYY-MM-DD to YYYY-MM-DD
- Status: raw import | summarized | distilled into active docs

## Why This Matters

One paragraph on why the thread is relevant to Alloy.

## Decisions

- Decision that should influence future work.

## Open Questions

- Question or unresolved risk.

## Implementation Notes

- Concrete file paths, API names, table names, or migration ideas mentioned.

## Raw Notes

Paste relevant excerpts or a concise summary here.
```

## Distillation rule

After importing, update the matching active doc if the thread changes current behavior or doctrine:

- `docs/core/*` for platform-wide principles
- `docs/system/*` for entities, workflows, records, workspace, permissions, config, and APIs
- `docs/product/*` for CRM, communications, forms/documents, billing, and AI product behavior
- `docs/execution/*` for operating doctrine, roadmap, deploy, source-pack, and verification rules

Keep raw transcripts here so the active docs stay compact.
