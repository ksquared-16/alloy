"use client";

/**
 * The kiosk. A dedicated appliance, not an admin page in a bigger font.
 *
 * ── WHAT IT REFUSES TO BE ──
 *
 * No workspace shell, no navigation, no operator chrome, no roster, no search. A
 * parent at a front desk with a toddler on one hip needs four decisions and no
 * reading, and every affordance that is not one of those four is an affordance
 * that can be mis-tapped in a lobby.
 *
 * ── IT HOLDS A DEVICE IDENTITY, NEVER A HUMAN ONE ──
 *
 * The credential is provisioned once and lives in this browser; the tablet is
 * authenticated as the kiosk producer for as long as it is that kiosk. The ADULT
 * is forgotten the moment the interaction ends — every ending routes through the
 * one `resetInteraction`, because a shared device leaks by accumulation and
 * "exactly the same clearing on every path" is not a property scattered handlers
 * can hold.
 *
 * No Alloy session is ever minted. There is nothing to log out of, which is the
 * point: the next family starts from nothing because nothing was kept.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
    IDLE_INTERACTION,
    KIOSK_IDLE_TIMEOUT_MS,
    KIOSK_SUCCESS_TIMEOUT_MS,
    resetInteraction,
    type KioskChild,
    type KioskInteraction,
} from "@/lib/childcareOperational/attendance/kiosk/kioskInteractionState";

const CREDENTIAL_STORAGE_KEY = "alloy.kiosk.credential";
const CODE_LENGTH = 8;

/** Touch targets a standing adult can hit without looking. Never hover-dependent. */
const KEY = "h-[72px] rounded-2xl text-[28px] font-semibold transition-colors active:scale-[0.98]";
const PRIMARY =
    "min-h-[64px] w-full rounded-2xl bg-[#00A283] px-6 text-[20px] font-semibold text-white active:bg-[#00715C] disabled:opacity-40";
const SECONDARY =
    "min-h-[56px] w-full rounded-2xl border-2 border-alloy-stone/30 bg-white px-6 text-[18px] font-medium text-alloy-midnight/80 active:bg-alloy-stone/10";

export default function KioskPage() {
    const [credential, setCredential] = useState<string | null>(null);
    const [provisioning, setProvisioning] = useState("");
    const [state, setState] = useState<KioskInteraction>(IDLE_INTERACTION);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        try {
            setCredential(window.localStorage.getItem(CREDENTIAL_STORAGE_KEY));
        } catch {
            setCredential(null);
        }
    }, []);

    /** Every ending goes through here. There is no other way back to idle. */
    const reset = useCallback(() => setState(resetInteraction()), []);

    /*
     * INACTIVITY IS AN ENDING TOO.
     *
     * An abandoned interaction is the most likely way a family's children are left
     * on a lobby screen — nobody presses Start Over on the way out of the door.
     */
    useEffect(() => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        if (state.step === "idle") return;
        const ms = state.step === "done" ? KIOSK_SUCCESS_TIMEOUT_MS : KIOSK_IDLE_TIMEOUT_MS;
        idleTimer.current = setTimeout(reset, ms);
        return () => {
            if (idleTimer.current) clearTimeout(idleTimer.current);
        };
    }, [state, reset]);

    /*
     * RE-ENTRY IS AN ENDING TOO — this is Scenario N's browser-history leg. A back
     * navigation restoring a bfcache page would otherwise put the previous
     * family's children back on screen, fully rendered, with no request made.
     */
    useEffect(() => {
        const forget = () => setState(resetInteraction());
        window.addEventListener("pageshow", forget);
        window.addEventListener("pagehide", forget);
        return () => {
            window.removeEventListener("pageshow", forget);
            window.removeEventListener("pagehide", forget);
        };
    }, []);

    async function post(path: string, body: Record<string, unknown>) {
        return fetch(`/api/public/kiosk/${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-alloy-kiosk-credential": credential ?? "" },
            body: JSON.stringify(body),
        });
    }

    async function identify(operation: "check_in" | "check_out", code: string) {
        setState((s) => ({ ...s, step: "working", operation, code }));
        try {
            const res = await post("identify", { operation, code });
            if (!res.ok) {
                // Every failure looks the same, including throttling: a lobby must
                // not be able to tell a wrong code from a known one.
                setState({ ...resetInteraction(), notice: "Please see a member of staff." });
                return;
            }
            const json = (await res.json()) as { children: KioskChild[] };
            if (!json.children.length) {
                setState({ ...resetInteraction(), notice: "Please see a member of staff." });
                return;
            }
            setState((s) => ({ ...s, step: "children", children: json.children, selected: [] }));
        } catch {
            setState({ ...resetInteraction(), notice: "We could not reach the centre's system. Please see a member of staff." });
        }
    }

    async function confirm() {
        // Minted once per confirm and reused on retry, so a double tap and a
        // network retry carry the same identity and converge on one fact per child.
        const token = state.operationToken ?? crypto.randomUUID();
        setState((s) => ({ ...s, step: "working", operationToken: token }));
        try {
            const res = await post("attendance", {
                operation: state.operation,
                code: state.code,
                child_ids: state.selected,
                operation_token: token,
            });
            if (!res.ok) {
                setState({ ...resetInteraction(), notice: "Please see a member of staff." });
                return;
            }
            const json = (await res.json()) as { results: KioskInteraction["results"] };
            // The code is dropped here, before anything renders: the result needs
            // names, never the secret that found them.
            setState((s) => ({ ...resetInteraction(), step: "done", results: json.results, operation: s.operation }));
        } catch {
            setState({ ...resetInteraction(), notice: "We could not reach the centre's system. Please try again." });
        }
    }

    // ── Provisioning: once per device, by a member of staff ──────────────────
    if (credential === null) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-alloy-stone/10 p-8" data-kiosk="provision">
                <h1 className="text-[24px] font-semibold text-alloy-midnight">Set up this device</h1>
                <p className="max-w-md text-center text-[16px] text-alloy-midnight/60">
                    A member of staff can pair this tablet with the centre. It stays paired until it is unpaired.
                </p>
                <input
                    className="min-h-[64px] w-full max-w-md rounded-2xl border-2 border-alloy-stone/30 px-5 text-[18px]"
                    value={provisioning}
                    onChange={(e) => setProvisioning(e.target.value)}
                    placeholder="Device key"
                    aria-label="Device key"
                    data-kiosk-credential-input="true"
                />
                <button
                    type="button"
                    className={`${PRIMARY} max-w-md`}
                    disabled={!provisioning.trim()}
                    onClick={() => {
                        try {
                            window.localStorage.setItem(CREDENTIAL_STORAGE_KEY, provisioning.trim());
                        } catch {
                            /* a device that cannot remember simply asks again */
                        }
                        setCredential(provisioning.trim());
                        setProvisioning("");
                    }}
                    data-kiosk-provision="true"
                >
                    Pair this device
                </button>
            </main>
        );
    }

    const heading =
        state.operation === "check_out" ? "Who are you collecting?" : "Who is arriving?";

    return (
        <main className="flex min-h-screen flex-col bg-alloy-stone/10 p-6" data-kiosk="true" data-kiosk-step={state.step}>
            {/* ── IDLE ── the whole screen is two decisions and no family data. */}
            {state.step === "idle" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-8" data-kiosk-idle="true">
                    <h1 className="text-[32px] font-semibold text-alloy-midnight">Welcome</h1>
                    {state.notice ? (
                        <p className="rounded-2xl bg-alloy-gold/15 px-6 py-4 text-[18px] text-alloy-midnight" data-kiosk-notice="true">
                            {state.notice}
                        </p>
                    ) : null}
                    <div className="flex w-full max-w-md flex-col gap-4">
                        <button type="button" className={PRIMARY} onClick={() => setState((s) => ({ ...resetInteraction(), operation: "check_in", step: "code", notice: s.notice ? null : null }))} data-kiosk-start="check_in">
                            Check in
                        </button>
                        <button type="button" className={SECONDARY} onClick={() => setState({ ...resetInteraction(), operation: "check_out", step: "code" })} data-kiosk-start="check_out">
                            Pick up
                        </button>
                    </div>
                </div>
            ) : null}

            {/* ── CODE ── a keypad, because this is a tablet in a corridor. */}
            {state.step === "code" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-6" data-kiosk-code="true">
                    <h2 className="text-[24px] font-semibold text-alloy-midnight">Enter your code</h2>
                    <div className="flex gap-2" aria-label="Code entry" data-kiosk-code-display={String(state.code.length)}>
                        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                            <span
                                key={i}
                                className={`h-[56px] w-[40px] rounded-xl border-2 ${
                                    i < state.code.length ? "border-[#00A283] bg-[#00A283]/10" : "border-alloy-stone/30 bg-white"
                                }`}
                            >
                                {/* Masked: a code is a secret, and somebody is always behind you. */}
                                <span className="sr-only">{i < state.code.length ? "entered" : "empty"}</span>
                            </span>
                        ))}
                    </div>
                    <div className="grid w-full max-w-sm grid-cols-3 gap-3">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                            <button
                                key={d}
                                type="button"
                                className={`${KEY} border-2 border-alloy-stone/25 bg-white active:bg-alloy-stone/15`}
                                onClick={() => setState((s) => ({ ...s, code: (s.code + d).slice(0, CODE_LENGTH) }))}
                                data-kiosk-key={d}
                            >
                                {d}
                            </button>
                        ))}
                        <button type="button" className={`${KEY} border-2 border-alloy-stone/25 bg-white text-[18px]`} onClick={reset} data-kiosk-cancel="true">
                            Cancel
                        </button>
                        <button
                            key="0"
                            type="button"
                            className={`${KEY} border-2 border-alloy-stone/25 bg-white active:bg-alloy-stone/15`}
                            onClick={() => setState((s) => ({ ...s, code: (s.code + "0").slice(0, CODE_LENGTH) }))}
                            data-kiosk-key="0"
                        >
                            0
                        </button>
                        <button
                            type="button"
                            className={`${KEY} border-2 border-alloy-stone/25 bg-white text-[18px]`}
                            onClick={() => setState((s) => ({ ...s, code: s.code.slice(0, -1) }))}
                            data-kiosk-backspace="true"
                        >
                            Back
                        </button>
                    </div>
                    <button
                        type="button"
                        className={`${PRIMARY} max-w-sm`}
                        disabled={state.code.length < CODE_LENGTH || !state.operation}
                        onClick={() => state.operation && identify(state.operation, state.code)}
                        data-kiosk-code-submit="true"
                    >
                        Continue
                    </button>
                </div>
            ) : null}

            {/* ── CHILDREN ── one row per child, each with its own answer. */}
            {state.step === "children" ? (
                <div className="flex flex-1 flex-col gap-4" data-kiosk-children="true">
                    <h2 className="text-[24px] font-semibold text-alloy-midnight">{heading}</h2>
                    <ul className="flex flex-col gap-3">
                        {state.children.map((c) => {
                            const chosen = state.selected.includes(c.child_id);
                            return (
                                <li key={c.child_id}>
                                    <button
                                        type="button"
                                        disabled={!c.eligible}
                                        className={`flex min-h-[76px] w-full items-center justify-between rounded-2xl border-2 px-5 text-left ${
                                            !c.eligible
                                                ? "border-alloy-stone/20 bg-alloy-stone/10 text-alloy-midnight/45"
                                                : chosen
                                                  ? "border-[#00A283] bg-[#00A283]/10"
                                                  : "border-alloy-stone/30 bg-white"
                                        }`}
                                        onClick={() =>
                                            setState((s) => ({
                                                ...s,
                                                selected: chosen
                                                    ? s.selected.filter((id) => id !== c.child_id)
                                                    : [...s.selected, c.child_id],
                                            }))
                                        }
                                        data-kiosk-child={c.child_id}
                                        data-kiosk-child-eligible={String(c.eligible)}
                                        data-kiosk-child-selected={String(chosen)}
                                    >
                                        <span className="text-[20px] font-medium text-alloy-midnight">{c.display_name}</span>
                                        {/* Mixed sibling eligibility says only the generic thing. */}
                                        <span className="text-[14px] text-alloy-midnight/55">{c.eligible ? (chosen ? "Selected" : "Tap to select") : c.message}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="mt-auto flex flex-col gap-3">
                        <button type="button" className={PRIMARY} disabled={state.selected.length === 0} onClick={confirm} data-kiosk-confirm="true">
                            {state.operation === "check_out" ? "Confirm pick up" : "Confirm check in"}
                        </button>
                        <button type="button" className={SECONDARY} onClick={reset} data-kiosk-start-over="true">
                            Start over
                        </button>
                    </div>
                </div>
            ) : null}

            {state.step === "working" ? (
                <div className="flex flex-1 items-center justify-center" data-kiosk-working="true">
                    <p className="text-[22px] text-alloy-midnight/70">One moment…</p>
                </div>
            ) : null}

            {/* ── DONE ── brief, obvious, and self-clearing. */}
            {state.step === "done" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-6" data-kiosk-done="true">
                    <h2 className="text-[28px] font-semibold text-alloy-midnight">
                        {state.results.some((r) => r.recorded) ? "Thank you" : "Please see a member of staff."}
                    </h2>
                    <ul className="flex flex-col gap-2">
                        {state.results.map((r) => (
                            <li key={r.child_id} className="text-[19px] text-alloy-midnight/75" data-kiosk-result={r.child_id} data-kiosk-result-recorded={String(r.recorded)}>
                                {r.display_name} · {r.recorded ? (state.operation === "check_out" ? "collected" : "checked in") : "please see a member of staff"}
                            </li>
                        ))}
                    </ul>
                    <button type="button" className={`${SECONDARY} max-w-sm`} onClick={reset} data-kiosk-done-dismiss="true">
                        Done
                    </button>
                </div>
            ) : null}
        </main>
    );
}
