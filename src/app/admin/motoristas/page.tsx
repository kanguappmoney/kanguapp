import { listDrivers, fmtDateTime } from "@/lib/admin";
import { AdminTable, Badge, ErrorNote, Td } from "@/components/admin/AdminUi";

const SUB = {
  active: { label: "Ativa", tone: "green" },
  trial: { label: "Trial", tone: "amber" },
  paused: { label: "Pausada", tone: "red" },
} as const;

export default async function AdminMotoristasPage() {
  const { rows, error } = await listDrivers();
  const complete = rows.filter((r) => r.profile_complete).length;
  const visible = rows.filter((r) => r.visible_on_marketplace).length;

  return (
    <>
      <h2 className="font-display text-xl text-navy-900">Motoristas</h2>
      <p className="mb-4 mt-1 text-sm text-navy-700/70" data-testid="resumo">
        {rows.length} cadastrados · {complete} com perfil completo · {visible} aparecendo na vitrine
      </p>
      {error ? (
        <ErrorNote message={error} />
      ) : (
        <AdminTable
          head={["Motorista", "Perfil", "Assinatura", "Marketplace", "Alunos", "Pedidos", "Cadastro"]}
          empty="Nenhum motorista."
        >
          {rows.map((d) => {
            const sub = SUB[d.subscription_status] ?? SUB.trial;
            return (
              <tr key={d.user_id}>
                <Td>
                  <p className="font-semibold text-navy-900">{d.full_name}</p>
                  <p className="text-xs text-navy-700/60">{d.email ?? "—"}</p>
                  {d.phone && <p className="text-xs text-navy-700/60">{d.phone}</p>}
                </Td>
                <Td>
                  {d.profile_complete ? (
                    <Badge tone="green">Completo</Badge>
                  ) : (
                    <>
                      <Badge tone="red">Incompleto</Badge>
                      {d.missing_fields && (
                        <p className="mt-1 text-xs text-navy-700/60">falta: {d.missing_fields}</p>
                      )}
                    </>
                  )}
                </Td>
                <Td>
                  <Badge tone={sub.tone}>{sub.label}</Badge>
                </Td>
                <Td>
                  <Badge tone={d.marketplace_listed ? "green" : "gray"}>
                    {d.marketplace_listed ? "Ligado" : "Desligado"}
                  </Badge>
                  <p className="mt-1 text-xs text-navy-700/60">
                    {d.visible_on_marketplace
                      ? "aparece na vitrine"
                      : d.marketplace_listed
                        ? "ligado, mas oculto (requisito faltando)"
                        : "fora da vitrine"}
                  </p>
                </Td>
                <Td>{d.active_students}</Td>
                <Td>
                  <Badge tone={d.open_requests ? "green" : "gray"}>
                    {d.open_requests ? "Aberto" : "Fechado"}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-xs text-navy-700/70">{fmtDateTime(d.created_at)}</Td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </>
  );
}
