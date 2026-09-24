const { execSync } = require("child_process");

/*
 * Build id, derived from the deployed commit rather than randomly generated.
 *
 * Next.js mints a fresh id on every build, and server action ids are derived
 * from it. A rebuild therefore invalidates the actions in every browser tab
 * that was already open, and the next click logs
 *   Error: Failed to find Server Action "…"
 * for a user who did nothing wrong. Rebuilding the same commit — which the
 * deploy guide's "rm -rf .next && npm run build" does routinely — used to break
 * tabs that were working a moment earlier.
 *
 * Keying on the commit means the id changes exactly when the code does. Tabs
 * still break when a deploy genuinely ships new code, which is unavoidable and
 * correct; they no longer break when nothing changed.
 *
 * Falls back to null (Next's own random id) outside a git checkout, so a build
 * from a tarball still works.
 */
function commitBuildId() {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || null;
  } catch {
    return null;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  generateBuildId: async () => commitBuildId(),
};
module.exports = nextConfig;
