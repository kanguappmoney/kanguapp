# Kangu (PWA de transporte escolar)

1. No início de toda sessão, ler **só** `docs/estado-atual.md` (curto). Ele tem as guardas
   G1–G6, decisões travadas, padrões de UI, onde estamos e as pendências.
2. `docs/progresso.md` é o histórico completo (cerca de 1.800 linhas): **nunca ler inteiro**.
   Consultar por busca (grep pelo assunto, migration ou seção) quando precisar do detalhe.
3. Uma fatia por sessão, plano aprovado pelo Abner antes do código. Guardas provadas por teste
   no banco (`docs/tests/`), nunca presumidas. Qualquer coisa que toque G1–G6 ou LGPD: avisar.
4. Ao fechar a fatia: atualizar `docs/estado-atual.md` e acrescentar UMA entrada curta no log
   (seção 9) do `progresso.md`.
5. Ler arquivos de código só nos trechos necessários; não colar saídas longas de testes/logs.
