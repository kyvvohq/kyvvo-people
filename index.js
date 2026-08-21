require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Fastify = require('fastify');
const fastifyJwt = require('@fastify/jwt');
const fastifyStatic = require('@fastify/static');

const { pool, migrar } = require('./lib/db');
const { validarCpf, normalizar } = require('./lib/cpf');
const { calcularResultado, CARACTERISTICAS } = require('./lib/inferencia');
const { montarResumo } = require('./lib/conteudo');
const { enviarLinkAvaliacao } = require('./lib/email');
const { gerarRelatorioPdf } = require('./lib/pdf');

const PORT = process.env.PORT || 3002;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://people.kyvvo.com.br';

// Lista pública das características (sem os pesos MBTI/OCEAN — só o que o
// candidato precisa ver na tela de avaliação).
const CARACTERISTICAS_PUBLICAS = CARACTERISTICAS.map((c) => ({ id: c.id, texto: c.caracteristica }));

async function build() {
  const fastify = Fastify({ logger: true });

  fastify.register(fastifyJwt, { secret: process.env.PEOPLE_JWT_SECRET });

  // Mesmo padrão do `authenticateAdmin` do painel principal (server/panel/index.js):
  // secret próprio, sem lookup em banco por request — adequado pra 1 usuário fixo.
  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Não autenticado' });
    }
  });

  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/people/',
  });

  // --- Auth (psicóloga, usuário fixo via env vars) ---
  fastify.post('/people/api/login', async (request, reply) => {
    const { email, senha } = request.body || {};
    const emailOk = email && email.toLowerCase() === (process.env.PEOPLE_ADMIN_EMAIL || '').toLowerCase();
    const senhaOk = emailOk && senha && bcrypt.compareSync(senha, process.env.PEOPLE_ADMIN_PASSWORD_HASH || '');
    if (!emailOk || !senhaOk) {
      return reply.code(401).send({ error: 'E-mail ou senha inválidos' });
    }
    const token = fastify.jwt.sign({ email }, { expiresIn: '12h' });
    return { token };
  });

  // --- Portal da psicóloga (autenticado) ---
  fastify.post('/people/api/candidatos', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { nome, email, cpf } = request.body || {};
    if (!nome || !email || !cpf) {
      return reply.code(400).send({ error: 'nome, email e cpf são obrigatórios' });
    }
    if (!validarCpf(cpf)) {
      return reply.code(400).send({ error: 'CPF inválido' });
    }

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    await pool.query(
      'insert into candidatos (id, nome, email, cpf, token) values ($1, $2, $3, $4, $5)',
      [id, nome, email, normalizar(cpf), token]
    );

    const link = `${PUBLIC_URL}/people/avaliacao/${token}`;
    await enviarLinkAvaliacao({ email, nome, link });

    return reply.code(201).send({ id, token, link });
  });

  fastify.get('/people/api/candidatos', { preHandler: fastify.authenticate }, async () => {
    const { rows } = await pool.query(
      'select id, nome, email, status, criado_em, concluido_em from candidatos order by criado_em desc'
    );
    return rows;
  });

  fastify.get('/people/api/candidatos/:id/relatorio', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query('select * from candidatos where id = $1', [request.params.id]);
    const candidato = rows[0];
    if (!candidato) return reply.code(404).send({ error: 'Candidato não encontrado' });
    if (candidato.status !== 'concluido') {
      return reply.code(409).send({ error: 'Avaliação ainda não foi concluída' });
    }
    return { ...candidato, resumo: montarResumo(candidato.resultado, candidato.nome) };
  });

  fastify.get('/people/api/candidatos/:id/relatorio.pdf', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query('select * from candidatos where id = $1', [request.params.id]);
    const candidato = rows[0];
    if (!candidato) return reply.code(404).send({ error: 'Candidato não encontrado' });
    if (candidato.status !== 'concluido') {
      return reply.code(409).send({ error: 'Avaliação ainda não foi concluída' });
    }

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="relatorio-${candidato.nome.replace(/\s+/g, '-')}.pdf"`);
    const resumo = montarResumo(candidato.resultado, candidato.nome);
    const doc = gerarRelatorioPdf(candidato, resumo);
    return reply.send(doc);
  });

  // Arquiva a tentativa atual em `candidatos_historico` e reseta o candidato
  // pra 'pendente', mantendo o mesmo token/link — decisão da psicóloga, o
  // candidato não pode se autodestravar depois de concluído.
  fastify.post('/people/api/candidatos/:id/refazer', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query('select * from candidatos where id = $1', [request.params.id]);
    const candidato = rows[0];
    if (!candidato) return reply.code(404).send({ error: 'Candidato não encontrado' });
    if (candidato.status !== 'concluido') {
      return reply.code(409).send({ error: 'Só é possível refazer uma avaliação já concluída' });
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into candidatos_historico (id, candidato_id, respostas_rodada1, respostas_rodada2, resultado, concluido_em)
         values ($1, $2, $3, $4, $5, $6)`,
        [crypto.randomUUID(), candidato.id, candidato.respostas_rodada1, candidato.respostas_rodada2, candidato.resultado, candidato.concluido_em]
      );
      await client.query(
        `update candidatos
         set status = 'pendente', respostas_rodada1 = null, respostas_rodada2 = null,
             resultado = null, iniciado_em = null, concluido_em = null
         where id = $1`,
        [candidato.id]
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }

    return { ok: true, link: `${PUBLIC_URL}/people/avaliacao/${candidato.token}` };
  });

  // --- Avaliação pública (candidato, sem login — gate por CPF) ---
  fastify.get('/people/avaliacao/:token', async (request, reply) => {
    return reply.sendFile('avaliacao.html');
  });

  fastify.get('/people/api/avaliacao/:token', async (request, reply) => {
    const { rows } = await pool.query('select status, nome from candidatos where token = $1', [request.params.token]);
    const candidato = rows[0];
    if (!candidato) return reply.code(404).send({ error: 'Link inválido' });
    return { status: candidato.status, nome: candidato.nome };
  });

  fastify.post('/people/api/avaliacao/:token/validar-cpf', async (request, reply) => {
    const { cpf } = request.body || {};
    const { rows } = await pool.query('select id, cpf, status from candidatos where token = $1', [request.params.token]);
    const candidato = rows[0];
    if (!candidato) return reply.code(404).send({ error: 'Link inválido' });
    if (candidato.status === 'concluido') {
      return reply.code(403).send({ error: 'Esta avaliação já foi concluída e não pode ser refeita' });
    }
    if (normalizar(cpf) !== candidato.cpf) {
      return reply.code(401).send({ error: 'CPF não confere' });
    }

    if (candidato.status === 'pendente') {
      await pool.query("update candidatos set status = 'iniciado', iniciado_em = now() where id = $1", [candidato.id]);
    }

    return { ok: true, caracteristicas: CARACTERISTICAS_PUBLICAS };
  });

  fastify.post('/people/api/avaliacao/:token/rodada1', async (request, reply) => {
    const { selecionadas } = request.body || {};
    const candidato = await buscarPorTokenEmAndamento(request.params.token, reply);
    if (!candidato) return;
    if (!Array.isArray(selecionadas) || !selecionadas.length) {
      return reply.code(400).send({ error: 'selecionadas deve ser uma lista de ids não vazia' });
    }

    await pool.query('update candidatos set respostas_rodada1 = $1 where id = $2', [JSON.stringify(selecionadas), candidato.id]);
    return { ok: true };
  });

  fastify.post('/people/api/avaliacao/:token/rodada2', async (request, reply) => {
    const { selecionadas } = request.body || {};
    const candidato = await buscarPorTokenEmAndamento(request.params.token, reply);
    if (!candidato) return;
    if (!Array.isArray(selecionadas) || !selecionadas.length) {
      return reply.code(400).send({ error: 'selecionadas deve ser uma lista de ids não vazia' });
    }
    if (!candidato.respostas_rodada1) {
      return reply.code(409).send({ error: 'Rodada 1 ainda não foi respondida' });
    }

    const resultado = calcularResultado(candidato.respostas_rodada1, selecionadas);
    await pool.query(
      `update candidatos
       set respostas_rodada2 = $1, resultado = $2, status = 'concluido', concluido_em = now()
       where id = $3`,
      [JSON.stringify(selecionadas), JSON.stringify(resultado), candidato.id]
    );
    return { ok: true };
  });

  // Busca um candidato pelo token garantindo que a avaliação está em andamento
  // (CPF já validado, ainda não concluída) — usado pelas rotas de rodada 1/2
  // pra impedir salvar respostas fora do fluxo (token errado, já concluído,
  // ou nunca iniciado).
  async function buscarPorTokenEmAndamento(token, reply) {
    const { rows } = await pool.query('select * from candidatos where token = $1', [token]);
    const candidato = rows[0];
    if (!candidato) {
      reply.code(404).send({ error: 'Link inválido' });
      return null;
    }
    if (candidato.status === 'concluido') {
      reply.code(403).send({ error: 'Esta avaliação já foi concluída e não pode ser refeita' });
      return null;
    }
    if (candidato.status === 'pendente') {
      reply.code(403).send({ error: 'Valide seu CPF antes de responder' });
      return null;
    }
    return candidato;
  }

  return fastify;
}

async function start() {
  await migrar();
  const fastify = await build();
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { build };
