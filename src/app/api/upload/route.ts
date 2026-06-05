import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// Generic upload endpoint. Returns the public URL of the saved file under /public/uploads/.
// Accepts multipart/form-data with field name "file" (and optional "folder" string field).
export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  // Allow one level of subfolder (e.g. "centers/mumbai-hub") but strip anything unsafe.
  const folder = ((form.get("folder") as string) || "misc")
    .split("/")
    .map((seg) => seg.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter(Boolean)
    .join("/");
  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, safeName);
  await writeFile(fullPath, buffer);
  const publicPath = `/uploads/${folder}/${safeName}`;
  return NextResponse.json({ path: publicPath, name: file.name, size: buffer.length });
}
