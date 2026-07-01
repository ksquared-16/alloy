"use client";

import "@/app/adminV2/components/alloyOsRuntime.css";

import { useState } from "react";

import FocusPanelCardInspector from "@/components/admin/focusPanel/FocusPanelCardInspector";
import type { FocusPanelCardConfig } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * Dev harness (no auth) rendering the REAL card Inspector for the Child card so the
 * Evidence Group authoring (Child → Placement) and Expanded / Related Views config are
 * screenshot-able outside the gated /settings/surfaces layout.
 */

const CHILD_MODEL: FocusPanelCardModel = {
    key: "children",
    archetype: "collection",
    title: "Children",
    insight: "—",
    tier: "context",
    span: 1,
    density: "standard",
    visible: true,
    iconName: "users",
};

export default function ChildInspectorVerify() {
    const [config, setConfig] = useState<FocusPanelCardConfig>({});
    return (
        <div style={{ background: "#f4f6f9", minHeight: "100vh", padding: 20 }}>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
                Dev harness — Child card Inspector (Evidence Group Authoring). The canvas owns composition; this Inspector owns behavior.
            </p>
            <div style={{ width: 380, height: 1180, background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                <FocusPanelCardInspector
                    baseModel={CHILD_MODEL}
                    instanceId="children"
                    config={config}
                    onChange={setConfig}
                    onClose={() => {}}
                    history={{ publishedVersion: null, hasDraft: false, dirty: false }}
                />
            </div>
        </div>
    );
}
