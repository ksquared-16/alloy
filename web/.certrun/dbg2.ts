import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
const minimal = { version: 1, stage_key: "tour", outcomes: [], work_templates: [{ template_key: "conduct_tour", label: "Conduct Tour", helpful_actions: [{ action_ref: "quick_message" }] }] };
const p1 = parseStageOperatingPlanV1(minimal);
console.log("minimal parses:", Boolean(p1), "| work_templates:", p1?.work_templates?.length ?? "n/a");
const withKeys = { ...minimal, lifecycle_key: "enrollment", purpose: "x" };
const p2 = parseStageOperatingPlanV1(withKeys);
console.log("with lifecycle_key+purpose:", Boolean(p2), "| work_templates:", p2?.work_templates?.length ?? "n/a");
if (p2?.work_templates?.length) console.log("   wt keys:", Object.keys(p2.work_templates[0]!).join(","));
