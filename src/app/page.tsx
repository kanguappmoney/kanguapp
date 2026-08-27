import { redirect } from "next/navigation";
import { getCurrentUser, homePathForRole } from "@/lib/auth";

// Raiz: manda cada um pra home do seu papel. Sem sessão, o middleware já
// teria redirecionado pra /login; este é o fallback.
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(homePathForRole(user.role));
}
