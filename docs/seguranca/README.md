# Kangu: evidências de segurança (fatia E)

> Data: 2026-11-13. Cada afirmação aponta o teste que a prova. Os testes são de banco (`docs/tests/*.sql`), rodam no SQL
> Editor, reproduzem cenários com dados fictícios e **sempre revertem** (terminam em `raise exception 'RESULTADO: ... PASSOU'`).
> Onde a prova depende de HTTP ou de arquivo real, o script está em `docs/seguranca/` e o resultado está descrito aqui.
> **Leia a seção "O que não está provado" antes de usar este documento como garantia.**

## Como reproduzir
- Banco: abrir o SQL Editor do projeto, colar o conteúdo de cada arquivo de `docs/tests/` e rodar. A última linha de saída deve ser
  `RESULTADO: ... PASSOU`. (Os arquivos antigos, de estilo `begin; ... rollback;`, trocam o `raise notice '== ... PASSOU =='` final
  por `raise exception` porque o editor esconde `notice`.)
- HTTP: `node docs/seguranca/http_exposure.mjs` (usa só a chave anon, que é pública, do `.env.local`).
- Resultado desta rodada (2026-11-13, no fim do dia): **39 de 39 arquivos de `docs/tests/` passaram**, rodados um a um no SQL Editor.

## Afirmações provadas

### E1. G5: um responsável nunca lê dado de outra família
| Afirmação | Prova | Resultado |
|---|---|---|
| Com duas famílias preenchidas em 12 fontes de dado (`students`, `guardian_student`, `capture_submissions`, `route_stops`, `route_events`, `route_executions`, `absences`, `invoices`, `consents`, `notifications`, `erasure_requests` e fotos da criança), o responsável A não lê nada de B e vice-versa; outro motorista (não dono) e o anônimo não leem nada de nenhuma; cada responsável lê o que é dele (o teste não é vazio) | `seguranca_g5_familias.sql` | PASSOU |
| Convites (`student_invites`) não são lidos por responsável, por outro motorista nem por anônimo; só o motorista dono lê | `seguranca_g5_familias.sql`, `seguranca_convites.sql` (5) | PASSOU |
| `get_active_journey` entrega a cada responsável só a própria jornada: sem nome de criança nem paradas de outra família | `seguranca_g5_familias.sql`; `embarque_100m.sql` (3: não vaza "mesmo assim" nem distância) | PASSOU |
| O responsável NÃO lê a tabela `occurrences` (nota livre do motorista) | `texto_livre_limites.sql` (2), `ocorrencia_notificacao_pai.sql` (3) | PASSOU |
| Mapa do pai mostra só o pino da van; modo Linha do tempo nunca entrega posição | `modo_mapa_guardas.sql`; `seguranca_gps_e_anonimizacao.sql` (E4.1d) | PASSOU |
| Vitrine anônima só vê motorista listado e só os campos públicos | `marketplace_view.sql`, `marketplace_coverage.sql` | PASSOU |
| Só o admin lê o log de IP e o log de acesso; ninguém altera o log legal | `admin_moderacao.sql` (5), `lgpd_log_acesso.sql`, `lgpd_retencao.sql` (12, 13), `admin_guard.sql` | PASSOU |

### E2. Fotos
| Afirmação | Prova | Resultado |
|---|---|---|
| Foto da CRIANÇA: bucket privado; só o motorista dono e o responsável vinculado leem; outra família, outro motorista e anônimo não | `seguranca_g5_familias.sql` (E2) | PASSOU |
| Foto da criança só é enviada com a autorização de foto ativa; criança suspensa perde a permissão | `lgpd_consentimento.sql` (10, 13, 18, 19) | PASSOU |
| Foto da VAN: bucket privado; leitura pública só enquanto o motorista está listado (toggle + consentimento) e a foto é a atual; desligar o toggle ou revogar o aceite corta na hora; admin remove | `foto_van_privada.sql` | PASSOU |
| Foto da VAN ponta a ponta, sem chave de serviço: motorista TESTE listado → `createSignedUrl` anônimo devolve URL e a URL abre a imagem (200, `image/png`); não listado → recusado; `list()` anônimo só enxerga a pasta do listado; toggle desligado → nenhuma URL nova | execução manual em 2026-11-13 (registrada em `progresso.md`); dados de teste apagados por ids exatos | PASSOU (manual) |

### E3. Convites
| Afirmação | Prova | Resultado |
|---|---|---|
| Aceitar exige responsável logado e a autorização da criança; anônimo e motorista são recusados | `seguranca_convites.sql` (1) | PASSOU |
| O aceite vincula só a criança do convite e grava a autorização própria do responsável | `seguranca_convites.sql` (2); `lgpd_consentimento.sql` | PASSOU |
| Convite usado, revogado, expirado ou inexistente é recusado | `seguranca_convites.sql` (3) | PASSOU |
| A pré-visualização pública tem só 4 campos e não lista outras crianças | `seguranca_convites.sql` (4) | PASSOU |

### E4. GPS (G4, G6)
| Afirmação | Prova | Resultado |
|---|---|---|
| Posição só existe com a rota em andamento; é apagada ao encerrar e pelo job de 24 h | `lgpd_retencao.sql` (1 a 4) | PASSOU |
| Só o responsável vinculado (em modo Mapa) e o motorista dono leem a posição; responsável não vinculado, outro motorista e anônimo não | `seguranca_gps_e_anonimizacao.sql` (E4.1), `modo_mapa_guardas.sql` | PASSOU |
| Reabrir a rota encerrada NÃO restaura a posição apagada | `seguranca_gps_e_anonimizacao.sql` (E4.3), `reabrir_rota.sql` | PASSOU |

### E5. Anonimização e exclusão
| Afirmação | Prova | Resultado |
|---|---|---|
| Depois de anonimizar, o ex-responsável não lê aluno, fatura, convite nem vínculo; o motorista não enxerga o aluno; a evidência de aceite segue legível só pelo titular | `seguranca_gps_e_anonimizacao.sql` (E5.4) | PASSOU |
| A anonimização não toca `app_access_log` nem `retention_exceptions`; o ledger registra; a fatura (esqueleto financeiro) permanece sem dado pessoal | `seguranca_gps_e_anonimizacao.sql` (E5.5 a E5.7), `lgpd_retencao_exclusao.sql` | PASSOU |
| G1: criança que embarcou e não desembarcou hoje, ou em perna `in_progress`, não é excluída (o job pula; a exclusão do admin fica adiada e avisada); depois de desembarcar, ou no dia seguinte, é excluída | `exclusao_janela_g1.sql` (a G2 não foi alterada: `rotas_edit.sql`) | PASSOU |
| Cadastro rejeitado e pendente há mais de 30 dias somem com a autorização | `lgpd_retencao_exclusao.sql` (16 a 18) | PASSOU |
| Retenção de 30 dias, exclusão a pedido, reautorização, ledger e fila de fotos | `lgpd_retencao_exclusao.sql` | PASSOU |
| Texto livre sem dado de saúde: limite no banco, aviso, apagamento das notas ao anonimizar e do motivo ao resolver o pedido | `texto_livre_limites.sql` | PASSOU |

### Consentimento e a flag interna
| Afirmação | Prova | Resultado |
|---|---|---|
| Só 4 funções do schema `public` ligam `kangu.consent_internal` e são executáveis pelo cliente: `approve_capture`, `reauthorize_child`, `revoke_consent` e o gatilho `students_consent_guard`; qualquer função nova que a ligue e seja exposta quebra o teste | `seguranca_flag_consentimento.sql` (1) | PASSOU |
| Sem a flag, cliente (autenticado ou anônimo) não insere, altera nem apaga em `consents`; ninguém muda `consent_status` por UPDATE direto; as três portas legítimas recusam anônimo, por permissão (42501) desde a 069, e o fluxo logado de aprovar, revogar e reautorizar continua funcionando | `seguranca_flag_consentimento.sql` (2 a 4), `revogar_execute_anon.sql` | PASSOU |
| `set_config` e as funções internas (`_insert_consent`, `_anonymize_student`, `anonymize_due_students`, `purge_stale_submissions`, `_student_in_transit_today`, `admin_erase_student`) não são chamáveis por RPC com a chave anon; tabelas sensíveis (`consents`, `erasure_ledger`, `erasure_deferred`, `app_access_log`, `retention_exceptions`) recusam leitura anônima (401) e as demais devolvem lista vazia | `docs/seguranca/http_exposure.mjs` (2026-11-13) | PASSOU |
| Consentimento da criança e da foto: evidência, revogação, suspensão, bloqueio de rota e de visibilidade pelo motorista | `lgpd_consentimento.sql` | PASSOU |
| Captação e cadastro: endereço em partes, escola da lista do motorista, autorização exigida | `escola_endereco_partes.sql`, `captacao_fatia2_rls.sql`, `captacao_fatia3_geocode.sql`, `captacao_fatia4_aprovacao.sql`, `captacao_generica.sql` | PASSOU |
| G1/G2 (embarque e paradas congeladas), reabertura e aviso de rota | `embarque_100m.sql`, `g1_volta_sem_ausente.sql`, `rotas_edit.sql`, `rotas_both_execution.sql`, `rotas_two_legs.sql`, `recorrencia.sql`, `reabrir_rota.sql`, `rota_iniciada_notificacao.sql` | PASSOU |

## Falhas e furos achados nesta fatia e nas anteriores
- **Corrigido (F2):** a policy `occurrences_select_guardian` deixava o responsável ler a nota livre do motorista por RLS. Removida.
- **Corrigido (F1):** exclusão a pedido podia tirar da lista da volta a criança que embarcou na ida.
- **Corrigido (F3):** foto da van era pública independentemente do toggle.
- **Nenhum furo novo** foi encontrado pelos testes E1 a E5 desta fatia.
- **Fechado (migration 069):** `approve_capture`, `reauthorize_child` e `revoke_consent` herdavam `EXECUTE` do PUBLIC (recusavam anônimo só por `auth.uid()`). Agora anon e PUBLIC não executam (recusa por permissão, 42501) e o fluxo logado segue funcionando (`revogar_execute_anon.sql`; prova HTTP em `docs/seguranca/http_exposure.mjs`: `approve_capture` anônimo = 401 permission denied).

## O que não está provado
1. **Os testes rodam no banco compartilhado com a produção.** Hoje só existe um projeto Supabase: localhost, testes e a Vercel usam o mesmo banco. Os testes de SQL revertem, mas tomam locks e o E2E de foto criou e apagou usuários reais de teste. Isso não é prova de que o ambiente está isolado e é o motivo da fatia G (`docs/ops-separar-dev-producao.md`).
2. **Os testes SQL simulam o papel do cliente** (`set local role` + claims) e provam as políticas de RLS e as funções. A configuração do PostgREST (schemas expostos) só foi conferida pelo script HTTP; a configuração do Auth (confirmação de e-mail, senha, taxa de login) e as chaves do projeto **não foram auditadas**.
3. **URL assinada de foto de criança (`student-photos`):** provado o RLS que a API consulta e que o bucket é privado; **não** foi feita a emissão e a expiração reais de URL (só a foto da van foi provada ponta a ponta).
4. **Expiração da URL assinada da van:** uma URL emitida antes de o motorista desligar o toggle continua abrindo até expirar (no máximo 1 h). Foi observado, não corrigido.
5. **Convite é segredo ao portador:** quem tiver o link e uma conta de responsável consegue aceitar; não há vínculo com e-mail. Defesas: uso único, 14 dias de validade e revogação pelo motorista.
6. **GPS em movimento no celular real**, câmera, auto-recolher, comportamento em segundo plano e instalação do PWA: só em dispositivo (pendência do `estado-atual.md`).
7. **Bucket e políticas de Storage fora do banco** (limites de tamanho e tipos, CORS, CDN): só o que está nas migrations foi testado.
8. **Backup:** o projeto está no plano Free, sem backup. Restaurar desfaz exclusões LGPD posteriores ao snapshot (reaplicar o `erasure_ledger` guardado fora do banco).
9. **IP do aceite** só aparece em produção (cabeçalho da Vercel); não foi exercitado em teste.
10. **Notas e motivos livres gravados antes da migration 067** continuam como estão; só os novos respeitam o limite e o apagamento.
11. **Operadores:** quem tem acesso ao painel do Supabase ou à chave secreta lê tudo. Controle de acesso humano, 2FA e segredos da Vercel não foram auditados.
12. **Fotos de criança removidas** vão para `storage_purge_queue`; o arquivo só sai por rotina manual (pendência conhecida).
13. **Fora do escopo desta fatia:** XSS/CSRF, cabeçalhos de segurança, dependências vulneráveis, pentest externo e a validação jurídica da LGPD.
