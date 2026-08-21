# Follow-up — complete reviewable output

**Status:** implemented in the complete-output + iPhone notifications slice.  
**Authority:** tmux `capture-pane` remains the live interactive session. Claude JSONL is a **presentation-only** “Latest Claude Response” source, not Governor state.

## Live Communications finding (2026-08-19)

Claude TUI alternate screen + `history_size=0` + 80×24 viewport. Gateway line caps were not the clipping layer. The full latest assistant reply remained in the worktree JSONL (`6186a022-…`), not in tmux scrollback.

## Contract

- **Recent** (`GET /api/lanes/:id/output`, default): ~120 lines / 64KB, polled.
- **Extended** (`?mode=extended`): operator-requested, up to 8000 lines / 512KB, not polled.
- **Latest Claude response** (`?mode=latest_response`): last assistant text from the newest transcript for the worktree. Soft-fails to a banner + Recent/Load more if unavailable.
- Truncation / viewport-only is explicit in the UI. Copy uses the loaded model, not the DOM, and does not recapture.
