import { redirect } from "next/navigation";
import { getCurrentUser, homePathForRole } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "driver") redirect(homePathForRole(user.role));

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#f5f7fa]">
      <div className="flex-1">{children}</div>
      <BottomNav role="driver" />
    </div>
  );
}
