import { NextResponse } from "next/server";

import {
    CONFIG_ASSIST_PERMISSION_APPLY,
    CONFIG_ASSIST_PERMISSION_GENERATE,
    CONFIG_ASSIST_PERMISSION_REVIEW,
    hasConfigLayoutAssistPermission,
    listConfigAssistPermissionCatalog,
} from "@/lib/agent/configLayoutAssist/configurationProposalAccess";
import { loadConfigLayoutAssistAdminContext } from "@/lib/agent/configLayoutAssist/configurationProposalApiHelpers";
import type { ConfigLayoutAssistCapabilitiesV1 } from "@/lib/agent/configLayoutAssist/configLayoutAssistTypes";

/** GET — portal capabilities for Configuration / Layout Assist. */
export async function GET() {
    const admin = await loadConfigLayoutAssistAdminContext();
    if (!admin.ok) return admin.response;

    const access = { permissionKeys: admin.permissionKeys, roleKeys: admin.roleKeys };
    const payload: ConfigLayoutAssistCapabilitiesV1 = {
        can_generate: hasConfigLayoutAssistPermission(access, CONFIG_ASSIST_PERMISSION_GENERATE),
        can_review: hasConfigLayoutAssistPermission(access, CONFIG_ASSIST_PERMISSION_REVIEW),
        can_apply: hasConfigLayoutAssistPermission(access, CONFIG_ASSIST_PERMISSION_APPLY),
        permission_keys: listConfigAssistPermissionCatalog().filter((k) =>
            hasConfigLayoutAssistPermission(access, k)
        ),
    };

    return NextResponse.json({ ok: true, ...payload });
}
