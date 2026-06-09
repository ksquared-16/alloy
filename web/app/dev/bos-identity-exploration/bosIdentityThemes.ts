export type BosIdentityVariant = "pine-first" | "contour" | "intelligence-surface";

export type BosIdentityTheme = {
    id: BosIdentityVariant;
    label: string;
    tagline: string;
    emotionalFeel: string;
    dominantColors: string;
    goldRole: string;
    contourUsage: string;
    hierarchy: string[];
    advantages: string[];
    risks: string[];
};

export const BOS_IDENTITY_THEMES: BosIdentityTheme[] = [
    {
        id: "pine-first",
        label: "A · Pine-first BOS",
        tagline: "Operational intelligence — calm, trusted, aligned with Command Center",
        emotionalFeel: "Steady partner. BOS feels like part of the Alloy operating system — not a feature bolt-on.",
        dominantColors: "Juniper (#00A283) + Midnight Forge (#273F52). Gold only on 2px sparkle accent.",
        goldRole: "Accent dot inside BOS badge — never borders, never fills, never dividers.",
        contourUsage: "No contour frame. Recognition via pine wash + juniper edge + BOS wordmark.",
        hierarchy: [
            "Midnight Forge header (structural)",
            "Juniper BOS findings rail (identity)",
            "White finding cards on stone (content)",
            "Human approval footer (neutral)",
        ],
        advantages: [
            "Aligns with existing Command Center pine wash",
            "Lowest risk — extends current AdminV2 language",
            "Trust-forward; no decorative noise",
            "Gold restraint feels premium, not promotional",
        ],
        risks: [
            "Less visually distinctive at thumbnail scale",
            "Could still read as 'nice admin UI' without contour signature",
            "Needs disciplined gold usage across all surfaces",
        ],
    },
    {
        id: "contour",
        label: "B · Contour BOS",
        tagline: "Signature intelligence frame — recognizable at a glance",
        emotionalFeel: "Present and intentional. BOS has a shape you remember without cartoon AI cues.",
        dominantColors: "Pine structure + juniper glow inside contour. Gold only on crest peak accent.",
        goldRole: "Single accent stroke on contour crest — marks the 'intelligence' apex.",
        contourUsage: "Asymmetric frame on findings pane, finding cards, Command Center crest. Shared SVG mark.",
        hierarchy: [
            "Contour-framed BOS findings pane (signature)",
            "BOS narrative inside frame (voice)",
            "Finding rows (content)",
            "Source material (neutral reference)",
        ],
        advantages: [
            "Strongest platform recognition — one shape everywhere",
            "Premium and subtle when pine-dominant",
            "Differentiates Action Workspace from generic split views",
            "Contour scales from badge to full pane",
        ],
        risks: [
            "Contour must stay subtle — overuse becomes decoration",
            "SVG asset discipline required across teams",
            "Wrong execution could feel 'blob UI' trend",
        ],
    },
    {
        id: "intelligence-surface",
        label: "C · Alloy Intelligence Surface",
        tagline: "Focused instrument panel — BOS as precision layer",
        emotionalFeel: "Serious, premium, high-context. Like switching to instrument mode — not a chat window.",
        dominantColors: "Dark pine panel (#273F52 at 94%) with juniper radial mesh. White text on BOS zone only.",
        goldRole: "Reserved for active analyze state or single highlight — never ambient fill.",
        contourUsage: "Soft radial mesh inside dark BOS surface — no literal contour; depth via light bloom.",
        hierarchy: [
            "Dark intelligence surface (BOS zone — right pane)",
            "Juniper mesh + narrative (presence)",
            "Light finding cards floating on dark (contrast)",
            "Source pane stays light (human material)",
        ],
        advantages: [
            "Maximum contrast — BOS zone unmistakable",
            "Emotionally distinct from rest of admin (light cards)",
            "Findings pop against dark surface",
            "Memorable 'instrument panel' moment",
        ],
        risks: [
            "Dark pane may feel heavy in long sessions",
            "Contrast jump between panes could fatigue",
            "Must not compete with org-chart dark chamber",
            "Accessibility contrast needs care on dark BOS text",
        ],
    },
];
