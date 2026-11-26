// ==================== MÓDULO: AGENDA E AGENDAMENTOS ====================
// • Administração e Recepção: veem todos os profissionais, criam, editam e excluem.
// • Profissional: vê somente a própria agenda (o servidor já filtra) e, ao tocar no
//   nome do paciente, abre o prontuário dele.
// • Cada card recebe a cor da especialidade (legenda na lateral).
(function () {
  // Grade de horários (ajuste aqui se a clínica abrir em outro horário)
  const HORA_INICIO = 7 * 60;   // 07:00
  const HORA_FIM = 19 * 60;     // última linha: 18:30
  const PASSO_MIN = 30;

  // Cores bem distintas entre si (a ordem segue a ordem alfabética das especialidades)
  const PALETA = ['#1f4e6b', '#2f9e7a', '#b7791f', '#7b5ea7', '#5e97a6', '#b4536a', '#3f6fb5', '#6b8e23', '#0d9488', '#c2410c'];
  const COR_SEM_ESP = '#64748b';
  const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const STATUS_ROTULO = { agendado: 'Agendado', confirmado: 'Confirmado', atendido: 'Atendido', faltou: 'Faltou' };

  let dataSel = '';            // AAAA-MM-DD exibida na grade
  let mesVisivel = '';         // AAAA-MM exibido no mini calendário
  const cacheMes = new Map();  // 'AAAA-MM' → agendamentos
  const carregando = new Map();
  let profsVisiveis = null;    // Set de ids (Administração/Recepção)
  let iniciado = false;
  let ultimoDiaRolado = '';    // evita "pular" a rolagem a cada redesenho

  // ---------- utilidades ----------
  const esc = (v) => window.escapeHTML(v);
  const perfil = () => window.sessaoAtual?.perfil;
  const isProfissional = () => perfil() === 'Profissional';
  const podeAgendar = () => perfil() === 'Administração' || perfil() === 'Recepção';
  const hoje = () => window.hojeISO();
  const pad = (n) => String(n).padStart(2, '0');
  const minutosParaHora = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const mesDe = (iso) => String(iso).slice(0, 7);

  function isoDe(ano, mes0, dia) {
    const d = new Date(ano, mes0, dia);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function somarDias(iso, n) {
    const [a, m, d] = iso.split('-').map(Number);
    return isoDe(a, m - 1, d + n);
  }

  function ultimoDiaMes(ym) {
    const [a, m] = ym.split('-').map(Number);
    return isoDe(a, m, 0);
  }

  function fmtDataLonga(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    const txt = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  const fmtDataCurta = (iso) => String(iso || '').split('-').reverse().join('/');

  function slotsBase() {
    const lista = [];
    for (let m = HORA_INICIO; m < HORA_FIM; m += PASSO_MIN) lista.push(minutosParaHora(m));
    return lista;
  }

  function iniciais(nome) {
    const partes = String(nome || '').replace(/^(dra?\.?|dr\.?)\s+/i, '').trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
  }

  function corEspecialidade(nome) {
    if (!nome) return COR_SEM_ESP;
    const lista = (window.db?.config?.especialidades || []).map((e) => e.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const i = lista.indexOf(nome);
    return i >= 0 ? PALETA[i % PALETA.length] : COR_SEM_ESP;
  }

  function profissionais() {
    const todos = window.db?.config?.dentistas || [];
    if (isProfissional()) return todos.filter((d) => d.id === window.sessaoAtual?.dentistaId);
    return todos;
  }

  const chaveFiltro = () => `dopin_agenda_profs_${window.sessaoAtual?.loginUsuario || 'x'}`;

  function carregarFiltro() {
    if (profsVisiveis) return;
    const ids = profissionais().map((d) => d.id);
    try {
      const salvo = JSON.parse(localStorage.getItem(chaveFiltro()) || 'null');
      if (Array.isArray(salvo)) {
        profsVisiveis = new Set(salvo.filter((id) => ids.includes(id)));
        if (profsVisiveis.size === 0) profsVisiveis = new Set(ids);
        return;
      }
    } catch { /* armazenamento indisponível */ }
    profsVisiveis = new Set(ids);
  }

  function salvarFiltro() {
    try {
      localStorage.setItem(chaveFiltro(), JSON.stringify([...profsVisiveis]));
    } catch { /* ignora */ }
  }

  function profsExibidos() {
    const lista = profissionais();
    if (isProfissional()) return lista;
    carregarFiltro();
    return lista.filter((d) => profsVisiveis.has(d.id));
  }

  // ---------- dados ----------
  async function carregarMes(ym, forcar = false) {
    if (!forcar && cacheMes.has(ym)) return cacheMes.get(ym);
    if (carregando.has(ym)) return carregando.get(ym);
    const prom = DopinAPI.listarAgendamentos(`${ym}-01`, ultimoDiaMes(ym))
      .then((res) => {
        cacheMes.set(ym, res.agendamentos || []);
        return cacheMes.get(ym);
      })
      .finally(() => carregando.delete(ym));
    carregando.set(ym, prom);
    return prom;
  }

  const agendamentosDoDia = (iso) => (cacheMes.get(mesDe(iso)) || []).filter((g) => g.data === iso);

  // ---------- renderização ----------
  function abaAtiva() {
    return document.getElementById('tab-agenda')?.classList.contains('active');
  }

  async function aoAtivar() {
    if (!dataSel) {
      dataSel = hoje();
      mesVisivel = mesDe(dataSel);
    }
    desenhar(); // desenha já com o que houver em cache
    try {
      await Promise.all([carregarMes(mesDe(dataSel), true), mesVisivel !== mesDe(dataSel) ? carregarMes(mesVisivel, true) : null]);
    } catch (err) {
      document.getElementById('agGrade').innerHTML = `<p class="hint" style="padding:16px;">Não foi possível carregar a agenda: ${esc(err.message)}</p>`;
      return;
    }
    desenhar();
  }

  function desenhar() {
    if (!abaAtiva()) return;
    const prof = isProfissional();
    document.getElementById('btnNovoAgendamento')?.classList.toggle('hidden', !podeAgendar());
    document.getElementById('agFiltroProfBox')?.classList.toggle('hidden', prof);
    document.querySelector('#tab-agenda .agenda-titulo').textContent = prof ? 'MINHA AGENDA' : 'AGENDA';
    document.getElementById('agDataTitulo').textContent = fmtDataLonga(dataSel);
    desenharMiniCalendario();
    desenharFiltro();
    desenharLegenda();
    desenharGrade();
  }

  function desenharMiniCalendario() {
    const [a, m] = mesVisivel.split('-').map(Number);
    document.getElementById('agMesTitulo').textContent = `${MESES[m - 1]} ${a}`;
    const primeiro = new Date(a, m - 1, 1);
    const inicio = new Date(a, m - 1, 1 - primeiro.getDay());
    const diasComAgenda = new Set();
    const idsVis = new Set(profsExibidos().map((d) => d.id));
    (cacheMes.get(mesVisivel) || []).forEach((g) => {
      if (idsVis.has(g.profissional_id)) diasComAgenda.add(g.data);
    });

    const diasNoMes = new Date(a, m, 0).getDate();
    const totalCelulas = Math.ceil((primeiro.getDay() + diasNoMes) / 7) * 7;
    let html = DIAS_SEMANA.map((d) => `<span class="mini-cal-sem">${d}</span>`).join('');
    for (let i = 0; i < totalCelulas; i++) {
      const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
      const iso = isoDe(d.getFullYear(), d.getMonth(), d.getDate());
      const fora = d.getMonth() !== m - 1;
      const classes = ['mini-cal-dia', fora ? 'fora' : '', iso === dataSel ? 'sel' : '', iso === hoje() ? 'hoje' : '', diasComAgenda.has(iso) ? 'tem' : '']
        .filter(Boolean).join(' ');
      html += `<button type="button" class="${classes}" data-iso="${iso}" aria-label="${fmtDataLonga(iso)}"${iso === dataSel ? ' aria-current="date"' : ''}>${d.getDate()}</button>`;
    }
    document.getElementById('agMiniCal').innerHTML = html;
  }

  function desenharFiltro() {
    const box = document.getElementById('agFiltroProf');
    if (!box || isProfissional()) return;
    carregarFiltro();
    const lista = profissionais();
    box.innerHTML = lista.length
      ? lista
          .map(
            (d) => `
          <label class="ag-filtro-item">
            <input type="checkbox" value="${esc(d.id)}" ${profsVisiveis.has(d.id) ? 'checked' : ''} />
            <span>${esc(d.nome)}</span>
          </label>`
          )
          .join('')
      : '<p class="hint">Cadastre profissionais em Configurações.</p>';
  }

  function desenharLegenda() {
    const box = document.getElementById('agLegenda');
    if (!box) return;
    const esps = (window.db?.config?.especialidades || []).map((e) => e.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    box.innerHTML =
      esps.map((n) => `<span class="ag-legenda-item"><i style="background:${corEspecialidade(n)}"></i>${esc(n)}</span>`).join('') +
      `<span class="ag-legenda-item"><i style="background:${COR_SEM_ESP}"></i>Sem especialidade</span>`;
  }

  function desenharGrade() {
    const wrap = document.getElementById('agGrade');
    const profs = profsExibidos();
    if (profs.length === 0) {
      wrap.innerHTML = `<p class="hint ag-vazio">${
        profissionais().length ? 'Marque ao menos um profissional em "Visualizar profissional".' : 'Nenhum profissional cadastrado.'
      }</p>`;
      return;
    }

    const doDia = agendamentosDoDia(dataSel).filter((g) => profs.some((p) => p.id === g.profissional_id));
    const horas = [...new Set([...slotsBase(), ...doDia.map((g) => g.hora)])].sort();
    const porCelula = new Map();
    doDia.forEach((g) => porCelula.set(`${g.profissional_id}|${g.hora}`, g));
    const agendar = podeAgendar();
    const passado = dataSel < hoje();

    let html = `<div class="ag-grade" style="--ag-cols:${profs.length}">`;
    html += '<div class="ag-cel ag-canto"></div>';
    html += profs
      .map(
        (p) => `
        <div class="ag-cel ag-prof-head">
          <span class="ag-avatar" aria-hidden="true">${esc(iniciais(p.nome))}<i class="ag-online"></i></span>
          <span class="ag-prof-nome">${esc(p.nome)}</span>
        </div>`
      )
      .join('');

    horas.forEach((h) => {
      html += `<div class="ag-cel ag-hora">${h}</div>`;
      profs.forEach((p) => {
        const g = porCelula.get(`${p.id}|${h}`);
        if (g) {
          const ok = g.status === 'confirmado' || g.status === 'atendido';
          const pend = !isProfissional() && g.paciente_cadastro_status === 'pendente';
          html += `
            <div class="ag-cel ag-slot">
              <div class="ag-card status-${esc(g.status)}" style="--cor:${corEspecialidade(g.especialidade)}" data-id="${esc(g.id)}"
                   role="button" tabindex="0" title="${esc(`${g.hora} - ${g.paciente_nome}${g.especialidade ? ' • ' + g.especialidade : ''}${g.observacao ? '\n' + g.observacao : ''}`)}">
                <div class="ag-card-linha">
                  <span>${esc(g.hora)} - </span>
                  <button type="button" class="ag-card-nome" data-paciente="${esc(g.paciente_id || '')}">${esc(g.paciente_nome)}</button>
                  ${ok ? `<span class="ag-check" title="${STATUS_ROTULO[g.status]}">✓</span>` : ''}
                </div>
                <small class="ag-card-info">${esc(g.especialidade || 'Sem especialidade')}${g.status === 'faltou' ? ' • FALTOU' : g.status === 'atendido' ? ' • Atendido' : ''}${pend ? ' • Cadastro pendente' : ''}</small>
              </div>
            </div>`;
        } else {
          html += `<div class="ag-cel ag-slot ag-livre">${
            agendar && !passado
              ? `<button type="button" class="ag-add" data-prof="${esc(p.id)}" data-hora="${h}" aria-label="Agendar ${h} com ${esc(p.nome)}">+</button>`
              : ''
          }</div>`;
        }
      });
    });
    html += '</div>';
    wrap.innerHTML = html;

    // Ao trocar de dia, posiciona a grade no 1º agendamento (ou às 08:00)
    if (ultimoDiaRolado !== dataSel) {
      ultimoDiaRolado = dataSel;
      const alvo = doDia.length ? doDia.map((g) => g.hora).sort()[0] : '08:00';
      const linha = [...wrap.querySelectorAll('.ag-hora')].find((x) => x.textContent >= alvo);
      const cabecalho = wrap.querySelector('.ag-prof-head');
      if (linha) {
        const deslocamento = linha.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop;
        wrap.scrollTop = Math.max(0, deslocamento - (cabecalho?.offsetHeight || 0));
      } else {
        wrap.scrollTop = 0;
      }
    }
  }

  // ---------- prontuário ----------
  async function abrirProntuarioPaciente(pacienteId) {
    if (!pacienteId) {
      alert('Este agendamento não está vinculado a um cadastro de paciente.');
      return;
    }
    if (!(window.db.pacientes || []).some((p) => p.id === pacienteId)) {
      try {
        const lista = await DopinAPI.listarPacientes();
        window.db.pacientes = lista.pacientes || [];
      } catch { /* segue */ }
    }
    if (!(window.db.pacientes || []).some((p) => p.id === pacienteId)) {
      alert('Paciente não encontrado (pode ter sido excluído).');
      return;
    }
    if (typeof window.ativarAba === 'function') window.ativarAba('pacientes');
    await window.ProntuarioModule?.abrirProntuario(pacienteId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- modal ----------
  const el = (id) => document.getElementById(id);

  function preencherSelects(profId, esp, hora) {
    const profs = profissionais();
    el('agProfissional').innerHTML =
      '<option value="">Selecione o profissional...</option>' +
      profs.map((d) => `<option value="${esc(d.id)}">${esc(d.nome)}</option>`).join('');
    el('agProfissional').value = profId || '';

    const esps = window.db?.config?.especialidades || [];
    el('agEspecialidade').innerHTML =
      '<option value="">Selecione a especialidade...</option>' +
      esps.map((e) => `<option value="${esc(e.nome)}">${esc(e.nome)}</option>`).join('');
    if (esp && !esps.some((e) => e.nome === esp)) {
      el('agEspecialidade').insertAdjacentHTML('beforeend', `<option value="${esc(esp)}">${esc(esp)} (removida)</option>`);
    }
    el('agEspecialidade').value = esp || '';

    const horas = slotsBase();
    if (hora && !horas.includes(hora)) horas.push(hora);
    horas.sort();
    el('agHora').innerHTML = horas.map((h) => `<option value="${h}">${h}</option>`).join('');
    el('agHora').value = hora || horas[0];
  }

  function mostrarErro(msg) {
    const e = el('agErro');
    e.textContent = msg || '';
    e.classList.toggle('hidden', !msg);
  }

  function definirPacienteSelecionado(pac) {
    el('agPacienteId').value = pac ? pac.id : '';
    el('agTelefoneBox').classList.toggle('hidden', Boolean(pac));
    const hint = el('agNomeHint');
    if (pac) {
      el('agNome').value = pac.nome;
      hint.textContent = '✓ Paciente cadastrado vinculado.';
      hint.className = 'hint text-success';
    } else {
      hint.textContent = el('agNome').value.trim()
        ? 'Paciente novo: será criado um cadastro provisório (CADASTRO PENDENTE).'
        : 'Busque um paciente cadastrado ou digite o nome de um paciente novo.';
      hint.className = 'hint';
    }
  }

  function abrirModal({ agendamento = null, profId = '', hora = '' } = {}) {
    if (!podeAgendar()) return;
    mostrarErro('');
    el('formAgendamento').reset();
    el('agNomeDropdown').classList.add('hidden');
    const edit = Boolean(agendamento);
    el('agModalTitulo').textContent = edit ? 'EDITAR AGENDAMENTO' : 'NOVO AGENDAMENTO';
    el('agSalvar').textContent = edit ? 'Salvar' : 'Agendar';
    el('agExcluir').classList.toggle('hidden', !edit);
    el('agStatusBox').classList.toggle('hidden', !edit);
    el('agId').value = edit ? agendamento.id : '';

    if (edit) {
      el('agNome').value = agendamento.paciente_nome || '';
      const pac = (window.db.pacientes || []).find((p) => p.id === agendamento.paciente_id);
      definirPacienteSelecionado(pac || null);
      if (!pac) el('agPacienteId').value = agendamento.paciente_id || '';
      preencherSelects(agendamento.profissional_id, agendamento.especialidade, agendamento.hora);
      el('agData').value = agendamento.data;
      el('agStatus').value = agendamento.status || 'agendado';
      el('agObservacao').value = agendamento.observacao || '';
    } else {
      definirPacienteSelecionado(null);
      preencherSelects(profId, '', hora);
      el('agData').value = dataSel || hoje();
    }

    el('modalAgendamento').classList.remove('hidden');
    setTimeout(() => el('agNome').focus(), 50);
  }

  function fecharModal() {
    el('modalAgendamento').classList.add('hidden');
    el('agNomeDropdown').classList.add('hidden');
  }

  function mostrarSugestoes() {
    const termo = el('agNome').value.trim().toLowerCase();
    const dd = el('agNomeDropdown');
    if (termo.length < 2) {
      dd.classList.add('hidden');
      return;
    }
    const PU = window.PacienteUtils || {};
    const digitos = termo.replace(/\D/g, '');
    const verContato = PU.podeVerContato ? PU.podeVerContato() : true;
    const lista = (window.db.pacientes || [])
      .filter(
        (p) =>
          String(p.nome || '').toLowerCase().includes(termo) ||
          (digitos.length >= 3 && String(p.cpf || '').replace(/\D/g, '').includes(digitos)) ||
          (verContato && digitos.length >= 4 && String(p.telefone || '').replace(/\D/g, '').includes(digitos))
      )
      .slice(0, 8);
    dd.innerHTML =
      lista
        .map(
          (p) => `
        <div class="paciente-picker-item" data-id="${esc(p.id)}">
          <strong>${esc(p.nome)}${PU.isCadastroPendente?.(p) ? ' ' + PU.tagPendente() : ''}</strong>
          <small>${p.cpf ? `CPF: ${esc(p.cpf)}` : 'Sem CPF'}${verContato && p.telefone ? ` • ${esc(p.telefone)}` : ''}</small>
        </div>`
        )
        .join('') +
      `<div class="paciente-picker-item picker-novo" data-novo="1">
        <strong>+ Paciente novo: "${esc(el('agNome').value.trim())}"</strong>
        <small>Cria cadastro provisório (CADASTRO PENDENTE) ao agendar</small>
      </div>`;
    dd.classList.remove('hidden');
  }

  // Garante que o agendamento fique ligado a um cadastro (para abrir o prontuário depois)
  async function resolverPaciente() {
    const id = el('agPacienteId').value;
    const nome = el('agNome').value.trim();
    if (id) return { id, nome };
    if (nome.length < 3) {
      mostrarErro('Informe o nome do paciente (mínimo 3 letras).');
      return null;
    }
    const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const iguais = (window.db.pacientes || []).filter((p) => norm(p.nome) === norm(nome));
    if (iguais.length === 1) {
      const p = iguais[0];
      const usar = confirm(
        `Já existe um paciente cadastrado chamado "${p.nome}"${p.cpf ? ` (CPF ${p.cpf})` : ''}.\n\nOK = agendar para este paciente\nCancelar = criar um NOVO cadastro provisório`
      );
      if (usar) return { id: p.id, nome: p.nome };
    }
    const payload = { nome, telefone: el('agTelefone').value.trim(), origem_cadastro: 'agenda' };
    payload.cadastro_status = window.PacienteUtils?.calcularStatusCadastro?.(payload) || 'pendente';
    const res = await DopinAPI.criarPaciente(payload);
    const novo = { id: res.id, ...payload, cadastro_status: res.cadastro_status || payload.cadastro_status };
    window.db.pacientes = [novo, ...(window.db.pacientes || [])];
    el('agPacienteId').value = res.id; // nova tentativa reaproveita o mesmo cadastro
    return { id: res.id, nome };
  }

  async function salvar(e) {
    e.preventDefault();
    mostrarErro('');
    if (!el('agProfissional').value) return mostrarErro('Selecione o profissional.');
    if (!el('agData').value) return mostrarErro('Informe a data.');
    if (!el('agHora').value) return mostrarErro('Informe o horário.');

    const btn = el('agSalvar');
    btn.disabled = true;
    try {
      const pac = await resolverPaciente();
      if (!pac) return;
      const id = el('agId').value;
      const payload = {
        paciente_id: pac.id,
        paciente_nome: pac.nome,
        profissional_id: el('agProfissional').value,
        especialidade: el('agEspecialidade').value,
        data: el('agData').value,
        hora: el('agHora').value,
        observacao: el('agObservacao').value.trim()
      };
      if (id) payload.status = el('agStatus').value;

      const anterior = id ? Object.values(Object.fromEntries(cacheMes)).flat().find((g) => g.id === id) : null;
      if (id) await DopinAPI.atualizarAgendamento(id, payload);
      else await DopinAPI.criarAgendamento(payload);

      fecharModal();
      dataSel = payload.data;
      mesVisivel = mesDe(dataSel);
      const meses = new Set([mesDe(payload.data), anterior ? mesDe(anterior.data) : null].filter(Boolean));
      await Promise.all([...meses].map((ym) => carregarMes(ym, true)));
      if (window.ProntuarioModule) window.ProntuarioModule.renderizarListaPacientes();
      desenhar();
    } catch (err) {
      mostrarErro(err.message || 'Erro ao salvar o agendamento.');
    } finally {
      btn.disabled = false;
    }
  }

  async function excluir() {
    const id = el('agId').value;
    const g = Object.values(Object.fromEntries(cacheMes)).flat().find((x) => x.id === id);
    if (!g) return;
    if (!confirm(`Excluir o agendamento de ${g.paciente_nome} em ${fmtDataCurta(g.data)} às ${g.hora}?`)) return;
    try {
      await DopinAPI.excluirAgendamento(id);
      fecharModal();
      await carregarMes(mesDe(g.data), true);
      desenhar();
    } catch (err) {
      mostrarErro(err.message || 'Erro ao excluir.');
    }
  }

  // ---------- eventos ----------
  function irPara(iso) {
    dataSel = iso;
    const ym = mesDe(iso);
    const mudouMes = ym !== mesVisivel;
    mesVisivel = ym;
    desenhar();
    if (!cacheMes.has(ym) || mudouMes) carregarMes(ym).then(desenhar).catch(() => {});
  }

  function init() {
    if (iniciado) return;
    iniciado = true;

    el('btnNovoAgendamento')?.addEventListener('click', () => abrirModal());
    el('agHoje')?.addEventListener('click', () => irPara(hoje()));
    el('agDiaAnterior')?.addEventListener('click', () => irPara(somarDias(dataSel, -1)));
    el('agDiaProximo')?.addEventListener('click', () => irPara(somarDias(dataSel, 1)));
    el('agMesAnterior')?.addEventListener('click', () => {
      const [a, m] = mesVisivel.split('-').map(Number);
      mesVisivel = isoDe(a, m - 2, 1).slice(0, 7);
      desenhar();
      carregarMes(mesVisivel).then(desenhar).catch(() => {});
    });
    el('agMesProximo')?.addEventListener('click', () => {
      const [a, m] = mesVisivel.split('-').map(Number);
      mesVisivel = isoDe(a, m, 1).slice(0, 7);
      desenhar();
      carregarMes(mesVisivel).then(desenhar).catch(() => {});
    });
    el('agMiniCal')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-iso]');
      if (b) irPara(b.dataset.iso);
    });
    el('agFiltroProf')?.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      if (e.target.checked) profsVisiveis.add(e.target.value);
      else profsVisiveis.delete(e.target.value);
      salvarFiltro();
      desenhar();
    });

    el('agGrade')?.addEventListener('click', (e) => {
      const add = e.target.closest('.ag-add');
      if (add) return abrirModal({ profId: add.dataset.prof, hora: add.dataset.hora });

      const nome = e.target.closest('.ag-card-nome');
      if (nome) {
        e.stopPropagation();
        return abrirProntuarioPaciente(nome.dataset.paciente);
      }
      const card = e.target.closest('.ag-card');
      if (!card) return;
      const g = agendamentosDoDia(dataSel).find((x) => x.id === card.dataset.id);
      if (!g) return;
      if (podeAgendar()) abrirModal({ agendamento: g });
      else abrirProntuarioPaciente(g.paciente_id);
    });
    el('agGrade')?.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('ag-card')) {
        e.preventDefault();
        e.target.click();
      }
    });

    // Modal
    el('formAgendamento')?.addEventListener('submit', salvar);
    el('agCancelar')?.addEventListener('click', fecharModal);
    el('agModalFechar')?.addEventListener('click', fecharModal);
    el('agExcluir')?.addEventListener('click', excluir);
    el('modalAgendamento')?.addEventListener('click', (e) => {
      if (e.target.id === 'modalAgendamento') fecharModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el('modalAgendamento')?.classList.contains('hidden')) fecharModal();
    });
    el('agNome')?.addEventListener('input', () => {
      el('agPacienteId').value = '';
      definirPacienteSelecionado(null);
      mostrarSugestoes();
    });
    el('agNome')?.addEventListener('focus', mostrarSugestoes);
    el('agNomeDropdown')?.addEventListener('click', (e) => {
      const item = e.target.closest('.paciente-picker-item');
      if (!item) return;
      if (item.dataset.novo) definirPacienteSelecionado(null);
      else definirPacienteSelecionado((window.db.pacientes || []).find((p) => p.id === item.dataset.id) || null);
      el('agNomeDropdown').classList.add('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#agPickerWrap')) el('agNomeDropdown')?.classList.add('hidden');
    });
  }

  // Chamado ao sair da conta: nada de uma sessão aparece na próxima
  function limpar() {
    cacheMes.clear();
    profsVisiveis = null;
    dataSel = '';
    mesVisivel = '';
    ultimoDiaRolado = '';
    const g = el('agGrade');
    if (g) g.innerHTML = '';
  }

  window.AgendaModule = { init, aoAtivar, limpar, corEspecialidade };
})();
