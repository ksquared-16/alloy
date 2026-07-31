/**
 * Phase 0 commit 6C — vendor object path remediation utility.
 *
 * Narrowly scoped, dry-run-first tool for the six known nonconforming
 * `vendors/...` storage objects that do not follow the `{org_id}/...`
 * convention.
 *
 * WHAT LIVE VERIFICATION FOUND (2026-07-31, read-only)
 *   * none of the six objects has a `documents` row
 *   * none of the three vendor ids resolves to a `vendors` row
 *   * zero `documents` rows point at any `vendors/%` path
 *
 * Ownership therefore CANNOT be established for any of them, and the specified
 * behavior is to fail closed rather than guess. This utility is still the right
 * artifact: it is the mechanism that proves that conclusion, it re-checks it at
 * execution time rather than trusting a snapshot, and it is ready if a mappable
 * object ever appears.
 *
 * Note also that after commit 6B the vendor signed-URL route is row-driven, so
 * an object with no `documents` row is already unreachable through every
 * application path. These six are orphaned storage, the same category as the
 * 34 untracked objects — not a live exposure.
 *
 * SAFETY
 *   * default mode is `dry-run`
 *   * mutating modes refuse to run unless explicitly authorized
 *   * enumerates ONLY the known nonconforming prefix; never a broad sweep
 *   * old objects are deleted only in a separately authorized mode, after
 *     verification
 *   * every run emits a machine-readable report
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "org_documents";
export const NONCONFORMING_PREFIX = "vendors/";

export type RemediationMode = "dry-run" | "copy-and-update" | "verify" | "delete-old" | "rollback";

export const DEFAULT_MODE: RemediationMode = "dry-run";

export type ObjectPlan = {
    objectPath: string;
    /** Vendor id parsed from the path. A parse result, never an ownership claim. */
    vendorIdFromPath: string | null;
    documentId: string | null;
    orgId: string | null;
    vendorExists: boolean;
    destinationPath: string | null;
    collision: boolean;
    /** `blocked` means ownership could not be established — the fail-closed case. */
    status: "mappable" | "blocked";
    blockedReason?: RemediationBlockReason;
};

export type RemediationBlockReason =
    | "NO_DOCUMENT_ROW"
    | "NO_VENDOR_ROW"
    | "ORG_MISMATCH"
    | "VENDOR_ORG_MISMATCH"
    | "UNPARSEABLE_PATH"
    | "DESTINATION_COLLISION";

export type RemediationReport = {
    mode: RemediationMode;
    bucket: string;
    generatedAt: string;
    totals: { enumerated: number; mappable: number; blocked: number; mutated: number };
    plans: ObjectPlan[];
    /** True when no mutating action was performed, for any reason. */
    readOnly: boolean;
    notes: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `vendors/{vendorId}/{kind}/{file}` → vendorId, or null when it does not parse. */
export function parseVendorIdFromPath(objectPath: string): string | null {
    const parts = objectPath.split("/");
    if (parts.length < 3 || parts[0] !== "vendors") return null;
    return UUID_RE.test(parts[1]) ? parts[1] : null;
}

/** Canonical destination: `{org_id}/vendors/{vendorId}/{rest}`. */
export function canonicalDestination(objectPath: string, orgId: string): string | null {
    const vendorId = parseVendorIdFromPath(objectPath);
    if (!vendorId || !orgId) return null;
    const rest = objectPath.split("/").slice(2).join("/");
    if (!rest) return null;
    return `${orgId}/vendors/${vendorId}/${rest}`;
}

export type StorageAdapter = {
    list(prefix: string): Promise<string[]>;
    exists(path: string): Promise<boolean>;
    copy(from: string, to: string): Promise<void>;
    remove(path: string): Promise<void>;
};

export type DbAdapter = {
    findDocumentByPath(bucket: string, path: string): Promise<{ id: string; org_id: string } | null>;
    findVendor(vendorId: string): Promise<{ id: string; org_id: string } | null>;
    updateDocumentPath(documentId: string, path: string): Promise<void>;
};

/**
 * Build the execution plan.
 *
 * Pure decision-making over the adapters — no mutation happens here, in any
 * mode, so the plan is identical whether or not it is later executed.
 */
export async function buildPlan(
    storage: StorageAdapter,
    db: DbAdapter,
    mode: RemediationMode = DEFAULT_MODE
): Promise<ObjectPlan[]> {
    // A destination that already exists is a COLLISION before the copy, but the
    // expected state afterwards. Treating it as a collision in the post-copy
    // modes would make verify/delete-old/rollback refuse to act on exactly the
    // objects they exist to finish.
    const collisionBlocks = mode === "dry-run" || mode === "copy-and-update";
    const objects = await storage.list(NONCONFORMING_PREFIX);
    const plans: ObjectPlan[] = [];

    for (const objectPath of objects) {
        const vendorIdFromPath = parseVendorIdFromPath(objectPath);

        if (!vendorIdFromPath) {
            plans.push({
                objectPath,
                vendorIdFromPath: null,
                documentId: null,
                orgId: null,
                vendorExists: false,
                destinationPath: null,
                collision: false,
                status: "blocked",
                blockedReason: "UNPARSEABLE_PATH",
            });
            continue;
        }

        // 1. Resolve to ONE canonical documents row. No row => no ownership.
        const doc = await db.findDocumentByPath(BUCKET, objectPath);
        if (!doc) {
            plans.push({
                objectPath,
                vendorIdFromPath,
                documentId: null,
                orgId: null,
                vendorExists: false,
                destinationPath: null,
                collision: false,
                status: "blocked",
                blockedReason: "NO_DOCUMENT_ROW",
            });
            continue;
        }

        // 3. Verify vendor ownership.
        const vendor = await db.findVendor(vendorIdFromPath);
        if (!vendor) {
            plans.push({
                objectPath,
                vendorIdFromPath,
                documentId: doc.id,
                orgId: doc.org_id,
                vendorExists: false,
                destinationPath: null,
                collision: false,
                status: "blocked",
                blockedReason: "NO_VENDOR_ROW",
            });
            continue;
        }

        if (vendor.org_id !== doc.org_id) {
            plans.push({
                objectPath,
                vendorIdFromPath,
                documentId: doc.id,
                orgId: doc.org_id,
                vendorExists: true,
                destinationPath: null,
                collision: false,
                status: "blocked",
                blockedReason: "VENDOR_ORG_MISMATCH",
            });
            continue;
        }

        // 4. Canonical destination + 5. collision detection.
        const destinationPath = canonicalDestination(objectPath, doc.org_id);
        if (!destinationPath) {
            plans.push({
                objectPath,
                vendorIdFromPath,
                documentId: doc.id,
                orgId: doc.org_id,
                vendorExists: true,
                destinationPath: null,
                collision: false,
                status: "blocked",
                blockedReason: "UNPARSEABLE_PATH",
            });
            continue;
        }

        const collision = await storage.exists(destinationPath);
        const blocked = collision && collisionBlocks;
        plans.push({
            objectPath,
            vendorIdFromPath,
            documentId: doc.id,
            orgId: doc.org_id,
            vendorExists: true,
            destinationPath,
            collision,
            status: blocked ? "blocked" : "mappable",
            ...(blocked ? { blockedReason: "DESTINATION_COLLISION" as const } : {}),
        });
    }

    return plans;
}

export type RunOptions = {
    mode?: RemediationMode;
    storage: StorageAdapter;
    db: DbAdapter;
    /** Mutating modes refuse to act without this. */
    authorizedToMutate?: boolean;
};

export async function runRemediation(opts: RunOptions): Promise<RemediationReport> {
    const mode = opts.mode ?? DEFAULT_MODE;
    const notes: string[] = [];
    const plans = await buildPlan(opts.storage, opts.db, mode);

    const mappable = plans.filter((p) => p.status === "mappable");
    const blocked = plans.filter((p) => p.status === "blocked");
    let mutated = 0;
    let readOnly = true;

    if (plans.length === 0) {
        notes.push(
            "No nonconforming objects remain under the vendors/ prefix. If 'delete-old' has already run, " +
                "rollback is no longer possible — which is why deletion is a separately authorized mode."
        );
    }

    if (blocked.length > 0) {
        notes.push(
            `${blocked.length} object(s) failed closed; ownership could not be established. No guess is made.`
        );
    }

    const mutatingMode = mode === "copy-and-update" || mode === "delete-old" || mode === "rollback";

    if (mutatingMode && !opts.authorizedToMutate) {
        notes.push(`Mode '${mode}' requires explicit authorization; refused. No object or row was changed.`);
        return report(mode, plans, mappable.length, blocked.length, 0, true, notes);
    }

    if (mode === "copy-and-update") {
        readOnly = false;
        for (const plan of mappable) {
            if (!plan.destinationPath || !plan.documentId) continue;
            // 7. copy
            await opts.storage.copy(plan.objectPath, plan.destinationPath);
            // 8. verify destination BEFORE the row is repointed
            const ok = await opts.storage.exists(plan.destinationPath);
            if (!ok) {
                notes.push(`Copy verification failed for ${plan.objectPath}; row NOT updated.`);
                continue;
            }
            // 9. update row only after a verified copy
            await opts.db.updateDocumentPath(plan.documentId, plan.destinationPath);
            mutated += 1;
        }
        notes.push("Old objects retained. Deletion requires the separately authorized 'delete-old' mode.");
    }

    if (mode === "verify") {
        for (const plan of mappable) {
            if (!plan.destinationPath) continue;
            const ok = await opts.storage.exists(plan.destinationPath);
            if (!ok) notes.push(`Destination missing for ${plan.objectPath}.`);
        }
    }

    if (mode === "delete-old") {
        readOnly = false;
        for (const plan of mappable) {
            if (!plan.destinationPath) continue;
            // 10. delete only after the destination is verified present
            const ok = await opts.storage.exists(plan.destinationPath);
            if (!ok) {
                notes.push(`Refusing to delete ${plan.objectPath}: destination not verified.`);
                continue;
            }
            await opts.storage.remove(plan.objectPath);
            mutated += 1;
        }
    }

    if (mode === "rollback") {
        readOnly = false;
        for (const plan of mappable) {
            if (!plan.documentId) continue;
            // 12. restore the row to the original path. The original object is
            // retained until delete-old runs, so this is recoverable.
            const originalPresent = await opts.storage.exists(plan.objectPath);
            if (!originalPresent) {
                notes.push(`Cannot roll back ${plan.objectPath}: original object no longer exists.`);
                continue;
            }
            await opts.db.updateDocumentPath(plan.documentId, plan.objectPath);
            mutated += 1;
        }
    }

    return report(mode, plans, mappable.length, blocked.length, mutated, readOnly, notes);
}

function report(
    mode: RemediationMode,
    plans: ObjectPlan[],
    mappable: number,
    blocked: number,
    mutated: number,
    readOnly: boolean,
    notes: string[]
): RemediationReport {
    return {
        mode,
        bucket: BUCKET,
        generatedAt: new Date().toISOString(),
        totals: { enumerated: plans.length, mappable, blocked, mutated },
        plans,
        readOnly,
        notes,
    };
}

// ---------------------------------------------------------------------------
// Live adapters (used only by the CLI entry point)
// ---------------------------------------------------------------------------

export function liveAdapters(client: SupabaseClient): { storage: StorageAdapter; db: DbAdapter } {
    return {
        storage: {
            async list(prefix) {
                const out: string[] = [];
                const { data } = await client.storage.from(BUCKET).list(prefix.replace(/\/$/, ""), { limit: 1000 });
                for (const entry of data ?? []) {
                    const sub = await client.storage.from(BUCKET).list(`${prefix}${entry.name}`, { limit: 1000 });
                    for (const kindDir of sub.data ?? []) {
                        const files = await client.storage
                            .from(BUCKET)
                            .list(`${prefix}${entry.name}/${kindDir.name}`, { limit: 1000 });
                        for (const f of files.data ?? []) out.push(`${prefix}${entry.name}/${kindDir.name}/${f.name}`);
                    }
                }
                return out;
            },
            async exists(path) {
                const dir = path.split("/").slice(0, -1).join("/");
                const name = path.split("/").pop()!;
                const { data } = await client.storage.from(BUCKET).list(dir, { limit: 1000, search: name });
                return (data ?? []).some((e) => e.name === name);
            },
            async copy(from, to) {
                const { error } = await client.storage.from(BUCKET).copy(from, to);
                if (error) throw new Error(`copy failed: ${error.message}`);
            },
            async remove(path) {
                const { error } = await client.storage.from(BUCKET).remove([path]);
                if (error) throw new Error(`remove failed: ${error.message}`);
            },
        },
        db: {
            async findDocumentByPath(bucket, path) {
                const { data } = await client
                    .from("documents")
                    .select("id, org_id")
                    .eq("bucket", bucket)
                    .eq("storage_path", path)
                    .maybeSingle();
                return (data as { id: string; org_id: string } | null) ?? null;
            },
            async findVendor(vendorId) {
                const { data } = await client.from("vendors").select("id, org_id").eq("id", vendorId).maybeSingle();
                return (data as { id: string; org_id: string } | null) ?? null;
            },
            async updateDocumentPath(documentId, path) {
                const { error } = await client.from("documents").update({ storage_path: path }).eq("id", documentId);
                if (error) throw new Error(`row update failed: ${error.message}`);
            },
        },
    };
}

/** CLI: `tsx web/scripts/vendorObjectPathRemediation.ts [--mode=<mode>] [--authorize]` */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const modeArg = args.find((a) => a.startsWith("--mode="))?.split("=")[1] as RemediationMode | undefined;
    const mode: RemediationMode = modeArg ?? DEFAULT_MODE;
    const authorizedToMutate = args.includes("--authorize");

    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
        console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
        process.exit(1);
    }

    const client = createClient(url, key, { auth: { persistSession: false } });
    const { storage, db } = liveAdapters(client);
    const result = await runRemediation({ mode, storage, db, authorizedToMutate });

    console.log(JSON.stringify(result, null, 2));
    if (result.totals.blocked > 0 && mode === "dry-run") {
        console.error(`\n${result.totals.blocked} object(s) failed closed. Review before any mutating mode.`);
    }
}

if (typeof require !== "undefined" && require.main === module) {
    void main();
}
