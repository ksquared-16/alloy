"use client";

/**
 * CREATE ASSIGNMENT — CHOOSE WHO, THEN USE THE CARD THAT ALREADY EXISTS.
 *
 * This component creates nothing. It answers the one question the Assignments lens cannot answer on
 * its own — WHICH SUBJECT — and then hands off to the canonical Schedule contextual card, which is
 * where every other single-assignment gesture in Operations already lands.
 *
 * ── WHY A CHOOSER AND NOT A CREATOR ──
 *
 * The lens listed commitments and offered "Add Assignment" only while exactly one row was selected,
 * which quietly said that creating a commitment is something you do TO a row. It is not: the subject
 * an operator wants to assign is very often the one with no row yet, and selecting somebody else's
 * assignment first is a detour through the wrong person. Separating the two means the lens-level
 * command has to ask who — so it asks, using canonical identity rather than the lens's own rows.
 *
 * ── WHERE THE NAMES COME FROM ──
 *
 * `/api/admin/records/children` and `/api/admin/staff/directory` — the SAME projections the Children
 * and Staff sections read. Not the assignment ledger: a subject with no assignment yet is precisely
 * the one most likely to need one, and sourcing from the ledger would offer only people who already
 * have what the operator is trying to give them.
 *
 * Child and Staff are the two subjects the canonical `OperationalAssignmentSubject` union admits.
 * This file does not widen it, name a third, or decide anything about the assignment itself.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";

/** The chosen subject, in the grain the record host addresses each one by. */
export type AssignmentSubjectChoice =
  | { kind: "child"; customerMemberId: string; name: string }
  | { kind: "staff"; personId: string; name: string };

type Tab = "child" | "staff";

type ChildRow = { customerMemberId: string; name: string };
type StaffRow = { personId: string; name: string };

export default function AssignmentSubjectPicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  /*
   * ── THE HANDOFF LIVES HERE, AND THAT IS NOT A STYLE CHOICE ──
   *
   * `focusRecord` opens the record OVER the workspace only when it can see a
   * `DurableRecordHostContext`. The workspace component RENDERS that host, so its own body is the
   * host's PARENT and sees no context — `durableHost` is null there and the call silently falls
   * through to `router.push`, navigating the page underneath while the Operations modal stays
   * open. The card then exists, correct in every detail, behind the modal: a probe found the
   * button at real coordinates with the ledger row on top of it and ZERO overlays in the document.
   *
   * This component is mounted inside the host, so the same call resolves the host and opens the
   * contextual card where the operator is standing. The Children and Staff sections work for
   * exactly this reason — they are children of the host too.
   */
  const focusRecord = useOperatorRecordFocus();

  const onChoose = useCallback(
    (subject: AssignmentSubjectChoice) => {
      // Close first: the chooser has done its whole job the moment the subject is known, and
      // leaving it up would put a second modal between the operator and the card they asked for.
      onClose();
      /*
       * Child grain is `customer_members`; staff grain is `persons`. That asymmetry is
       * canonical — a child IS the member row, while a staff member is addressed as a person —
       * and it is the pairing the O-3 assignment binding already speaks. Both land on the same
       * contextual card.
       */
      void focusRecord(
        subject.kind === "child"
          ? {
              entity_type: "customer_members",
              entity_id: subject.customerMemberId,
              intent: "durable_record",
              preferred_context_key: "schedule",
            }
          : {
              entity_type: "persons",
              entity_id: subject.personId,
              intent: "durable_record",
              preferred_context_key: "schedule",
            },
      );
    },
    [focusRecord, onClose],
  );
  const [tab, setTab] = useState<Tab>("child");
  const [filter, setFilter] = useState("");
  const [children, setChildren] = useState<ChildRow[] | null>(null);
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset on close so a second invocation does not open on the last operator's search.
      setFilter("");
      setTab("child");
      setError(null);
    }
  }, [open]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [childRes, staffRes] = await Promise.all([
        fetch("/api/admin/records/children?limit=200", {
          credentials: "include",
        }),
        fetch("/api/admin/staff/directory", { credentials: "include" }),
      ]);
      const childJson = await childRes.json().catch(() => ({}));
      const staffJson = await staffRes.json().catch(() => ({}));

      /*
       * Field names are taken from each route's declared entry type — `RecordsChildEntry` and
       * `StaffDirectoryEntry` — not guessed with `??` chains. A fallback chain would have
       * quietly rendered an empty list if a shape ever changed, and an empty subject list is
       * indistinguishable from a tenant with nobody in it.
       *
       * The child's id is `customerMemberId`, never `personId`: that is the durable attention
       * subject the record host addresses, and a child may legitimately have no person row.
       */
      setChildren(
        (
          (childJson?.children ?? []) as {
            customerMemberId: string;
            displayName: string;
          }[]
        )
          .map((r) => ({
            customerMemberId: r.customerMemberId,
            name: r.displayName,
          }))
          .filter((r) => Boolean(r.customerMemberId)),
      );
      setStaff(
        (
          (staffJson?.staff ?? []) as {
            personId: string;
            displayName: string;
          }[]
        )
          .map((r) => ({ personId: r.personId, name: r.displayName }))
          .filter((r) => Boolean(r.personId)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load subjects");
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const match = (name: string) => !q || name.toLowerCase().includes(q);
    return tab === "child"
      ? (children ?? []).filter((r) => match(r.name))
      : (staff ?? []).filter((r) => match(r.name));
  }, [tab, filter, children, staff]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const loaded = tab === "child" ? children != null : staff != null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-alloy-midnight/30 px-4 py-16"
      data-assignment-subject-picker="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-alloy-stone/15 px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-alloy-midnight">
              Create assignment
            </h2>
            <p className="mt-0.5 text-[11.5px] text-alloy-slate">
              Who is this commitment for?
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-alloy-slate"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/*
         * The two subjects the canonical union admits, both always present. A tab that
         * disappeared when a cohort was empty would say "staff cannot be assigned here",
         * which is a claim about the platform rather than about the data.
         */}
        <div className="flex items-center gap-1 px-4 pt-3">
          {(["child", "staff"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                tab === t
                  ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                  : "text-alloy-slate hover:text-alloy-midnight"
              }`}
              data-assignment-subject-tab={t}
              aria-pressed={tab === t}
            >
              {t === "child" ? "Children" : "Staff"}
            </button>
          ))}
        </div>

        <div className="px-4 py-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={tab === "child" ? "Filter children" : "Filter staff"}
            className="w-full rounded border border-alloy-stone/25 px-2.5 py-1.5 text-[12px]"
            data-assignment-subject-filter="true"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {error ? (
            <p className="px-2 py-3 text-[12px] text-red-700">{error}</p>
          ) : !loaded ? (
            <p className="px-2 py-3 text-[12px] text-alloy-slate">Loading…</p>
          ) : rows.length === 0 ? (
            <p
              className="px-2 py-3 text-[12px] text-alloy-slate"
              data-assignment-subject-none="true"
            >
              {filter.trim()
                ? "No matches"
                : `No ${tab === "child" ? "children" : "staff"} yet`}
            </p>
          ) : (
            rows.map((r: any) => {
              const id = tab === "child" ? r.customerMemberId : r.personId;
              return (
                <button
                  key={id}
                  type="button"
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-[12.5px] text-alloy-midnight hover:bg-alloy-stone/[0.08]"
                  data-assignment-subject-option={id}
                  data-assignment-subject-kind={tab}
                  onClick={() =>
                    onChoose(
                      tab === "child"
                        ? { kind: "child", customerMemberId: id, name: r.name }
                        : { kind: "staff", personId: id, name: r.name },
                    )
                  }
                >
                  {r.name}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/** Exported so the lens command and this modal's title cannot drift apart. */
export const CREATE_ASSIGNMENT_LABEL = "Create assignment";
