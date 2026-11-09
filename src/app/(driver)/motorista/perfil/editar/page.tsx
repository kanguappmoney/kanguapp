import { redirect } from "next/navigation";

// Rota antiga (tela única de edição): Configurações agora é uma lista de categorias, cada uma com sua tela.
export default function EditarPerfilPage() {
  redirect("/motorista/perfil");
}
