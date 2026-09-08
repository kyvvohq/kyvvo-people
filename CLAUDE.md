# CLAUDE.md

Guia para o Claude Code (claude.ai/code) neste repositório.

## O que é este repo

Kyvvo People — SaaS de avaliação comportamental (Profiler + MBTI + Big Five)
para processos seletivos. Em produção em `people.kyvvo.com.br` desde 2026-08-21.
Um serviço Fastify único, sem build e sem bundler.

Layout flat na raiz: `index.js` (~1400 linhas), `lib/`, `db/`, `public/`,
`test/`. Container `people`, porta 3002, deployado em `/opt/rh` na EC2.

## Comandos

```bash
npm start          # node index.js  (precisa DATABASE_URL, PEOPLE_JWT_SECRET)
npm test           # node --test test/*.test.js
```

`npm ci` precisa de `NPM_PACKAGES_TOKEN` no ambiente — o `.npmrc` aponta
`@kyvvohq` pro GitHub Packages e lê esse token.

## Arquitetura

**`index.js`** monta o Fastify, registra `@fastify/{jwt,static,multipart}`,
serve `public/` em `/people/` e os tokens do design system crus de
`node_modules/@kyvvohq/design-system` em `/ds/`. Todas as rotas de API vivem
nesse arquivo (não há `routes/`).

**Auth** (corte P3): o People **não tem tabela de usuário/tenant**. `POST
/people/api/login` valida servidor-a-servidor contra o `kyvvo-platform`
(`PLATFORM_URL`, `POST /api/auth/login` + `GET /api/auth/people/acesso`) —
qualquer usuário Kyvvo com o módulo `people` ativo entra — e então emite um JWT
**interno** próprio (12h, `PEOPLE_JWT_SECRET`). O decorator `fastify.authenticate`
só faz `request.jwtVerify()`, sem lookup em banco.

**Front** é estático não-bundlado em `public/`: `shell.js` + `shell.css` + um
`*.html` por tela. Tema claro/escuro via `data-theme` (`localStorage.people_tema`).

**`lib/`:**
- `inferencia.js` — cálculo do resultado (pesos OCEAN / tipo psicológico). Puro.
- `conteudo.js` — banco de conteúdo da avaliação (características, textos).
- `curriculo.js` — extração de texto de CV (`mammoth` / `pdf-parse`).
- `pdf.js` — geração do relatório (`pdfkit`).
- `pessoas.js` — dedup/reaproveitamento de pessoa por `(tenant_id, telefone/email)`.
- `mascarar.js` — mascaramento LGPD reversível (botão "Anonimizar").
- `telefone.js` — normalização pra E.164; **chave primária de dedup de pessoa**.
- `planos.js` — catálogo de planos (vem do admin do Studio via `KYVVO_APP_URL`).
- `asaas.js` — wrapper fino de `@kyvvohq/asaas` (pagamento).
- `db.js` — `pool` (pg) + `migrar()` sobre `@kyvvohq/db-migrate`.
- `email.js` — Resend (`RESEND_API_KEY`); inerte sem a credencial.
- `whatsapp.js` — Meta Cloud API (`META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID`,
  `META_WABA_ID`); inerte sem as credenciais. Envio é sempre por template
  aprovado (mensagem proativa, nunca dentro da janela de 24h), nunca texto
  livre.
- `automacoes.js` — automações de e-mail/WhatsApp por gatilho do fluxo de vaga
  (`db/019_automacoes.sql`). Seeds automáticos por tenant, ver comentário no
  topo do arquivo.

## Banco

- Postgres **próprio deste serviço**, DB `kyvvo_people` — **nunca** o `railway`
  do Kyvvo principal.
- Migrations = SQL sequencial `db/NNN_descricao.sql`, aplicadas em ordem pelo
  runner `@kyvvohq/db-migrate` (tabela `_migrations`, `lib/db.js` `migrar()`).
  Uma mudança de schema é um arquivo novo numerado — sem down migration.
- Multi-tenancy é por query (`WHERE tenant_id = $1`), sem RLS.

## Serviços externos

Todo integração é **inerte sem a credencial** — sem `RESEND_API_KEY`, sem
`ASAAS_*`, a feature fica off e o app sobe. `kyvvo-platform` (auth) e o painel do
Studio (`KYVVO_APP_URL`, catálogo de planos) são os dois serviços irmãos.

## Secrets

Nunca commitar. Vivem no **AWS SSM** como `SecureString` em `/kyvvo/people/<KEY>`;
`gen-env-from-ssm.sh` (na EC2) materializa `/opt/kyvvo/env/people.env`, lido pelo
`docker-compose` via `env_file`.

## CI / deploy

- **`gate.yml`** (toda PR): `npm ci`, migrations do zero pelo runner real contra
  um `postgres:16` efêmero, `npm test`. Job `caminhos-protegidos` reprova PR que
  toca `.github/workflows/`, `.github/dependabot.yml`, `db/`, `.npmrc`,
  `package.json`, `Dockerfile` ou `lib/{db,asaas,planos,email}.js` **sem a label
  `revisado:infra`** (Dependabot isento).
- **`agente.yml`** (`issues: labeled`): `agent:tests` (só `test/`) ou `agent:app`
  (`lib/`, `public/`, `index.js` — fora das libs de infra) dispara o
  `anthropics/claude-code-action`.
- **`deploy.yml`** (push na `master`, path-filtered): scp pra `/opt/rh`,
  `gen-env-from-ssm.sh`, `docker compose up -d --force-recreate people`.

## Fluxo obrigatório (para o agente)

1. Rode `npm test` antes de mudar qualquer coisa.
2. Respeite a categoria da label — não toque nada fora dela, nunca em caminho
   protegido.
3. No máximo 3 tentativas de conserto de um teste que quebrou; se não convergir,
   abra a PR como rascunho e explique.
4. PR com `Closes #<n>` na descrição.

## Testes

`test/*.test.js` são `node --test`, funções puras de `lib/`, **sem Postgres e
sem servidor**. Sem Playwright neste repo.
