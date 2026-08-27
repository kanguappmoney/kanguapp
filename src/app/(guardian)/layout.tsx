import { redirect } from "next/navigation";
import { getCurrentUser, homePathForRole } from "@/lib/auth";
import { BottomNav, type NavItem } from "@/components/BottomNav";

const NAV: NavItem[] = [
  { href: "/responsavel", label: "Início", icon: "🏠" },
  { href: "/responsavel/rotas", label: "Rotas", icon: "🚐" },
  { href: "/responsavel/pagamentos", label: "Pagamentos", icon: "💳" },
  { href: "/responsavel/perfil", label: "Perfil", icon: "👤" },
];

export default async function GuardianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "guardian") redirect(homePathForRole(user.role));

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#f5f7fa]">
      <div className="flex-1">{children}</div>
      <BottomNav items={NAV} />
    </div>
  );
}
