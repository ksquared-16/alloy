import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { detectHostedFormStructure, headingTitleAndOverflow } from "@/lib/pos/processingCase/structure/hostedFormStructure";

const CAPTURE = path.join(process.cwd(), "tests/fixtures/processing/school-of-enrichment-admissions-packet.capture.html");
const capture = () => fs.readFileSync(CAPTURE, "utf8");

const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

describe("hosted form reader — standard form semantics", () => {
    it("reads a labelled control", () => {
        const st = detectHostedFormStructure({
            html: page(`<h1>About you</h1><label for="a">Your name:</label><input type="text" name="full_name" id="a">`),
        });
        expect(st.sections).toHaveLength(1);
        expect(st.sections[0].title).toBe("About you");
        expect(st.sections[0].fields[0]).toMatchObject({ label: "Your name:", suggested_type: "text", evidence: "hosted_form:full_name" });
    });

    it("collapses controls sharing a name into ONE question with its options", () => {
        const st = detectHostedFormStructure({
            html: page(
                `<h1>Q</h1><span class="question">Any allergies?</span>` +
                    `<input type="checkbox" name="allergy" id="n" value="0"><label for="n">No</label>` +
                    `<input type="checkbox" name="allergy" id="y" value="1"><label for="y">Yes</label>`
            ),
        });
        expect(st.sections[0].fields).toHaveLength(1);
        expect(st.sections[0].fields[0]).toMatchObject({ label: "Any allergies?", suggested_type: "select", options: ["No", "Yes"] });
    });

    it("keeps a select's declared options", () => {
        const st = detectHostedFormStructure({
            html: page(`<h1>Q</h1><label for="s">Account type:</label><select name="acct" id="s"><option></option><option>Checking</option><option>Savings</option></select>`),
        });
        expect(st.sections[0].fields[0].options).toEqual(["Checking", "Savings"]);
    });

    it("reads requiredness from the destination's OWN container, not its neighbour's", () => {
        const st = detectHostedFormStructure({
            html: page(
                `<h1>Q</h1>` +
                    `<div class="q required"><label for="a">Required one:</label><input type="text" name="a" id="a"></div>` +
                    `<div class="q"><label for="b">Optional one:</label><input type="text" name="b" id="b"></div>`
            ),
        });
        const [a, b] = st.sections[0].fields;
        expect(a.required).toBe(true);
        expect(b.required, "requiredness must not bleed from the previous question").toBe(false);
    });

    it("recognizes a signature widget and does not report its hidden value input as a field", () => {
        const st = detectHostedFormStructure({
            html: page(
                `<h1>Sign</h1><div class="q required"><span class="question">By signing below I agree.</span>` +
                    `<input type="hidden" name="SIG_1_SVG" value=""><div class="signature"></div><div class="signature_clear">clear</div></div>`
            ),
        });
        expect(st.sections[0].fields).toHaveLength(1);
        expect(st.sections[0].fields[0]).toMatchObject({ suggested_type: "signature", evidence: expect.stringContaining("SIG_1") });
    });

    it("recognizes a file upload control", () => {
        const st = detectHostedFormStructure({
            html: page(`<h1>Q</h1><label for="f">Immunization record:</label><input type="file" name="rec" id="f">`),
        });
        expect(st.sections[0].fields[0].suggested_type).toBe("file");
    });

    it("is honest when the capture is not a form", () => {
        const st = detectHostedFormStructure({ html: page(`<h1>Our policies</h1><p>We are open 8 to 5.</p>`) });
        expect(st.sections).toHaveLength(0);
        expect(st.warnings).toEqual(["no_form_controls_found"]);
        expect(detectHostedFormStructure({ html: "" }).warnings).toEqual(["empty_capture"]);
    });

    it("keeps a naming clause as the section title and the rest as prose", () => {
        const { title, overflow } = headingTitleAndOverflow("Emergency Contacts: Please list 2-3 local adults authorized to collect your student.");
        expect(title).toBe("Emergency Contacts");
        expect(overflow).toContain("Please list 2-3 local adults");
    });
});

describe("hosted form reader — the real School of Enrichment capture", () => {
    const st = detectHostedFormStructure({ html: capture(), sourceUri: "https://fs23.formsite.com/Okk63x/bztthqe6gx/index" });
    const fields = st.sections.flatMap((s) => s.fields);

    it("normalizes 97 source controls into 95 destinations", () => {
        expect(st.hosted_form?.raw_control_count).toBe(97);
        expect(st.hosted_form?.destination_count).toBe(95);
        expect(fields).toHaveLength(95);
        // The difference is exactly the two Yes/No questions: two checkbox elements, one question.
        expect(fields.filter((f) => f.suggested_type === "select" && f.options?.join("|") === "No|Yes")).toHaveLength(2);
    });

    it("preserves the form's own requiredness — every one of it, and no more", () => {
        expect(fields.filter((f) => f.required)).toHaveLength(79);
    });

    it("preserves the source's sections in order", () => {
        expect(st.sections.map((s) => s.title)).toEqual([
            "School of Enrichment Admissions Packet",
            "Contact Information",
            "Emergency Contact Information & Authorized Adults",
            "Health Information and Developmental History",
            "Tuition & Enrollment Agreement",
            "Parent Handbook Acknowledgement",
            "Direct Payment Authorization",
        ]);
    });

    it("preserves declared choices rather than guessing them", () => {
        const gender = fields.find((f) => f.label.startsWith("How would you describe"));
        expect(gender?.options).toEqual(["Male", "Female", "Gender-diverse"]);
        const account = fields.find((f) => f.label.startsWith("Select Account Type"));
        expect(account?.options).toEqual(["Checking", "Savings"]);
    });

    it("gives every destination a stable source identity", () => {
        expect(fields.every((f) => f.evidence?.startsWith("hosted_form:"))).toBe(true);
        expect(new Set(fields.map((f) => f.evidence)).size).toBe(95);
    });

    it("finds all three signatures", () => {
        expect(fields.filter((f) => f.suggested_type === "signature")).toHaveLength(3);
    });

    it("preserves the agreements' prose so consent can be read clause by clause", () => {
        const tuition = st.sections.find((s) => s.title === "Tuition & Enrollment Agreement");
        expect(tuition?.static_text?.length ?? 0).toBeGreaterThan(2000);
    });
});
