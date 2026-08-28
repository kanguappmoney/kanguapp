-- Kangu v1 — Cadastro do motorista encorpado (perfil + veículo).
-- Escopo (decisão do builder): nome/telefone/e-mail, endereço, foto, e veículo
-- com placa/modelo/ano/cor (+ vagas, que já existe e a rota precisa).
-- FORA: CPF, CNH e verificação de documentos (LGPD/piloto com motorista conhecido).

-- Perfil: endereço + ponteiro da foto (bucket privado driver-photos).
alter table driver_profiles add column address    text;
alter table driver_profiles add column photo_path text;

-- Veículo: complementa placa/vagas (já existentes) com modelo, ano e cor.
alter table vehicles add column model text;
alter table vehicles add column year  int;
alter table vehicles add column color text;
