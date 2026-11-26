/**
 * Local services — Docker daemon, Supabase containers, toolkit install, MCP hints.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { providerProbeDue, readProviderHealth, recordProviderHealth } from "../cache.mjs";

function tryCmd(cmd, args) {
  try {
    const out = execFileSync(cmd, args, { encoding: "utf8", timeout: 8000 });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, err: String(e.stderr || e.message || e).slice(0, 200) };
  }
}

export function collectServices({ force = false } = {}) {
  // The SAME provider-health record the docker collector keeps. Two collectors
  // probing the same absent daemon on their own schedules is how one optional
  // provider produced two streams of identical connection failures.
  const docker = providerProbeDue("docker", { force })
    ? tryCmd("docker", ["info", "--format", "{{.ServerVersion}}"])
    : { ok: false, err: readProviderHealth("docker")?.detail || "docker unavailable", probe_skipped: true };
  if (!docker.probe_skipped) {
    recordProviderHealth("docker", {
      available: docker.ok,
      detail: docker.ok ? String(docker.out || "").slice(0, 60) : String(docker.err || "").split("\n")[0].slice(0, 200),
    });
  }
  let supabaseContainers = 0;
  if (docker.ok) {
    const ps = tryCmd("docker", ["ps", "--format", "{{.Names}}"]);
    if (ps.ok) {
      supabaseContainers = ps.out.split("\n").filter((n) => /supabase/i.test(n)).length;
    }
  }

  const toolkit = join(os.homedir(), "bin/alloy-dev");
  const gc = join(os.homedir(), "bin/alloy-worktree-gc");
  const cursorMcp = join(os.homedir(), ".cursor/mcp.json");

  return {
    ok: true,
    collector: "services",
    docker: {
      available: docker.ok,
      version: docker.ok ? docker.out : null,
      error: docker.ok ? null : docker.err,
    },
    supabase: {
      running_containers: supabaseContainers,
    },
    toolkit: {
      alloy_dev_installed: existsSync(toolkit),
      worktree_gc_installed: existsSync(gc),
      path: toolkit,
    },
    mcp: {
      cursor_mcp_config_present: existsSync(cursorMcp),
      path: cursorMcp,
    },
  };
}
