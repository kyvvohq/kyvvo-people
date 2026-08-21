# Kyvvo People

Avaliação comportamental (Profiler + MBTI + Big Five) para processos seletivos, via link único protegido por CPF — sem o candidato precisar criar conta.

MVP mínimo: uso privado por uma psicóloga (login fixo) para conduzir um único processo seletivo. Serviço separado do Kyvvo principal — banco de dados, container e segredos isolados. Deploy em `people.kyvvo.com.br`.

## Rodando localmente

```
cp .env.example .env
# preencher DATABASE_URL (Postgres local) e PEOPLE_ADMIN_PASSWORD_HASH
npm install
npm start
```

Gerar o hash da senha da psicóloga:

```
node -e "console.log(require('bcryptjs').hashSync('SUA_SENHA', 10))"
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
