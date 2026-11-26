/**
 * The capabilities an operator may grant.
 *
 * Served from the canonical scope catalog so the wizard and the editor keep no
 * list of their own. A capability that stops existing here stops being offerable
 * everywhere, which is the only way the two can never disagree.
 */
import { NextResponse } from "next/server";

import { requireIntegrationsAccess } from "../_guard";
import { allPublicScopes } from "@/lib/platform/external/scopeCatalog";
import { presentScopes } from "@/lib/platform/external/scopePresentation";

export async function GET() {
    const gate = await requireIntegrationsAccess("viewInstallation");
    if (!gate.ok) return gate.response;

    return NextResponse.json({
        capabilities: presentScopes(allPublicScopes().map((d) => d.scope)),
    });
}
