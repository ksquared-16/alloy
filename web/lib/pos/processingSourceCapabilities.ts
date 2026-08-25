/**
 * Processing source format capability model.
 * Honest per-format support — no silent PDF pretense for non-PDF files.
 */

export type ProcessingSourceFormat =
    | "pdf"
    | "docx"
    | "doc"
    | "png"
    | "jpeg"
    | "heic"
    | "txt"
    | "csv"
    | "html"
    | "unsupported";

export type ProcessingFormatCapabilities = {
    format: ProcessingSourceFormat;
    label: string;
    store: boolean;
    preview: boolean;
    textExtraction: boolean;
    questionDetection: boolean;
    acceptMime: readonly string[];
    acceptExt: readonly string[];
};

const CAPABILITIES: Record<ProcessingSourceFormat, Omit<ProcessingFormatCapabilities, "format">> = {
    pdf: {
        label: "PDF",
        store: true,
        preview: true,
        textExtraction: true,
        questionDetection: true,
        acceptMime: ["application/pdf"],
        acceptExt: [".pdf"],
    },
    docx: {
        label: "Word (DOCX)",
        store: true,
        preview: true,
        textExtraction: true,
        questionDetection: true,
        acceptMime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        acceptExt: [".docx"],
    },
    doc: {
        label: "Word (DOC)",
        store: true,
        preview: false,
        textExtraction: false,
        questionDetection: false,
        acceptMime: ["application/msword"],
        acceptExt: [".doc"],
    },
    png: {
        label: "PNG image",
        store: true,
        preview: true,
        textExtraction: false,
        questionDetection: false,
        acceptMime: ["image/png"],
        acceptExt: [".png"],
    },
    jpeg: {
        label: "JPEG image",
        store: true,
        preview: true,
        textExtraction: false,
        questionDetection: false,
        acceptMime: ["image/jpeg", "image/jpg"],
        acceptExt: [".jpg", ".jpeg"],
    },
    heic: {
        label: "HEIC image",
        store: false,
        preview: false,
        textExtraction: false,
        questionDetection: false,
        acceptMime: ["image/heic", "image/heif"],
        acceptExt: [".heic", ".heif"],
    },
    html: {
        // A CAPTURE of a hosted form — the bytes already stored as a document, with a hash. Never
        // fetched. A hosted form declares its labels, control types, requiredness and choices, so
        // it is better structural evidence than any PDF heuristic; converting it to a PDF to reuse
        // the PDF importer would throw that away. @see processingCase/structure/hostedFormStructure
        label: "Hosted form capture",
        store: true,
        preview: true,
        textExtraction: true,
        questionDetection: true,
        acceptMime: ["text/html", "application/xhtml+xml"],
        acceptExt: [".html", ".htm"],
    },
    txt: {
        label: "Plain text",
        store: true,
        preview: true,
        textExtraction: true,
        questionDetection: true,
        acceptMime: ["text/plain"],
        acceptExt: [".txt"],
    },
    csv: {
        label: "CSV",
        store: true,
        preview: true,
        textExtraction: true,
        questionDetection: false,
        acceptMime: ["text/csv", "application/csv"],
        acceptExt: [".csv"],
    },
    unsupported: {
        label: "Unsupported",
        store: false,
        preview: false,
        textExtraction: false,
        questionDetection: false,
        acceptMime: [],
        acceptExt: [],
    },
};

export function detectProcessingSourceFormat(fileName: string, mimeType: string): ProcessingSourceFormat {
    const lower = fileName.toLowerCase();
    const mime = (mimeType || "").toLowerCase();
    for (const [format, cap] of Object.entries(CAPABILITIES) as Array<[ProcessingSourceFormat, (typeof CAPABILITIES)[ProcessingSourceFormat]]>) {
        if (format === "unsupported") continue;
        if (cap.acceptExt.some((ext) => lower.endsWith(ext))) return format;
        if (cap.acceptMime.some((m) => mime.includes(m.replace("*", "")))) return format;
    }
    if (mime.includes("pdf") || lower.endsWith(".pdf")) return "pdf";
    return "unsupported";
}

export function capabilitiesForFormat(format: ProcessingSourceFormat): ProcessingFormatCapabilities {
    return { format, ...CAPABILITIES[format] };
}

/** Combined accept string for file inputs. */
export function processingImportAcceptList(): string {
    const mimes = new Set<string>();
    const exts = new Set<string>();
    for (const key of Object.keys(CAPABILITIES) as ProcessingSourceFormat[]) {
        if (key === "unsupported" || key === "heic") continue;
        const cap = CAPABILITIES[key];
        cap.acceptMime.forEach((m) => mimes.add(m));
        cap.acceptExt.forEach((e) => exts.add(e));
    }
    return [...exts, ...mimes].join(",");
}

export function processingImportFormatsMatrix(): ProcessingFormatCapabilities[] {
    return (["pdf", "docx", "doc", "png", "jpeg", "txt", "csv"] as ProcessingSourceFormat[]).map(capabilitiesForFormat);
}
