-- Kangu v1 — mini-fatia 069: as três portas legítimas do consentimento deixam de ser executáveis por anon.
--
-- approve_capture, reauthorize_child e revoke_consent ligam a flag interna kangu.consent_internal DEPOIS de validar quem chama
-- (motorista dono da submissão; responsável vinculado; titular do aceite). Elas já recusavam anônimo por auth.uid(), mas
-- herdavam EXECUTE do PUBLIC. Agora a recusa vem do próprio banco, por permissão (42501), antes de entrar na função.
-- Quem está logado (role authenticated) continua executando como antes.

revoke all on function public.approve_capture(uuid) from public, anon;
grant execute on function public.approve_capture(uuid) to authenticated;

revoke all on function public.reauthorize_child(uuid, jsonb) from public, anon;
grant execute on function public.reauthorize_child(uuid, jsonb) to authenticated;

revoke all on function public.revoke_consent(uuid, text) from public, anon;
grant execute on function public.revoke_consent(uuid, text) to authenticated;
