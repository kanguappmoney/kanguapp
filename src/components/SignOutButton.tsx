import { signOut } from "@/lib/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-sm font-medium text-navy-700/70 underline"
      >
        Sair
      </button>
    </form>
  );
}
