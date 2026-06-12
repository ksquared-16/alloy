"use client";

import { useState } from "react";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { extractVariables, templatePreview } from "@/lib/communications/v2/templateRender";

/**
 * Visual-first template builder (PKG-14) — DARK (self-gated behind comms_v2_templates).
 * Edit body, see referenced variables, and a live desktop/mobile preview rendered with sample values.
 * Persistence/approval API wiring is a real-gate-validated follow-on.
 */
export default function TemplateBuilder() {
    if (!isCommsV2FlagEnabled("comms_v2_templates")) return null;

    const [body, setBody] = useState("Hi {{first_name}}, welcome to {{school_name}}.");
    const variables = extractVariables(body);
    const preview = templatePreview(null, body, { first_name: "Sam", school_name: "North Star" }, "email");

    return (
        <div data-cc-template-builder className="space-y-2 bg-white">
            <textarea
                aria-label="Template body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="h-24 w-full rounded-lg border border-alloy-stone/15 px-2 py-1 text-sm"
            />
            <div data-cc-template-variables className="text-xs text-alloy-midnight/70">
                Variables: {variables.join(", ") || "none"}
            </div>
            <div data-cc-template-preview className="rounded-lg border border-alloy-stone/10 p-2 text-sm">
                {preview.desktop.body}
            </div>
        </div>
    );
}
