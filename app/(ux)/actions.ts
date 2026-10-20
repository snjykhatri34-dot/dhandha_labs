"use server";

import { cookies } from "next/headers";
import { ROLE_COOKIE, ROLES } from "@/lib/ux/role";

export async function setRole(formData: FormData) {
  const role = String(formData.get("role"));
  if (!(ROLES as readonly string[]).includes(role)) return;
  (await cookies()).set(ROLE_COOKIE, role, { path: "/", sameSite: "lax" });
}
