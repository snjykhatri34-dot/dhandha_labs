import Link from "next/link";
import { EmptyState } from "@/components/ux/shared";

export default function VisitNotFound() {
  return (
    <EmptyState title="Visit not found">
      <Link href="/owner#visits" className="underline">
        Back to all visits
      </Link>
    </EmptyState>
  );
}
