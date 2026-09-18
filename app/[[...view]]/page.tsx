import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { verifySession } from "@/lib/crypto";
import { dashboardData } from "@/lib/db";
import { Dashboard } from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  if (!verifySession((await cookies()).get("eve_owner")?.value))
    redirect("/login");
  const { view } = await params;
  const section = view?.[0] ?? "overview";
  if (
    (view?.length ?? 0) > 1 ||
    !["overview", "activity", "decisions", "settings", "chat"].includes(section)
  )
    notFound();
  return <Dashboard initial={await dashboardData()} section={section} />;
}
