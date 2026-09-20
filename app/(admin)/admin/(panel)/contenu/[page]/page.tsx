import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { getPageContent } from "@/lib/content/server";
import { pageFromAdminSlug } from "@/lib/content/registry";
import { ContentEditor } from "../content-editor";
import { savePageContent } from "../actions";

export const dynamic = "force-dynamic";

export default async function ContenuPage({ params }: PageProps<"/admin/contenu/[page]">) {
  await verifySession();
  const { page: adminSlug } = await params;
  const page = pageFromAdminSlug(adminSlug);
  if (!page) notFound();
  const content = await getPageContent(page);
  return <ContentEditor key={page} page={page} initial={content} action={savePageContent} />;
}
