/**
 * Trusted Host Actions — read-only SQL validation (defensive, layered).
 * Rejects mutation / unsafe constructs before any host execution.
 */
const FORBIDDEN_KEYWORDS = [
  "INSERT", "UPDATE", "DELETE", "UPSERT", "MERGE", "ALTER", "DROP", "CREATE",
  "TRUNCATE", "GRANT", "REVOKE", "CALL", "DO", "COPY", "EXECUTE", "PREPARE",
  "DEALLOCATE", "REINDEX", "VACUUM", "CLUSTER", "COMMENT", "SECURITY",
  "OWNER", "ATTACH", "DETACH", "LISTEN", "NOTIFY", "LOAD", "SET ROLE",
  "RESET ROLE", "SET SESSION AUTHORIZATION",
];

const FORBIDDEN_PHRASES = [
  /FOR\s+UPDATE\b/i,
  /FOR\s+SHARE\b/i,
  /INTO\s+(TEMP|TEMPORARY|UNLOGGED)?\s*TABLE\b/i,
  /\bINTO\s+[a-zA-Z_][\w.]*\b/i, // SELECT INTO
  /\bCOPY\s+/i,
  /\bPG_SLEEP\s*\(/i,
  /\blo_import\s*\(/i,
  /\blo_export\s*\(/i,
  /\bdblink\s*\(/i,
  /\bSET\s+TRANSACTION\s+.*READ\s+WRITE\b/i,
  /\bSET\s+SESSION\s+CHARACTERISTICS\b/i,
  /\bCREATE\s+OR\s+REPLACE\b/i,
  /\bALTER\s+SYSTEM\b/i,
];

function stripCommentsAndStrings(sql) {
  // Replace string literals and comments with spaces so keyword scans don't
  // false-positive inside them, while preserving length for diagnostics.
  let out = "";
  let i = 0;
  const s = String(sql || "");
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === "-" && n === "-") {
      while (i < s.length && s[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (c === "/" && n === "*") {
      out += "  "; i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) { out += " "; i += 1; }
      if (i < s.length) { out += "  "; i += 2; }
      continue;
    }
    if (c === "'") {
      out += " "; i += 1;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") { out += "  "; i += 2; continue; }
        if (s[i] === "'") { out += " "; i += 1; break; }
        out += " "; i += 1;
      }
      continue;
    }
    if (c === "$") {
      // dollar-quoted string $tag$...$tag$
      const m = s.slice(i).match(/^\$([A-Za-z_][\w]*)?\$/);
      if (m) {
        const tag = m[0];
        out += " ".repeat(tag.length);
        i += tag.length;
        const end = s.indexOf(tag, i);
        if (end < 0) {
          out += " ".repeat(s.length - i);
          i = s.length;
        } else {
          out += " ".repeat(end - i + tag.length);
          i = end + tag.length;
        }
        continue;
      }
    }
    out += c;
    i += 1;
  }
  return out;
}

function splitStatements(scrubbed) {
  return scrubbed
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
}

function looksLikeWritableCte(scrubbed) {
  // WITH ... AS ( INSERT|UPDATE|DELETE ... )
  return /\bWITH\b[\s\S]*\bAS\s*\(\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(scrubbed);
}

/**
 * @returns {{ ok: true, kind: string } | { ok: false, code: string, detail: string }}
 */
export function validateReadOnlySql(sql) {
  if (!sql || !String(sql).trim()) {
    return { ok: false, code: "empty_sql", detail: "SQL artifact is empty." };
  }
  const raw = String(sql);
  if (raw.length > 200_000) {
    return { ok: false, code: "sql_too_large", detail: "SQL artifact exceeds size limit." };
  }

  const scrubbed = stripCommentsAndStrings(raw);
  const statements = splitStatements(scrubbed);
  if (statements.length === 0) {
    return { ok: false, code: "empty_sql", detail: "No executable statement after stripping comments." };
  }
  if (statements.length > 1) {
    return {
      ok: false,
      code: "multiple_statements",
      detail: `Only one statement is allowed; found ${statements.length}.`,
    };
  }

  const stmt = statements[0].replace(/\s+/g, " ").trim();
  const upper = stmt.toUpperCase();

  if (looksLikeWritableCte(scrubbed)) {
    return { ok: false, code: "writable_cte", detail: "Writable CTEs (WITH … INSERT/UPDATE/DELETE) are rejected." };
  }

  for (const phrase of FORBIDDEN_PHRASES) {
    if (phrase.test(scrubbed)) {
      return { ok: false, code: "forbidden_construct", detail: `Rejected pattern: ${phrase}` };
    }
  }

  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`(^|\\s)${kw}\\b`, "i");
    if (re.test(scrubbed)) {
      // Allow SELECT … (subquery) that mentions nothing forbidden as leading keyword
      // Keyword mid-query like "create" in a column alias is already stripped if quoted;
      // unquoted CREATE anywhere is rejected.
      return { ok: false, code: "forbidden_keyword", detail: `Rejected keyword: ${kw}` };
    }
  }

  const startsSelect = /^(WITH|SELECT)\b/i.test(stmt);
  if (!startsSelect) {
    return {
      ok: false,
      code: "not_select",
      detail: "Only WITH … SELECT or SELECT statements are allowed.",
    };
  }

  // WITH must eventually SELECT
  if (/^WITH\b/i.test(stmt) && !/\bSELECT\b/i.test(stmt)) {
    return { ok: false, code: "with_without_select", detail: "WITH block must end in SELECT." };
  }

  return {
    ok: true,
    kind: /^WITH\b/i.test(stmt) ? "with_select" : "select",
    statementPreview: stmt.slice(0, 120),
  };
}
