import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
const payload = {
  version: 1, active_process_id: "p1",
  processes: [{
    id: "p1", key: "enrollment", name: "Enrollment", primary_entity: "opportunity", sort_order: 0, is_active: true,
    command_set_v1: { version: 1, commands: [] },
    stages: [{ id: "s1", key: "tour", label: "Tour", sort_order: 0, is_active: true,
      stage_operating_plan_v1: { version: 1, stage_key: "tour", outcomes: [],
        work_templates: [{ template_key: "conduct_tour", label: "Conduct Tour", helpful_actions: [{ action_ref: "quick_message" }] }] } }],
  }],
};
const v = validateBusinessProcessForPublish(payload);
console.log("errors:", v.errors.map((e) => `${e.code}: ${e.message}`).join("\n  ") || "(none)");
