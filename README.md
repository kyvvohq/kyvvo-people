# Kyvvo People

Avaliação comportamental (Profiler + MBTI + Big Five) para processos seletivos, via link único protegido por CPF — sem o candidato precisar criar conta.

Multi-tenant: login valida contra o serviço de auth do Kyvvo principal (`POST /api/auth/login` + `GET /api/auth/people/acesso`, server-to-server) — qualquer usuário Kyvvo com o módulo "people" ativo no tenant consegue entrar, dados de candidatos ficam isolados por `tenant_id`. Serviço separado do Kyvvo principal — banco de dados, container e segredos isolados; o People nunca acessa `usuarios`/`tenants` diretamente. Deploy em `people.kyvvo.com.br`.

## Rodando localmente

```
cp .env.example .env
# preencher DATABASE_URL (Postgres local) e KYVVO_APP_URL (aponte pro painel Kyvvo rodando local ou em produção)
npm install
npm start
```

Sem `RESEND_API_KEY` configurada, o link de avaliação é apenas logado no console (modo dev).

## Testes

```
npm test
```

## Estrutura

- `index.js` — servidor Fastify, todas as rotas sob `/people`.
- `lib/inferencia.js` — motor de cálculo (Profiler/MBTI/Big Five/gaps), matriz das 48 características.
- `lib/cpf.js` — validação de CPF (checksum).
- `lib/email.js` — envio do link via Resend.
- `lib/pdf.js` — geração do relatório em PDF.
- `lib/db.js` — pool Postgres + migration runner simples (`db/*.sql`).
- `public/` — telas: login, painel da psicóloga, avaliação pública, relatório.
