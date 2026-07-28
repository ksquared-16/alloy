"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

/**
 * Compact Create Lead help — Escape / dialog / click-outside pattern
 * (CurrentWorkActivityPreview / QueueRecordAttentionPopover precedent).
 */
export function CreateLeadCommandHelp({ compact }: { compact?: boolean }) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        const onPointer = (e: MouseEvent) => {
            const t = e.target as Node;
            if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onPointer);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onPointer);
        };
    }, [open]);

    const panel = open
        ? createPortal(
              <div
                  ref={panelRef}
                  role="dialog"
                  aria-labelledby="bos-create-lead-help-title"
                  className="fixed z-[80] w-[min(320px,calc(100vw-24px))] rounded-xl border border-alloy-stone/25 bg-white p-3.5 shadow-[0_8px_28px_rgba(24,39,58,0.14)]"
                  style={(() => {
                      const rect = buttonRef.current?.getBoundingClientRect();
                      if (!rect) return { top: 80, left: 16 };
                      const top = Math.min(rect.bottom + 6, window.innerHeight - 200);
                      const left = Math.max(8, Math.min(rect.left - 280 + rect.width, window.innerWidth - 328));
                      return { top, left };
                  })()}
                  data-bos-command-session-help-popover="true"
              >
                  <p id="bos-create-lead-help-title" className="text-[13px] font-semibold text-alloy-midnight">
                      What can I provide?
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-alloy-midnight/65">
                      Paste an email, call note, website lead, voice transcript, meeting notes, or describe
                      the lead in your own words.
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-alloy-midnight/55">
                      BOS will organize the details and ask for anything still needed. Nothing is created
                      until you review and confirm.
                  </p>
              </div>,
              document.body
          )
        : null;

    return (
        <span className="relative inline-flex">
            <button
                ref={buttonRef}
                type="button"
                className={`inline-flex items-center justify-center rounded-md text-alloy-midnight/45 hover:bg-alloy-stone/10 hover:text-alloy-midnight ${
                    compact ? "h-8 w-8" : "h-7 w-7"
                }`}
                aria-label="Create Lead help"
                aria-expanded={open}
                aria-haspopup="dialog"
                data-bos-command-session-help="true"
                onClick={() => setOpen((v) => !v)}
            >
                <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>
            {panel}
        </span>
    );
}

export function useCreateLeadOptionLabelMap(
    formValues: Record<string, string>,
    fieldOptions?: Partial<Record<string, ReadonlyArray<{ value: string; label: string }>>>
): Map<string, string> {
    return useMemo(() => {
        const map = new Map<string, string>();
        if (!fieldOptions) return map;
        for (const [key, options] of Object.entries(fieldOptions)) {
            for (const opt of options ?? []) {
                map.set(`${key}:${opt.value}`, opt.label);
                map.set(opt.value, opt.label);
            }
        }
        void formValues;
        return map;
    }, [fieldOptions, formValues]);
}
