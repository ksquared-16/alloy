/** Minimal plain-text formatting helpers for Activity embed composer (wrap selection). */

export function wrapTextareaSelection(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    before: string,
    after: string,
): { next: string; cursorStart: number; cursorEnd: number } {
    const start = Math.max(0, Math.min(selectionStart, value.length));
    const end = Math.max(start, Math.min(selectionEnd, value.length));
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    const cursorStart = start + before.length;
    const cursorEnd = cursorStart + selected.length;
    return { next, cursorStart, cursorEnd };
}

export function prefixTextareaLines(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    prefix: string,
): { next: string; cursorStart: number; cursorEnd: number } {
    const start = Math.max(0, Math.min(selectionStart, value.length));
    const end = Math.max(start, Math.min(selectionEnd, value.length));
    const block = value.slice(start, end);
    const lines = block.length > 0 ? block.split("\n") : [""];
    const prefixed = lines.map((line) => `${prefix}${line}`).join("\n");
    const next = `${value.slice(0, start)}${prefixed}${value.slice(end)}`;
    return { next, cursorStart: start, cursorEnd: start + prefixed.length };
}

export function insertTextareaLink(
    value: string,
    selectionStart: number,
    selectionEnd: number,
): { next: string; cursorStart: number; cursorEnd: number } | null {
    if (typeof window === "undefined") return null;
    const start = Math.max(0, Math.min(selectionStart, value.length));
    const end = Math.max(start, Math.min(selectionEnd, value.length));
    const selected = value.slice(start, end).trim();
    const url = window.prompt("Link URL", "https://");
    if (!url?.trim()) return null;
    const label = selected || "link";
    const token = `[${label}](${url.trim()})`;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    return { next, cursorStart: start, cursorEnd: start + token.length };
}
