import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { redirect } from "next/navigation";
import {
  getHkConfig, getIssueConfig, getGeneratorConfig, getRequestConfig,
  getEfficiencyConfig, getRetentionConfig, getAiConfig,
} from "@/lib/housekeeping/settings";
import ConfigClient from "./ConfigClient";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canAccess(me.role, "hk_admin", parseAllowedModules(me.allowedModules))) redirect("/dashboard");

  const [inspection, issues, generator, requests, efficiency, retention, ai] = await Promise.all([
    getHkConfig(), getIssueConfig(), getGeneratorConfig(), getRequestConfig(),
    getEfficiencyConfig(), getRetentionConfig(), getAiConfig(),
  ]);

  return (
    <ConfigClient
      initial={{
        inspection, issues, generator, requests, efficiency, retention,
        ai: { ...ai, prompts: ai.prompts ?? {} },
      }}
      aiDriver={process.env.HK_AI_DRIVER || "stub"}
      ocrDriver={process.env.HK_OCR_DRIVER || "stub"}
    />
  );
}
