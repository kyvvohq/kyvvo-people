---
name: refinar
description: Transforma uma ideia solta de tarefa num issue fechado e testável para o agente de IA (agente.yml), já com a label agent:* certa e um aviso se a tarefa esbarra em caminho protegido.
---

# refinar

Pega um rascunho de tarefa (uma frase, um print, um "arruma isso") e devolve o
corpo de issue no formato que `.github/ISSUE_TEMPLATE/tarefa-agente.yml` espera,
pronto pra colar em `gh issue create`.

## Quando usar

Antes de abrir qualquer issue com label `agent:*`. O workflow `agente.yml` roda
o `anthropics/claude-code-action` com `--max-turns 60` e escopo travado pela
label — issue vago = PR ruim ou nenhum PR.

## Passos

1. **Entenda a tarefa.** Leia o rascunho. Se faltar o essencial (o que muda, como
   saber que ficou pronto), pergunte — no máximo duas perguntas.

2. **Classifique a categoria** e a label:
   - mexe só em teste (`test/`) → `agent:tests`
   - lógica de app (`lib/` fora das libs de infra, `public/`, `index.js`) → `agent:app`

3. **Cheque caminho protegido.** Se a tarefa, pra ficar de pé, precisa tocar
   `.github/workflows/`, `.github/dependabot.yml`, `db/` (migration), `.npmrc`,
   `package.json`, `Dockerfile`, ou `lib/db.js` / `lib/asaas.js` /
   `lib/planos.js` / `lib/email.js` — **pare**. Isso não vai por agente: é PR
   humano com a label `revisado:infra`. Diga isso e não gere o issue.

4. **Escreva o corpo** com estas seções (as do template):
   - **Objetivo** — 1–2 frases, resultado final.
   - **Critério de aceite** — checklist verificável ("`npm test` passa com…",
     "tela X mostra Y"). Todo item checável sem adivinhar.
   - **Arquivos / áreas prováveis** — onde a mudança mora (rode `grep`/`glob`
     pra confirmar antes de listar; não chute).
   - **Fora de escopo** — o que não pode mudar.
   - **Contexto / links** — prints, PRs, logs.

5. **Entregue** o bloco pronto:

   ```
   gh issue create \
     --title "[agente] <título curto>" \
     --label "tarefa" --label "agent:<categoria>" \
     --body "<corpo>"
   ```

   Aplicar a label `agent:*` é o que dispara o workflow — confirme com o humano
   antes de criar já com ela, ou crie sem e deixe a pessoa aplicar.

## Regras

- Uma tarefa por issue. Se o rascunho tem três coisas, gere três.
- Critério de aceite sem número mágico não medido: "rápido" não serve.
- Não invente caminho de arquivo. Verifique.
- O agente segue o `CLAUDE.md` da raiz (se existir) — não repita, referencie.
