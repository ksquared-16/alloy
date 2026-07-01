/** Shared Create Lead intake validation — delegates to intake normalizers. */

export {
    INTAKE_VALID_EMAIL_RE as CREATE_LEAD_EMAIL_RE,
    isValidEmail as isValidCreateLeadEmail,
} from "@/lib/intake/normalize/email";

export {
    normalizePhoneDigits as normalizeCreateLeadPhoneDigits,
    isValidPhone as isValidCreateLeadPhone,
    formatPhoneDisplay as formatCreateLeadPhoneDisplay,
} from "@/lib/intake/normalize/phone";
