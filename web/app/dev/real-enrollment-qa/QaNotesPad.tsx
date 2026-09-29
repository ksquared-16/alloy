"use client";

import { useEffect, useState } from "react";

/**
 * Somewhere to write findings down while walking the product.
 *
 * Deliberately not a tracker. Persisting QA issues would mean a schema, an owner and a lifecycle,
 * and none of that helps the person who has just noticed something on their phone. This keeps the
 * text in the browser so a reload does not lose it, and hands the whole lot over on one click.
 */

const STORAGE_KEY = "alloy.real-enrollment-qa.notes";

const CATEGORIES = [
    ["BLOCKER", "a family could not get through this"],
    ["PRODUCT / UX", "it works, but it is not good enough"],
    ["CONFIGURATION", "the wrong thing was set up"],
    ["RUNTIME DEFECT", "an error, a blank screen, something did not save"],
    ["DATA / CONTENT", "wrong name, wrong child, bad wording, wrong amount"],
    ["QUESTION", "not sure whether that was intended"],
] as const;

export default function QaNotesPad() {
    const [notes, setNotes] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        try {
            setNotes(window.localStorage.getItem(STORAGE_KEY) ?? "");
        } catch {
            /* Private windows and blocked site data are not errors here. */
        }
    }, []);

    const update = (value: string) => {
        setNotes(value);
        setCopied(false);
        try {
            window.localStorage.setItem(STORAGE_KEY, value);
        } catch {
            /* Losing the draft is survivable; failing to type is not. */
        }
    };

    const add = (category: string) => update(`${notes}${notes && !notes.endsWith("\n") ? "\n" : ""}${category}: `);

    return (
        <section className="my-8 rounded-2xl border border-alloy-midnight/12 bg-alloy-midnight/[0.02] p-5">
            <h2 className="text-[15px] font-semibold text-alloy-midnight">What you found</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-alloy-midnight/70">
                Tag each note so taste and breakage do not get confused for each other. Kept in this browser as
                you type; copy it out when you are done.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
                {CATEGORIES.map(([label, hint]) => (
                    <button
                        key={label}
                        type="button"
                        title={hint}
                        onClick={() => add(label)}
                        className="min-h-[36px] rounded-full border border-alloy-midnight/15 bg-white px-3 text-[12px] font-medium text-alloy-midnight/80"
                    >
                        {label}
                    </button>
                ))}
            </div>

            <textarea
                value={notes}
                onChange={(e) => update(e.target.value)}
                rows={8}
                placeholder="BLOCKER: the fee appeared before the Handbook was acknowledged"
                data-qa-notes="true"
                className="mt-3 w-full rounded-xl border border-alloy-midnight/15 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-alloy-midnight outline-none focus:border-alloy-bend-pine/40"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => {
                        void navigator.clipboard?.writeText(notes).then(
                            () => setCopied(true),
                            () => setCopied(false),
                        );
                    }}
                    disabled={!notes.trim()}
                    className="min-h-[40px] rounded-xl bg-alloy-midnight px-4 text-[13px] font-medium text-white disabled:opacity-40"
                >
                    {copied ? "Copied" : "Copy notes"}
                </button>
                <button
                    type="button"
                    onClick={() => update("")}
                    disabled={!notes}
                    className="min-h-[40px] rounded-xl border border-alloy-midnight/15 px-4 text-[13px] text-alloy-midnight/70 disabled:opacity-40"
                >
                    Clear
                </button>
            </div>
        </section>
    );
}
