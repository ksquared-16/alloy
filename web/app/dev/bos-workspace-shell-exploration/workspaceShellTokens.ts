export const FORGE_DEEP = "#18273A";
export const MIDNIGHT_FORGE = "#273F52";
export const BEND_PINE = "#00A283";
export const ALLOY_BLUE = "#00458C";
export const RIVER_STONE = "#F6F8FC";

export type WorkspaceShellVariant =
    | "cloud"
    | "organic-contour"
    | "intelligence-halo"
    | "sculpted-alloy"
    | "dynamic-island";

export const WORKSPACE_SHELL_SPECS: Record<
    WorkspaceShellVariant,
    {
        id: WorkspaceShellVariant;
        label: string;
        tagline: string;
        crestStrategy: string;
        emotionalFeel: string;
        advantages: string[];
        risks: string[];
    }
> = {
    cloud: {
        id: "cloud",
        label: "1 · Cloud Shell",
        tagline: "Soft crest across the top edge — sides and bottom stay normal",
        crestStrategy:
            "Gentle multi-arc crest on top border only. Rectangular body. Entering BOS feels like passing under a calm intelligence canopy.",
        emotionalFeel: "Approachable territory. Soft boundary, not a gimmick.",
        advantages: ["Lowest visual risk", "Clearly not a speech bubble", "Top-only distortion"],
        risks: ["May be too subtle at distance", "Cloud association needs abstract treatment"],
    },
    "organic-contour": {
        id: "organic-contour",
        label: "2 · Organic Contour Shell",
        tagline: "Distinctive asymmetric crest — normal sides, normal bottom",
        crestStrategy:
            "Bold organic wave on top-left crest apex. Straight vertical sides, flat bottom. 80% identity / 20% risk.",
        emotionalFeel: "BOS owns the horizon line. You crossed into assisted execution.",
        advantages: ["Strongest top-edge silhouette", "Body stays enterprise-rectangular", "Memorable without full blob"],
        risks: ["Heavier crest can feel decorative if stroke too thick", "Asymmetry must be consistent"],
    },
    "intelligence-halo": {
        id: "intelligence-halo",
        label: "3 · Intelligence Halo Shell",
        tagline: "Bend-pine halo wraps the workspace — rectangular interior",
        crestStrategy:
            "Outer glow ring around full shell. Top edge slightly elevated with pine wash. Interior unchanged.",
        emotionalFeel: "Focused instrument zone. The workspace glows — you entered intelligence airspace.",
        advantages: ["No shape distortion of content", "Premium ambient feel", "Works with dark backdrop"],
        risks: ["Halo can read as shadow if too faint", "Less unique than crest at thumbnail"],
    },
    "sculpted-alloy": {
        id: "sculpted-alloy",
        label: "4 · Sculpted Alloy Shell",
        tagline: "Engineered top bar with characteristic corner notch",
        crestStrategy:
            "Flat sides and bottom. Sculpted midnight-forge header with bend-pine notch cut — Alloy geometry, not organic.",
        emotionalFeel: "Engineered BOS chamber. Alloy-native, authoritative, precise.",
        advantages: ["Most enterprise-appropriate", "Notch readable at workspace scale", "Zero cartoon risk"],
        risks: ["Less 'wow' than organic crest", "Notch must align with Alloy design system"],
    },
    "dynamic-island": {
        id: "dynamic-island",
        label: "5 · Dynamic Island-inspired BOS Shell",
        tagline: "Floating BOS territory — collapsed pill expands to workspace",
        crestStrategy:
            "Closed: pine capsule above Command Center. Open: expands to full shell with rounded-top capsule morph. Sides straight below fold.",
        emotionalFeel: "Living BOS presence. Territory expands when invoked — not another modal rectangle.",
        advantages: ["Strongest closed/open story", "Distinct from all other Alloy overlays", "Clear BOS entry ritual"],
        risks: ["Animation discipline required", "Could feel iOS-derivative if over-rounded", "Must stay enterprise weight"],
    },
};
