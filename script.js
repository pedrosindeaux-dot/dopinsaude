
// ==================== DADOS PADRÃO E ESTADO ====================
const STORAGE_KEY = 'dopin_saude_db_v1';
const SESSION_KEY = 'dopin_saude_session_v1';
const DEFAULT_GAS_URL = '';

const ADMIN_USUARIO = 'admin';
const ADMIN_SENHA = 'pasteldefrango';

const DEFAULT_CONFIG = {
  gasUrl: DEFAULT_GAS_URL,
  percentualVenda: 5,
  clinica: {
    nome: '',
    razaoSocial: '',
    cnpj: '',
    cro: '',
    telefone: '',
    email: '',
    endereco: ''
  },
  dentistas: [
    { id: 'd1', nome: 'Dr. Pedro', usuario: 'dr.pedro', senha: '1234' },
    { id: 'd2', nome: 'Dra. Parceira', usuario: 'dra.parceira', senha: '1234' }
  ],
  recepcionistas: [
    { id: 'r1', nome: 'Recepção Principal', usuario: 'recepcao', senha: '1234' }
  ],
  especialidades: [
    { nome: 'IMPLANTE', percentual: 30 },
    { nome: 'PROTESE', percentual: 25 },
    { nome: 'ORTO', percentual: 30 },
    { nome: 'ENDO', percentual: 30 },
    { nome: 'FACETA', percentual: 30 },
    { nome: 'CLINICO', percentual: 25 }
  ],
  taxas: [
    { id: 'dinheiro', nome: 'Dinheiro', taxa: 0 },
    { id: 'pix', nome: 'Pix', taxa: 0 },
    { id: 'debito', nome: 'Débito', taxa: 2 },
    { id: 'credito_3x', nome: 'Crédito até 3x', taxa: 7 },
    { id: 'credito_6x', nome: 'Crédito até 6x', taxa: 10 },
    { id: 'credito_12x', nome: 'Crédito até 12x', taxa: 15 }
  ],
  categoriasSaida: [
    'LABORATÓRIO',
    'PROD. LIMP/HIG.',
    'IMPOSTOS',
    'SALÁRIOS',
    'MARKETING',
    'ALUGUEL',
    'MERCANTIL',
    'SERV. ESSENCIAIS',
    'FAXINA',
    'PAG. DENTISTAS',
    'GRAF./PAPELARIA',
    'MANUTENÇÃO',
    'OUTROS'
  ]
};

let db = carregarDB();
let sessaoAtual = null;
let abasDesbloqueadas = { geral: false, config: false };
let abaPendenteSenha = null;

function normalizarUsuarioItem(item, prefixoId, idx = 0) {
  const nome = item.nome || `${prefixoId === 'd_' ? 'Dentista' : 'Recepção'} ${idx + 1}`;
  const usuarioFallback = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
  return {
    id: item.id || prefixoId + gerarId(),
    nome,
    usuario: item.usuario || usuarioFallback || `user${idx + 1}`,
    senha: item.senha ? String(item.senha) : '1234'
  };
}

function carregarDB() {
  const salvo = localStorage.getItem(STORAGE_KEY);
  if (salvo) {
    try {
      const parsed = JSON.parse(salvo);

      const dentistasSalvos = Array.isArray(parsed.config?.dentistas)
        ? parsed.config.dentistas.map((d, i) => normalizarUsuarioItem(d, 'd_', i))
        : structuredClone(DEFAULT_CONFIG.dentistas);

      const recepSalvos = Array.isArray(parsed.config?.recepcionistas)
        ? parsed.config.recepcionistas.map((r, i) => normalizarUsuarioItem(r, 'r_', i))
        : structuredClone(DEFAULT_CONFIG.recepcionistas);

      return {
        config: {
          ...DEFAULT_CONFIG,
          ...parsed.config,
          clinica: {
            ...DEFAULT_CONFIG.clinica,
            ...(parsed.config?.clinica || {})
          },
          dentistas: dentistasSalvos,
          recepcionistas: recepSalvos,
          percentualVenda:
            parsed.config?.percentualVenda !== undefined
              ? Number(parsed.config.percentualVenda)
              : 5,
          gasUrl: parsed.config?.gasUrl ?? DEFAULT_GAS_URL
        },
        atendimentos: parsed.atendimentos || [],
        saidas: parsed.saidas || [],
        pagamentosDentistas: parsed.pagamentosDentistas || {},
        filaSync: parsed.filaSync || []
      };
    } catch (e) {
      console.error('Erro ao ler storage local:', e);
    }
  }
  return {
    config: structuredClone(DEFAULT_CONFIG),
    atendimentos: [],
    saidas: [],
    pagamentosDentistas: {},
    filaSync: []
  };
}

function salvarDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  atualizarBadgePendentes();
}

// ==================== UTILITÁRIOS & SEGURANÇA ====================
const escapeHTML = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmtBRL = (val) =>
  Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const hojeISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};

const getDataAtiva = () => document.getElementById('dataAtiva')?.value || hojeISO();

const gerarId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();

  const inputData = document.getElementById('dataAtiva');
  if (inputData) {
    inputData.value = hojeISO();
    inputData.addEventListener('change', renderizarTudo);
  }

  atualizarCabecalhoClinica();
  popularSelects();
  configurarLogin();
  configurarNavegacao();
  configurarModalSenha();
  configurarFormularios();
  configurarConexao();
  verificarSessaoSalva();
});

function atualizarCabecalhoClinica() {
  const badge = document.getElementById('headerClinicaNome');
  if (!badge) return;
  const nomeClinica = (db.config.clinica?.nome || '').trim();
  if (nomeClinica) {
    badge.textContent = nomeClinica;
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

// ==================== AUTENTICAÇÃO & PERFIS ====================
function configurarLogin() {
  const botoesPerfil = document.querySelectorAll('.perfil-btn');
  const inputPerfil = document.getElementById('loginPerfil');
  const inputUsuario = document.getElementById('loginUsuario');

  const atualizarPerfilLogin = (perfil) => {
    inputPerfil.value = perfil;

    if (perfil === 'Profissional') {
      inputUsuario.placeholder = 'ex: dr.pedro';
    } else if (perfil === 'Recepção') {
      inputUsuario.placeholder = 'ex: recepcao';
    } else {
      inputUsuario.placeholder = 'Usuário administrativo';
    }
    document.getElementById('loginErro').classList.add('hidden');
  };

  botoesPerfil.forEach((btn) => {
    btn.addEventListener('click', () => {
      botoesPerfil.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      atualizarPerfilLogin(btn.dataset.perfil);
    });
  });

  atualizarPerfilLogin('Profissional');

  document.getElementById('btnToggleLoginSenha').addEventListener('click', () => {
    const inp = document.getElementById('loginSenha');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('formLogin').addEventListener('submit', (e) => {
    e.preventDefault();
    const perfil = document.getElementById('loginPerfil').value;
    const usuarioDigitado = document.getElementById('loginUsuario').value.trim();
    const senhaDigitada = document.getElementById('loginSenha').value.trim();
    const manter = document.getElementById('loginManterSessao').checked;
    const erroEl = document.getElementById('loginErro');

    if (!usuarioDigitado || !senhaDigitada) {
      erroEl.textContent = 'Preencha usuário e senha para acessar.';
      erroEl.classList.remove('hidden');
      return;
    }

    if (perfil === 'Profissional') {
      const dentObj = db.config.dentistas.find(
        (d) =>
          String(d.usuario || '').trim().toLowerCase() === usuarioDigitado.toLowerCase() &&
          String(d.senha || '').trim() === senhaDigitada
      );

      if (!dentObj) {
        erroEl.textContent = 'Usuário ou senha não autorizados para o perfil Profissional.';
        erroEl.classList.remove('hidden');
        return;
      }

      erroEl.classList.add('hidden');
      iniciarSessao({ usuario: dentObj.nome, perfil: 'Profissional', dentistaId: dentObj.id }, manter);
      return;
    }

    if (perfil === 'Recepção') {
      const recepObj = db.config.recepcionistas.find(
        (r) =>
          String(r.usuario || '').trim().toLowerCase() === usuarioDigitado.toLowerCase() &&
          String(r.senha || '').trim() === senhaDigitada
      );

      if (!recepObj) {
        erroEl.textContent = 'Usuário ou senha não autorizados para o perfil Recepção.';
        erroEl.classList.remove('hidden');
        return;
      }

      erroEl.classList.add('hidden');
      iniciarSessao({ usuario: recepObj.nome, perfil: 'Recepção', recepcaoId: recepObj.id }, manter);
      return;
    }

    if (perfil === 'Administração') {
      if (usuarioDigitado.toLowerCase() !== ADMIN_USUARIO || senhaDigitada !== ADMIN_SENHA) {
        erroEl.textContent = 'Usuário ou senha administrativos incorretos.';
        erroEl.classList.remove('hidden');
        return;
      }

      erroEl.classList.add('hidden');
      iniciarSessao({ usuario: 'Administrador', perfil: 'Administração', dentistaId: null }, manter);
    }
  });

  document.getElementById('btnSair').addEventListener('click', encerrarSessao);
}

function verificarSessaoSalva() {
  const salvo = localStorage.getItem(SESSION_KEY);
  if (salvo) {
    try {
      const dados = JSON.parse(salvo);
      if (dados && dados.usuario && dados.perfil) {
        if (dados.perfil === 'Profissional') {
          const existeDent = db.config.dentistas.some((d) => d.id === dados.dentistaId);
          if (!existeDent) {
            localStorage.removeItem(SESSION_KEY);
            mostrarTelaLogin();
            return;
          }
        }
        if (dados.perfil === 'Recepção') {
          const existeRecep = db.config.recepcionistas.some((r) => r.id === dados.recepcaoId);
          if (!existeRecep) {
            localStorage.removeItem(SESSION_KEY);
            mostrarTelaLogin();
            return;
          }
        }
        iniciarSessao(dados, false);
        return;
      }
    } catch (e) {
      localStorage.removeItem(SESSION_KEY);
    }
  }
  mostrarTelaLogin();
}

function iniciarSessao(dados, salvarNoStorage = false) {
  sessaoAtual = dados;
  if (salvarNoStorage) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(dados));
  }

  document.getElementById('usuarioLogadoInfo').textContent = `${dados.usuario} (${dados.perfil})`;

  const tabMapa = document.getElementById('navTabMapa');
  const tabSaidas = document.getElementById('navTabSaidas');
  const tabCaixa = document.getElementById('navTabCaixa');
  const tabPagamentos = document.getElementById('navTabPagamentos');
  const tabGeral = document.getElementById('navTabGeral');
  const tabConfig = document.getElementById('navTabConfig');

  const cardFormMapa = document.getElementById('cardFormMapa');
  const thAcoesMapa = document.getElementById('thAcoesMapa');
  const hintMapaProf = document.getElementById('hintMapaProfissional');

  if (dados.perfil === 'Profissional') {
    tabMapa.classList.remove('hidden');
    tabPagamentos.classList.remove('hidden');
    tabSaidas.classList.add('hidden');
    tabCaixa.classList.add('hidden');
    tabGeral.classList.add('hidden');
    tabConfig.classList.add('hidden');

    cardFormMapa.classList.add('hidden');
    thAcoesMapa.classList.add('hidden');
    hintMapaProf.textContent = 'Visualização somente leitura dos seus atendimentos (venda ou execução) lançados no dia.';
    hintMapaProf.classList.remove('hidden');
    abasDesbloqueadas = { geral: false, config: false };
  } else if (dados.perfil === 'Recepção') {
    tabMapa.classList.remove('hidden');
    tabSaidas.classList.remove('hidden');
    tabCaixa.classList.remove('hidden');
    tabPagamentos.classList.add('hidden');
    tabGeral.classList.add('hidden');
    tabConfig.classList.add('hidden');

    cardFormMapa.classList.remove('hidden');
    thAcoesMapa.classList.remove('hidden');
    hintMapaProf.classList.add('hidden');
    abasDesbloqueadas = { geral: false, config: false };
  } else {
    tabMapa.classList.remove('hidden');
    tabSaidas.classList.remove('hidden');
    tabCaixa.classList.remove('hidden');
    tabPagamentos.classList.remove('hidden');
    tabGeral.classList.remove('hidden');
    tabConfig.classList.remove('hidden');

    cardFormMapa.classList.remove('hidden');
    thAcoesMapa.classList.remove('hidden');
    hintMapaProf.classList.add('hidden');
    abasDesbloqueadas = { geral: true, config: true };
  }

  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  ativarAba('mapa');
}

function encerrarSessao() {
  sessaoAtual = null;
  abasDesbloqueadas = { geral: false, config: false };
  localStorage.removeItem(SESSION_KEY);
  document.getElementById('loginSenha').value = '';
  mostrarTelaLogin();
}

function mostrarTelaLogin() {
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

// ==================== CONEXÃO & FILA LOCAL ====================
function configurarConexao() {
  const atualizarStatus = async () => {
    const badge = document.getElementById('statusConexao');
    const txt = document.getElementById('statusTexto');
    const loginBadge = document.getElementById('loginStatusBadge');
    const loginTxt = document.getElementById('loginStatusTexto');

    if (navigator.onLine) {
      badge.className = 'status-badge online';
      txt.textContent = 'Online';
      loginBadge.className = 'status-pill-light online';
      loginTxt.textContent = 'Sistema Online e Sincronizado';
      if (db.config.gasUrl) {
        await sincronizarFila();
        await buscarDadosDaNuvem();
      }
    } else {
      badge.className = 'status-badge offline';
      txt.textContent = 'Offline (Local)';
      loginBadge.className = 'status-pill-light offline';
      loginTxt.textContent = 'Modo Offline Ativo (Local)';
    }
  };

  window.addEventListener('online', atualizarStatus);
  window.addEventListener('offline', atualizarStatus);
  document.getElementById('btnSincronizar').addEventListener('click', async () => {
    if (!db.config.gasUrl) {
      alert('Armazenamento em nuvem ainda não configurado. Os dados estão salvos localmente no navegador.');
      return;
    }
    await sincronizarFila(true);
    await buscarDadosDaNuvem();
  });
  atualizarStatus();
}

function enfileirarSync(acao, payload) {
  if (!db.config.gasUrl) return;
  db.filaSync.push({
    id: gerarId(),
    timestamp: new Date().toISOString(),
    acao,
    payload
  });
  salvarDB();
  if (navigator.onLine) sincronizarFila();
}

function atualizarBadgePendentes() {
  const badge = document.getElementById('badgePendentes');
  if (badge) badge.textContent = db.filaSync.length;
}

async function sincronizarFila(manual = false) {
  atualizarBadgePendentes();
  if (!navigator.onLine) {
    if (manual) alert('Sem conexão com a internet. Os dados estão salvos localmente.');
    return;
  }
  if (!db.config.gasUrl || db.filaSync.length === 0) return;

  const txt = document.getElementById('statusTexto');
  txt.textContent = 'Enviando...';

  try {
    const lote = [...db.filaSync];
    const resp = await fetch(db.config.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ tipo: 'SYNC_LOTE', itens: lote })
    });

    if (!resp.ok) throw new Error('Falha HTTP ' + resp.status);

    const idsEnviados = new Set(lote.map((i) => i.id));
    db.filaSync = db.filaSync.filter((i) => !idsEnviados.has(i.id));
    salvarDB();
    txt.textContent = 'Online';
    if (manual) alert('Dados sincronizados com sucesso!');
  } catch (err) {
    console.error('Erro na sincronização:', err);
    txt.textContent = 'Erro Sync';
  }
}

async function buscarDadosDaNuvem() {
  if (!navigator.onLine || !db.config.gasUrl || db.filaSync.length > 0) return;

  const txt = document.getElementById('statusTexto');
  txt.textContent = 'Atualizando...';

  try {
    const resp = await fetch(db.config.gasUrl);
    const json = await resp.json();

    if (json.status === 'ok') {
      db.atendimentos = json.atendimentos || [];
      db.saidas = json.saidas || [];
      db.pagamentosDentistas = json.pagamentosDentistas || {};
      if (json.config) {
        const dentistasNuvem = Array.isArray(json.config.dentistas)
          ? json.config.dentistas.map((d, i) => normalizarUsuarioItem(d, 'd_', i))
          : db.config.dentistas;
        const recepNuvem = Array.isArray(json.config.recepcionistas)
          ? json.config.recepcionistas.map((r, i) => normalizarUsuarioItem(r, 'r_', i))
          : db.config.recepcionistas;
        db.config = {
          ...db.config,
          ...json.config,
          clinica: {
            ...db.config.clinica,
            ...(json.config.clinica || {})
          },
          dentistas: dentistasNuvem,
          recepcionistas: recepNuvem,
          percentualVenda:
            json.config.percentualVenda !== undefined
              ? Number(json.config.percentualVenda)
              : db.config.percentualVenda,
          gasUrl: db.config.gasUrl
        };
      }
      salvarDB();
      atualizarCabecalhoClinica();
      popularSelects();
      renderizarTudo();
    }
    txt.textContent = 'Online';
  } catch (err) {
    console.error('Erro ao baixar dados da nuvem:', err);
    txt.textContent = 'Online (Local)';
  }
}

// ==================== NAVEGAÇÃO & PROTEÇÃO POR SENHA ====================
function configurarNavegacao() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      const isProtected = btn.dataset.protected === 'true';

      if (isProtected && !abasDesbloqueadas[target]) {
        abaPendenteSenha = target;
        abrirModalSenha();
        return;
      }
      ativarAba(target);
    });
  });

  document.getElementById('btnBloquearGeral')?.addEventListener('click', () => {
    abasDesbloqueadas.geral = false;
    ativarAba('mapa');
  });

  document.getElementById('btnBloquearConfig')?.addEventListener('click', () => {
    abasDesbloqueadas.config = false;
    ativarAba('mapa');
  });
}

function ativarAba(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach((s) => s.classList.toggle('active', s.id === `tab-${tabName}`));
  renderizarTudo();
}

function configurarModalSenha() {
  const modal = document.getElementById('modalSenha');
  const input = document.getElementById('inputSenhaAcesso');
  const erro = document.getElementById('erroSenha');

  const validar = () => {
    const senhaDigitada = input.value.trim();

    if (senhaDigitada === ADMIN_SENHA) {
      abasDesbloqueadas[abaPendenteSenha] = true;
      modal.classList.add('hidden');
      erro.classList.add('hidden');
      input.value = '';
      ativarAba(abaPendenteSenha);
    } else {
      erro.classList.remove('hidden');
    }
  };

  document.getElementById('btnConfirmarSenha').addEventListener('click', validar);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') validar(); });
  document.getElementById('btnCancelarSenha').addEventListener('click', () => {
    modal.classList.add('hidden');
    erro.classList.add('hidden');
    input.value = '';
  });
}

function abrirModalSenha() {
  const modal = document.getElementById('modalSenha');
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('inputSenhaAcesso').focus(), 50);
}

// ==================== LISTAS SUSPENSAS E CÁLCULOS ====================
function popularSelects() {
  const dentistasHTML = db.config.dentistas
    .map((dent) => `<option value="${escapeHTML(dent.id)}">${escapeHTML(dent.nome)}</option>`)
    .join('');

  document.getElementById('mDentistaVenda').innerHTML = dentistasHTML;
  document.getElementById('mDentistaExec').innerHTML = dentistasHTML;
  document.getElementById('sDentista').innerHTML =
    `<option value="">-- Nenhum (Despesa Geral) --</option>${dentistasHTML}`;

  document.getElementById('mEspecialidade').innerHTML = db.config.especialidades
    .map((esp) => `<option value="${escapeHTML(esp.nome)}">${escapeHTML(esp.nome)}</option>`)
    .join('');

  document.getElementById('mFormaPagamento').innerHTML = db.config.taxas
    .map((tx) => `<option value="${escapeHTML(tx.id)}">${escapeHTML(tx.nome)} (-${tx.taxa}%)</option>`)
    .join('');

  document.getElementById('sDescricao').innerHTML = db.config.categoriasSaida
    .map((cat) => `<option value="${escapeHTML(cat)}">${escapeHTML(cat)}</option>`)
    .join('');

  const selectAno = document.getElementById('filtroAno');
  if (selectAno && selectAno.options.length === 0) {
    const anoCorrente = new Date().getFullYear();
    const anosOpcoes = [];
    for (let y = anoCorrente; y >= anoCorrente - 3; y--) {
      anosOpcoes.push(`<option value="${y}">${y}</option>`);
    }
    selectAno.innerHTML = anosOpcoes.join('');
    selectAno.addEventListener('change', renderizarGeral);
  }
}

function calcularValoresMapa() {
  const espNome = document.getElementById('mEspecialidade').value;
  const formaId = document.getElementById('mFormaPagamento').value;
  const valorPago = Number(document.getElementById('mValorPago').value) || 0;
  const valorExecBruto = Number(document.getElementById('mValorExecBruto').value) || 0;
  const valorLab = Number(document.getElementById('mValorLab').value) || 0;

  const espItem = db.config.especialidades.find((item) => item.nome === espNome) || { percentual: 0 };
  const formaItem = db.config.taxas.find((item) => item.id === formaId) || { taxa: 0, nome: '' };
  const percVenda = Number(db.config.percentualVenda ?? 5);

  const fatorLiquido = 1 - formaItem.taxa / 100;
  const valorFinal = valorPago * fatorLiquido;
  const comissaoVenda = valorFinal * (percVenda / 100);

  const valorExecLiquido = valorExecBruto * fatorLiquido;
  const baseLiquidaExec = Math.max(0, valorExecLiquido - valorLab);
  const comissaoExec = baseLiquidaExec * (espItem.percentual / 100);

  return {
    espNome,
    formaId,
    formaNome: formaItem.nome,
    taxaAplicada: formaItem.taxa,
    percVenda,
    percEspecialidade: espItem.percentual,
    valorPago,
    valorFinal,
    comissaoVenda,
    valorExecBruto,
    valorExecLiquido,
    valorLab,
    comissaoExec,
    comissaoTotal: comissaoVenda + comissaoExec
  };
}

function atualizarPreviewMapa() {
  const resumo = calcularValoresMapa();
  document.getElementById('prevValorFinal').textContent = fmtBRL(resumo.valorFinal);
  document.getElementById('prevComVenda').textContent = fmtBRL(resumo.comissaoVenda);
  document.getElementById('prevExecLiq').textContent = fmtBRL(resumo.valorExecLiquido);
  document.getElementById('prevComExec').textContent = fmtBRL(resumo.comissaoExec);
  document.getElementById('prevComTotal').textContent = fmtBRL(resumo.comissaoTotal);
}

function resetarFormDentista() {
  document.getElementById('cfgDentistaEditId').value = '';
  document.getElementById('cfgDentistaNome').value = '';
  document.getElementById('cfgDentistaUsuario').value = '';
  document.getElementById('cfgDentistaSenha').value = '';
  document.getElementById('btnSalvarDentista').textContent = 'Adicionar';
  document.getElementById('btnCancelarEditDentista').classList.add('hidden');
}

function resetarFormRecepcao() {
  document.getElementById('cfgRecepcaoEditId').value = '';
  document.getElementById('cfgRecepcaoNome').value = '';
  document.getElementById('cfgRecepcaoUsuario').value = '';
  document.getElementById('cfgRecepcaoSenha').value = '';
  document.getElementById('btnSalvarRecepcao').textContent = 'Adicionar';
  document.getElementById('btnCancelarEditRecepcao').classList.add('hidden');
}

function usuarioJaExisteEmAlgumPerfil(loginDigitado, idIgnorado = '') {
  const normalizado = loginDigitado.trim().toLowerCase();
  if (normalizado === ADMIN_USUARIO) return true;

  const conflitoDentista = db.config.dentistas.some(
    (d) => d.id !== idIgnorado && String(d.usuario || '').trim().toLowerCase() === normalizado
  );
  const conflitoRecepcao = db.config.recepcionistas.some(
    (r) => r.id !== idIgnorado && String(r.usuario || '').trim().toLowerCase() === normalizado
  );

  return conflitoDentista || conflitoRecepcao;
}

// ==================== EVENTOS DOS FORMULÁRIOS ====================
function configurarFormularios() {
  const campoPago = document.getElementById('mValorPago');
  const campoExec = document.getElementById('mValorExecBruto');

  campoPago.addEventListener('input', () => {
    if (!campoExec.dataset.editadoManualmente) {
      campoExec.value = campoPago.value;
    }
    atualizarPreviewMapa();
  });

  campoExec.addEventListener('input', () => {
    campoExec.dataset.editadoManualmente = 'true';
    atualizarPreviewMapa();
  });

  ['mEspecialidade', 'mFormaPagamento', 'mValorLab'].forEach((campoId) => {
    const el = document.getElementById(campoId);
    el.addEventListener('change', atualizarPreviewMapa);
    el.addEventListener('input', atualizarPreviewMapa);
  });

  document.getElementById('formMapa').addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (sessaoAtual && sessaoAtual.perfil === 'Profissional') return;

    const valores = calcularValoresMapa();
    const registroAtendimento = {
      id: gerarId(),
      data: getDataAtiva(),
      paciente: document.getElementById('mPaciente').value.trim(),
      procedimento: document.getElementById('mProcedimento').value.trim(),
      dentistaVendaId: document.getElementById('mDentistaVenda').value,
      dentistaExecId: document.getElementById('mDentistaExec').value,
      ...valores
    };

    db.atendimentos.push(registroAtendimento);
    salvarDB();
    enfileirarSync('ADD_ATENDIMENTO', registroAtendimento);

    evento.target.reset();
    document.getElementById('mValorLab').value = '0';
    delete campoExec.dataset.editadoManualmente;
    atualizarPreviewMapa();
    renderizarTudo();
  });

  const selectSaida = document.getElementById('sDescricao');
  const selectDentistaSaida = document.getElementById('sDentista');
  const inputOutrosTexto = document.getElementById('sOutrosTexto');

  const atualizarCamposSaida = () => {
    const escolha = selectSaida.value;
    const isOutros = escolha === 'OUTROS';
    const isPagDentista = escolha === 'PAG. DENTISTAS';

    document.getElementById('boxOutros').classList.toggle('hidden', !isOutros);
    document.getElementById('boxDentistaDesconto').classList.toggle('hidden', !isPagDentista);

    if (inputOutrosTexto) inputOutrosTexto.required = isOutros;
    if (selectDentistaSaida) selectDentistaSaida.required = isPagDentista;
  };

  selectSaida.addEventListener('change', atualizarCamposSaida);

  document.getElementById('formSaidas').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const categoria = selectSaida.value;
    const textoOutros = inputOutrosTexto.value.trim();
    const dentistaId = selectDentistaSaida.value;

    const registroSaida = {
      id: gerarId(),
      data: getDataAtiva(),
      categoria,
      descricaoFinal: categoria === 'OUTROS' && textoOutros ? `OUTROS: ${textoOutros}` : categoria,
      dentistaId: dentistaId || null,
      origem: document.getElementById('sOrigem').value,
      valor: Number(document.getElementById('sValor').value) || 0,
      obs: document.getElementById('sObs').value.trim()
    };

    db.saidas.push(registroSaida);
    salvarDB();
    enfileirarSync('ADD_SAIDA', registroSaida);

    evento.target.reset();
    atualizarCamposSaida();
    renderizarTudo();
  });

  document.getElementById('formDadosClinica').addEventListener('submit', (evento) => {
    evento.preventDefault();
    db.config.clinica = {
      nome: document.getElementById('cfgClinicaNome').value.trim(),
      razaoSocial: document.getElementById('cfgClinicaRazao').value.trim(),
      cnpj: document.getElementById('cfgClinicaCnpj').value.trim(),
      cro: document.getElementById('cfgClinicaCro').value.trim(),
      telefone: document.getElementById('cfgClinicaTelefone').value.trim(),
      email: document.getElementById('cfgClinicaEmail').value.trim(),
      endereco: document.getElementById('cfgClinicaEndereco').value.trim()
    };
    salvarDB();
    atualizarCabecalhoClinica();
    enfileirarSync('UPDATE_CONFIG', db.config);
    alert('Dados da clínica salvos com sucesso!');
  });

  document.getElementById('formAddDentista').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const editId = document.getElementById('cfgDentistaEditId').value;
    const nome = document.getElementById('cfgDentistaNome').value.trim();
    const usuario = document.getElementById('cfgDentistaUsuario').value.trim();
    const senha = document.getElementById('cfgDentistaSenha').value.trim();

    if (!nome || !usuario || !senha) return;
    if (usuarioJaExisteEmAlgumPerfil(usuario, editId)) {
      alert('Este nome de usuário já está em uso em outro cadastro.');
      return;
    }

    if (editId) {
      const posicao = db.config.dentistas.findIndex((item) => item.id === editId);
      if (posicao !== -1) db.config.dentistas[posicao] = { id: editId, nome, usuario, senha };
    } else {
      db.config.dentistas.push({ id: 'd_' + gerarId(), nome, usuario, senha });
    }

    salvarDB();
    enfileirarSync('UPDATE_CONFIG', db.config);
    resetarFormDentista();
    popularSelects();
    renderizarConfig();
  });

  document.getElementById('btnCancelarEditDentista').addEventListener('click', resetarFormDentista);

  document.getElementById('formAddRecepcao').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const editId = document.getElementById('cfgRecepcaoEditId').value;
    const nome = document.getElementById('cfgRecepcaoNome').value.trim();
    const usuario = document.getElementById('cfgRecepcaoUsuario').value.trim();
    const senha = document.getElementById('cfgRecepcaoSenha').value.trim();

    if (!nome || !usuario || !senha) return;
    if (usuarioJaExisteEmAlgumPerfil(usuario, editId)) {
      alert('Este nome de usuário já está em uso em outro cadastro.');
      return;
    }

    if (editId) {
      const posicao = db.config.recepcionistas.findIndex((item) => item.id === editId);
      if (posicao !== -1) db.config.recepcionistas[posicao] = { id: editId, nome, usuario, senha };
    } else {
      db.config.recepcionistas.push({ id: 'r_' + gerarId(), nome, usuario, senha });
    }

    salvarDB();
    enfileirarSync('UPDATE_CONFIG', db.config);
    resetarFormRecepcao();
    renderizarConfig();
  });

  document.getElementById('btnCancelarEditRecepcao').addEventListener('click', resetarFormRecepcao);

  document.getElementById('formAddEspecialidade').addEventListener('submit', (evento) => {
    evento.preventDefault();
    db.config.especialidades.push({
      nome: document.getElementById('cfgEspNome').value.trim().toUpperCase(),
      percentual: Number(document.getElementById('cfgEspPerc').value) || 0
    });
    salvarDB();
    enfileirarSync('UPDATE_CONFIG', db.config);
    evento.target.reset();
    popularSelects();
    renderizarConfig();
  });

  document.getElementById('btnSalvarComissaoVenda').addEventListener('click', () => {
    const novoPerc = Number(document.getElementById('cfgComissaoVenda').value);
    db.config.percentualVenda = Number.isNaN(novoPerc) || novoPerc < 0 ? 0 : novoPerc;
    salvarDB();
    enfileirarSync('UPDATE_CONFIG', db.config);
    atualizarPreviewMapa();
    alert(`Comissão de venda atualizada para ${db.config.percentualVenda}%!`);
  });

  document.getElementById('formAddSaidaCat').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const novaCat = document.getElementById('cfgSaidaNome').value.trim().toUpperCase();
    if (novaCat && !db.config.categoriasSaida.includes(novaCat)) {
      db.config.categoriasSaida.push(novaCat);
      salvarDB();
      enfileirarSync('UPDATE_CONFIG', db.config);
      popularSelects();
      renderizarConfig();
    }
    evento.target.reset();
  });

  document.getElementById('btnSalvarSistema').addEventListener('click', () => {
    db.config.gasUrl = document.getElementById('cfgGasUrl').value.trim();
    salvarDB();
    enfileirarSync('UPDATE_CONFIG', db.config);
    alert('Configurações salvas localmente!');
  });
}

// ==================== RENDERIZAÇÃO DAS ABAS OPERACIONAIS ====================
function renderizarTudo() {
  renderizarMapa();
  renderizarSaidas();
  renderizarDiarioCaixa();
  renderizarPagamentosDentistas();
  if (abasDesbloqueadas.geral) renderizarGeral();
  if (abasDesbloqueadas.config) renderizarConfig();
}

function nomeDentista(dentistaId) {
  const encontrado = db.config.dentistas.find((item) => item.id === dentistaId);
  return encontrado ? encontrado.nome : 'Removido';
}

function renderizarMapa() {
  const dataSelecionada = getDataAtiva();
  const modoLeitura = sessaoAtual && sessaoAtual.perfil === 'Profissional';

  const registrosDia = db.atendimentos.filter((item) => {
    if (item.data !== dataSelecionada) return false;
    if (modoLeitura && sessaoAtual.dentistaId) {
      return item.dentistaVendaId === sessaoAtual.dentistaId || item.dentistaExecId === sessaoAtual.dentistaId;
    }
    return true;
  });

  const corpoTabela = document.querySelector('#tabelaMapa tbody');
  if (!corpoTabela) return;

  corpoTabela.innerHTML = registrosDia
    .map((atend) => {
      const colunaAcao = modoLeitura
        ? ''
        : `<td><button type="button" class="btn-danger-sm" onclick="excluirAtendimento('${escapeHTML(atend.id)}')">Excluir</button></td>`;

      return `
      <tr>
        <td><strong>${escapeHTML(atend.paciente)}</strong></td>
        <td>${escapeHTML(atend.procedimento)}<br><small class="hint">${escapeHTML(atend.espNome)}</small></td>
        <td>${escapeHTML(atend.formaNome)}<br><small class="hint">Taxa: ${Number(atend.taxaAplicada) || 0}%</small></td>
        <td>${fmtBRL(atend.valorPago)}</td>
        <td><strong>${fmtBRL(atend.valorFinal)}</strong></td>
        <td>${escapeHTML(nomeDentista(atend.dentistaVendaId))}<br><span class="text-success">${fmtBRL(atend.comissaoVenda)}</span></td>
        <td>${fmtBRL(atend.valorExecLiquido)}</td>
        <td>${fmtBRL(atend.valorLab)}</td>
        <td>${escapeHTML(nomeDentista(atend.dentistaExecId))}<br><span class="text-success">${fmtBRL(atend.comissaoExec)}</span></td>
        ${colunaAcao}
      </tr>`;
    })
    .join('');
}

window.excluirAtendimento = function (atendimentoId) {
  if (sessaoAtual && sessaoAtual.perfil === 'Profissional') return;
  if (!confirm('Deseja excluir este atendimento?')) return;

  db.atendimentos = db.atendimentos.filter((item) => item.id !== atendimentoId);
  salvarDB();
  enfileirarSync('DELETE_ATENDIMENTO', { id: atendimentoId });
  renderizarTudo();
};

function renderizarSaidas() {
  const dataSelecionada = getDataAtiva();
  const saidasDia = db.saidas.filter((item) => item.data === dataSelecionada);
  const corpoTabela = document.querySelector('#tabelaSaidas tbody');
  if (!corpoTabela) return;

  let somaSaidas = 0;
  corpoTabela.innerHTML = saidasDia
    .map((saida) => {
      somaSaidas += Number(saida.valor) || 0;
      const dentistaLabel = saida.dentistaId ? nomeDentista(saida.dentistaId) : '-';

      return `
      <tr>
        <td><strong>${escapeHTML(saida.descricaoFinal)}</strong></td>
        <td>${escapeHTML(dentistaLabel)}</td>
        <td>${escapeHTML(saida.origem)}</td>
        <td class="text-danger"><strong>${fmtBRL(saida.valor)}</strong></td>
        <td>${escapeHTML(saida.obs || '-')}</td>
        <td><button type="button" class="btn-danger-sm" onclick="excluirSaida('${escapeHTML(saida.id)}')">Excluir</button></td>
      </tr>`;
    })
    .join('');

  document.getElementById('saidasTotalDia').textContent = fmtBRL(somaSaidas);
}

window.excluirSaida = function (saidaId) {
  if (!confirm('Deseja excluir esta saída?')) return;

  db.saidas = db.saidas.filter((item) => item.id !== saidaId);
  salvarDB();
  enfileirarSync('DELETE_SAIDA', { id: saidaId });
  renderizarTudo();
};

function renderizarDiarioCaixa() {
  const dataSelecionada = getDataAtiva();
  const atendimentosDia = db.atendimentos.filter((item) => item.data === dataSelecionada);
  const saidasDia = db.saidas.filter((item) => item.data === dataSelecionada);

  let totalBruto = 0;
  let totalLiquido = 0;
  let entradasDinheiro = 0;
  const resumoModalidades = {};

  atendimentosDia.forEach((atend) => {
    totalBruto += Number(atend.valorPago) || 0;
    totalLiquido += Number(atend.valorFinal) || 0;

    if (atend.formaId === 'dinheiro') {
      entradasDinheiro += Number(atend.valorPago) || 0;
    }

    if (!resumoModalidades[atend.formaNome]) {
      resumoModalidades[atend.formaNome] = { bruto: 0, liquido: 0 };
    }
    resumoModalidades[atend.formaNome].bruto += Number(atend.valorPago) || 0;
    resumoModalidades[atend.formaNome].liquido += Number(atend.valorFinal) || 0;
  });

  const saidasGaveta = saidasDia
    .filter((s) => s.origem === 'Gaveta')
    .reduce((soma, s) => soma + (Number(s.valor) || 0), 0);

  const saidasReais = saidasDia
    .filter((s) => s.origem !== 'Desconto Produção')
    .reduce((soma, s) => soma + (Number(s.valor) || 0), 0);

  document.getElementById('cxBruto').textContent = fmtBRL(totalBruto);
  document.getElementById('cxLiquido').textContent = fmtBRL(totalLiquido);
  document.getElementById('cxGaveta').textContent = fmtBRL(entradasDinheiro - saidasGaveta);
  document.getElementById('cxSaidas').textContent = fmtBRL(saidasReais);

  const linhasModalidades = Object.entries(resumoModalidades)
    .map(
      ([modalidade, vals]) =>
        `<tr><td>${escapeHTML(modalidade)}</td><td>${fmtBRL(vals.bruto)}</td><td><strong>${fmtBRL(vals.liquido)}</strong></td></tr>`
    )
    .join('');

  document.getElementById('cxModalidadesBody').innerHTML =
    linhasModalidades || '<tr><td colspan="3">Sem movimentação nesta data.</td></tr>';

  const acumuladoCredito = {};
  db.atendimentos
    .filter((atend) => String(atend.formaId || '').startsWith('credito'))
    .forEach((atend) => {
      if (!acumuladoCredito[atend.formaNome]) {
        acumuladoCredito[atend.formaNome] = { qtd: 0, total: 0 };
      }
      acumuladoCredito[atend.formaNome].qtd += 1;
      acumuladoCredito[atend.formaNome].total += Number(atend.valorPago) || 0;
    });

  const linhasCredito = Object.entries(acumuladoCredito)
    .sort((a, b) => b[1].qtd - a[1].qtd)
    .map(
      ([modalidade, dados]) =>
        `<tr><td><strong>${escapeHTML(modalidade)}</strong></td><td>${dados.qtd} vendas</td><td>${fmtBRL(dados.total)}</td></tr>`
    )
    .join('');

  document.getElementById('cxRankingCreditoBody').innerHTML =
    linhasCredito || '<tr><td colspan="3">Nenhuma venda no crédito registrada ainda.</td></tr>';
}

function renderizarPagamentosDentistas() {
  const dataSelecionada = getDataAtiva();
  const atendimentosDia = db.atendimentos.filter((item) => item.data === dataSelecionada);
  const saidasDia = db.saidas.filter((item) => item.data === dataSelecionada);
  const corpoTabela = document.querySelector('#tabelaPagamentos tbody');
  if (!corpoTabela) return;

  const isProfissional = sessaoAtual && sessaoAtual.perfil === 'Profissional';
  const tituloEl = document.getElementById('tituloPagamentosDentista');
  const hintEl = document.getElementById('hintPagamentosDentista');

  if (isProfissional) {
    tituloEl.textContent = `Minha Produção & Repasse — ${sessaoAtual.usuario}`;
    hintEl.textContent = 'Visualização individual da sua produção e repasses do dia.';
  } else {
    tituloEl.textContent = 'Fechamento & Repasse aos Dentistas (Dia)';
    hintEl.textContent = 'Preencha o valor pago no dia. O sistema impede saldo negativo.';
  }

  const dentistasExibidos = isProfissional
    ? db.config.dentistas.filter((d) => d.id === sessaoAtual.dentistaId)
    : db.config.dentistas;

  corpoTabela.innerHTML = dentistasExibidos
    .map((dent) => {
      const totalVendido = atendimentosDia
        .filter((a) => a.dentistaVendaId === dent.id)
        .reduce((soma, a) => soma + (Number(a.valorFinal) || 0), 0);

      const comissaoVenda = atendimentosDia
        .filter((a) => a.dentistaVendaId === dent.id)
        .reduce((soma, a) => soma + (Number(a.comissaoVenda) || 0), 0);

      const comissaoExec = atendimentosDia
        .filter((a) => a.dentistaExecId === dent.id)
        .reduce((soma, a) => soma + (Number(a.comissaoExec) || 0), 0);

      const producaoBruta = comissaoVenda + comissaoExec;

      const descontosDentista = saidasDia
        .filter((s) => s.dentistaId === dent.id)
        .reduce((soma, s) => soma + (Number(s.valor) || 0), 0);

      const liquidoReceber = Math.max(0, producaoBruta - descontosDentista);
      const chavePagamento = `${dataSelecionada}_${dent.id}`;
      const valorPago = Number(db.pagamentosDentistas[chavePagamento]) || 0;
      const saldoRestante = Math.max(0, liquidoReceber - valorPago);

      const celulaPago = isProfissional
        ? `<strong>${fmtBRL(valorPago)}</strong>`
        : `<input type="number" step="0.01" min="0" max="${liquidoReceber.toFixed(2)}"
            value="${valorPago}"
            onchange="registrarPagamentoDentista('${escapeHTML(dent.id)}', this.value, ${liquidoReceber})"
            style="width: 110px;" />`;

      return `
      <tr>
        <td><strong>${escapeHTML(dent.nome)}</strong><br><small class="hint">@${escapeHTML(dent.usuario)}</small></td>
        <td>${fmtBRL(totalVendido)}</td>
        <td>${fmtBRL(comissaoVenda)}</td>
        <td>${fmtBRL(comissaoExec)}</td>
        <td><strong>${fmtBRL(producaoBruta)}</strong></td>
        <td class="text-danger">${fmtBRL(descontosDentista)}</td>
        <td><strong>${fmtBRL(liquidoReceber)}</strong></td>
        <td>${celulaPago}</td>
        <td class="${saldoRestante > 0 ? 'text-danger' : 'text-success'}"><strong>${fmtBRL(saldoRestante)}</strong></td>
      </tr>`;
    })
    .join('');
}

window.registrarPagamentoDentista = function (dentistaId, valorDigitado, tetoMaximo) {
  const dataSelecionada = getDataAtiva();
  let valorNumerico = Number(valorDigitado) || 0;
  if (valorNumerico < 0) valorNumerico = 0;

  if (valorNumerico > tetoMaximo) {
    alert(
      `O valor pago (${fmtBRL(valorNumerico)}) não pode ser maior que o total a receber (${fmtBRL(tetoMaximo)}) para não gerar saldo negativo.`
    );
    valorNumerico = tetoMaximo;
  }

  const chavePagamento = `${dataSelecionada}_${dentistaId}`;
  db.pagamentosDentistas[chavePagamento] = valorNumerico;
  salvarDB();
  enfileirarSync('PAGAMENTO_DENTISTA', {
    data: dataSelecionada,
    dentistaId,
    valorPago: valorNumerico
  });
  renderizarPagamentosDentistas();
};

// ==================== PAINEL GERENCIAL ANUAL ====================
window.abrirDemonstrativoDoMes = function (mesNumero) {
  const seletorMes = document.getElementById('filtroMesDemo');
  if (seletorMes) {
    seletorMes.value = mesNumero;
    const anoSelecionado = document.getElementById('filtroAno')?.value || String(new Date().getFullYear());
    renderizarDemonstrativoMensal(anoSelecionado);
    document.getElementById('cardDemonstrativoMensal')?.scrollIntoView({ behavior: 'smooth' });
  }
};

function renderizarGeral() {
  const seletorAno = document.getElementById('filtroAno');
  const anoSelecionado = seletorAno?.value || String(new Date().getFullYear());
  const rotulosMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const atendimentosAno = db.atendimentos.filter((item) => String(item.data || '').startsWith(anoSelecionado));
  const saidasAno = db.saidas.filter((item) => String(item.data || '').startsWith(anoSelecionado));

  let receitaBrutaTotal = 0;
  let receitaLiquidaTotal = 0;
  let custoLaboratorioTotal = 0;

  atendimentosAno.forEach((item) => {
    receitaBrutaTotal += Number(item.valorPago) || 0;
    receitaLiquidaTotal += Number(item.valorFinal) || 0;
    custoLaboratorioTotal += Number(item.valorLab) || 0;
  });

  const despesaOperacionalTotal = saidasAno
    .filter((item) => item.origem !== 'Desconto Produção')
    .reduce((acc, item) => acc + (Number(item.valor) || 0), 0);

  const taxasMaquinetaTotal = Math.max(0, receitaBrutaTotal - receitaLiquidaTotal);
  const lucroAnual = receitaLiquidaTotal - despesaOperacionalTotal;
  const margemLucro = receitaLiquidaTotal > 0 ? (lucroAnual / receitaLiquidaTotal) * 100 : 0;
  const ticketMedio = atendimentosAno.length > 0 ? receitaBrutaTotal / atendimentosAno.length : 0;

  // 1. KPIs Estratégicos (IDs alinhados com index.html)
  document.getElementById('kpiAnualLiquido').textContent = fmtBRL(receitaLiquidaTotal);
  document.getElementById('kpiAnualBrutoSub').textContent = `Bruto: ${fmtBRL(receitaBrutaTotal)}`;

  const elLucro = document.getElementById('kpiAnualLucro');
  elLucro.textContent = fmtBRL(lucroAnual);
  elLucro.className = lucroAnual >= 0 ? 'text-success' : 'text-danger';
  document.getElementById('kpiAnualMargem').textContent = `Margem: ${margemLucro.toFixed(1)}%`;

  document.getElementById('kpiAnualTaxas').textContent = fmtBRL(taxasMaquinetaTotal);
  document.getElementById('kpiAnualTicket').textContent = fmtBRL(ticketMedio);
  document.getElementById('kpiAnualAtendimentos').textContent = `${atendimentosAno.length} atendimentos no ano`;
  document.getElementById('kpiAnualLab').textContent = fmtBRL(custoLaboratorioTotal);

  // 2. Consolidação Mês a Mês
  const resumoMensal = [];
  let maiorValorGrafico = 1;
  let totalDinheiroAno = 0;
  let totalPixAno = 0;
  let totalDebitoAno = 0;
  let totalCreditoAno = 0;

  for (let idx = 0; idx < 12; idx++) {
    const mesNumero = String(idx + 1).padStart(2, '0');
    const prefixoMes = `${anoSelecionado}-${mesNumero}`;

    const atendMes = atendimentosAno.filter((a) => String(a.data || '').startsWith(prefixoMes));
    const saidasMes = saidasAno.filter((s) => String(s.data || '').startsWith(prefixoMes));

    const liquidoMes = atendMes.reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
    const despesasMes = saidasMes
      .filter((s) => s.origem !== 'Desconto Produção')
      .reduce((s, item) => s + (Number(item.valor) || 0), 0);
    const resultadoMes = liquidoMes - despesasMes;

    const dinheiroMes = atendMes
      .filter((a) => a.formaId === 'dinheiro')
      .reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
    const pixMes = atendMes
      .filter((a) => a.formaId === 'pix')
      .reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
    const debitoMes = atendMes
      .filter((a) => a.formaId === 'debito')
      .reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
    const creditoMes = atendMes
      .filter((a) => String(a.formaId || '').startsWith('credito'))
      .reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);

    totalDinheiroAno += dinheiroMes;
    totalPixAno += pixMes;
    totalDebitoAno += debitoMes;
    totalCreditoAno += creditoMes;

    if (liquidoMes > maiorValorGrafico) maiorValorGrafico = liquidoMes;
    if (despesasMes > maiorValorGrafico) maiorValorGrafico = despesasMes;

    resumoMensal.push({
      indice: idx,
      mesNumero,
      mesNome: rotulosMeses[idx],
      liquido: liquidoMes,
      despesas: despesasMes,
      resultado: resultadoMes,
      dinheiro: dinheiroMes,
      pix: pixMes,
      debito: debitoMes,
      credito: creditoMes
    });
  }

  // Gráfico de Barras
  const containerGrafico = document.getElementById('graficoAnualBarras');
  if (containerGrafico) {
    containerGrafico.innerHTML = resumoMensal
      .map((m) => {
        const alturaRec = Math.round((m.liquido / maiorValorGrafico) * 145);
        const alturaDesp = Math.round((m.despesas / maiorValorGrafico) * 145);
        return `
        <div class="bar-col" title="${m.mesNome}/${anoSelecionado} — Receita: ${fmtBRL(m.liquido)} | Despesa: ${fmtBRL(m.despesas)}">
          <div class="bar-pair">
            <div class="bar-item rev" style="height: ${Math.max(3, alturaRec)}px;"></div>
            <div class="bar-item exp" style="height: ${Math.max(3, alturaDesp)}px;"></div>
          </div>
          <span class="bar-label">${m.mesNome}</span>
        </div>`;
      })
      .join('');
  }

  // 3. Tabela Consolidada Mês a Mês (9 colunas alinhadas com tabelaGeralMeses)
  const corpoTabelaMeses = document.querySelector('#tabelaGeralMeses tbody');
  if (corpoTabelaMeses) {
    corpoTabelaMeses.innerHTML = resumoMensal
      .map(
        (m) => `
        <tr>
          <td><strong>${m.mesNome}/${anoSelecionado}</strong></td>
          <td>${fmtBRL(m.liquido)}</td>
          <td class="text-danger">${fmtBRL(m.despesas)}</td>
          <td class="${m.resultado >= 0 ? 'text-success' : 'text-danger'}"><strong>${fmtBRL(m.resultado)}</strong></td>
          <td>${fmtBRL(m.dinheiro)}</td>
          <td>${fmtBRL(m.pix)}</td>
          <td>${fmtBRL(m.debito)}</td>
          <td>${fmtBRL(m.credito)}</td>
          <td>
            <button type="button" class="btn-edit-sm" onclick="abrirDemonstrativoDoMes('${m.mesNumero}')">
              Demonstrativo
            </button>
          </td>
        </tr>`
      )
      .join('');
  }

  const rodapeTabelaMeses = document.getElementById('tabelaGeralMesesFoot');
  if (rodapeTabelaMeses) {
    rodapeTabelaMeses.innerHTML = `
      <tr class="row-total">
        <td>TOTAL ${anoSelecionado}</td>
        <td>${fmtBRL(receitaLiquidaTotal)}</td>
        <td class="text-danger">${fmtBRL(despesaOperacionalTotal)}</td>
        <td class="${lucroAnual >= 0 ? 'text-success' : 'text-danger'}">${fmtBRL(lucroAnual)}</td>
        <td>${fmtBRL(totalDinheiroAno)}</td>
        <td>${fmtBRL(totalPixAno)}</td>
        <td>${fmtBRL(totalDebitoAno)}</td>
        <td>${fmtBRL(totalCreditoAno)}</td>
        <td>-</td>
      </tr>
      <tr class="row-media">
        <td>MÉDIA MENSAL</td>
        <td>${fmtBRL(receitaLiquidaTotal / 12)}</td>
        <td>${fmtBRL(despesaOperacionalTotal / 12)}</td>
        <td>${fmtBRL(lucroAnual / 12)}</td>
        <td>${fmtBRL(totalDinheiroAno / 12)}</td>
        <td>${fmtBRL(totalPixAno / 12)}</td>
        <td>${fmtBRL(totalDebitoAno / 12)}</td>
        <td>${fmtBRL(totalCreditoAno / 12)}</td>
        <td>-</td>
      </tr>`;
  }

  // 4. Desempenho Anual por Dentista (8 colunas alinhadas com tabelaGeralDentistas)
  const corpoDentistasAnual = document.querySelector('#tabelaGeralDentistas tbody');
  if (corpoDentistasAnual) {
    corpoDentistasAnual.innerHTML = db.config.dentistas
      .map((dent) => {
        const vendidoAno = atendimentosAno
          .filter((a) => a.dentistaVendaId === dent.id)
          .reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);

        const comissaoVendaAno = atendimentosAno
          .filter((a) => a.dentistaVendaId === dent.id)
          .reduce((s, a) => s + (Number(a.comissaoVenda) || 0), 0);

        const comissaoExecAno = atendimentosAno
          .filter((a) => a.dentistaExecId === dent.id)
          .reduce((s, a) => s + (Number(a.comissaoExec) || 0), 0);

        const producaoTotalAno = comissaoVendaAno + comissaoExecAno;

        const descontosAno = saidasAno
          .filter((s) => s.dentistaId === dent.id)
          .reduce((s, a) => s + (Number(a.valor) || 0), 0);

        const totalPagoAno = Object.entries(db.pagamentosDentistas || {})
          .filter(([chave]) => chave.startsWith(anoSelecionado) && chave.endsWith(`_${dent.id}`))
          .reduce((s, [, val]) => s + (Number(val) || 0), 0);

        const liquidoDevidoAno = Math.max(0, producaoTotalAno - descontosAno);
        const saldoPendenteAno = Math.max(0, liquidoDevidoAno - totalPagoAno);

        return `
        <tr>
          <td><strong>${escapeHTML(dent.nome)}</strong></td>
          <td>${fmtBRL(vendidoAno)}</td>
          <td>${fmtBRL(comissaoVendaAno)}</td>
          <td>${fmtBRL(comissaoExecAno)}</td>
          <td><strong>${fmtBRL(producaoTotalAno)}</strong></td>
          <td class="text-danger">${fmtBRL(descontosAno)}</td>
          <td>${fmtBRL(totalPagoAno)}</td>
          <td class="${saldoPendenteAno > 0 ? 'text-danger' : 'text-success'}"><strong>${fmtBRL(saldoPendenteAno)}</strong></td>
        </tr>`;
      })
      .join('');
  }

  // 5A. Despesas Detalhadas por Categoria (Ano)
  const corpoDespesasCat = document.getElementById('geralDespesasBody');
  if (corpoDespesasCat) {
    const mapaCategorias = {};
    let somaTotalCategorias = 0;

    saidasAno.forEach((s) => {
      const cat = s.categoria || 'OUTROS';
      const val = Number(s.valor) || 0;
      mapaCategorias[cat] = (mapaCategorias[cat] || 0) + val;
      somaTotalCategorias += val;
    });

    const linhasCat = Object.entries(mapaCategorias)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, total]) => {
        const perc = somaTotalCategorias > 0 ? (total / somaTotalCategorias) * 100 : 0;
        return `
        <tr>
          <td><strong>${escapeHTML(cat)}</strong></td>
          <td class="text-danger">${fmtBRL(total)}</td>
          <td>${perc.toFixed(1)}%</td>
        </tr>`;
      })
      .join('');

    corpoDespesasCat.innerHTML =
      linhasCat || '<tr><td colspan="3">Nenhuma despesa registrada neste ano.</td></tr>';
  }

  // 5B. Vendas por Especialidade (Ano)
  const corpoEspAno = document.getElementById('geralEspecialidadesBody');
  if (corpoEspAno) {
    const mapaEspecialidades = {};

    atendimentosAno.forEach((a) => {
      const esp = a.espNome || 'OUTROS';
      if (!mapaEspecialidades[esp]) {
        mapaEspecialidades[esp] = { qtd: 0, total: 0 };
      }
      mapaEspecialidades[esp].qtd += 1;
      mapaEspecialidades[esp].total += Number(a.valorFinal) || 0;
    });

    const linhasEsp = Object.entries(mapaEspecialidades)
      .sort((a, b) => b[1].total - a[1].total)
      .map(
        ([esp, dados]) => `
        <tr>
          <td><strong>${escapeHTML(esp)}</strong></td>
          <td>${dados.qtd}</td>
          <td class="text-success"><strong>${fmtBRL(dados.total)}</strong></td>
        </tr>`
      )
      .join('');

    corpoEspAno.innerHTML =
      linhasEsp || '<tr><td colspan="3">Nenhum atendimento registrado neste ano.</td></tr>';
  }

  // 6. Demonstrativo Mensal
  renderizarDemonstrativoMensal(anoSelecionado);
}

// ==================== DEMONSTRATIVO MENSAL E CONFIGURAÇÕES ====================
function renderizarDemonstrativoMensal(anoSelecionado) {
  const seletorMes = document.getElementById('filtroMesDemo');
  if (!seletorMes) return;

  if (seletorMes.options.length === 0) {
    const mesesNomes = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    seletorMes.innerHTML = mesesNomes
      .map((nome, idx) => `<option value="${String(idx + 1).padStart(2, '0')}">${nome}</option>`)
      .join('');
    seletorMes.value = String(new Date().getMonth() + 1).padStart(2, '0');
    seletorMes.addEventListener('change', () => {
      const anoAtualFiltro = document.getElementById('filtroAno')?.value || String(new Date().getFullYear());
      renderizarDemonstrativoMensal(anoAtualFiltro);
    });

    const btnImprimir = document.getElementById('btnImprimirDemo');
    if (btnImprimir) {
      btnImprimir.addEventListener('click', () => window.print());
    }
  }

  const mesEscolhido = seletorMes.value || '01';
  const prefixoPeriodo = `${anoSelecionado}-${mesEscolhido}`;
  const ultimoDiaMes = new Date(Number(anoSelecionado), Number(mesEscolhido), 0).getDate();
  const dataFechamentoFmt = `${String(ultimoDiaMes).padStart(2, '0')}/${mesEscolhido}/${anoSelecionado}`;

  const clinica = db.config.clinica || {};
  const nomeClinica = escapeHTML(clinica.nome || 'DôPin Saúde — Clínica Odontológica');
  const detalhesClinica = [
    clinica.razaoSocial ? `Razão Social: ${escapeHTML(clinica.razaoSocial)}` : '',
    clinica.cnpj ? `CNPJ/CPF: ${escapeHTML(clinica.cnpj)}` : '',
    clinica.cro ? `CRO: ${escapeHTML(clinica.cro)}` : '',
    clinica.telefone ? `Tel: ${escapeHTML(clinica.telefone)}` : '',
    clinica.endereco ? `End.: ${escapeHTML(clinica.endereco)}` : ''
  ].filter(Boolean).join(' • ');

  const atendimentosMes = db.atendimentos.filter((a) => String(a.data || '').startsWith(prefixoPeriodo));
  const saidasMes = db.saidas.filter((s) => String(s.data || '').startsWith(prefixoPeriodo));

  const receitaBruta = atendimentosMes.reduce((acc, a) => acc + (Number(a.valorPago) || 0), 0);
  const receitaLiquida = atendimentosMes.reduce((acc, a) => acc + (Number(a.valorFinal) || 0), 0);
  const taxasCartao = Math.max(0, receitaBruta - receitaLiquida);
  const despesasOperacionais = saidasMes
    .filter((s) => s.origem !== 'Desconto Produção')
    .reduce((acc, s) => acc + (Number(s.valor) || 0), 0);
  const resultadoLiquido = receitaLiquida - despesasOperacionais;

  const despesasPorCategoria = {};
  saidasMes.forEach((s) => {
    const cat = s.categoria || 'OUTROS';
    despesasPorCategoria[cat] = (despesasPorCategoria[cat] || 0) + (Number(s.valor) || 0);
  });

  const linhasDespesasHtml = Object.entries(despesasPorCategoria)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => `<tr><td>${escapeHTML(cat)}</td><td><strong>${fmtBRL(val)}</strong></td></tr>`)
    .join('') || '<tr><td colspan="2">Nenhuma despesa lançada neste mês.</td></tr>';

  const linhasDentistasHtml = db.config.dentistas
    .map((dent) => {
      const comVenda = atendimentosMes
        .filter((a) => a.dentistaVendaId === dent.id)
        .reduce((acc, a) => acc + (Number(a.comissaoVenda) || 0), 0);
      const comExec = atendimentosMes
        .filter((a) => a.dentistaExecId === dent.id)
        .reduce((acc, a) => acc + (Number(a.comissaoExec) || 0), 0);
      const descontos = saidasMes
        .filter((s) => s.dentistaId === dent.id)
        .reduce((acc, s) => acc + (Number(s.valor) || 0), 0);
      const totalRepasse = Math.max(0, comVenda + comExec - descontos);

      return `
        <tr>
          <td><strong>${escapeHTML(dent.nome)}</strong></td>
          <td>${fmtBRL(comVenda)}</td>
          <td>${fmtBRL(comExec)}</td>
          <td class="text-danger">${fmtBRL(descontos)}</td>
          <td><strong>${fmtBRL(totalRepasse)}</strong></td>
        </tr>`;
    })
    .join('');

  // ID alinhado com index.html: demonstrativoMensalConteudo
  const containerDemo = document.getElementById('demonstrativoMensalConteudo');
  if (containerDemo) {
    containerDemo.innerHTML = `
      <div class="demo-header-doc">
        <div>
          <h4>${nomeClinica}</h4>
          <p>${detalhesClinica || 'Configure os dados institucionais da clínica na aba Configurações.'}</p>
        </div>
        <div class="demo-meta-box">
          <strong>Demonstrativo Mensal de Fechamento</strong><br>
          Competência: ${mesEscolhido}/${anoSelecionado}<br>
          Fechado em: ${dataFechamentoFmt}
        </div>
      </div>

      <div class="demo-summary-grid">
        <div class="demo-box">
          <span>Receita Bruta</span>
          <strong>${fmtBRL(receitaBruta)}</strong>
        </div>
        <div class="demo-box">
          <span>Taxas de Cartão</span>
          <strong class="text-danger">${fmtBRL(taxasCartao)}</strong>
        </div>
        <div class="demo-box">
          <span>Receita Líquida</span>
          <strong>${fmtBRL(receitaLiquida)}</strong>
        </div>
        <div class="demo-box">
          <span>Despesas Operacionais</span>
          <strong class="text-danger">${fmtBRL(despesasOperacionais)}</strong>
        </div>
        <div class="demo-box">
          <span>Resultado Líquido</span>
          <strong class="${resultadoLiquido >= 0 ? 'text-success' : 'text-danger'}">${fmtBRL(resultadoLiquido)}</strong>
        </div>
      </div>

      <h5 class="demo-section-title">Despesas por Categoria</h5>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Total no Mês</th>
            </tr>
          </thead>
          <tbody>${linhasDespesasHtml}</tbody>
        </table>
      </div>

      <h5 class="demo-section-title">Resumo de Repasses aos Profissionais</h5>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Profissional</th>
              <th>Comissão Venda</th>
              <th>Comissão Execução</th>
              <th>Descontos</th>
              <th>Líquido a Repassar</th>
            </tr>
          </thead>
          <tbody>${linhasDentistasHtml}</tbody>
        </table>
      </div>

      <div class="demo-signatures">
        <div class="sig-line">Assinatura da Administração / Direção</div>
        <div class="sig-line">Conferência Financeira — ${dataFechamentoFmt}</div>
      </div>
    `;
  }
}

// ==================== ABA CONFIGURAÇÕES ====================
function renderizarConfig() {
  const clinica = db.config.clinica || {};
  document.getElementById('cfgClinicaNome').value = clinica.nome || '';
  document.getElementById('cfgClinicaRazao').value = clinica.razaoSocial || '';
  document.getElementById('cfgClinicaCnpj').value = clinica.cnpj || '';
  document.getElementById('cfgClinicaCro').value = clinica.cro || '';
  document.getElementById('cfgClinicaTelefone').value = clinica.telefone || '';
  document.getElementById('cfgClinicaEmail').value = clinica.email || '';
  document.getElementById('cfgClinicaEndereco').value = clinica.endereco || '';

  const inpComVenda = document.getElementById('cfgComissaoVenda');
  if (inpComVenda) inpComVenda.value = db.config.percentualVenda ?? 5;

  const inpGas = document.getElementById('cfgGasUrl');
  if (inpGas) inpGas.value = db.config.gasUrl || '';

  // IDs alinhados com index.html
  const listaDentistas = document.getElementById('listaDentistas');
  if (listaDentistas) {
    listaDentistas.innerHTML = db.config.dentistas
      .map(
        (d) => `
        <li>
          <div>
            <strong>${escapeHTML(d.nome)}</strong>
            <br><small class="hint">Usuário: <code>${escapeHTML(d.usuario)}</code> • Senha: <code>${escapeHTML(d.senha)}</code></small>
          </div>
          <div class="item-actions">
            <button type="button" class="btn-edit-sm" onclick="editarDentista('${escapeHTML(d.id)}')">Editar</button>
            <button type="button" class="btn-danger-sm" onclick="removerDentista('${escapeHTML(d.id)}')">Excluir</button>
          </div>
        </li>`
      )
      .join('');
  }

  const listaRecepcao = document.getElementById('listaRecepcao');
  if (listaRecepcao) {
    listaRecepcao.innerHTML = db.config.recepcionistas
      .map(
        (r) => `
        <li>
          <div>
            <strong>${escapeHTML(r.nome)}</strong>
            <br><small class="hint">Usuário: <code>${escapeHTML(r.usuario)}</code> • Senha: <code>${escapeHTML(r.senha)}</code></small>
          </div>
          <div class="item-actions">
            <button type="button" class="btn-edit-sm" onclick="editarRecepcao('${escapeHTML(r.id)}')">Editar</button>
            <button type="button" class="btn-danger-sm" onclick="removerRecepcao('${escapeHTML(r.id)}')">Excluir</button>
          </div>
        </li>`
      )
      .join('');
  }

  const listaEsp = document.getElementById('listaEspecialidades');
  if (listaEsp) {
    listaEsp.innerHTML = db.config.especialidades
      .map(
        (esp, idx) => `
        <li>
          <span><strong>${escapeHTML(esp.nome)}</strong></span>
          <div class="item-actions">
            <input type="number" step="0.1" min="0" max="100" class="inline-edit"
              value="${Number(esp.percentual) || 0}"
              onchange="atualizarPercentualEspecialidade(${idx}, this.value)" /> %
            <button type="button" class="btn-danger-sm" onclick="removerEspecialidade(${idx})">Excluir</button>
          </div>
        </li>`
      )
      .join('');
  }

  const listaTaxas = document.getElementById('listaTaxas');
  if (listaTaxas) {
    listaTaxas.innerHTML = db.config.taxas
      .map(
        (tx, idx) => `
        <li>
          <span><strong>${escapeHTML(tx.nome)}</strong></span>
          <div class="item-actions">
            <input type="number" step="0.1" min="0" max="100" class="inline-edit"
              value="${Number(tx.taxa) || 0}"
              onchange="atualizarTaxaPagamento(${idx}, this.value)" /> %
          </div>
        </li>`
      )
      .join('');
  }

  const listaSaidas = document.getElementById('listaSaidasCat');
  if (listaSaidas) {
    listaSaidas.innerHTML = db.config.categoriasSaida
      .map(
        (cat, idx) => `
        <li>
          <span><strong>${escapeHTML(cat)}</strong></span>
          <button type="button" class="btn-danger-sm" onclick="removerCategoriaSaida(${idx})">Excluir</button>
        </li>`
      )
      .join('');
  }
}

window.editarDentista = function (id) {
  const dent = db.config.dentistas.find((d) => d.id === id);
  if (!dent) return;
  document.getElementById('cfgDentistaEditId').value = dent.id;
  document.getElementById('cfgDentistaNome').value = dent.nome;
  document.getElementById('cfgDentistaUsuario').value = dent.usuario;
  document.getElementById('cfgDentistaSenha').value = dent.senha;
  document.getElementById('btnSalvarDentista').textContent = 'Salvar';
  document.getElementById('btnCancelarEditDentista').classList.remove('hidden');
};

window.removerDentista = function (id) {
  if (!confirm('Remover este dentista da lista?')) return;
  db.config.dentistas = db.config.dentistas.filter((d) => d.id !== id);
  salvarDB();
  enfileirarSync('UPDATE_CONFIG', db.config);
  popularSelects();
  renderizarConfig();
};

window.editarRecepcao = function (id) {
  const rec = db.config.recepcionistas.find((r) => r.id === id);
  if (!rec) return;
  document.getElementById('cfgRecepcaoEditId').value = rec.id;
  document.getElementById('cfgRecepcaoNome').value = rec.nome;
  document.getElementById('cfgRecepcaoUsuario').value = rec.usuario;
  document.getElementById('cfgRecepcaoSenha').value = rec.senha;
  document.getElementById('btnSalvarRecepcao').textContent = 'Salvar';
  document.getElementById('btnCancelarEditRecepcao').classList.remove('hidden');
};

window.removerRecepcao = function (id) {
  if (!confirm('Remover este acesso da recepção?')) return;
  db.config.recepcionistas = db.config.recepcionistas.filter((r) => r.id !== id);
  salvarDB();
  enfileirarSync('UPDATE_CONFIG', db.config);
  renderizarConfig();
};

window.atualizarPercentualEspecialidade = function (idx, novoValor) {
  db.config.especialidades[idx].percentual = Math.max(0, Number(novoValor) || 0);
  salvarDB();
  enfileirarSync('UPDATE_CONFIG', db.config);
  atualizarPreviewMapa();
};

window.removerEspecialidade = function (idx) {
  if (!confirm('Remover esta especialidade?')) return;
  db.config.especialidades.splice(idx, 1);
  salvarDB();
  enfileirarSync('UPDATE_CONFIG', db.config);
  popularSelects();
  renderizarConfig();
};

window.atualizarTaxaPagamento = function (idx, novaTaxa) {
  db.config.taxas[idx].taxa = Math.max(0, Number(novaTaxa) || 0);
  salvarDB();
  enfileirarSync('UPDATE_CONFIG', db.config);
  popularSelects();
  atualizarPreviewMapa();
};

window.removerCategoriaSaida = function (idx) {
  if (!confirm('Remover esta categoria de saída?')) return;
  db.config.categoriasSaida.splice(idx, 1);
  salvarDB();
  enfileirarSync('UPDATE_CONFIG', db.config);
  popularSelects();
  renderizarConfig();
};
