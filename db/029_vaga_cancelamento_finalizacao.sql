-- Menu Vagas (2026-10-16): data de encerramento/cancelamento + cancelamento
-- explícito de vaga (ação separada do dropdown de status, com confirmação e
-- notificação aos inscritos, index.js POST /people/api/vagas/:id/cancelar).
-- "cancelada" só é alcançável por essa rota dedicada — não entra na lista de
-- status editáveis via PATCH genérico nem nas colunas do Quadro de vagas,
-- de propósito (evita cancelar vaga "sem querer" arrastando card ou
-- editando o status direto, sem passar pela confirmação).
alter table vagas add column finalizada_em timestamptz;
alter table vagas drop constraint vagas_status_check;
alter table vagas add constraint vagas_status_check
  check (status = any (array['rascunho', 'nova', 'em_andamento', 'pausada', 'encerrada', 'cancelada']));

-- Backfill best-effort pras vagas já encerradas antes desta migration — não
-- sabemos o momento exato da transição, atualizado_em é a aproximação mais
-- razoável disponível (só muda de novo se a vaga for editada).
update vagas set finalizada_em = atualizado_em where status = 'encerrada' and finalizada_em is null;
