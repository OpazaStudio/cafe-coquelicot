// Upload d'image produit (back-office).
//
// Pourquoi un Route Handler et pas une Server Action : `serverActions.
// bodySizeLimit` est GLOBAL à l'application (aucun réglage par action, cf.
// node_modules/next/dist/docs/.../serverActions.md). Le relever pour accepter
// des images relevait aussi le plafond de `startCheckout` et
// `sendContactMessage`, toutes deux publiques. Ici le corps volumineux reste
// cantonné à une route authentifiée, et les Server Actions gardent le défaut
// de 1 Mo.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/dal";
import { validateImageFile } from "@/lib/product-image";
import { uploadImage } from "@/lib/storage";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  // getSession (et non verifySession) : une route d'API doit répondre 401,
  // pas rediriger vers /admin/login.
  const session = await getSession();
  if (!session) return bad("Authentification requise.", 401);

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return bad("Requête illisible.");
  }
  if (!(file instanceof File) || file.size === 0) {
    return bad("Aucun fichier sélectionné.");
  }

  const v = validateImageFile(file);
  if (!v.ok) return bad(v.error);

  try {
    const { path } = await uploadImage(file);
    return NextResponse.json({ path });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Échec de l'upload.");
  }
}
