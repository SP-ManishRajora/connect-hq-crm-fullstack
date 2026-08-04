import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { ROUTES, buildOpenApi } from "@/lib/housekeeping/openapi";

// Guards the OpenAPI spec against drift.
//
// The spec is hand-authored (plain Next handlers carry no decorator metadata to
// introspect), which normally means it rots the moment someone adds a route.
// This test walks the actual route files on disk and fails if any endpoint is
// undocumented — so the spec cannot quietly fall behind the code.

const API_ROOT = path.join(process.cwd(), "src/app/api/housekeeping");

function findRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) findRouteFiles(full, acc);
    else if (entry === "route.ts") acc.push(full);
  }
  return acc;
}

// src/app/api/housekeeping/foo/[id]/route.ts → /api/housekeeping/foo/{id}
function toApiPath(file: string): string {
  const rel = path.relative(path.join(process.cwd(), "src/app"), path.dirname(file));
  return "/" + rel.split(path.sep).map((s) => s.replace(/^\[(.+)\]$/, "{$1}")).join("/");
}

function exportedMethods(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return ["GET", "POST", "PATCH", "DELETE"]
    .filter((m) => new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(src))
    .map((m) => m.toLowerCase());
}

describe("OpenAPI spec coverage", () => {
  const files = findRouteFiles(API_ROOT);

  it("finds the route files on disk", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("documents every endpoint that exists", () => {
    const documented = new Set(ROUTES.map((r) => `${r.method} ${r.path}`));
    const missing: string[] = [];

    for (const file of files) {
      const apiPath = toApiPath(file);
      // The spec endpoint documenting itself would be noise.
      if (apiPath === "/api/housekeeping/openapi") continue;
      for (const method of exportedMethods(file)) {
        if (!documented.has(`${method} ${apiPath}`)) missing.push(`${method.toUpperCase()} ${apiPath}`);
      }
    }

    expect(missing, `Undocumented endpoints — add them to src/lib/housekeeping/openapi.ts:\n  ${missing.join("\n  ")}`)
      .toEqual([]);
  });

  it("documents no endpoint that has been deleted", () => {
    const onDisk = new Set<string>();
    for (const file of files) {
      const apiPath = toApiPath(file);
      for (const method of exportedMethods(file)) onDisk.add(`${method} ${apiPath}`);
    }

    const stale = ROUTES
      .map((r) => `${r.method} ${r.path}`)
      .filter((k) => !onDisk.has(k));

    expect(stale, `Documented but missing from disk:\n  ${stale.join("\n  ")}`).toEqual([]);
  });
});

describe("OpenAPI document", () => {
  const doc = buildOpenApi("https://example.test") as any;

  it("is a valid 3.1 document with the expected shape", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toMatch(/Housekeeping/);
    expect(Object.keys(doc.paths).length).toBeGreaterThan(30);
  });

  it("declares path parameters for every templated segment", () => {
    for (const [p, methods] of Object.entries(doc.paths)) {
      const expected = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const op of Object.values(methods as Record<string, any>)) {
        const declared = (op.parameters ?? []).filter((x: any) => x.in === "path").map((x: any) => x.name);
        for (const name of expected) expect(declared).toContain(name);
      }
    }
  });

  it("marks the public endpoints as unsecured and everything else as session-guarded", () => {
    const publicPaths = ROUTES.filter((r) => r.auth === "none").map((r) => r.path);
    expect(publicPaths.length).toBeGreaterThan(0);

    for (const [p, methods] of Object.entries(doc.paths)) {
      for (const op of Object.values(methods as Record<string, any>)) {
        if (publicPaths.includes(p)) expect(op.security).toEqual([]);
        else expect(op.security).toEqual([{ sessionCookie: [] }]);
      }
    }
  });

  it("gives every operation at least one documented response", () => {
    for (const methods of Object.values(doc.paths)) {
      for (const op of Object.values(methods as Record<string, any>)) {
        expect(Object.keys(op.responses).length).toBeGreaterThan(0);
      }
    }
  });
});
