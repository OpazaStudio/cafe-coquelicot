"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string; exact?: boolean };

const GROUPS: { id: string; title: string | null; links: NavLink[] }[] = [
  {
    id: "general",
    title: null,
    links: [{ href: "/admin", label: "Tableau de bord", exact: true }],
  },
  {
    id: "boutique",
    title: "Boutique",
    links: [
      { href: "/admin/produits", label: "Produits" },
      { href: "/admin/commandes", label: "Commandes" },
      { href: "/admin/soumissions", label: "Messages" },
    ],
  },
  {
    id: "site",
    title: "Site",
    links: [
      { href: "/admin/contenu", label: "Contenu" },
      { href: "/admin/emails", label: "E-mails" },
    ],
  },
  {
    id: "reglages",
    title: "Réglages",
    links: [
      { href: "/admin/parametres", label: "Paramètres" },
      { href: "/admin/compte", label: "Mon compte" },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5 px-3">
      {GROUPS.map(({ id, title, links }) => (
        <div
          key={id}
          className="flex flex-col gap-1"
          {...(title
            ? { role: "group", "aria-labelledby": `admin-nav-${id}` }
            : {})}
        >
          {title && (
            <p
              id={`admin-nav-${id}`}
              className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
            >
              {title}
            </p>
          )}
          {links.map(({ href, label, exact }) => {
            const active = exact
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none ${
                  active ? "bg-wine text-linen" : "text-ink hover:bg-hover"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
