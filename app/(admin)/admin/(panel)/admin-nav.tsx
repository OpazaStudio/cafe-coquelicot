"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/produits", label: "Produits", exact: false },
  { href: "/admin/commandes", label: "Commandes", exact: false },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {LINKS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-wine text-linen"
                : "text-stone-700 hover:bg-stone-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
