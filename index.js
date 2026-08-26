require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const Fastify = require('fastify');
const fastifyJwt = require('@fastify/jwt');
const fastifyStatic = require('@fastify/static');
const fastifyMultipart = require('@fastify/multipart');

const { pool, migrar } = require('./lib/db');
const { validarCpf, normalizar } = require('./lib/cpf');
const { calcularResultado, CARACTERISTICAS } = require('./lib/inferencia');
const { montarResumo } = require('./lib/conteudo');
const { enviarLinkAvaliacao } = require('./lib/email');
const { gerarRelatorioPdf } = require('./lib/pdf');

const PORT = process.env.PORT || 3002;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://people.kyvvo.com.br';
const KYVVO_APP_URL = process.env.KYVVO_APP_URL || 'https://studio.kyvvo.com.br';

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

  fastify.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  // Landing page (marketing, pública) — mesmo padrão de reply.sendFile já
  // usado por /people/avaliacao/:token, ignora o prefixo /people/ do
  // registro acima (sendFile resolve pelo `root`, não pela rota).
  fastify.get('/', async (request, reply) => reply.sendFile('index.html'));

  // --- Auth: valida contra o serviço de login do Kyvvo principal em vez de
  // credencial fixa (qualquer usuário Kyvvo com o módulo "people" ativo pode
  // entrar). O People nunca vê/toca usuarios/tenants — só confia numa
  // checagem servidor-a-servidor e emite seu próprio JWT interno depois.
  fastify.post('/people/api/login', async (request, reply) => {
    const { email, senha } = request.body || {};
    if (!email || !senha) {
      return reply.code(400).send({ error: 'E-mail e senha são obrigatórios' });
    }

    let loginRes;
    try {
      loginRes = await fetch(`${KYVVO_APP_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      request.log.error(`Falha ao contatar login do Kyvvo: ${err.message}`);
      return reply.code(502).send({ error: 'Não foi possível validar o login agora. Tente novamente em instantes.' });
    }
    if (!loginRes.ok) {
      const dados = await loginRes.json().catch(() => ({}));
      return reply.code(401).send({ error: dados.error || 'E-mail ou senha inválidos' });
    }
    const { token: kyvvoToken, nome } = await loginRes.json();

    let acessoRes;
    try {
      acessoRes = await fetch(`${KYVVO_APP_URL}/api/auth/people/acesso`, {
        headers: { Authorization: `Bearer ${kyvvoToken}` },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      request.log.error(`Falha ao checar acesso ao módulo people: ${err.message}`);
      return reply.code(502).send({ error: 'Não foi possível validar o login agora. Tente novamente em instantes.' });
    }
    if (!acessoRes.ok) {
      return reply.code(403).send({ error: 'Sua conta Kyvvo não tem acesso ao módulo People.' });
    }
    const { tenantId } = await acessoRes.json();

    const token = fastify.jwt.sign({ tenantId, email, nome }, { expiresIn: '12h' });
    return { token, nome };
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
      'insert into candidatos (id, nome, email, cpf, token, tenant_id) values ($1, $2, $3, $4, $5, $6)',
      [id, nome, email, normalizar(cpf), token, request.user.tenantId]
    );

    const link = `${PUBLIC_URL}/people/avaliacao/${token}`;
    await enviarLinkAvaliacao({ email, nome, link });

    return reply.code(201).send({ id, token, link });
  });

  fastify.get('/people/api/candidatos', { preHandler: fastify.authenticate }, async (request) => {
    const { rows } = await pool.query(
      'select id, nome, email, status, criado_em, concluido_em from candidatos where tenant_id = $1 order by criado_em desc',
      [request.user.tenantId]
    );
    return rows;
  });

  fastify.get('/people/api/candidatos/:id/relatorio', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query('select * from candidatos where id = $1 and tenant_id = $2', [request.params.id, request.user.tenantId]);
    const candidato = rows[0];
    if (!candidato) return reply.code(404).send({ error: 'Candidato não encontrado' });
    if (candidato.status !== 'concluido') {
      return reply.code(409).send({ error: 'Avaliação ainda não foi concluída' });
    }
    return { ...candidato, resumo: montarResumo(candidato.resultado, candidato.nome) };
  });

  fastify.get('/people/api/candidatos/:id/relatorio.pdf', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query('select * from candidatos where id = $1 and tenant_id = $2', [request.params.id, request.user.tenantId]);
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
    const { rows } = await pool.query('select * from candidatos where id = $1 and tenant_id = $2', [request.params.id, request.user.tenantId]);
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
        [
          crypto.randomUUID(),
          candidato.id,
          JSON.stringify(candidato.respostas_rodada1),
          JSON.stringify(candidato.respostas_rodada2),
          JSON.stringify(candidato.resultado),
          candidato.concluido_em,
        ]
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

  // --- Vagas (autenticado) ---
  const CAMPOS_VAGA_OBRIGATORIOS = ['nome', 'descricao', 'nivel_experiencia', 'cargo', 'requisitos', 'competencias'];
  const CAMPOS_VAGA_EDITAVEIS = [
    'codigo', 'nome', 'descricao', 'salario', 'modalidade',
    'nivel_experiencia', 'cargo', 'requisitos', 'competencias', 'status',
  ];

  fastify.post('/people/api/vagas', { preHandler: fastify.authenticate }, async (request, reply) => {
    const dados = request.body || {};
    const faltando = CAMPOS_VAGA_OBRIGATORIOS.filter((campo) => !dados[campo]);
    if (faltando.length) {
      return reply.code(400).send({ error: `Campos obrigatórios faltando: ${faltando.join(', ')}` });
    }

    const id = crypto.randomUUID();
    await pool.query(
      `insert into vagas (id, tenant_id, codigo, nome, descricao, salario, modalidade, nivel_experiencia, cargo, requisitos, competencias)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id, request.user.tenantId, dados.codigo || null, dados.nome, dados.descricao,
        dados.salario || null, dados.modalidade || null, dados.nivel_experiencia,
        dados.cargo, dados.requisitos, dados.competencias,
      ]
    );
    return reply.code(201).send({ id });
  });

  fastify.get('/people/api/vagas', { preHandler: fastify.authenticate }, async (request) => {
    const { rows } = await pool.query(
      'select id, codigo, nome, cargo, status, criado_em from vagas where tenant_id = $1 order by criado_em desc',
      [request.user.tenantId]
    );
    return rows;
  });

  fastify.get('/people/api/vagas/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query('select * from vagas where id = $1 and tenant_id = $2', [request.params.id, request.user.tenantId]);
    if (!rows[0]) return reply.code(404).send({ error: 'Vaga não encontrada' });
    return rows[0];
  });

  fastify.patch('/people/api/vagas/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const dados = request.body || {};
    const campos = Object.keys(dados).filter((campo) => CAMPOS_VAGA_EDITAVEIS.includes(campo));
    if (!campos.length) {
      return reply.code(400).send({ error: 'Nenhum campo válido para atualizar' });
    }
    if (dados.status && !['nova', 'em_andamento', 'pausada', 'encerrada'].includes(dados.status)) {
      return reply.code(400).send({ error: 'Status inválido' });
    }

    const sets = campos.map((campo, i) => `${campo} = $${i + 3}`).join(', ');
    const valores = campos.map((campo) => dados[campo]);
    const { rows } = await pool.query(
      `update vagas set ${sets}, atualizado_em = now() where id = $1 and tenant_id = $2 returning id`,
      [request.params.id, request.user.tenantId, ...valores]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Vaga não encontrada' });
    return { ok: true };
  });

  fastify.get('/people/api/vagas/:id/candidaturas', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows: vagaRows } = await pool.query('select id from vagas where id = $1 and tenant_id = $2', [request.params.id, request.user.tenantId]);
    if (!vagaRows[0]) return reply.code(404).send({ error: 'Vaga não encontrada' });

    const { rows } = await pool.query(
      'select id, nome, whatsapp, email, linkedin, curriculo_nome, criado_em from candidaturas where vaga_id = $1 order by criado_em desc',
      [request.params.id]
    );
    return rows;
  });

  // Lista todas as candidaturas do tenant (todas as vagas juntas) — usada
  // pela tela "Candidatos" (distinta de "Avaliações", que é sobre a tabela
  // `candidatos` do teste comportamental).
  fastify.get('/people/api/candidaturas', { preHandler: fastify.authenticate }, async (request) => {
    const { rows } = await pool.query(
      `select c.id, c.nome, c.email, c.whatsapp, c.criado_em, v.nome as vaga_nome
       from candidaturas c join vagas v on v.id = c.vaga_id
       where v.tenant_id = $1
       order by c.criado_em desc`,
      [request.user.tenantId]
    );
    return rows;
  });

  fastify.get('/people/api/candidaturas/:id/curriculo', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      `select c.curriculo_nome, c.curriculo_tipo, c.curriculo_arquivo
       from candidaturas c join vagas v on v.id = c.vaga_id
       where c.id = $1 and v.tenant_id = $2`,
      [request.params.id, request.user.tenantId]
    );
    const candidatura = rows[0];
    if (!candidatura) return reply.code(404).send({ error: 'Currículo não encontrado' });

    reply.header('Content-Type', candidatura.curriculo_tipo);
    reply.header('Content-Disposition', `attachment; filename="${candidatura.curriculo_nome}"`);
    return reply.send(candidatura.curriculo_arquivo);
  });

  // --- Quadro Kanban: etapas (colunas, tenant-wide) + candidaturas movendo entre elas ---
  fastify.post('/people/api/etapas', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { nome } = request.body || {};
    if (!nome) return reply.code(400).send({ error: 'nome é obrigatório' });

    const { rows } = await pool.query(
      'select coalesce(max(ordem), 0) + 1 as proxima from etapas where tenant_id = $1',
      [request.user.tenantId]
    );
    const id = crypto.randomUUID();
    await pool.query(
      'insert into etapas (id, tenant_id, nome, ordem) values ($1, $2, $3, $4)',
      [id, request.user.tenantId, nome, rows[0].proxima]
    );
    return reply.code(201).send({ id, nome, ordem: rows[0].proxima });
  });

  fastify.get('/people/api/etapas', { preHandler: fastify.authenticate }, async (request) => {
    const { rows } = await pool.query(
      'select id, nome, ordem from etapas where tenant_id = $1 order by ordem',
      [request.user.tenantId]
    );
    return rows;
  });

  fastify.patch('/people/api/etapas/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { nome } = request.body || {};
    if (!nome) return reply.code(400).send({ error: 'nome é obrigatório' });
    const { rows } = await pool.query(
      'update etapas set nome = $1 where id = $2 and tenant_id = $3 returning id',
      [nome, request.params.id, request.user.tenantId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Etapa não encontrada' });
    return { ok: true };
  });

  // Troca a `ordem` com a etapa vizinha na direção pedida — reordenação simples
  // via botões ←/→ no cabeçalho da coluna (drag-and-drop fica só pros cartões).
  fastify.patch('/people/api/etapas/:id/mover', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { direcao } = request.body || {};
    if (!['esquerda', 'direita'].includes(direcao)) {
      return reply.code(400).send({ error: 'direcao deve ser esquerda ou direita' });
    }

    const { rows } = await pool.query(
      'select id, ordem from etapas where tenant_id = $1 order by ordem',
      [request.user.tenantId]
    );
    const indice = rows.findIndex((e) => e.id === request.params.id);
    if (indice === -1) return reply.code(404).send({ error: 'Etapa não encontrada' });

    const indiceVizinho = direcao === 'esquerda' ? indice - 1 : indice + 1;
    if (indiceVizinho < 0 || indiceVizinho >= rows.length) return { ok: true };

    const atual = rows[indice];
    const vizinho = rows[indiceVizinho];
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('update etapas set ordem = $1 where id = $2', [vizinho.ordem, atual.id]);
      await client.query('update etapas set ordem = $1 where id = $2', [atual.ordem, vizinho.id]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    return { ok: true };
  });

  fastify.delete('/people/api/etapas/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      'delete from etapas where id = $1 and tenant_id = $2 returning id',
      [request.params.id, request.user.tenantId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Etapa não encontrada' });
    return { ok: true };
  });

  // Payload único com tudo que o quadro precisa pra montar o grid raia×coluna —
  // filtro por vaga/etapa fica client-side (volume pequeno, evita ida e volta
  // a cada clique no filtro).
  fastify.get('/people/api/kanban', { preHandler: fastify.authenticate }, async (request) => {
    const [vagas, etapas, candidaturas] = await Promise.all([
      pool.query('select id, nome from vagas where tenant_id = $1 order by criado_em desc', [request.user.tenantId]),
      pool.query('select id, nome, ordem from etapas where tenant_id = $1 order by ordem', [request.user.tenantId]),
      pool.query(
        `select c.id, c.nome, c.vaga_id, c.etapa_id, c.criado_em
         from candidaturas c join vagas v on v.id = c.vaga_id
         where v.tenant_id = $1
         order by c.criado_em desc`,
        [request.user.tenantId]
      ),
    ]);
    return { vagas: vagas.rows, etapas: etapas.rows, candidaturas: candidaturas.rows };
  });

  fastify.patch('/people/api/candidaturas/:id/etapa', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { etapa_id } = request.body || {};
    const { rows } = await pool.query(
      `update candidaturas c set etapa_id = $1
       from vagas v
       where c.vaga_id = v.id and c.id = $2 and v.tenant_id = $3
       returning c.id`,
      [etapa_id || null, request.params.id, request.user.tenantId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Candidatura não encontrada' });
    return { ok: true };
  });

  // --- Vaga pública (candidato, sem login) ---
  const EXTENSOES_CURRICULO_ACEITAS = ['.pdf', '.docx'];

  fastify.get('/people/vaga/:id', async (request, reply) => {
    return reply.sendFile('vaga.html');
  });

  fastify.get('/people/api/vaga-publica/:id', async (request, reply) => {
    const { rows } = await pool.query(
      `select nome, descricao, salario, modalidade, nivel_experiencia, cargo, requisitos, competencias, status
       from vagas where id = $1`,
      [request.params.id]
    );
    const vaga = rows[0];
    if (!vaga || vaga.status === 'encerrada') {
      return reply.code(404).send({ error: 'Vaga não encontrada ou encerrada' });
    }
    return vaga;
  });

  fastify.post('/people/api/vaga-publica/:id/candidatar', async (request, reply) => {
    const { rows: vagaRows } = await pool.query("select id, status from vagas where id = $1", [request.params.id]);
    const vaga = vagaRows[0];
    if (!vaga || vaga.status === 'encerrada') {
      return reply.code(404).send({ error: 'Vaga não encontrada ou encerrada' });
    }

    const campos = {};
    let arquivo = null;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const extensao = path.extname(part.filename || '').toLowerCase();
        if (!EXTENSOES_CURRICULO_ACEITAS.includes(extensao)) {
          return reply.code(400).send({ error: 'Currículo deve ser PDF ou DOCX' });
        }
        arquivo = { nome: part.filename, tipo: part.mimetype, buffer: await part.toBuffer() };
      } else {
        campos[part.fieldname] = part.value;
      }
    }

    if (!campos.nome || !campos.whatsapp || !campos.email) {
      return reply.code(400).send({ error: 'nome, whatsapp e email são obrigatórios' });
    }
    if (!arquivo) {
      return reply.code(400).send({ error: 'Currículo é obrigatório' });
    }

    await pool.query(
      `insert into candidaturas (id, vaga_id, tenant_id, nome, whatsapp, email, linkedin, curriculo_nome, curriculo_tipo, curriculo_arquivo)
       values ($1, $2, (select tenant_id from vagas where id = $2), $3, $4, $5, $6, $7, $8, $9)`,
      [crypto.randomUUID(), vaga.id, campos.nome, campos.whatsapp, campos.email, campos.linkedin || null, arquivo.nome, arquivo.tipo, arquivo.buffer]
    );

    return reply.code(201).send({ ok: true });
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
