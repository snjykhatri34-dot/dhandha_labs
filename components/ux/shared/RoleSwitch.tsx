import { setRole } from "@/app/(ux)/actions";
import { getRole, ROLES } from "@/lib/ux/role";

/** Server component: reads the role cookie, so render it inside <Suspense>. */
export async function RoleSwitch() {
  const current = await getRole();
  return (
    <form action={setRole} className="flex items-center gap-1 text-xs" aria-label="Viewing as">
      <span className="mr-1 text-muted">View as</span>
      {ROLES.map((role) => (
        <button
          key={role}
          name="role"
          value={role}
          aria-pressed={role === current}
          className={`rounded-full px-2.5 py-1 capitalize ${
            role === current ? "bg-ink text-paper" : "text-muted hover:bg-line"
          }`}
        >
          {role}
        </button>
      ))}
    </form>
  );
}
