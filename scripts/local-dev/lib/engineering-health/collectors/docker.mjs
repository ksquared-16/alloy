/**
 * Docker collector — images, containers, volumes, reclaimable space.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

function run(cmd, args, { timeout = 20000 } = {}) {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, args, { encoding: "utf8", timeout, maxBuffer: 4 << 20 }),
    };
  } catch (e) {
    return { ok: false, out: String(e.stdout || ""), err: String(e.stderr || e.message || e) };
  }
}

function parseSystemDf(text) {
  const rows = { images: null, containers: null, volumes: null, build_cache: null };
  for (const line of String(text || "").split("\n")) {
    const m = line.match(/^(Images|Containers|Local Volumes|Build Cache)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)/i);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/\s+/g, "_");
    const map = {
      images: "images",
      containers: "containers",
      local_volumes: "volumes",
      build_cache: "build_cache",
    };
    const k = map[key];
    if (!k) continue;
    rows[k] = {
      total: Number(m[2]),
      active: Number(m[3]),
      size: m[4],
      reclaimable: m[5],
      reclaimable_raw: line,
    };
  }
  return rows;
}

/** Parse strings like "7.608GB" / "686.9MB" / "0B" → bytes */
export function parseDockerSize(s) {
  const m = String(s || "").match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  const u = m[2].toUpperCase();
  const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return Math.round(n * (mult[u] || 1));
}

function dockerRawInfo() {
  const p = join(
    os.homedir(),
    "Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw",
  );
  if (!existsSync(p)) return null;
  try {
    const st = statSync(p);
    return {
      path: p,
      logical_bytes: st.size,
      allocated_bytes: st.blocks * 512,
      logical_gb: Math.round((st.size / 1024 ** 3) * 10) / 10,
      allocated_gb: Math.round(((st.blocks * 512) / 1024 ** 3) * 10) / 10,
    };
  } catch {
    return null;
  }
}

export function collectDocker() {
  const version = run("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (!version.ok && /Cannot connect|Is the docker daemon|not found/i.test(version.err || "")) {
    return {
      ok: false,
      collector: "docker",
      available: false,
      error: version.err || "docker unavailable",
      raw_disk: dockerRawInfo(),
    };
  }

  const df = run("docker", ["system", "df"]);
  const parsed = parseSystemDf(df.out);
  const imagesReclaim = parseDockerSize(
    (parsed.images?.reclaimable || "").match(/([\d.]+\s*[KMGT]?B)/i)?.[1]
      || parsed.images?.reclaimable,
  );
  // reclaimable field often "7.608GB (22%)" — take first size token
  const reclaimMatch = (row) => {
    if (!row?.reclaimable) return 0;
    const m = String(row.reclaimable).match(/([\d.]+\s*[KMGT]?B)/i);
    return parseDockerSize(m?.[1] || row.reclaimable);
  };

  const reclaimable_bytes =
    reclaimMatch(parsed.images)
    + reclaimMatch(parsed.containers)
    + reclaimMatch(parsed.volumes)
    + reclaimMatch(parsed.build_cache);

  return {
    ok: true,
    collector: "docker",
    available: true,
    server_version: (version.out || "").trim() || null,
    system_df: parsed,
    reclaimable_bytes,
    reclaimable_gb: Math.round((reclaimable_bytes / 1024 ** 3) * 10) / 10,
    raw_disk: dockerRawInfo(),
  };
}
