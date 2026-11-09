import { redirect } from "next/navigation";

// Cadastro direto de aluno pelo motorista foi substituído pelo convite-primeiro (LGPD): o dado real da criança só
// entra depois da autorização do responsável. Quem chegar aqui por link antigo vai para a tela de convites.
export default function NovoAlunoPage() {
  redirect("/motorista/alunos/captacao");
}
