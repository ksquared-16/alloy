/** Alloy BOS identity reset — no gold. Canonical design tokens for shape explorations. */

export const MIDNIGHT_FORGE = "#273F52";
export const FORGE_DEEP = "#18273A";
export const BEND_PINE = "#00A283";
export const RIVER_STONE = "#F6F8FC";

export const BOS_WASH = "rgba(0, 162, 131, 0.09)";
export const BOS_BORDER = "rgba(0, 162, 131, 0.38)";
export const BOS_GLOW = "rgba(0, 162, 131, 0.18)";

export const AMBER_REVIEW = { bg: "#fffbeb", border: "#fde68a", rail: "#f59e0b", text: "#92400e" };
export const RED_RISK = { bg: "#fef2f2", border: "#fecaca", rail: "#ef4444", text: "#991b1b" };

export type BosShapeVariant = "cloud" | "contour" | "halo" | "intelligence-frame";

export const BOS_SHAPE_SPECS: Record<
    BosShapeVariant,
    {
        id: BosShapeVariant;
        label: string;
        tagline: string;
        recognition: string;
        emotionalFeel: string;
        advantages: string[];
        risks: string[];
    }
> = {
    cloud: {
        id: "cloud",
        label: "A · Cloud BOS",
        tagline: "Soft intelligence presence — calm, organic, unobtrusive",
        recognition: "Gentle cloud crest along BOS zone top edge; badge uses mini cloud silhouette",
        emotionalFeel: "Approachable intelligence. BOS feels ambient and supportive.",
        advantages: [
            "Softest emotional read — lowest intimidation",
            "Organic without literal AI metaphor",
            "Works on light surfaces without heavy contrast",
        ],
        risks: [
            "May be too subtle at small scale",
            "Cloud association must stay abstract to avoid cartoon",
            "Less structural than frame-based options",
        ],
    },
    contour: {
        id: "contour",
        label: "B · Contour BOS",
        tagline: "Distinctive intelligence frame — visible without explanation",
        recognition: "Asymmetric crest + anchored base; bold pine stroke on findings pane",
        emotionalFeel: "Intentional and present. BOS owns its territory.",
        advantages: [
            "Strongest silhouette at thumbnail scale",
            "Clear differentiation from standard admin cards",
            "Scales from badge to full pane with same path family",
        ],
        risks: [
            "Must avoid trending 'blob UI' if over-rounded",
            "Heavier stroke can feel decorative if not disciplined",
        ],
    },
    halo: {
        id: "halo",
        label: "C · Halo BOS",
        tagline: "Recognition through framing — intelligence glow, not border",
        recognition: "Soft bend-pine radial halo behind BOS content; no hard outline",
        emotionalFeel: "Focused attention. BOS material glows without shouting.",
        advantages: [
            "Premium and subtle — no hard cartoon edges",
            "Works across light and dark adjacency",
            "Halo reads as 'active intelligence' not container",
        ],
        risks: [
            "Low contrast on busy backgrounds",
            "May be invisible without sufficient pine opacity",
            "Harder to reproduce consistently in CSS vs SVG",
        ],
    },
    "intelligence-frame": {
        id: "intelligence-frame",
        label: "D · Intelligence Frame BOS",
        tagline: "Custom Alloy geometry — one shape, every scale",
        recognition: "Characteristic corner notch + pine rail; geometric, not organic",
        emotionalFeel: "Precision instrument. Alloy-native, engineered, trustworthy.",
        advantages: [
            "Most 'platform' feeling — engineered not decorative",
            "Corner notch is memorable at icon size",
            "Clearest scale path: badge → card → command → workspace",
        ],
        risks: [
            "Geometric frame can feel cold if not warmed by pine wash",
            "Requires strict corner-notch consistency across teams",
        ],
    },
};
