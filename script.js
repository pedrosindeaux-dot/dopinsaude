// ==================== ESTADO EM MEMÓRIA (ALIMENTADO PELA NUVEM) ====================
const SESSION_KEY = 'dopin_saude_session_v1';

const DEFAULT_CONFIG = {
  percentualVenda: 5,
  clinica: {
    nome: '',
    razaoSocial: '',
    cnpj: '',
    cro: '',
    telefone: '',
    email: '',
    endereco: '',
    logoR2Key: ''
  },
  dentistas: [],
  recepcionistas: [],
  especialidades: [],
  taxas: [],
  categoriasSaida: []
};

window.db = {
  dataServidor: '',
  config: structuredClone(DEFAULT_CONFIG),
  atendimentos: [],
  saidas: [],
  pagamentosDentistas: {},
  pacientes: [],
  aprovacoes: { atendimentos: [], saidas: [] }
};

window.sessaoAtual = null;
window.clinicLogoDataUrl = null;
let abasDesbloqueadas = { geral: false, config: false };
let abaPendenteSenha = null;

// ==================== UTILITÁRIOS & SEGURANÇA ====================
window.escapeHTML = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

window.fmtBRL = (val) =>
  Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

window.hojeISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};

const getDataAtiva = () => document.getElementById('dataAtiva')?.value || window.hojeISO();

function isDataRetroativa(dataStr) {
  const referencia = window.db.dataServidor || window.hojeISO();
  return Boolean(dataStr && dataStr < referencia);
}

function atualizarAlertasRetroativos() {
  const retro = isDataRetroativa(getDataAtiva());
  const boxMapa = document.getElementById('boxRetroMapa');
  const inpMapa = document.getElementById('mJustificativaRetro');
  const boxSaida = document.getElementById('boxRetroSaida');
  const inpSaida = document.getElementById('sJustificativaRetro');

  if (boxMapa) boxMapa.classList.toggle('hidden', !retro);
  if (inpMapa) inpMapa.required = retro;
  if (boxSaida) boxSaida.classList.toggle('hidden', !retro);
  if (inpSaida) inpSaida.required = retro;
}

function atualizarStatusNuvem(estado, texto) {
  const badge = document.getElementById('statusConexao');
  const txt = document.getElementById('statusTexto');
  const loginBadge = document.getElementById('loginStatusBadge');
  const loginTxt = document.getElementById('loginStatusTexto');

  const classe = estado === 'erro' || estado === 'offline' ? 'offline' : 'online';
  if (badge) badge.className = `status-badge ${classe}`;
  if (txt) txt.textContent = texto;
  if (loginBadge) loginBadge.className = `status-pill-light ${classe}`;
  if (loginTxt) loginTxt.textContent = estado === 'offline' ? 'Sem conexão com a internet' : 'Nuvem Cloudflare Ativa';
}

// ==================== LOGO DA CLÍNICA (R2) ====================
async function carregarLogoClinica() {
  try {
    const dataUrl = await DopinAPI.buscarLogoDataUrl();
    window.clinicLogoDataUrl = dataUrl;
    aplicarLogoNaInterface();
  } catch {
    window.clinicLogoDataUrl = null;
  }
}

function aplicarLogoNaInterface() {
  const preview = document.getElementById('cfgLogoPreview');
  const placeholder = document.getElementById('cfgLogoPlaceholder');
  const headerBadge = document.getElementById('headerLogoBadge');

  if (window.clinicLogoDataUrl) {
    if (preview) {
      preview.src = window.clinicLogoDataUrl;
      preview.classList.remove('hidden');
    }
    if (placeholder) placeholder.classList.add('hidden');
    if (headerBadge) {
      headerBadge.innerHTML = `<img src="${window.clinicLogoDataUrl}" alt="Logo da clínica" />`;
    }
  } else {
    if (preview) preview.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
  }
}

// ==================== CARREGAMENTO DOS DADOS DO D1 ====================
async function carregarDadosDaNuvem() {
  atualizarStatusNuvem('carregando', 'Sincronizando...');
  try {
    const promessas = [
      DopinAPI.buscarDadosIniciais(),
      DopinAPI.listarPacientes().catch(() => ({ pacientes: [] }))
    ];
    if (window.sessaoAtual?.perfil === 'Administração') {
      promessas.push(DopinAPI.listarAprovacoes().catch(() => ({ atendimentos: [], saidas: [] })));
    }

    const [res, resPac, resAprov] = await Promise.all(promessas);
    window.db.dataServidor = res.data_servidor || window.hojeISO();
    window.db.pacientes = resPac.pacientes || [];
    if (resAprov) {
      window.db.aprovacoes = {
        atendimentos: resAprov.atendimentos || [],
        saidas: resAprov.saidas || []
      };
    }

    const c = res.clinica || {};
    window.db.config = {
      percentualVenda: Number(c.percentual_venda ?? 5),
      clinica: {
        nome: c.nome || '',
        razaoSocial: c.razao_social || '',
        cnpj: c.cnpj || '',
        cro: c.cro || '',
        telefone: c.telefone || '',
        email: c.email || '',
        endereco: c.endereco || '',
        logoR2Key: c.logo_r2_key || ''
      },
      dentistas: (res.usuarios || []).filter((u) => u.perfil === 'Profissional'),
      recepcionistas: (res.usuarios || []).filter((u) => u.perfil === 'Recepção'),
      especialidades: (res.especialidades || []).map((e) => ({
        id: e.id,
        nome: e.nome,
        percentual: Number(e.percentual || 0)
      })),
      taxas: (res.taxas || []).map((t) => ({
        id: t.codigo,
        dbId: t.id,
        nome: t.nome,
        taxa: Number(t.taxa || 0)
      })),
      categoriasSaida: (res.categoriasSaida || []).map((cat) => cat.nome)
    };

    window.db.atendimentos = (res.atendimentos || []).map((a) => ({
      id: a.id,
      data: a.data,
      pacienteId: a.paciente_id,
      paciente: a.paciente_nome,
      procedimento: a.procedimento,
      espNome: a.especialidade_nome,
      formaId: a.forma_pagamento_id,
      formaNome: a.forma_pagamento_nome,
      taxaAplicada: Number(a.taxa_aplicada || 0),
      percVenda: Number(a.perc_venda || 0),
      percEspecialidade: Number(a.perc_especialidade || 0),
      valorPago: Number(a.valor_pago || 0),
      valorFinal: Number(a.valor_final || 0),
      dentistaVendaId: a.dentista_venda_id,
      comissaoVenda: Number(a.comissao_venda || 0),
      dentistaExecId: a.dentista_exec_id,
      valorExecBruto: Number(a.valor_exec_bruto || 0),
      valorExecLiquido: Number(a.valor_exec_liquido || 0),
      valorLab: Number(a.valor_lab || 0),
      comissaoExec: Number(a.comissao_exec || 0),
      comissaoTotal: Number(a.comissao_total || 0)
    }));

    window.db.saidas = (res.saidas || []).map((s) => ({
      id: s.id,
      data: s.data,
      categoria: s.categoria,
      descricaoFinal: s.descricao_final,
      dentistaId: s.dentista_id || null,
      origem: s.origem,
      valor: Number(s.valor || 0),
      obs: s.obs || ''
    }));

    window.db.pagamentosDentistas = {};
    (res.pagamentos || []).forEach((p) => {
      window.db.pagamentosDentistas[`${p.data}_${p.dentista_id}`] = Number(p.valor_pago || 0);
    });

    if (c.logo_r2_key) await carregarLogoClinica();

    atualizarCabecalhoClinica();
    popularSelects();
    atualizarAlertasRetroativos();
    atualizarPreviewMapa();
    renderizarTudo();
    atualizarStatusNuvem('online', 'Nuvem OK');
  } catch (err) {
    console.error('Erro ao carregar dados da nuvem:', err);
    atualizarStatusNuvem('erro', 'Erro Nuvem');
    if (String(err.message).includes('Sessão expirada') || String(err.message).includes('autorizada')) {
      encerrarSessao();
    } else {
      alert(`Não foi possível carregar os dados da nuvem: ${err.message}`);
    }
  }
}

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();

  const inputData = document.getElementById('dataAtiva');
  if (inputData) {
    inputData.value = window.hojeISO();
    inputData.addEventListener('change', () => {
      atualizarAlertasRetroativos();
      renderizarTudo();
    });
  }

  configurarLogin();
  configurarCadastroClinica();
  configurarNavegacao();
  configurarModalSenha();
  configurarSeletorPacienteMapa();
  configurarFormularios();
  configurarConexao();
  if (window.ProntuarioModule) window.ProntuarioModule.init();
  verificarSessaoSalva();
});

function atualizarCabecalhoClinica() {
  const badge = document.getElementById('headerClinicaNome');
  if (!badge) return;
  const nomeClinica = (window.db.config.clinica?.nome || '').trim();
  if (nomeClinica) {
    badge.textContent = nomeClinica;
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

// ==================== SELETOR PESQUISÁVEL DE PACIENTE NO MAPA DIÁRIO (ITEM 13) ====================
function configurarSeletorPacienteMapa() {
  const inputBusca = document.getElementById('mPacienteBusca');
  const inputId = document.getElementById('mPacienteId');
  const dropdown = document.getElementById('mPacienteDropdown');
  const hint = document.getElementById('mPacienteHint');
  if (!inputBusca || !inputId || !dropdown) return;

  const mostrarLista = () => {
    const termo = inputBusca.value.trim().toLowerCase();
    const filtrados = (window.db.pacientes || [])
      .filter(
        (p) =>
          String(p.nome || '').toLowerCase().includes(termo) ||
          String(p.cpf || '').toLowerCase().includes(termo)
      )
      .slice(0, 15);

    if (filtrados.length === 0) {
      dropdown.innerHTML =
        '<div class="paciente-picker-item"><strong>Nenhum paciente encontrado</strong><small>Cadastre o paciente primeiro na aba Pacientes &amp; Prontuário.</small></div>';
    } else {
      dropdown.innerHTML = filtrados
        .map(
          (p) => `
          <div class="paciente-picker-item" data-id="${window.escapeHTML(p.id)}" data-nome="${window.escapeHTML(p.nome)}">
            <strong>${window.escapeHTML(p.nome)}</strong>
            <small>${p.cpf ? `CPF: ${window.escapeHTML(p.cpf)}` : 'Sem CPF'}${p.telefone ? ` • ${window.escapeHTML(p.telefone)}` : ''}</small>
          </div>`
        )
        .join('');
    }
    dropdown.classList.remove('hidden');
  };

  inputBusca.addEventListener('focus', mostrarLista);
  inputBusca.addEventListener('input', () => {
    inputId.value = '';
    if (hint) {
      hint.textContent = 'Selecione um paciente cadastrado da lista.';
      hint.className = 'hint';
    }
    mostrarLista();
  });

  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.paciente-picker-item');
    if (!item || !item.dataset.id) return;
    inputId.value = item.dataset.id;
    inputBusca.value = item.dataset.nome;
    dropdown.classList.add('hidden');
    if (hint) {
      hint.textContent = '✓ Paciente vinculado com sucesso.';
      hint.className = 'hint text-success';
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.paciente-picker-wrap')) {
      dropdown.classList.add('hidden');
    }
  });
}

// ==================== CADASTRO DE NOVA CLÍNICA (SAAS) ====================
function configurarCadastroClinica() {
  const modal = document.getElementById('modalCadastroClinica');
  const btnAbrir = document.getElementById('btnAbrirCadastroClinica');
  const btnCancelar = document.getElementById('btnCancelarCadastroClinica');
  const form = document.getElementById('formCadastroClinica');
  const erroEl = document.getElementById('cadClinicaErro');

  if (!modal || !btnAbrir || !form) return;

  btnAbrir.addEventListener('click', () => {
    erroEl.classList.add('hidden');
    modal.classList.remove('hidden');
  });

  btnCancelar.addEventListener('click', () => modal.classList.add('hidden'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erroEl.classList.add('hidden');
    const btn = document.getElementById('btnConfirmarCadastroClinica');
    btn.disabled = true;
    btn.textContent = 'Criando...';

    try {
      const nomeClinica = document.getElementById('cadClinicaNome').value.trim();
      const email = document.getElementById('cadClinicaEmail').value.trim();
      const nomeAdmin = document.getElementById('cadAdminNome').value.trim();
      const usuario = document.getElementById('cadAdminUsuario').value.trim().toLowerCase();
      const senha = document.getElementById('cadAdminSenha').value.trim();

      const res = await DopinAPI.registrarClinica({
        nome_clinica: nomeClinica,
        email,
        nome_admin: nomeAdmin,
        usuario,
        senha
      });

      DopinAPI.setToken(res.token, true);
      modal.classList.add('hidden');
      form.reset();

      await iniciarSessao(
        { usuario: nomeAdmin, loginUsuario: usuario, perfil: 'Administração', dentistaId: null },
        true
      );
    } catch (err) {
      erroEl.textContent = err.message || 'Erro ao criar clínica.';
      erroEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Criar Clínica';
    }
  });
}

// ==================== AUTENTICAÇÃO & PERFIS ====================
function configurarLogin() {
  const botoesPerfil = document.querySelectorAll('.perfil-btn');
  const inputPerfil = document.getElementById('loginPerfil');
  const inputUsuario = document.getElementById('loginUsuario');

  const atualizarPerfilLogin = (perfil) => {
    inputPerfil.value = perfil;
    if (perfil === 'Profissional') inputUsuario.placeholder = 'ex: dr.pedro';
    else if (perfil === 'Recepção') inputUsuario.placeholder = 'ex: recepcao';
    else inputUsuario.placeholder = 'Usuário administrativo';
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

  document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuarioDigitado = document.getElementById('loginUsuario').value.trim();
    const senhaDigitada = document.getElementById('loginSenha').value.trim();
    const manter = document.getElementById('loginManterSessao').checked;
    const erroEl = document.getElementById('loginErro');

    if (!usuarioDigitado || !senhaDigitada) {
      erroEl.textContent = 'Preencha usuário e senha para acessar.';
      erroEl.classList.remove('hidden');
      return;
    }

    erroEl.classList.add('hidden');
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;

    try {
      const res = await DopinAPI.login(usuarioDigitado, senhaDigitada);
      DopinAPI.setToken(res.token, manter);
      const u = res.usuario;
      await iniciarSessao(
        {
          usuario: u.nome,
          loginUsuario: u.usuario,
          perfil: u.perfil,
          dentistaId: u.perfil === 'Profissional' ? u.id : null,
          recepcaoId: u.perfil === 'Recepção' ? u.id : null
        },
        manter
      );
    } catch (err) {
      erroEl.textContent = err.message || 'Usuário ou senha incorretos.';
      erroEl.classList.remove('hidden');
    } finally {
      btnSubmit.disabled = false;
    }
  });

  document.getElementById('btnSair').addEventListener('click', encerrarSessao);
}

async function verificarSessaoSalva() {
  const token = DopinAPI.getToken();
  const salvo = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (token && salvo) {
    try {
      const dados = JSON.parse(salvo);
      if (dados && dados.usuario && dados.perfil) {
        await iniciarSessao(dados, false);
        return;
      }
    } catch {
      // ignora
    }
  }
  mostrarTelaLogin();
}

async function iniciarSessao(dados, salvarNoStorage = false) {
  window.sessaoAtual = dados;
  if (salvarNoStorage) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(dados));
  } else if (!localStorage.getItem(SESSION_KEY)) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(dados));
  }

  document.getElementById('usuarioLogadoInfo').textContent = `${dados.usuario} (${dados.perfil})`;

  const tabMapa = document.getElementById('navTabMapa');
  const tabPacientes = document.getElementById('navTabPacientes');
  const tabSaidas = document.getElementById('navTabSaidas');
  const tabCaixa = document.getElementById('navTabCaixa');
  const tabPagamentos = document.getElementById('navTabPagamentos');
  const tabAprovacoes = document.getElementById('navTabAprovacoes');
  const tabGeral = document.getElementById('navTabGeral');
  const tabConfig = document.getElementById('navTabConfig');

  const cardFormMapa = document.getElementById('cardFormMapa');
  const thAcoesMapa = document.getElementById('thAcoesMapa');
  const hintMapaProf = document.getElementById('hintMapaProfissional');

  tabPacientes?.classList.remove('hidden');

  if (dados.perfil === 'Profissional') {
    tabMapa.classList.remove('hidden');
    tabPagamentos.classList.remove('hidden');
    tabSaidas.classList.add('hidden');
    tabCaixa.classList.add('hidden');
    tabAprovacoes?.classList.add('hidden');
    tabGeral.classList.add('hidden');
    tabConfig.classList.add('hidden');

    cardFormMapa.classList.add('hidden');
    thAcoesMapa.classList.add('hidden');
    hintMapaProf.classList.remove('hidden');
    abasDesbloqueadas = { geral: false, config: false };
  } else if (dados.perfil === 'Recepção') {
    tabMapa.classList.remove('hidden');
    tabSaidas.classList.remove('hidden');
    tabCaixa.classList.remove('hidden');
    tabPagamentos.classList.add('hidden');
    tabAprovacoes?.classList.add('hidden');
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
    tabAprovacoes?.classList.remove('hidden');
    tabGeral.classList.remove('hidden');
    tabConfig.classList.remove('hidden');

    cardFormMapa.classList.remove('hidden');
    thAcoesMapa.classList.remove('hidden');
    hintMapaProf.classList.add('hidden');
    abasDesbloqueadas = { geral: true, config: true };
  }

  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  await carregarDadosDaNuvem();
  ativarAba('mapa');
}

function encerrarSessao() {
  window.sessaoAtual = null;
  window.clinicLogoDataUrl = null;
  abasDesbloqueadas = { geral: false, config: false };
  DopinAPI.limparToken();
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  document.getElementById('loginSenha').value = '';
  mostrarTelaLogin();
}

function mostrarTelaLogin() {
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

// ==================== CONEXÃO & NAVEGAÇÃO ====================
function configurarConexao() {
  const atualizarRede = () => {
    atualizarStatusNuvem(navigator.onLine ? 'online' : 'offline', navigator.onLine ? 'Nuvem OK' : 'Offline');
  };
  window.addEventListener('online', atualizarRede);
  window.addEventListener('offline', atualizarRede);
  document.getElementById('btnSincronizar').addEventListener('click', async () => {
    if (window.sessaoAtual) await carregarDadosDaNuvem();
  });
  atualizarRede();
}

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

  const validar = async () => {
    const senhaDigitada = input.value.trim();
    if (!window.sessaoAtual?.loginUsuario || !senhaDigitada) {
      erro.classList.remove('hidden');
      return;
    }
    try {
      await DopinAPI.login(window.sessaoAtual.loginUsuario, senhaDigitada);
      abasDesbloqueadas[abaPendenteSenha] = true;
      modal.classList.add('hidden');
      erro.classList.add('hidden');
      input.value = '';
      ativarAba(abaPendenteSenha);
    } catch {
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

// ==================== LISTAS SUSPENSAS E CÁLCULOS (COM EXCEÇÃO ORTO) ====================
function popularSelects() {
  const dentistasHTML = window.db.config.dentistas.length
    ? window.db.config.dentistas
        .map((dent) => `<option value="${window.escapeHTML(dent.id)}">${window.escapeHTML(dent.nome)}</option>`)
        .join('')
    : '<option value="">Cadastre um dentista em Configurações</option>';

  document.getElementById('mDentistaVenda').innerHTML = dentistasHTML;
  document.getElementById('mDentistaExec').innerHTML = dentistasHTML;
  document.getElementById('sDentista').innerHTML =
    `<option value="">-- Nenhum (Despesa Geral) --</option>${window.db.config.dentistas
      .map((dent) => `<option value="${window.escapeHTML(dent.id)}">${window.escapeHTML(dent.nome)}</option>`)
      .join('')}`;

  document.getElementById('mEspecialidade').innerHTML = window.db.config.especialidades
    .map((esp) => `<option value="${window.escapeHTML(esp.nome)}">${window.escapeHTML(esp.nome)}</option>`)
    .join('');

  document.getElementById('mFormaPagamento').innerHTML = window.db.config.taxas
    .map((tx) => `<option value="${window.escapeHTML(tx.id)}">${window.escapeHTML(tx.nome)} (-${tx.taxa}%)</option>`)
    .join('');

  document.getElementById('sDescricao').innerHTML = window.db.config.categoriasSaida
    .map((cat) => `<option value="${window.escapeHTML(cat)}">${window.escapeHTML(cat)}</option>`)
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

  const espItem = window.db.config.especialidades.find((item) => item.nome === espNome) || { percentual: 0 };
  const formaItem = window.db.config.taxas.find((item) => item.id === formaId) || { taxa: 0, nome: '' };
  const percVenda = Number(window.db.config.percentualVenda ?? 5);

  const fatorLiquido = 1 - formaItem.taxa / 100;
  const valorFinal = valorPago * fatorLiquido;
  const comissaoVenda = valorFinal * (percVenda / 100);

  // Exceção da Ortodontia (Item 11): ORTO não sofre desconto de maquineta na comissão de execução
  const espNorm = String(espNome || '').trim().toUpperCase();
  const isOrto = espNorm === 'ORTO' || espNorm === 'ORTODONTIA';
  const valorExecLiquido = isOrto ? valorExecBruto : valorExecBruto * fatorLiquido;
  const baseLiquidaExec = Math.max(0, valorExecLiquido - valorLab);
  const comissaoExec = baseLiquidaExec * (espItem.percentual / 100);

  return {
    espNome,
    isOrto,
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
  document.getElementById('prevValorFinal').textContent = window.fmtBRL(resumo.valorFinal);
  document.getElementById('prevComVenda').textContent = window.fmtBRL(resumo.comissaoVenda);
  document.getElementById('prevExecLiq').textContent = window.fmtBRL(resumo.valorExecLiquido);
  document.getElementById('prevComExec').textContent = window.fmtBRL(resumo.comissaoExec);
  document.getElementById('prevComTotal').textContent = window.fmtBRL(resumo.comissaoTotal);
  document.getElementById('prevOrtoTag')?.classList.toggle('hidden', !resumo.isOrto);
}

// ==================== EVENTOS DOS FORMULÁRIOS ====================
function configurarFormularios() {
  const campoPago = document.getElementById('mValorPago');
  const campoExec = document.getElementById('mValorExecBruto');

  campoPago.addEventListener('input', () => {
    if (!campoExec.dataset.editadoManualmente) campoExec.value = campoPago.value;
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

  document.getElementById('formMapa').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (window.sessaoAtual?.perfil === 'Profissional') return;

    const pacienteId = document.getElementById('mPacienteId').value;
    const pacienteNome = document.getElementById('mPacienteBusca').value.trim();
    if (!pacienteId) {
      alert('Selecione um paciente já cadastrado na lista (digite o nome ou CPF e clique no paciente).');
      return;
    }

    const dentVenda = document.getElementById('mDentistaVenda').value;
    const dentExec = document.getElementById('mDentistaExec').value;
    if (!dentVenda || !dentExec) {
      alert('Cadastre pelo menos um dentista na aba Configurações antes de lançar atendimentos.');
      return;
    }

    const dataAtiva = getDataAtiva();
    const justificativaRetroativa = document.getElementById('mJustificativaRetro')?.value.trim() || '';
    if (isDataRetroativa(dataAtiva) && !justificativaRetroativa) {
      alert('Informe a justificativa para lançamento em data retroativa.');
      return;
    }

    const valores = calcularValoresMapa();
    const registroAtendimento = {
      data: dataAtiva,
      pacienteId,
      paciente: pacienteNome,
      procedimento: document.getElementById('mProcedimento').value.trim(),
      dentistaVendaId: dentVenda,
      dentistaExecId: dentExec,
      justificativaRetroativa,
      ...valores
    };

    try {
      const res = await DopinAPI.criarAtendimento(registroAtendimento);
      evento.target.reset();
      document.getElementById('mPacienteId').value = '';
      document.getElementById('mValorLab').value = '0';
      delete campoExec.dataset.editadoManualmente;
      atualizarPreviewMapa();

      if (res.status_aprovacao === 'pendente') {
        alert('Lançamento retroativo enviado para APROVAÇÃO ADMINISTRATIVA. Ele entrará nos cálculos somente após aprovado.');
        await carregarDadosDaNuvem();
      } else {
        window.db.atendimentos.unshift({ id: res.id, ...registroAtendimento });
        renderizarTudo();
      }
    } catch (err) {
      alert(`Erro ao salvar atendimento na nuvem: ${err.message}`);
    }
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

  document.getElementById('formSaidas').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const categoria = selectSaida.value;
    const textoOutros = inputOutrosTexto.value.trim();
    const dentistaId = selectDentistaSaida.value;
    const dataAtiva = getDataAtiva();
    const justificativaRetroativa = document.getElementById('sJustificativaRetro')?.value.trim() || '';

    if (isDataRetroativa(dataAtiva) && !justificativaRetroativa) {
      alert('Informe a justificativa para saída em data retroativa.');
      return;
    }

    const registroSaida = {
      data: dataAtiva,
      categoria,
      descricaoFinal: categoria === 'OUTROS' && textoOutros ? `OUTROS: ${textoOutros}` : categoria,
      dentistaId: dentistaId || null,
      origem: document.getElementById('sOrigem').value,
      valor: Number(document.getElementById('sValor').value) || 0,
      obs: document.getElementById('sObs').value.trim(),
      justificativaRetroativa
    };

    try {
      const res = await DopinAPI.criarSaida(registroSaida);
      evento.target.reset();
      atualizarCamposSaida();
      if (res.status_aprovacao === 'pendente') {
        alert('Saída retroativa enviada para APROVAÇÃO ADMINISTRATIVA.');
        await carregarDadosDaNuvem();
      } else {
        window.db.saidas.unshift({ id: res.id, ...registroSaida });
        renderizarTudo();
      }
    } catch (err) {
      alert(`Erro ao salvar saída na nuvem: ${err.message}`);
    }
  });

  document.getElementById('btnAtualizarAprovacoes')?.addEventListener('click', carregarDadosDaNuvem);

  // Upload de Logo da Clínica (R2)
  document.getElementById('formUploadLogo')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const arq = document.getElementById('cfgLogoArquivo')?.files?.[0];
    if (!arq) return;
    const btn = document.getElementById('btnEnviarLogo');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const fd = new FormData();
      fd.append('logo', arq);
      await DopinAPI.uploadLogo(fd);
      await carregarLogoClinica();
      e.target.reset();
      alert('Logomarca atualizada na nuvem com sucesso!');
    } catch (err) {
      alert(`Erro ao enviar logo: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="image"></i> Enviar Logo';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  });

  // Dados da Clínica
  document.getElementById('formDadosClinica').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const dadosClinica = {
      nome: document.getElementById('cfgClinicaNome').value.trim(),
      razaoSocial: document.getElementById('cfgClinicaRazao').value.trim(),
      cnpj: document.getElementById('cfgClinicaCnpj').value.trim(),
      cro: document.getElementById('cfgClinicaCro').value.trim(),
      telefone: document.getElementById('cfgClinicaTelefone').value.trim(),
      email: document.getElementById('cfgClinicaEmail').value.trim(),
      endereco: document.getElementById('cfgClinicaEndereco').value.trim()
    };
    try {
      await DopinAPI.salvarClinica(dadosClinica);
      window.db.config.clinica = { ...window.db.config.clinica, ...dadosClinica };
      atualizarCabecalhoClinica();
      alert('Dados da clínica salvos na nuvem com sucesso!');
    } catch (err) {
      alert(`Erro ao salvar dados da clínica: ${err.message}`);
    }
  });

  // Alterar Senha Administrativa (Item 15)
  document.getElementById('formAlterarSenha')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const senha_atual = document.getElementById('cfgSenhaAtual').value;
    const nova_senha = document.getElementById('cfgNovaSenha').value;
    const confirmacao_senha = document.getElementById('cfgConfirmaSenha').value;
    if (nova_senha !== confirmacao_senha) {
      alert('A nova senha e a confirmação não coincidem.');
      return;
    }
    const btn = document.getElementById('btnAlterarSenha');
    btn.disabled = true;
    try {
      await DopinAPI.alterarSenha({ senha_atual, nova_senha, confirmacao_senha });
      e.target.reset();
      alert('Senha alterada com sucesso!');
    } catch (err) {
      alert(`Erro ao alterar senha: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('formAddDentista').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nome = document.getElementById('cfgDentistaNome').value.trim();
    const usuario = document.getElementById('cfgDentistaUsuario').value.trim().toLowerCase();
    const senha = document.getElementById('cfgDentistaSenha').value.trim();
    if (!nome || !usuario || !senha) return;
    try {
      await DopinAPI.criarUsuario({ nome, usuario, senha, perfil: 'Profissional' });
      evento.target.reset();
      await carregarDadosDaNuvem();
    } catch (err) {
      alert(`Erro ao adicionar dentista: ${err.message}`);
    }
  });

  document.getElementById('formAddRecepcao').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nome = document.getElementById('cfgRecepcaoNome').value.trim();
    const usuario = document.getElementById('cfgRecepcaoUsuario').value.trim().toLowerCase();
    const senha = document.getElementById('cfgRecepcaoSenha').value.trim();
    if (!nome || !usuario || !senha) return;
    try {
      await DopinAPI.criarUsuario({ nome, usuario, senha, perfil: 'Recepção' });
      evento.target.reset();
      await carregarDadosDaNuvem();
    } catch (err) {
      alert(`Erro ao adicionar acesso da recepção: ${err.message}`);
    }
  });

  document.getElementById('btnSalvarComissaoVenda').addEventListener('click', async () => {
    const novoPerc = Number(document.getElementById('cfgComissaoVenda').value);
    const percentualVenda = Number.isNaN(novoPerc) || novoPerc < 0 ? 0 : novoPerc;
    try {
      await DopinAPI.salvarClinica({ ...window.db.config.clinica, percentualVenda });
      window.db.config.percentualVenda = percentualVenda;
      atualizarPreviewMapa();
      alert(`Comissão de venda atualizada para ${percentualVenda}%!`);
    } catch (err) {
      alert(`Erro ao atualizar comissão: ${err.message}`);
    }
  });
}

// ==================== RENDERIZAÇÃO GERAL ====================
function renderizarTudo() {
  renderizarMapa();
  if (window.ProntuarioModule) window.ProntuarioModule.renderizarListaPacientes();
  renderizarSaidas();
  renderizarDiarioCaixa();
  renderizarPagamentosDentistas();
  renderizarAprovacoes();
  if (abasDesbloqueadas.geral) renderizarGeral();
  if (abasDesbloqueadas.config) renderizarConfig();
}

function nomeDentista(dentistaId) {
  const encontrado = window.db.config.dentistas.find((item) => item.id === dentistaId);
  return encontrado ? encontrado.nome : 'Removido';
}

function renderizarMapa() {
  const dataSelecionada = getDataAtiva();
  const modoLeitura = window.sessaoAtual?.perfil === 'Profissional';

  const registrosDia = window.db.atendimentos.filter((item) => {
    if (item.data !== dataSelecionada) return false;
    if (modoLeitura && window.sessaoAtual.dentistaId) {
      return item.dentistaVendaId === window.sessaoAtual.dentistaId || item.dentistaExecId === window.sessaoAtual.dentistaId;
    }
    return true;
  });

  const corpoTabela = document.querySelector('#tabelaMapa tbody');
  if (!corpoTabela) return;

  corpoTabela.innerHTML = registrosDia
    .map((atend) => {
      const colunaAcao = modoLeitura
        ? ''
        : `<td><button type="button" class="btn-danger-sm" onclick="excluirAtendimento('${window.escapeHTML(atend.id)}')">Excluir</button></td>`;
      return `
      <tr>
        <td><strong>${window.escapeHTML(atend.paciente)}</strong></td>
        <td>${window.escapeHTML(atend.procedimento)}<br><small class="hint">${window.escapeHTML(atend.espNome)}</small></td>
        <td>${window.escapeHTML(atend.formaNome)}<br><small class="hint">Taxa: ${Number(atend.taxaAplicada) || 0}%</small></td>
        <td>${window.fmtBRL(atend.valorPago)}</td>
        <td><strong>${window.fmtBRL(atend.valorFinal)}</strong></td>
        <td>${window.escapeHTML(nomeDentista(atend.dentistaVendaId))}<br><span class="text-success">${window.fmtBRL(atend.comissaoVenda)}</span></td>
        <td>${window.fmtBRL(atend.valorExecLiquido)}</td>
        <td>${window.fmtBRL(atend.valorLab)}</td>
        <td>${window.escapeHTML(nomeDentista(atend.dentistaExecId))}<br><span class="text-success">${window.fmtBRL(atend.comissaoExec)}</span></td>
        ${colunaAcao}
      </tr>`;
    })
    .join('');
}

window.excluirAtendimento = async function (atendimentoId) {
  if (window.sessaoAtual?.perfil === 'Profissional') return;
  if (!confirm('Deseja excluir este atendimento da nuvem?')) return;
  try {
    await DopinAPI.excluirAtendimento(atendimentoId);
    window.db.atendimentos = window.db.atendimentos.filter((item) => item.id !== atendimentoId);
    renderizarTudo();
  } catch (err) {
    alert(`Erro ao excluir atendimento: ${err.message}`);
  }
};

function renderizarSaidas() {
  const dataSelecionada = getDataAtiva();
  const saidasDia = window.db.saidas.filter((item) => item.data === dataSelecionada);
  const corpoTabela = document.querySelector('#tabelaSaidas tbody');
  if (!corpoTabela) return;

  let somaSaidas = 0;
  corpoTabela.innerHTML = saidasDia
    .map((saida) => {
      somaSaidas += Number(saida.valor) || 0;
      const dentistaLabel = saida.dentistaId ? nomeDentista(saida.dentistaId) : '-';
      return `
      <tr>
        <td><strong>${window.escapeHTML(saida.descricaoFinal)}</strong></td>
        <td>${window.escapeHTML(dentistaLabel)}</td>
        <td>${window.escapeHTML(saida.origem)}</td>
        <td class="text-danger"><strong>${window.fmtBRL(saida.valor)}</strong></td>
        <td>${window.escapeHTML(saida.obs || '-')}</td>
        <td><button type="button" class="btn-danger-sm" onclick="excluirSaida('${window.escapeHTML(saida.id)}')">Excluir</button></td>
      </tr>`;
    })
    .join('');
  document.getElementById('saidasTotalDia').textContent = window.fmtBRL(somaSaidas);
}

window.excluirSaida = async function (saidaId) {
  if (!confirm('Deseja excluir esta saída da nuvem?')) return;
  try {
    await DopinAPI.excluirSaida(saidaId);
    window.db.saidas = window.db.saidas.filter((item) => item.id !== saidaId);
    renderizarTudo();
  } catch (err) {
    alert(`Erro ao excluir saída: ${err.message}`);
  }
};

// ==================== APROVAÇÕES RETROATIVAS ====================
function renderizarAprovacoes() {
  const atendPend = window.db.aprovacoes?.atendimentos || [];
  const saidasPend = window.db.aprovacoes?.saidas || [];
  const total = atendPend.length + saidasPend.length;

  const badge = document.getElementById('badgeAprovacoes');
  if (badge) {
    badge.textContent = total;
    badge.classList.toggle('hidden', total === 0);
  }

  const tbodyAtend = document.getElementById('listaAprovAtendBody');
  if (tbodyAtend) {
    tbodyAtend.innerHTML = atendPend.length
      ? atendPend
          .map(
            (a) => `
          <tr>
            <td><strong>${window.escapeHTML(a.data)}</strong></td>
            <td>${window.escapeHTML(a.paciente_nome)}</td>
            <td>${window.escapeHTML(a.procedimento)}</td>
            <td><strong>${window.fmtBRL(a.valor_pago)}</strong></td>
            <td>${window.escapeHTML(a.criado_por_nome || '-')}<br><small class="hint">${window.escapeHTML(a.criado_em || '')}</small></td>
            <td>${window.escapeHTML(a.justificativa_retroativa || '-')}</td>
            <td class="item-actions">
              <button type="button" class="btn-success-sm" onclick="decidirAprovacao('atendimento','${window.escapeHTML(a.id)}','aprovado')">Aprovar</button>
              <button type="button" class="btn-danger-sm" onclick="decidirAprovacao('atendimento','${window.escapeHTML(a.id)}','rejeitado')">Rejeitar</button>
            </td>
          </tr>`
          )
          .join('')
      : '<tr><td colspan="7">Nenhum atendimento retroativo aguardando aprovação.</td></tr>';
  }

  const tbodySaida = document.getElementById('listaAprovSaidaBody');
  if (tbodySaida) {
    tbodySaida.innerHTML = saidasPend.length
      ? saidasPend
          .map(
            (s) => `
          <tr>
            <td><strong>${window.escapeHTML(s.data)}</strong></td>
            <td>${window.escapeHTML(s.descricao_final)}</td>
            <td>${window.escapeHTML(s.origem)}</td>
            <td class="text-danger"><strong>${window.fmtBRL(s.valor)}</strong></td>
            <td>${window.escapeHTML(s.criado_por_nome || '-')}<br><small class="hint">${window.escapeHTML(s.criado_em || '')}</small></td>
            <td>${window.escapeHTML(s.justificativa_retroativa || '-')}</td>
            <td class="item-actions">
              <button type="button" class="btn-success-sm" onclick="decidirAprovacao('saida','${window.escapeHTML(s.id)}','aprovado')">Aprovar</button>
              <button type="button" class="btn-danger-sm" onclick="decidirAprovacao('saida','${window.escapeHTML(s.id)}','rejeitado')">Rejeitar</button>
            </td>
          </tr>`
          )
          .join('')
      : '<tr><td colspan="7">Nenhuma saída retroativa aguardando aprovação.</td></tr>';
  }
}

window.decidirAprovacao = async function (tipo, id, decisao) {
  const verbo = decisao === 'aprovado' ? 'aprovar' : 'rejeitar';
  if (!confirm(`Deseja realmente ${verbo} este lançamento retroativo?`)) return;
  try {
    await DopinAPI.decidirAprovacao(tipo, id, decisao);
    await carregarDadosDaNuvem();
  } catch (err) {
    alert(`Erro ao processar aprovação: ${err.message}`);
  }
};

// ==================== DIÁRIO DE CAIXA, REPASSES, GERAL E CONFIG ====================
function renderizarDiarioCaixa() {
  const dataSelecionada = getDataAtiva();
  const atendimentosDia = window.db.atendimentos.filter((item) => item.data === dataSelecionada);
  const saidasDia = window.db.saidas.filter((item) => item.data === dataSelecionada);

  let totalBruto = 0, totalLiquido = 0, entradasDinheiro = 0;
  const resumoModalidades = {};

  atendimentosDia.forEach((atend) => {
    totalBruto += Number(atend.valorPago) || 0;
    totalLiquido += Number(atend.valorFinal) || 0;
    if (atend.formaId === 'dinheiro') entradasDinheiro += Number(atend.valorPago) || 0;
    if (!resumoModalidades[atend.formaNome]) resumoModalidades[atend.formaNome] = { bruto: 0, liquido: 0 };
    resumoModalidades[atend.formaNome].bruto += Number(atend.valorPago) || 0;
    resumoModalidades[atend.formaNome].liquido += Number(atend.valorFinal) || 0;
  });

  const saidasGaveta = saidasDia.filter((s) => s.origem === 'Gaveta').reduce((soma, s) => soma + (Number(s.valor) || 0), 0);
  const saidasReais = saidasDia.filter((s) => s.origem !== 'Desconto Produção').reduce((soma, s) => soma + (Number(s.valor) || 0), 0);

  document.getElementById('cxBruto').textContent = window.fmtBRL(totalBruto);
  document.getElementById('cxLiquido').textContent = window.fmtBRL(totalLiquido);
  document.getElementById('cxGaveta').textContent = window.fmtBRL(entradasDinheiro - saidasGaveta);
  document.getElementById('cxSaidas').textContent = window.fmtBRL(saidasReais);

  document.getElementById('cxModalidadesBody').innerHTML =
    Object.entries(resumoModalidades)
      .map(([m, vals]) => `<tr><td>${window.escapeHTML(m)}</td><td>${window.fmtBRL(vals.bruto)}</td><td><strong>${window.fmtBRL(vals.liquido)}</strong></td></tr>`)
      .join('') || '<tr><td colspan="3">Sem movimentação nesta data.</td></tr>';

  const acumuladoCredito = {};
  window.db.atendimentos
    .filter((a) => String(a.formaId || '').startsWith('credito'))
    .forEach((a) => {
      if (!acumuladoCredito[a.formaNome]) acumuladoCredito[a.formaNome] = { qtd: 0, total: 0 };
      acumuladoCredito[a.formaNome].qtd += 1;
      acumuladoCredito[a.formaNome].total += Number(a.valorPago) || 0;
    });

  document.getElementById('cxRankingCreditoBody').innerHTML =
    Object.entries(acumuladoCredito)
      .sort((a, b) => b[1].qtd - a[1].qtd)
      .map(([m, d]) => `<tr><td><strong>${window.escapeHTML(m)}</strong></td><td>${d.qtd} vendas</td><td>${window.fmtBRL(d.total)}</td></tr>`)
      .join('') || '<tr><td colspan="3">Nenhuma venda no crédito registrada ainda.</td></tr>';
}

function renderizarPagamentosDentistas() {
  const dataSelecionada = getDataAtiva();
  const atendimentosDia = window.db.atendimentos.filter((item) => item.data === dataSelecionada);
  const saidasDia = window.db.saidas.filter((item) => item.data === dataSelecionada);
  const corpoTabela = document.querySelector('#tabelaPagamentos tbody');
  if (!corpoTabela) return;

  const isProfissional = window.sessaoAtual?.perfil === 'Profissional';
  document.getElementById('tituloPagamentosDentista').textContent = isProfissional
    ? `Minha Produção & Repasse — ${window.sessaoAtual.usuario}`
    : 'Fechamento & Repasse aos Dentistas (Dia)';

  const dentistasExibidos = isProfissional
    ? window.db.config.dentistas.filter((d) => d.id === window.sessaoAtual.dentistaId)
    : window.db.config.dentistas;

  corpoTabela.innerHTML = dentistasExibidos
    .map((dent) => {
      const totalVendido = atendimentosDia.filter((a) => a.dentistaVendaId === dent.id).reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
      const comissaoVenda = atendimentosDia.filter((a) => a.dentistaVendaId === dent.id).reduce((s, a) => s + (Number(a.comissaoVenda) || 0), 0);
      const comissaoExec = atendimentosDia.filter((a) => a.dentistaExecId === dent.id).reduce((s, a) => s + (Number(a.comissaoExec) || 0), 0);
      const producaoBruta = comissaoVenda + comissaoExec;
      const descontosDentista = saidasDia.filter((s) => s.dentistaId === dent.id).reduce((s, a) => s + (Number(a.valor) || 0), 0);
      const liquidoReceber = Math.max(0, producaoBruta - descontosDentista);
      const valorPago = Number(window.db.pagamentosDentistas[`${dataSelecionada}_${dent.id}`]) || 0;
      const saldoRestante = Math.max(0, liquidoReceber - valorPago);

      const celulaPago = isProfissional
        ? `<strong>${window.fmtBRL(valorPago)}</strong>`
        : `<input type="number" step="0.01" min="0" max="${liquidoReceber.toFixed(2)}" value="${valorPago}" onchange="registrarPagamentoDentista('${window.escapeHTML(dent.id)}', this.value, ${liquidoReceber})" style="width: 110px;" />`;

      return `
      <tr>
        <td><strong>${window.escapeHTML(dent.nome)}</strong><br><small class="hint">@${window.escapeHTML(dent.usuario)}</small></td>
        <td>${window.fmtBRL(totalVendido)}</td>
        <td>${window.fmtBRL(comissaoVenda)}</td>
        <td>${window.fmtBRL(comissaoExec)}</td>
        <td><strong>${window.fmtBRL(producaoBruta)}</strong></td>
        <td class="text-danger">${window.fmtBRL(descontosDentista)}</td>
        <td><strong>${window.fmtBRL(liquidoReceber)}</strong></td>
        <td>${celulaPago}</td>
        <td class="${saldoRestante > 0 ? 'text-danger' : 'text-success'}"><strong>${window.fmtBRL(saldoRestante)}</strong></td>
      </tr>`;
    })
    .join('');
}

window.registrarPagamentoDentista = async function (dentistaId, valorDigitado, tetoMaximo) {
  const dataSelecionada = getDataAtiva();
  let valorNumerico = Math.max(0, Number(valorDigitado) || 0);
  if (valorNumerico > tetoMaximo) {
    alert(`O valor pago (${window.fmtBRL(valorNumerico)}) não pode exceder o total a receber (${window.fmtBRL(tetoMaximo)}).`);
    valorNumerico = tetoMaximo;
  }
  try {
    await DopinAPI.registrarPagamento({ data: dataSelecionada, dentistaId, valorPago: valorNumerico });
    window.db.pagamentosDentistas[`${dataSelecionada}_${dentistaId}`] = valorNumerico;
    renderizarPagamentosDentistas();
  } catch (err) {
    alert(`Erro ao registrar pagamento: ${err.message}`);
  }
};

window.abrirDemonstrativoDoMes = function (mesNumero) {
  const seletorMes = document.getElementById('filtroMesDemo');
  if (seletorMes) {
    seletorMes.value = mesNumero;
    renderizarDemonstrativoMensal(document.getElementById('filtroAno')?.value || String(new Date().getFullYear()));
    document.getElementById('cardDemonstrativoMensal')?.scrollIntoView({ behavior: 'smooth' });
  }
};

function renderizarGeral() {
  const anoSelecionado = document.getElementById('filtroAno')?.value || String(new Date().getFullYear());
  const rotulosMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const atendimentosAno = window.db.atendimentos.filter((i) => String(i.data || '').startsWith(anoSelecionado));
  const saidasAno = window.db.saidas.filter((i) => String(i.data || '').startsWith(anoSelecionado));
  const saidasOpAno = saidasAno.filter((i) => i.origem !== 'Desconto Produção');

  const receitaBrutaTotal = atendimentosAno.reduce((s, i) => s + (Number(i.valorPago) || 0), 0);
  const receitaLiquidaTotal = atendimentosAno.reduce((s, i) => s + (Number(i.valorFinal) || 0), 0);
  const custoLabTotal = atendimentosAno.reduce((s, i) => s + (Number(i.valorLab) || 0), 0);
  const despesaOpTotal = saidasOpAno.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const taxasTotal = Math.max(0, receitaBrutaTotal - receitaLiquidaTotal);
  const lucroAnual = receitaLiquidaTotal - despesaOpTotal;
  const margemLucro = receitaLiquidaTotal > 0 ? (lucroAnual / receitaLiquidaTotal) * 100 : 0;
  const ticketMedio = atendimentosAno.length > 0 ? receitaBrutaTotal / atendimentosAno.length : 0;

  document.getElementById('kpiAnualLiquido').textContent = window.fmtBRL(receitaLiquidaTotal);
  document.getElementById('kpiAnualBrutoSub').textContent = `Bruto: ${window.fmtBRL(receitaBrutaTotal)}`;
  const elLucro = document.getElementById('kpiAnualLucro');
  elLucro.textContent = window.fmtBRL(lucroAnual);
  elLucro.className = lucroAnual >= 0 ? 'text-success' : 'text-danger';
  document.getElementById('kpiAnualMargem').textContent = `Margem: ${margemLucro.toFixed(1)}%`;
  document.getElementById('kpiAnualTaxas').textContent = window.fmtBRL(taxasTotal);
  document.getElementById('kpiAnualTicket').textContent = window.fmtBRL(ticketMedio);
  document.getElementById('kpiAnualAtendimentos').textContent = `${atendimentosAno.length} atendimentos no ano`;
  document.getElementById('kpiAnualLab').textContent = window.fmtBRL(custoLabTotal);

  const resumoMensal = [];
  let maiorValor = 1, totDin = 0, totPix = 0, totDeb = 0, totCred = 0;

  for (let idx = 0; idx < 12; idx++) {
    const mesNumero = String(idx + 1).padStart(2, '0');
    const prefixo = `${anoSelecionado}-${mesNumero}`;
    const aMes = atendimentosAno.filter((a) => String(a.data || '').startsWith(prefixo));
    const sMes = saidasOpAno.filter((s) => String(s.data || '').startsWith(prefixo));
    const liq = aMes.reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
    const desp = sMes.reduce((s, x) => s + (Number(x.valor) || 0), 0);
    const din = aMes.filter((a) => a.formaId === 'dinheiro').reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
    const pix = aMes.filter((a) => a.formaId === 'pix').reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
    const deb = aMes.filter((a) => a.formaId === 'debito').reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
    const cred = aMes.filter((a) => String(a.formaId || '').startsWith('credito')).reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
    totDin += din; totPix += pix; totDeb += deb; totCred += cred;
    if (liq > maiorValor) maiorValor = liq;
    if (desp > maiorValor) maiorValor = desp;
    resumoMensal.push({ mesNumero, mesNome: rotulosMeses[idx], liquido: liq, despesas: desp, resultado: liq - desp, dinheiro: din, pix, debito: deb, credito: cred });
  }

  document.getElementById('graficoAnualBarras').innerHTML = resumoMensal
    .map((m) => `
      <div class="bar-col" title="${m.mesNome}/${anoSelecionado} — Receita: ${window.fmtBRL(m.liquido)} | Despesa: ${window.fmtBRL(m.despesas)}">
        <div class="bar-pair">
          <div class="bar-item rev" style="height:${Math.max(3, Math.round((m.liquido / maiorValor) * 145))}px;"></div>
          <div class="bar-item exp" style="height:${Math.max(3, Math.round((m.despesas / maiorValor) * 145))}px;"></div>
        </div>
        <span class="bar-label">${m.mesNome}</span>
      </div>`).join('');

  document.querySelector('#tabelaGeralMeses tbody').innerHTML = resumoMensal
    .map((m) => `
      <tr>
        <td><strong>${m.mesNome}/${anoSelecionado}</strong></td>
        <td>${window.fmtBRL(m.liquido)}</td>
        <td class="text-danger">${window.fmtBRL(m.despesas)}</td>
        <td class="${m.resultado >= 0 ? 'text-success' : 'text-danger'}"><strong>${window.fmtBRL(m.resultado)}</strong></td>
        <td>${window.fmtBRL(m.dinheiro)}</td><td>${window.fmtBRL(m.pix)}</td><td>${window.fmtBRL(m.debito)}</td><td>${window.fmtBRL(m.credito)}</td>
        <td><button type="button" class="btn-edit-sm" onclick="abrirDemonstrativoDoMes('${m.mesNumero}')">Demonstrativo</button></td>
      </tr>`).join('');

  document.getElementById('tabelaGeralMesesFoot').innerHTML = `
    <tr class="row-total">
      <td>TOTAL ${anoSelecionado}</td><td>${window.fmtBRL(receitaLiquidaTotal)}</td><td class="text-danger">${window.fmtBRL(despesaOpTotal)}</td>
      <td class="${lucroAnual >= 0 ? 'text-success' : 'text-danger'}">${window.fmtBRL(lucroAnual)}</td>
      <td>${window.fmtBRL(totDin)}</td><td>${window.fmtBRL(totPix)}</td><td>${window.fmtBRL(totDeb)}</td><td>${window.fmtBRL(totCred)}</td><td>-</td>
    </tr>`;

  document.querySelector('#tabelaGeralDentistas tbody').innerHTML = window.db.config.dentistas
    .map((dent) => {
      const vendido = atendimentosAno.filter((a) => a.dentistaVendaId === dent.id).reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
      const comV = atendimentosAno.filter((a) => a.dentistaVendaId === dent.id).reduce((s, a) => s + (Number(a.comissaoVenda) || 0), 0);
      const comE = atendimentosAno.filter((a) => a.dentistaExecId === dent.id).reduce((s, a) => s + (Number(a.comissaoExec) || 0), 0);
      const prod = comV + comE;
      const desc = saidasAno.filter((s) => s.dentistaId === dent.id).reduce((s, a) => s + (Number(a.valor) || 0), 0);
      const pago = Object.entries(window.db.pagamentosDentistas || {})
        .filter(([k]) => k.startsWith(anoSelecionado) && k.endsWith(`_${dent.id}`))
        .reduce((s, [, v]) => s + (Number(v) || 0), 0);
      const pend = Math.max(0, Math.max(0, prod - desc) - pago);
      return `<tr><td><strong>${window.escapeHTML(dent.nome)}</strong></td><td>${window.fmtBRL(vendido)}</td><td>${window.fmtBRL(comV)}</td><td>${window.fmtBRL(comE)}</td><td><strong>${window.fmtBRL(prod)}</strong></td><td class="text-danger">${window.fmtBRL(desc)}</td><td>${window.fmtBRL(pago)}</td><td class="${pend > 0 ? 'text-danger' : 'text-success'}"><strong>${window.fmtBRL(pend)}</strong></td></tr>`;
    }).join('');

  const mapaCat = {};
  let somaCat = 0;
  saidasOpAno.forEach((s) => {
    const c = s.categoria || 'OUTROS';
    mapaCat[c] = (mapaCat[c] || 0) + (Number(s.valor) || 0);
    somaCat += Number(s.valor) || 0;
  });
  document.getElementById('geralDespesasBody').innerHTML =
    Object.entries(mapaCat).sort((a, b) => b[1] - a[1])
      .map(([c, t]) => `<tr><td><strong>${window.escapeHTML(c)}</strong></td><td class="text-danger">${window.fmtBRL(t)}</td><td>${somaCat > 0 ? ((t / somaCat) * 100).toFixed(1) : '0.0'}%</td></tr>`)
      .join('') || '<tr><td colspan="3">Nenhuma despesa registrada neste ano.</td></tr>';

  const mapaEsp = {};
  atendimentosAno.forEach((a) => {
    const e = a.espNome || 'OUTROS';
    if (!mapaEsp[e]) mapaEsp[e] = { qtd: 0, total: 0 };
    mapaEsp[e].qtd += 1;
    mapaEsp[e].total += Number(a.valorFinal) || 0;
  });
  document.getElementById('geralEspecialidadesBody').innerHTML =
    Object.entries(mapaEsp).sort((a, b) => b[1].total - a[1].total)
      .map(([e, d]) => `<tr><td><strong>${window.escapeHTML(e)}</strong></td><td>${d.qtd}</td><td class="text-success"><strong>${window.fmtBRL(d.total)}</strong></td></tr>`)
      .join('') || '<tr><td colspan="3">Nenhum atendimento registrado neste ano.</td></tr>';

  renderizarDemonstrativoMensal(anoSelecionado);
}

function renderizarDemonstrativoMensal(anoSelecionado) {
  const seletorMes = document.getElementById('filtroMesDemo');
  if (!seletorMes) return;
  if (seletorMes.options.length === 0) {
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    seletorMes.innerHTML = meses.map((n, i) => `<option value="${String(i + 1).padStart(2, '0')}">${n}</option>`).join('');
    seletorMes.value = String(new Date().getMonth() + 1).padStart(2, '0');
    seletorMes.addEventListener('change', () => renderizarDemonstrativoMensal(document.getElementById('filtroAno')?.value || String(new Date().getFullYear())));
    document.getElementById('btnImprimirDemo')?.addEventListener('click', () => window.print());
  }

  const mes = seletorMes.value || '01';
  const prefixo = `${anoSelecionado}-${mes}`;
  const ultimoDia = new Date(Number(anoSelecionado), Number(mes), 0).getDate();
  const dataFech = `${String(ultimoDia).padStart(2, '0')}/${mes}/${anoSelecionado}`;

  const clinica = window.db.config.clinica || {};
  const logoHtml = window.clinicLogoDataUrl ? `<img src="${window.clinicLogoDataUrl}" class="demo-clinic-logo" alt="Logo" />` : '';
  const detalhes = [
    clinica.razaoSocial ? `Razão Social: ${window.escapeHTML(clinica.razaoSocial)}` : '',
    clinica.cnpj ? `CNPJ/CPF: ${window.escapeHTML(clinica.cnpj)}` : '',
    clinica.cro ? `CRO: ${window.escapeHTML(clinica.cro)}` : '',
    clinica.telefone ? `Tel: ${window.escapeHTML(clinica.telefone)}` : '',
    clinica.endereco ? `End.: ${window.escapeHTML(clinica.endereco)}` : ''
  ].filter(Boolean).join(' • ');

  const aMes = window.db.atendimentos.filter((a) => String(a.data || '').startsWith(prefixo));
  const sMes = window.db.saidas.filter((s) => String(s.data || '').startsWith(prefixo));
  const sOp = sMes.filter((s) => s.origem !== 'Desconto Produção');

  const bruto = aMes.reduce((s, a) => s + (Number(a.valorPago) || 0), 0);
  const liq = aMes.reduce((s, a) => s + (Number(a.valorFinal) || 0), 0);
  const taxas = Math.max(0, bruto - liq);
  const desp = sOp.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const resLiq = liq - desp;

  const despCat = {};
  sOp.forEach((s) => { const c = s.categoria || 'OUTROS'; despCat[c] = (despCat[c] || 0) + (Number(s.valor) || 0); });
  const linhasDesp = Object.entries(despCat).sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `<tr><td>${window.escapeHTML(c)}</td><td><strong>${window.fmtBRL(v)}</strong></td></tr>`).join('') || '<tr><td colspan="2">Nenhuma despesa lançada neste mês.</td></tr>';

  const linhasDent = window.db.config.dentistas.map((d) => {
    const cv = aMes.filter((a) => a.dentistaVendaId === d.id).reduce((s, a) => s + (Number(a.comissaoVenda) || 0), 0);
    const ce = aMes.filter((a) => a.dentistaExecId === d.id).reduce((s, a) => s + (Number(a.comissaoExec) || 0), 0);
    const dc = sMes.filter((s) => s.dentistaId === d.id).reduce((s, x) => s + (Number(x.valor) || 0), 0);
    return `<tr><td><strong>${window.escapeHTML(d.nome)}</strong></td><td>${window.fmtBRL(cv)}</td><td>${window.fmtBRL(ce)}</td><td class="text-danger">${window.fmtBRL(dc)}</td><td><strong>${window.fmtBRL(Math.max(0, cv + ce - dc))}</strong></td></tr>`;
  }).join('');

  document.getElementById('demonstrativoMensalConteudo').innerHTML = `
    <div class="demo-header-doc">
      <div class="demo-header-brand">
        ${logoHtml}
        <div>
          <h4>${window.escapeHTML(clinica.nome || 'DôPin Saúde — Clínica Odontológica')}</h4>
          <p>${detalhes || 'Configure os dados institucionais da clínica na aba Configurações.'}</p>
        </div>
      </div>
      <div class="demo-meta-box">
        <strong>Demonstrativo Mensal de Fechamento</strong><br>
        Competência: ${mes}/${anoSelecionado}<br>
        Fechado em: ${dataFech}
      </div>
    </div>
    <div class="demo-summary-grid">
      <div class="demo-box"><span>Receita Bruta</span><strong>${window.fmtBRL(bruto)}</strong></div>
      <div class="demo-box"><span>Taxas de Cartão</span><strong class="text-danger">${window.fmtBRL(taxas)}</strong></div>
      <div class="demo-box"><span>Receita Líquida</span><strong>${window.fmtBRL(liq)}</strong></div>
      <div class="demo-box"><span>Despesas Operacionais</span><strong class="text-danger">${window.fmtBRL(desp)}</strong></div>
      <div class="demo-box"><span>Resultado Líquido</span><strong class="${resLiq >= 0 ? 'text-success' : 'text-danger'}">${window.fmtBRL(resLiq)}</strong></div>
    </div>
    <h5 class="demo-section-title">Despesas por Categoria</h5>
    <div class="table-responsive"><table><thead><tr><th>Categoria</th><th>Total no Mês</th></tr></thead><tbody>${linhasDesp}</tbody></table></div>
    <h5 class="demo-section-title">Resumo de Repasses aos Profissionais</h5>
    <div class="table-responsive"><table><thead><tr><th>Profissional</th><th>Comissão Venda</th><th>Comissão Execução</th><th>Descontos</th><th>Líquido a Repassar</th></tr></thead><tbody>${linhasDent}</tbody></table></div>
    <div class="demo-signatures">
      <div class="sig-line">Assinatura da Administração / Direção</div>
      <div class="sig-line">Conferência Financeira — ${dataFech}</div>
    </div>`;
}

function renderizarConfig() {
  const c = window.db.config.clinica || {};
  document.getElementById('cfgClinicaNome').value = c.nome || '';
  document.getElementById('cfgClinicaRazao').value = c.razaoSocial || '';
  document.getElementById('cfgClinicaCnpj').value = c.cnpj || '';
  document.getElementById('cfgClinicaCro').value = c.cro || '';
  document.getElementById('cfgClinicaTelefone').value = c.telefone || '';
  document.getElementById('cfgClinicaEmail').value = c.email || '';
  document.getElementById('cfgClinicaEndereco').value = c.endereco || '';
  document.getElementById('cfgComissaoVenda').value = window.db.config.percentualVenda ?? 5;
  aplicarLogoNaInterface();

  document.getElementById('listaDentistas').innerHTML =
    window.db.config.dentistas
      .map((d) => `<li><div><strong>${window.escapeHTML(d.nome)}</strong><br><small class="hint">Usuário: <code>${window.escapeHTML(d.usuario)}</code></small></div><button type="button" class="btn-danger-sm" onclick="removerUsuarioNuvem('${window.escapeHTML(d.id)}')">Desativar</button></li>`)
      .join('') || '<li><span class="hint">Nenhum dentista cadastrado.</span></li>';

  document.getElementById('listaRecepcao').innerHTML =
    window.db.config.recepcionistas
      .map((r) => `<li><div><strong>${window.escapeHTML(r.nome)}</strong><br><small class="hint">Usuário: <code>${window.escapeHTML(r.usuario)}</code></small></div><button type="button" class="btn-danger-sm" onclick="removerUsuarioNuvem('${window.escapeHTML(r.id)}')">Desativar</button></li>`)
      .join('') || '<li><span class="hint">Nenhuma recepção cadastrada.</span></li>';

  document.getElementById('listaEspecialidades').innerHTML =
    window.db.config.especialidades.map((e) => `<li><span><strong>${window.escapeHTML(e.nome)}</strong></span><span><strong>${Number(e.percentual) || 0}%</strong></span></li>`).join('');

  document.getElementById('listaTaxas').innerHTML =
    window.db.config.taxas.map((t) => `<li><span><strong>${window.escapeHTML(t.nome)}</strong></span><span><strong>${Number(t.taxa) || 0}%</strong></span></li>`).join('');
}

window.removerUsuarioNuvem = async function (id) {
  if (!confirm('Desativar este acesso?')) return;
  try {
    await DopinAPI.desativarUsuario(id);
    await carregarDadosDaNuvem();
  } catch (err) {
    alert(`Erro ao desativar usuário: ${err.message}`);
  }
};
