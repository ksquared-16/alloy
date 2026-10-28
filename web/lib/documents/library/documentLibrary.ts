/**
 * D4 — the household document library: one read model over the canonical Documents foundation.
 *
 * It resolves the documents belonging to a household, its adults (parents/guardians) and its children, plus the
 * household's cases (opportunities) and the Forms artifacts filed against those cases. Nothing here stores or copies a
 * document: the subjects are the D2 `document_subject_links` view (active `document_subjects` + derived Forms and
 * Processing context links) and the files are `documents` / `document_versions`.
 *
 * Disclosure is the canonical decision, applied in the canonical order to every row before anything is counted:
 *   1. org isolation (every read is `org_id`-bound);
 *   2. availability — deleted, quarantined and restricted documents are never listed;
 *   3. subject scope — decided by the document's PRIMARY OWNER (`documents.entity_type/entity_id`), never by how the
 *      library reached it, so a secondary association never grants access by itself;
 *   4. sensitivity — medical, safeguarding, personal-identity and restricted clearances.
 * A row that fails any step is dropped before counts, labels, search terms or filenames are built, so the response
 * carries nothing about it. A document reached only through a context link and owned outside this household is listed
 * only when the actor may read it on its own terms, and its owner is never named.
 *
 * Narrowing to one child or adult (`focus`) is applied on the server: the response then holds only documents linked to
 * that subject, so a sibling's documents are neither listed nor counted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { assertEntityDrawerRecordReadable, type AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { filterDocumentRowsInActorScope } from "@/lib/documents/assertDocumentAccess";
import { isDocumentUnavailable } from "@/lib/documents/documentAvailability";
import { filterDocumentRowsBySensitivity } from "@/lib/documents/documentSensitivity";
import { listCategories, listTypes } from "@/lib/documents/configuration/documentConfigurationService";
import type { ValidityPolicy } from "@/lib/documents/configuration/documentTypePolicy";
import { validityNeedsEventDates, evaluateDocumentValidity } from "@/lib/documents/validity/documentValidity";
import { loadValidityEventDates } from "@/lib/documents/validity/validityEventDates";
import { localDateOf, resolveDocumentsClock } from "@/lib/documents/validity/documentsClock";
import { loadFormArtifactProvenance } from "@/lib/documents/forms/formArtifactProvenance";

import {
    isLibrarySubjectType,
    LIBRARY_SUBJECT_TYPES,
    type DocumentLibrary,
    type LibraryAssociation,
    type LibrarySubject,
    type LibrarySubjectRef,
    type LibrarySubjectType,
    type LibraryVersion,
    type LibraryDocument,
} from "@/lib/documents/library/documentLibraryModel";

export * from "@/lib/documents/library/documentLibraryModel";

export type LibraryError = { ok: false; status: 400 | 404 | 500; code: string };
export type LibraryResult = { ok: true; value: DocumentLibrary } | LibraryError;

export type LibraryActor = {
    orgId: string;
    scope: AdminAccessScopeDimensions | null;
    roleKeys: readonly string[];
    permissionKeys: readonly string[];
};

/** Upper bound on documents in one response. */
export const LIBRARY_DOCUMENT_LIMIT = 300;
const IN_CHUNK = 150;
const HOUSEHOLD_CASE_LIMIT = 50;

const ENTITY_FOR_SCOPE: Record<LibrarySubjectType, string> = {
    household: "customers",
    person: "persons",
    child: "customer_members",
    opportunity: "opportunities",
};

function chunks<T>(list: T[], size = IN_CHUNK): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const key = (r: LibrarySubjectRef) => `${r.subject_type}:${r.subject_id}`;
const personLabel = (p: { full_name?: unknown; first_name?: unknown; last_name?: unknown; display_name?: unknown } | null | undefined) =>
    str(p?.display_name) ?? str(p?.full_name) ?? ([str(p?.first_name), str(p?.last_name)].filter(Boolean).join(" ") || "Unnamed");

/** The household a subject belongs to, or null (a case with no household, a person with none). Also read by D5 filing. */
export async function householdForAnchor(
    supabase: SupabaseClient,
    orgId: string,
    anchor: LibrarySubjectRef,
): Promise<{ ok: true; householdId: string | null } | LibraryError> {
    const id = anchor.subject_id;
    switch (anchor.subject_type) {
        case "household": {
            const { data, error } = await supabase.from("customers").select("id").eq("org_id", orgId).eq("id", id).maybeSingle();
            if (error) return { ok: false, status: 500, code: "LIBRARY_READ_FAILED" };
            return data ? { ok: true, householdId: id } : { ok: false, status: 404, code: "NOT_FOUND" };
        }
        case "child": {
            const { data, error } = await supabase.from("customer_members").select("id, customer_id").eq("org_id", orgId).eq("id", id).maybeSingle();
            if (error) return { ok: false, status: 500, code: "LIBRARY_READ_FAILED" };
            if (!data) return { ok: false, status: 404, code: "NOT_FOUND" };
            return { ok: true, householdId: str((data as { customer_id?: unknown }).customer_id) };
        }
        case "person": {
            const { data: person, error } = await supabase.from("persons").select("id").eq("org_id", orgId).eq("id", id).maybeSingle();
            if (error) return { ok: false, status: 500, code: "LIBRARY_READ_FAILED" };
            if (!person) return { ok: false, status: 404, code: "NOT_FOUND" };
            const { data: links } = await supabase
                .from("customer_persons")
                .select("customer_id, is_primary")
                .eq("org_id", orgId)
                .eq("person_id", id)
                .order("is_primary", { ascending: false })
                .limit(1);
            return { ok: true, householdId: str((links?.[0] as { customer_id?: unknown } | undefined)?.customer_id) };
        }
        case "opportunity": {
            const { data, error } = await supabase.from("opportunities").select("id, customer_id").eq("org_id", orgId).eq("id", id).maybeSingle();
            if (error) return { ok: false, status: 500, code: "LIBRARY_READ_FAILED" };
            if (!data) return { ok: false, status: 404, code: "NOT_FOUND" };
            return { ok: true, householdId: str((data as { customer_id?: unknown }).customer_id) };
        }
    }
}

/** The household graph: the household, its adults, its children and its cases. Also read by D5 filing. */
export async function householdSubjects(
    supabase: SupabaseClient,
    orgId: string,
    householdId: string,
): Promise<{ household: { id: string; label: string }; subjects: LibrarySubject[] } | null> {
    const [{ data: household }, { data: adults }, { data: children }, { data: cases }] = await Promise.all([
        supabase.from("customers").select("id, name").eq("org_id", orgId).eq("id", householdId).maybeSingle(),
        supabase
            .from("customer_persons")
            .select("person_id, role_type, is_primary, status, end_date, persons(id, full_name, first_name, last_name)")
            .eq("org_id", orgId)
            .eq("customer_id", householdId),
        supabase
            .from("customer_members")
            .select("id, display_name, first_name, last_name, is_active")
            .eq("org_id", orgId)
            .eq("customer_id", householdId),
        supabase
            .from("opportunities")
            .select("id, title, name, created_at")
            .eq("org_id", orgId)
            .eq("customer_id", householdId)
            .order("created_at", { ascending: false })
            .limit(HOUSEHOLD_CASE_LIMIT),
    ]);
    if (!household) return null;
    const label = str((household as { name?: unknown }).name) ?? "Household";
    const subjects: LibrarySubject[] = [{ subject_type: "household", subject_id: householdId, label, role: "household", is_primary_contact: false, active: true }];
    const seenPeople = new Set<string>();
    const sortedAdults = ((adults ?? []) as Array<Record<string, unknown>>).sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
    for (const a of sortedAdults) {
        const pid = str(a.person_id);
        if (!pid || seenPeople.has(pid)) continue;
        seenPeople.add(pid);
        const ended = Boolean(str(a.end_date)) || (str(a.status) ?? "active") !== "active";
        subjects.push({
            subject_type: "person",
            subject_id: pid,
            label: personLabel(a.persons as Record<string, unknown> | null),
            role: "adult",
            is_primary_contact: Boolean(a.is_primary),
            active: !ended,
        });
    }
    for (const c of ((children ?? []) as Array<Record<string, unknown>>).sort((a, b) => Number(b.is_active !== false) - Number(a.is_active !== false))) {
        const cid = str(c.id);
        if (!cid) continue;
        subjects.push({ subject_type: "child", subject_id: cid, label: personLabel(c), role: "child", is_primary_contact: false, active: c.is_active !== false });
    }
    for (const o of (cases ?? []) as Array<Record<string, unknown>>) {
        const oid = str(o.id);
        if (!oid) continue;
        subjects.push({ subject_type: "opportunity", subject_id: oid, label: str(o.title) ?? str(o.name) ?? "Enrollment case", role: "case", is_primary_contact: false, active: true });
    }
    return { household: { id: householdId, label }, subjects };
}

type LinkRow = { document_id: string; subject_type: string; subject_id: string; association: string; is_primary: boolean; derived_from: string };

async function linksForSubjects(supabase: SupabaseClient, orgId: string, refs: Array<{ subject_type: string; ids: string[] }>): Promise<LinkRow[] | null> {
    const reads: Array<PromiseLike<{ data: unknown; error: unknown }>> = [];
    for (const r of refs) {
        for (const ids of chunks([...new Set(r.ids)])) {
            if (ids.length === 0) continue;
            reads.push(
                supabase
                    .from("document_subject_links")
                    .select("document_id, subject_type, subject_id, association, is_primary, derived_from")
                    .eq("org_id", orgId)
                    .eq("subject_type", r.subject_type)
                    .in("subject_id", ids),
            );
        }
    }
    const results = await Promise.all(reads);
    const out: LinkRow[] = [];
    for (const res of results) {
        if (res.error) return null;
        out.push(...((res.data ?? []) as LinkRow[]));
    }
    return out;
}

/** Every link of the given documents: needed to know each document's primary owner even when it is outside the graph. */
async function allLinksOfDocuments(supabase: SupabaseClient, orgId: string, documentIds: string[]): Promise<LinkRow[] | null> {
    const results = await Promise.all(
        chunks(documentIds).map((ids) =>
            supabase.from("document_subjects").select("document_id, subject_type, subject_id, association, is_primary").eq("org_id", orgId).in("document_id", ids).is("ended_at", null),
        ),
    );
    const out: LinkRow[] = [];
    for (const res of results) {
        if (res.error) return null;
        for (const r of (res.data ?? []) as Array<Omit<LinkRow, "derived_from">>) out.push({ ...r, derived_from: "document_subjects" });
    }
    return out;
}

type DocRow = {
    id: string;
    title: string | null;
    original_filename: string | null;
    mime_type: string | null;
    byte_size: number | null;
    doc_type: string | null;
    sensitivity: string | null;
    status: string | null;
    entity_type: string | null;
    entity_id: string | null;
    created_at: string | null;
    current_version_id: string | null;
    checksum_sha256?: string | null;
    metadata?: Record<string, unknown> | null;
};

export async function buildDocumentLibrary(
    supabase: SupabaseClient,
    actor: LibraryActor,
    input: { anchor: LibrarySubjectRef; focus?: LibrarySubjectRef | null },
): Promise<LibraryResult> {
    const { orgId } = actor;
    const anchor = input.anchor;
    if (!actor.scope) return { ok: false, status: 404, code: "NOT_FOUND" };

    // The anchor must be a record this actor may open; otherwise the library is an existence oracle.
    if (!(await assertEntityDrawerRecordReadable(supabase, orgId, actor.scope, ENTITY_FOR_SCOPE[anchor.subject_type], anchor.subject_id))) {
        return { ok: false, status: 404, code: "NOT_FOUND" };
    }
    const resolved = await householdForAnchor(supabase, orgId, anchor);
    if (!resolved.ok) return resolved;

    let household: DocumentLibrary["household"] = null;
    let subjects: LibrarySubject[];
    if (resolved.householdId) {
        const graph = await householdSubjects(supabase, orgId, resolved.householdId);
        if (!graph) return { ok: false, status: 404, code: "NOT_FOUND" };
        household = graph.household;
        subjects = graph.subjects;
        // A case or person reached through the anchor is always part of the library, even when not linked by household.
        if (!subjects.some((s) => key(s) === key(anchor))) {
            subjects.push({ ...anchor, label: anchor.subject_type === "opportunity" ? "Enrollment case" : "Selected record", role: anchor.subject_type === "opportunity" ? "case" : "adult", is_primary_contact: false, active: true });
        }
    } else {
        subjects = [{ ...anchor, label: anchor.subject_type === "opportunity" ? "Enrollment case" : "Selected record", role: anchor.subject_type === "opportunity" ? "case" : anchor.subject_type === "child" ? "child" : "adult", is_primary_contact: false, active: true }];
    }
    const subjectKeys = new Set(subjects.map(key));

    const focus = input.focus ?? null;
    if (focus && !subjectKeys.has(key(focus))) return { ok: false, status: 404, code: "NOT_FOUND" };

    const idsOf = (t: LibrarySubjectType) => subjects.filter((s) => s.subject_type === t).map((s) => s.subject_id);
    const caseIds = idsOf("opportunity");

    // Forms artifacts: submissions of the household's cases reach their documents through the derived context links.
    let submissionIds: string[] = [];
    if (caseIds.length) {
        const subs = await Promise.all(chunks(caseIds).map((ids) => supabase.from("form_submissions").select("id").eq("org_id", orgId).in("opportunity_id", ids)));
        if (subs.some((s) => s.error)) return { ok: false, status: 500, code: "LIBRARY_READ_FAILED" };
        submissionIds = subs.flatMap((s) => ((s.data ?? []) as Array<{ id: string }>).map((r) => r.id));
    }

    const links = await linksForSubjects(supabase, orgId, [
        ...LIBRARY_SUBJECT_TYPES.map((t) => ({ subject_type: t, ids: idsOf(t) })),
        { subject_type: "form_submission", ids: submissionIds },
    ]);
    if (!links) return { ok: false, status: 500, code: "LIBRARY_READ_FAILED" };

    const submissionSet = new Set(submissionIds);
    const linksByDoc = new Map<string, LinkRow[]>();
    for (const l of links) {
        const list = linksByDoc.get(l.document_id) ?? [];
        list.push(l);
        linksByDoc.set(l.document_id, list);
    }
    const linkedIds = [...linksByDoc.keys()];

    // Load the rows and apply the canonical disclosure before anything else is derived from them.
    const docReads = await Promise.all(
        chunks(linkedIds).map((ids) =>
            supabase
                .from("documents")
                .select("id, title, original_filename, mime_type, byte_size, doc_type, sensitivity, status, entity_type, entity_id, created_at, current_version_id, checksum_sha256, metadata")
                .eq("org_id", orgId)
                .in("id", ids),
        ),
    );
    if (docReads.some((r) => r.error)) return { ok: false, status: 500, code: "LIBRARY_READ_FAILED" };
    const available = docReads.flatMap((r) => (r.data ?? []) as DocRow[]).filter((d) => !isDocumentUnavailable(d.status));
    const inScope = await filterDocumentRowsInActorScope(supabase, orgId, actor.scope, available);
    const disclosed = await filterDocumentRowsBySensitivity(supabase, orgId, { roleKeys: [...actor.roleKeys], permissionKeys: [...actor.permissionKeys] }, inScope);

    // Primary owners, from the stored subjects (a document reached through a context link may be owned elsewhere).
    const ownerLinks = await allLinksOfDocuments(supabase, orgId, disclosed.map((d) => d.id));
    if (!ownerLinks) return { ok: false, status: 500, code: "LIBRARY_READ_FAILED" };
    const primaryByDoc = new Map<string, LibrarySubjectRef>();
    for (const l of ownerLinks) {
        if (l.is_primary && l.association === "owner" && isLibrarySubjectType(l.subject_type)) primaryByDoc.set(l.document_id, { subject_type: l.subject_type, subject_id: l.subject_id });
    }

    // Narrowing happens here, after disclosure and before counting: a focused library holds only that subject's documents.
    let rows = disclosed;
    if (focus) rows = rows.filter((d) => (linksByDoc.get(d.id) ?? []).some((l) => l.subject_type === focus.subject_type && l.subject_id === focus.subject_id));

    rows.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    const truncated = rows.length > LIBRARY_DOCUMENT_LIMIT;
    rows = rows.slice(0, LIBRARY_DOCUMENT_LIMIT);

    const [typesRes, categoriesRes, versionReads, clock] = await Promise.all([
        listTypes(supabase, orgId),
        listCategories(supabase, orgId),
        Promise.all(
            chunks(rows.map((d) => d.id)).map((ids) =>
                supabase
                    .from("document_versions")
                    .select("id, document_id, version_number, created_at, source, review_status, reviewed_at, effective_on, expires_on")
                    .eq("org_id", orgId)
                    .in("document_id", ids),
            ),
        ),
        resolveDocumentsClock(supabase, orgId),
    ]);
    if (versionReads.some((r) => r.error)) return { ok: false, status: 500, code: "LIBRARY_READ_FAILED" };
    // D8: Forms provenance for every listed document (only form-produced ones appear in the map). Best-effort for the
    // library's display: an unreadable link shows no provenance; evidence decisions read it again and fail closed.
    const formProvenance =
        (await loadFormArtifactProvenance(
            supabase,
            orgId,
            rows.map((d) => ({ id: d.id, doc_type: str(d.doc_type), checksum_sha256: str((d as { checksum_sha256?: unknown }).checksum_sha256), metadata: ((d as { metadata?: unknown }).metadata ?? null) as Record<string, unknown> | null })),
        )) ?? new Map();
    const categories = categoriesRes.ok ? categoriesRes.value : [];
    const categoryLabel = new Map(categories.map((c) => [c.id, c.label]));
    const typeByKey = new Map((typesRes.ok ? typesRes.value : []).map((t) => [t.key, t]));
    const versionsByDoc = new Map<string, LibraryVersion[]>();
    for (const v of versionReads.flatMap((r) => (r.data ?? []) as Array<LibraryVersion & { document_id: string }>)) {
        const list = versionsByDoc.get(v.document_id) ?? [];
        const { document_id: _documentId, ...version } = v;
        void _documentId;
        list.push(version);
        versionsByDoc.set(v.document_id, list);
    }

    // B2: event-renewal types resolve from each document's owner's authoritative event dates.
    const eventOwners = rows
        .filter((d) => {
            const tk = str(d.doc_type);
            return tk ? validityNeedsEventDates((typeByKey.get(tk)?.published?.validity_policy ?? null) as ValidityPolicy | null) : false;
        })
        .map((d) => primaryByDoc.get(d.id))
        .filter((o): o is NonNullable<typeof o> => Boolean(o));
    const eventDates = eventOwners.length ? await loadValidityEventDates(supabase, orgId, eventOwners) : null;

    const documents: LibraryDocument[] = rows.map((d) => {
        const typeKey = str(d.doc_type);
        const t = typeKey ? typeByKey.get(typeKey) : undefined;
        const shown = t?.published ?? t?.open_draft ?? null;
        const categoryId = t?.published?.category_id ?? null;
        const owner = primaryByDoc.get(d.id) ?? null;
        const ownerHere = owner && subjectKeys.has(key(owner)) ? owner : null;
        const docLinks = (linksByDoc.get(d.id) ?? []).filter((l) => isLibrarySubjectType(l.subject_type));
        const associations: LibraryAssociation[] = docLinks
            .map((l) => ({
                subject_type: l.subject_type as LibrarySubjectType,
                subject_id: l.subject_id,
                association: (l.association === "owner" ? "owner" : "context") as "owner" | "context",
                is_primary: Boolean(l.is_primary),
                derived_from: l.derived_from,
            }))
            .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
        const versions = (versionsByDoc.get(d.id) ?? []).sort((a, b) => b.version_number - a.version_number);
        const current = versions.find((v) => v.id === d.current_version_id) ?? versions[0] ?? null;
        return {
            id: d.id,
            title: str(d.title) ?? str(d.original_filename) ?? "Untitled",
            original_filename: str(d.original_filename),
            mime_type: str(d.mime_type),
            byte_size: typeof d.byte_size === "number" ? d.byte_size : null,
            type: {
                key: typeKey,
                label: shown?.label ?? (typeKey ? typeKey.replace(/_/g, " ") : "Unclassified"),
                registered: Boolean(t),
                category_id: categoryId,
                category_label: categoryId ? (categoryLabel.get(categoryId) ?? null) : null,
            },
            sensitivity: str(d.sensitivity) ?? "standard",
            status: str(d.status),
            received_at: str(d.created_at),
            owner: ownerHere,
            owned_elsewhere: !ownerHere,
            associations,
            forms_artifact:
                typeKey === "generated_form_pdf" ||
                typeKey === "signature_asset" ||
                (linksByDoc.get(d.id) ?? []).some((l) => l.subject_type === "form_submission" && submissionSet.has(l.subject_id)),
            current_version: current,
            version_count: versions.length,
            form_provenance: formProvenance.get(d.id) ?? null,
            validity: current
                ? evaluateDocumentValidity({
                      policy: (t?.published?.validity_policy ?? null) as ValidityPolicy | null,
                      facts: {
                          effective_on: current.effective_on,
                          expires_on: current.expires_on,
                          received_on: localDateOf(current.created_at, clock.timeZone),
                          reviewed_on: localDateOf(current.reviewed_at ?? null, clock.timeZone),
                          events: owner ? (eventDates?.get(`${owner.subject_type}:${owner.subject_id}`) ?? null) : null,
                      },
                      today: clock.today,
                  })
                : null,
        };
    });

    return {
        ok: true,
        value: {
            anchor,
            household,
            subjects,
            focus,
            documents,
            categories: categories.filter((c) => c.status === "active").map((c) => ({ id: c.id, label: c.label, parent_id: c.parent_id })),
            truncated,
        },
    };
}
