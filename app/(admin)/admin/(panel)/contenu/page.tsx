import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";

export default async function ContenuIndex() {
  await verifySession();
  redirect("/admin/contenu/accueil");
}
