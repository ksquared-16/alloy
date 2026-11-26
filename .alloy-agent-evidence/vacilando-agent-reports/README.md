# Structured agent reports — acceptance, live :3020

The chat no longer treats raw Claude terminal output as the assistant message.
Captured with Playwright against the running Gateway (iPhone 14 Pro, 390×844)
on this run, `erun_e27f625ecf76df91`. Metrics in `acceptance3.json` /
`acceptance4.json`; the submitted final message is `final.md`.

| # | Screenshot | What it proves |
|---|---|---|
| 12 | consolidated header | one sticky header `← Lanes · Vacilando · Details` + `Working · Claude`; global topbar `display:none`, Refresh button not visible, status card count 0 |
| 13 | structured progress | assistant bubble is `data-gw-message-source="report"`, type `progress`; raw pane absent from the thread and present only in Details |
| 14 | complete final response | type `completion`, 7 headings, 2 tables, 1 code block, 7 list items, 4 result rows, `fullyRendered: true` — the tail is on screen |
| 15 | copy proof | clipboard sha256 `e8f7c8e46168c339` — identical to the submitted file, 2,961 characters |

## Ordering, from the run's own event log

```
16:23:33.428Z  execution_run.complete         COMPLETE
16:23:34.131Z  execution_run.push_dispatch    COMPLETE  sent: 3
```

The message was written and read back before the transition, and the
notification dispatched after it. There is no window in which a Complete
notification exists without its final message.

## Terminal cannot overwrite it

The pane behind this run was 1,522 bytes of `viewport_only` TUI and kept
advancing throughout. After a full page reload the assistant message is still
the stored completion, still 2,702 rendered characters, still carrying the
blocker paragraph (`acceptance4.json` → `afterReload`).

Rendered characters (2,702) are fewer than stored (2,961) because Markdown
syntax is consumed by rendering. The clipboard is byte-identical — that is the
contract the copy icon holds.
