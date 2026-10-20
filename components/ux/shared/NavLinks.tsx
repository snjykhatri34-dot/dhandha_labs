"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/owner", label: "Owner" },
  { href: "/upload", label: "Upload" },
  { href: "/manager/review", label: "Review" },
  { href: "/staff", label: "Staff" },
];

function Nav({ path }: { path: string | null }) {
  return (
    <nav className="flex gap-3 text-sm text-muted">
      {NAV.map((item) => {
        const active = path !== null && (path === item.href || path.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={active ? "font-medium text-ink underline decoration-2 underline-offset-8" : "hover:text-ink"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Highlights the current section. Reads the URL, so render it inside <Suspense fallback={<NavLinksStatic />}>. */
export function NavLinks() {
  return <Nav path={usePathname()} />;
}

/** Same links without the highlight: the prerendered fallback. */
export function NavLinksStatic() {
  return <Nav path={null} />;
}
