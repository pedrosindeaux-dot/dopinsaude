// ==================== MÓDULO DE PACIENTES, ANAMNESE, ODONTOGRAMA, ORÇAMENTO E EVOLUÇÃO ====================
(function () {
  const QUADRANTES_FDI = [
    { titulo: 'Superior Direito (18–11)', dentes: ['18', '17', '16', '15', '14', '13', '12', '11'] },
    { titulo: 'Superior Esquerdo (21–28)', dentes: ['21', '22', '23', '24', '25', '26', '27', '28'] },
    { titulo: 'Inferior Direito (48–41)', dentes: ['48', '47', '46', '45', '44', '43', '42', '41'] },
    { titulo: 'Inferior Esquerdo (31–38)', dentes: ['31', '32', '33', '34', '35', '36', '37', '38'] }
  ];

  const ARCADA_SUP = ['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'];
  const ARCADA_INF = ['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];

  let pacienteAtualId = null;
  let procedimentosAtuais = [];
  let pagamentosAtuais = [];
  let evolucoesAtuais = [];
  let documentosAtuais = [];

  function fmtDataBR(iso) {
    if (!iso) return '-';
    const partes = String(iso).slice(0, 10).split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : iso;
  }

  function fmtTamanhoBytes(bytes) {
    const b = Number(bytes || 0);
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  }

  function classeStatus(status) {
    if (status === 'Realizado') return 'realizado';
    if (status === 'Em andamento') return 'andamento';
    return 'pendente';
  }

  // ==================== UTILITÁRIOS DE PACIENTE (CPF, PERMISSÕES, STATUS) ====================
  // Campos exigidos para o cadastro deixar de ser "CADASTRO PENDENTE".
  // Mantenha esta lista igual à do backend (função statusCadastro no Worker).
  const CAMPOS_OBRIGATORIOS_CADASTRO = [
    { campo: 'nome', rotulo: 'Nome completo' },
    { campo: 'cpf', rotulo: 'CPF válido' },
    { campo: 'data_nascimento', rotulo: 'Data de nascimento' },
    { campo: 'telefone', rotulo: 'Telefone' }
  ];

  const normalizarCPF = (cpf) => String(cpf || '').replace(/\D/g, '');

  function cpfValido(cpf) {
    const d = normalizarCPF(cpf);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (let t = 9; t < 11; t++) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
      const dv = ((soma * 10) % 11) % 10;
      if (dv !== Number(d[t])) return false;
    }
    return true;
  }

  function formatarCPF(cpf) {
    const d = normalizarCPF(cpf).slice(0, 11);
    if (d.length !== 11) return String(cpf || '').trim();
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  // Máscara leve enquanto digita (aceita colar com ou sem pontuação)
  function aplicarMascaraCPF(input) {
    input.addEventListener('input', () => {
      const d = normalizarCPF(input.value).slice(0, 11);
      let v = d;
      if (d.length > 9) v = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
      else if (d.length > 6) v = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
      else if (d.length > 3) v = `${d.slice(0, 3)}.${d.slice(3)}`;
      input.value = v;
    });
  }

  const normalizarNome = (nome) =>
    String(nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  function buscarPorCPF(cpf, ignorarId = null) {
    const alvo = normalizarCPF(cpf);
    if (!alvo) return null;
    return (window.db?.pacientes || []).find((p) => p.id !== ignorarId && normalizarCPF(p.cpf) === alvo) || null;
  }

  function camposPendentes(dados) {
    return CAMPOS_OBRIGATORIOS_CADASTRO.filter(({ campo }) => {
      if (campo === 'cpf') return !cpfValido(dados.cpf);
      return !String(dados[campo] || '').trim();
    });
  }

  const calcularStatusCadastro = (dados) => (camposPendentes(dados).length === 0 ? 'completo' : 'pendente');
  const isCadastroPendente = (p) => Boolean(p) && p.cadastro_status === 'pendente';
  const podeVerContato = () => window.sessaoAtual?.perfil !== 'Profissional';
  const tagPendente = () => '<span class="status-tag cadastro-pendente" style="margin-left:6px;">CADASTRO PENDENTE</span>';

  // Aviso de CPF duplicado com atalho para o cadastro existente
  function avisarCPFDuplicado(existente) {
    const abrir = confirm(
      `Já existe um paciente cadastrado com este CPF:\n\n${existente.nome}${existente.cpf ? ` — CPF ${formatarCPF(existente.cpf)}` : ''}\n\nNão é permitido criar um segundo cadastro com o mesmo CPF.\n\nDeseja abrir o cadastro existente?`
    );
    if (abrir) abrirProntuario(existente.id);
  }

  function getPacienteAtual() {
    return (window.db?.pacientes || []).find((p) => p.id === pacienteAtualId) || null;
  }

  // ==================== INICIALIZAÇÃO DE EVENTOS ====================
  function init() {
    document.querySelectorAll('.input-cpf').forEach(aplicarMascaraCPF);
    document.getElementById('filtroCadastroPendente')?.addEventListener('change', renderizarListaPacientes);

    // Cadastro / Edição de Paciente + Anamnese
    document.getElementById('formPaciente')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSalvarPaciente');
      const editId = document.getElementById('pacEditId').value;
      const payload = {
        nome: document.getElementById('pacNome').value.trim(),
        cpf: document.getElementById('pacCpf').value.trim(),
        data_nascimento: document.getElementById('pacNascimento').value,
        telefone: document.getElementById('pacTelefone').value.trim(),
        email: document.getElementById('pacEmail').value.trim(),
        endereco: document.getElementById('pacEndereco').value.trim(),
        historico_medico: document.getElementById('pacHistMedico').value.trim(),
        doencas_sistemicas: document.getElementById('pacDoencas').value.trim(),
        alergias: document.getElementById('pacAlergias').value.trim(),
        medicamentos_uso: document.getElementById('pacMedicamentos').value.trim(),
        historico_odontologico: document.getElementById('pacHistOdonto').value.trim(),
        observacoes_anamnese: document.getElementById('pacObsAnamnese').value.trim()
      };
      if (!payload.nome) return;

      const isProf = !podeVerContato();
      if (isProf) {
        // Profissional não visualiza nem altera telefone/e-mail: os campos não são enviados.
        // (O backend também ignora esses campos para o perfil Profissional.)
        delete payload.telefone;
        delete payload.email;
      }

      // CPF: identificador único (com ou sem pontuação)
      if (payload.cpf) {
        if (!cpfValido(payload.cpf)) {
          alert('CPF inválido. Confira os 11 dígitos informados (ou deixe em branco se o paciente não tiver CPF no momento).');
          document.getElementById('pacCpf').focus();
          return;
        }
        payload.cpf = formatarCPF(payload.cpf);
        const existente = buscarPorCPF(payload.cpf, editId || null);
        if (existente) {
          avisarCPFDuplicado(existente);
          return;
        }
      } else if (!editId) {
        // Sem CPF: não bloqueia (nomes iguais são permitidos), mas alerta possível duplicidade
        const nomeNorm = normalizarNome(payload.nome);
        const parecido = (window.db?.pacientes || []).find(
          (p) =>
            normalizarNome(p.nome) === nomeNorm &&
            (!payload.data_nascimento || !p.data_nascimento || p.data_nascimento === payload.data_nascimento)
        );
        if (
          parecido &&
          !confirm(
            `Já existe um paciente chamado "${parecido.nome}"${parecido.cpf ? ` (CPF ${formatarCPF(parecido.cpf)})` : ' sem CPF'}${parecido.data_nascimento ? `, nascido em ${fmtDataBR(parecido.data_nascimento)}` : ''}.\n\nPode ser a mesma pessoa. Cadastre o CPF para evitar duplicidade.\n\nDeseja criar mesmo assim um NOVO cadastro?`
          )
        ) {
          return;
        }
      }

      // Status do cadastro (o backend recalcula com os dados completos, inclusive para o Profissional)
      if (!isProf) payload.cadastro_status = calcularStatusCadastro(payload);

      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        let pacId = editId;
        if (editId) {
          await DopinAPI.atualizarPaciente(editId, payload);
        } else {
          const res = await DopinAPI.criarPaciente(payload);
          pacId = res.id;
        }
        resetarFormPaciente();
        const lista = await DopinAPI.listarPacientes();
        window.db.pacientes = lista.pacientes || [];
        renderizarListaPacientes();
        if (pacId) await abrirProntuario(pacId);
      } catch (err) {
        if (err.status === 409 && err.dados?.paciente_id) {
          const lista = await DopinAPI.listarPacientes().catch(() => null);
          if (lista) window.db.pacientes = lista.pacientes || [];
          const existente = (window.db?.pacientes || []).find((p) => p.id === err.dados.paciente_id) || {
            id: err.dados.paciente_id,
            nome: err.dados.paciente_nome || 'Paciente existente',
            cpf: payload.cpf
          };
          avisarCPFDuplicado(existente);
        } else {
          alert(`Erro ao salvar paciente: ${err.message}`);
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save"></i> Salvar Paciente';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });

    document.getElementById('btnCancelarEditPaciente')?.addEventListener('click', resetarFormPaciente);
    document.getElementById('buscaPaciente')?.addEventListener('input', renderizarListaPacientes);

    // Voltar e Editar a partir do Prontuário
    document.getElementById('btnVoltarListaPacientes')?.addEventListener('click', () => {
      document.getElementById('viewProntuarioPaciente').classList.add('hidden');
      document.getElementById('viewListaPacientes').classList.remove('hidden');
      renderizarListaPacientes();
    });

    document.getElementById('btnEditarCadastroPront')?.addEventListener('click', () => {
      if (!pacienteAtualId) return;
      document.getElementById('viewProntuarioPaciente').classList.add('hidden');
      document.getElementById('viewListaPacientes').classList.remove('hidden');
      editarPaciente(pacienteAtualId);
    });

    // Sub-abas internas do Prontuário
    document.querySelectorAll('.subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        ativarSubAba(btn.dataset.subtab);
      });
    });

    // Procedimento Adicional (sem dente específico)
    document.getElementById('formProcAdicional')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pacienteAtualId) return;
      const descricao = document.getElementById('procAdicDesc').value.trim();
      const valor = Number(document.getElementById('procAdicValor').value) || 0;
      const status = document.getElementById('procAdicStatus').value;
      if (!descricao) return;

      try {
        await DopinAPI.criarProcedimento(pacienteAtualId, {
          dente_fdi: null,
          descricao,
          valor,
          status
        });
        e.target.reset();
        await carregarDadosProntuario(pacienteAtualId);
      } catch (err) {
        alert(`Erro ao adicionar procedimento: ${err.message}`);
      }
    });

    // Registrar Pagamento do Paciente (Orçamento)
    document.getElementById('formPagamentoPaciente')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pacienteAtualId) return;
      try {
        await DopinAPI.criarPagamentoPaciente(pacienteAtualId, {
          data_pagamento: document.getElementById('pagPacData').value,
          valor: Number(document.getElementById('pagPacValor').value) || 0,
          forma_pagamento: document.getElementById('pagPacForma').value,
          observacao: document.getElementById('pagPacObs').value.trim()
        });
        e.target.reset();
        document.getElementById('pagPacData').value = window.hojeISO();
        await carregarDadosProntuario(pacienteAtualId);
      } catch (err) {
        alert(`Erro ao registrar pagamento: ${err.message}`);
      }
    });

    // Modal de Utilização de Procedimento no Orçamento
    document.getElementById('btnCancelarUtilProc')?.addEventListener('click', () => {
      document.getElementById('modalUtilizarProc').classList.add('hidden');
    });

    document.getElementById('formUtilizarProc')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pacienteAtualId) return;
      const procId = document.getElementById('utilProcId').value;
      try {
        await DopinAPI.utilizarProcedimento(pacienteAtualId, procId, {
          dentista_id: document.getElementById('utilProcDentista').value,
          especialidade: document.getElementById('utilProcEsp').value,
          valor_utilizado: Number(document.getElementById('utilProcValor').value) || 0,
          data_utilizacao: document.getElementById('utilProcData').value
        });
        document.getElementById('modalUtilizarProc').classList.add('hidden');
        await carregarDadosProntuario(pacienteAtualId);
      } catch (err) {
        alert(`Erro ao registrar utilização: ${err.message}`);
      }
    });

    // Evolução Clínica (Criar / Editar)
    document.getElementById('formEvolucao')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pacienteAtualId) return;
      const editId = document.getElementById('evolEditId').value;
      const payload = {
        data_atendimento: document.getElementById('evolData').value,
        descricao: document.getElementById('evolDescricao').value.trim()
      };
      if (!payload.data_atendimento || !payload.descricao) return;

      const btn = document.getElementById('btnSalvarEvolucao');
      btn.disabled = true;
      try {
        if (editId) {
          await DopinAPI.atualizarEvolucao(pacienteAtualId, editId, payload);
        } else {
          await DopinAPI.criarEvolucao(pacienteAtualId, payload);
        }
        resetarFormEvolucao();
        await carregarDadosProntuario(pacienteAtualId);
      } catch (err) {
        alert(`Erro ao salvar evolução: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('btnCancelarEditEvol')?.addEventListener('click', resetarFormEvolucao);

    // Upload de Exames / Anexos (R2)
    document.getElementById('formUploadDocumento')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pacienteAtualId) return;
      const arquivo = document.getElementById('docArquivo')?.files?.[0];
      if (!arquivo) return;

      const btn = document.getElementById('btnEnviarDocumento');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      try {
        const fd = new FormData();
        fd.append('arquivo', arquivo);
        fd.append('paciente_id', pacienteAtualId);
        fd.append('categoria', document.getElementById('docCategoria').value);
        await DopinAPI.uploadDocumento(fd);
        e.target.reset();
        await carregarDadosProntuario(pacienteAtualId);
      } catch (err) {
        alert(`Erro ao enviar arquivo: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="upload-cloud"></i> Enviar Arquivo Seguro';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }

  function aplicarPermissoesFormPaciente() {
    const ver = podeVerContato();
    document.getElementById('grpPacTelefone')?.classList.toggle('hidden', !ver);
    document.getElementById('grpPacEmail')?.classList.toggle('hidden', !ver);
  }

  function atualizarAvisoPendente(p) {
    const box = document.getElementById('pacAvisoPendente');
    if (!box) return;
    if (!p || !isCadastroPendente(p)) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const faltam = camposPendentes(p)
      .filter(({ campo }) => podeVerContato() || campo !== 'telefone')
      .map((c) => c.rotulo);
    box.innerHTML = `<strong>CADASTRO PENDENTE.</strong> ${
      faltam.length ? `Complete: ${window.escapeHTML(faltam.join(', '))}.` : 'Salve para atualizar o status.'
    } Ao salvar com todos os dados obrigatórios, o status muda automaticamente para "Cadastro completo".`;
    box.classList.remove('hidden');
  }

  function resetarFormPaciente() {
    document.getElementById('formPaciente')?.reset();
    document.getElementById('pacEditId').value = '';
    atualizarAvisoPendente(null);
    aplicarPermissoesFormPaciente();
    document.getElementById('tituloFormPaciente').innerHTML =
      '<i data-lucide="user-plus"></i> Cadastrar Novo Paciente &amp; Anamnese';
    document.getElementById('btnCancelarEditPaciente')?.classList.add('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function resetarFormEvolucao() {
    document.getElementById('evolEditId').value = '';
    document.getElementById('evolData').value = window.hojeISO();
    document.getElementById('evolDescricao').value = '';
    document.getElementById('tituloFormEvolucao').innerHTML = '<i data-lucide="pen-line"></i> Nova Evolução Clínica';
    document.getElementById('btnSalvarEvolucao').innerHTML = '<i data-lucide="save"></i> Salvar Evolução';
    document.getElementById('btnCancelarEditEvol')?.classList.add('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function ativarSubAba(nome) {
    document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.toggle('active', b.dataset.subtab === nome));
    document.querySelectorAll('.subtab-panel').forEach((p) => p.classList.toggle('hidden', p.id !== `subtab-${nome}`));
    if (nome === 'documentos' && window.DocumentosModule && typeof window.DocumentosModule.renderizar === 'function') {
      window.DocumentosModule.renderizar(getPacienteAtual());
    }
  }

  // ==================== LISTA DE PACIENTES ====================
  function renderizarListaPacientes() {
    const ul = document.getElementById('listaPacientes');
    if (!ul) return;
    const isProf = window.sessaoAtual?.perfil === 'Profissional';
    const cardCad = document.getElementById('cardCadastroPaciente');
    if (cardCad) cardCad.classList.toggle('hidden', isProf && !document.getElementById('pacEditId').value);

    aplicarPermissoesFormPaciente();
    const termo = (document.getElementById('buscaPaciente')?.value || '').trim().toLowerCase();
    const termoCpf = normalizarCPF(termo);

    // Filtro "Só cadastros pendentes" (Administração e Recepção)
    const todos = window.db?.pacientes || [];
    const totalPendentes = todos.filter(isCadastroPendente).length;
    const wrapFiltro = document.getElementById('filtroPendentesWrap');
    const chkPend = document.getElementById('filtroCadastroPendente');
    if (wrapFiltro) wrapFiltro.classList.toggle('hidden', isProf);
    const contador = document.getElementById('contadorPendentes');
    if (contador) contador.textContent = totalPendentes;
    const soPendentes = !isProf && Boolean(chkPend?.checked);

    const filtrados = todos.filter(
      (p) =>
        (!soPendentes || isCadastroPendente(p)) &&
        (String(p.nome || '').toLowerCase().includes(termo) ||
          String(p.cpf || '').toLowerCase().includes(termo) ||
          (termoCpf.length >= 3 && normalizarCPF(p.cpf).includes(termoCpf)))
    );

    if (filtrados.length === 0) {
      ul.innerHTML = '<li><span class="hint">Nenhum paciente encontrado.</span></li>';
      return;
    }

    ul.innerHTML = filtrados
      .map((p) => {
        const detalhes = [
          p.cpf ? `CPF: ${window.escapeHTML(p.cpf)}` : 'Sem CPF',
          podeVerContato() && p.telefone ? `Tel: ${window.escapeHTML(p.telefone)}` : '',
          p.alergias ? `⚠️ Alergia: ${window.escapeHTML(p.alergias)}` : ''
        ]
          .filter(Boolean)
          .join(' • ');

        const perfil = window.sessaoAtual?.perfil;
        const pendenteExcl = p.status_exclusao === 'pendente';
        const badgeExcl = pendenteExcl
          ? '<span class="status-tag pendente" style="margin-left:6px;">Exclusão pendente</span>'
          : '';
        const badgeCadastro = !isProf && isCadastroPendente(p) ? tagPendente() : '';
        const btnExcluir =
          perfil === 'Administração'
            ? `<button type="button" class="btn-danger-sm" onclick="ProntuarioModule.excluirPaciente('${window.escapeHTML(p.id)}', '${window.escapeHTML(p.nome)}')">Excluir</button>`
            : perfil === 'Recepção' && !pendenteExcl
            ? `<button type="button" class="btn-danger-sm" onclick="ProntuarioModule.excluirPaciente('${window.escapeHTML(p.id)}', '${window.escapeHTML(p.nome)}')">Solicitar Exclusão</button>`
            : '';

        return `
          <li>
            <div>
              <strong>${window.escapeHTML(p.nome)}</strong>${badgeCadastro}${badgeExcl}
              ${detalhes ? `<br><small class="hint">${detalhes}</small>` : ''}
            </div>
            <div class="item-actions">
              <button type="button" class="btn-edit-sm" onclick="ProntuarioModule.abrirProntuario('${window.escapeHTML(p.id)}')">
                Abrir Prontuário
              </button>
              <button type="button" class="btn-edit-sm" onclick="ProntuarioModule.editarPaciente('${window.escapeHTML(p.id)}')">
                Editar
              </button>
              ${btnExcluir}
            </div>
          </li>`;
      })
      .join('');
  }

  function editarPaciente(pacienteId) {
    const p = (window.db?.pacientes || []).find((item) => item.id === pacienteId);
    if (!p) return;

    document.getElementById('cardCadastroPaciente')?.classList.remove('hidden');
    document.getElementById('pacEditId').value = p.id;
    document.getElementById('pacNome').value = p.nome || '';
    document.getElementById('pacCpf').value = p.cpf || '';
    document.getElementById('pacNascimento').value = p.data_nascimento || '';
    document.getElementById('pacTelefone').value = podeVerContato() ? p.telefone || '' : '';
    document.getElementById('pacEmail').value = podeVerContato() ? p.email || '' : '';
    aplicarPermissoesFormPaciente();
    atualizarAvisoPendente(p);
    document.getElementById('pacEndereco').value = p.endereco || '';
    document.getElementById('pacHistMedico').value = p.historico_medico || '';
    document.getElementById('pacDoencas').value = p.doencas_sistemicas || '';
    document.getElementById('pacAlergias').value = p.alergias || '';
    document.getElementById('pacMedicamentos').value = p.medicamentos_uso || '';
    document.getElementById('pacHistOdonto').value = p.historico_odontologico || '';
    document.getElementById('pacObsAnamnese').value = p.observacoes_anamnese || '';

    document.getElementById('tituloFormPaciente').innerHTML =
      `<i data-lucide="edit-3"></i> Editando Cadastro &amp; Anamnese — ${window.escapeHTML(p.nome)}`;
    document.getElementById('btnCancelarEditPaciente')?.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    document.getElementById('cardCadastroPaciente')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function excluirPaciente(pacienteId, nomePaciente) {
    const perfil = window.sessaoAtual?.perfil;
    if (perfil === 'Profissional') return;

    try {
      if (perfil === 'Administração') {
        if (!confirm(`Tem certeza que deseja excluir permanentemente o paciente "${nomePaciente}" e todo o seu prontuário?`)) return;
        await DopinAPI.excluirPaciente(pacienteId);
        alert('Paciente excluído com sucesso.');
      } else {
        const motivo = prompt(`Informe o motivo para solicitar a exclusão do paciente "${nomePaciente}" (requer aprovação administrativa):`);
        if (!motivo || !motivo.trim()) return;
        await DopinAPI.excluirPaciente(pacienteId, motivo.trim());
        alert('Solicitação de exclusão enviada para aprovação da Administração.');
      }
      const lista = await DopinAPI.listarPacientes();
      window.db.pacientes = lista.pacientes || [];
      renderizarListaPacientes();
    } catch (err) {
      alert(`Erro ao processar exclusão do paciente: ${err.message}`);
    }
  }

  // ==================== ABRIR PRONTUÁRIO ====================
  async function abrirProntuario(pacienteId) {
    pacienteAtualId = pacienteId;
    const pac = getPacienteAtual();
    if (!pac) return;

    document.getElementById('viewListaPacientes').classList.add('hidden');
    document.getElementById('viewProntuarioPaciente').classList.remove('hidden');

    document.getElementById('prontNomePaciente').innerHTML =
      `Prontuário — ${window.escapeHTML(pac.nome)}${podeVerContato() && isCadastroPendente(pac) ? tagPendente() : ''}`;
    const infoParts = [
      pac.cpf ? `CPF: ${pac.cpf}` : '',
      pac.data_nascimento ? `Nasc.: ${fmtDataBR(pac.data_nascimento)}` : '',
      podeVerContato() && pac.telefone ? `Tel: ${pac.telefone}` : ''
    ].filter(Boolean);
    document.getElementById('prontInfoPaciente').textContent = infoParts.join(' • ') || 'Sem informações complementares';

    // Datas padrão dos formulários internos
    const pagData = document.getElementById('pagPacData');
    if (pagData && !pagData.value) pagData.value = window.hojeISO();
    const evolData = document.getElementById('evolData');
    if (evolData && !evolData.value) evolData.value = window.hojeISO();

    ativarSubAba('geral');
    renderizarAnamnese(pac);
    await carregarDadosProntuario(pacienteId);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  async function carregarDadosProntuario(pacienteId) {
    try {
      const [resProc, resPag, resEvol, resDocs] = await Promise.all([
        DopinAPI.listarProcedimentos(pacienteId),
        DopinAPI.listarPagamentosPaciente(pacienteId),
        DopinAPI.listarEvolucoes(pacienteId),
        DopinAPI.listarDocumentos(pacienteId)
      ]);
      procedimentosAtuais = resProc.procedimentos || [];
      pagamentosAtuais = resPag.pagamentos || [];
      evolucoesAtuais = resEvol.evolucoes || [];
      documentosAtuais = resDocs.documentos || [];

      renderizarOdontograma();
      renderizarOrcamento();
      renderizarEvolucoes();
      renderizarDocumentosR2();
    } catch (err) {
      alert(`Erro ao carregar dados do prontuário: ${err.message}`);
    }
  }

  // ==================== 1. ANAMNESE ====================
  function renderizarAnamnese(pac) {
    const grid = document.getElementById('prontAnamneseGrid');
    if (!grid) return;
    const campos = [
      { label: 'Histórico Médico', val: pac.historico_medico },
      { label: 'Doenças e Condições Sistêmicas', val: pac.doencas_sistemicas },
      { label: 'Alergias', val: pac.alergias, alerta: Boolean((pac.alergias || '').trim()) },
      { label: 'Medicamentos em Uso', val: pac.medicamentos_uso },
      { label: 'Histórico Odontológico', val: pac.historico_odontologico },
      { label: 'Observações Adicionais', val: pac.observacoes_anamnese }
    ];

    grid.innerHTML = campos
      .map(
        (c) => `
        <div class="anamnese-item ${c.alerta ? 'alert-alergia' : ''}">
          <small>${c.alerta ? '⚠️ ' : ''}${c.label}</small>
          <p>${window.escapeHTML(c.val || 'Não informado.')}</p>
        </div>`
      )
      .join('');
  }

  // ==================== 2. ODONTOGRAMA FDI + PROCEDIMENTOS ADICIONAIS ====================
  function renderizarOdontograma() {
    const mapaDentes = {};
    procedimentosAtuais
      .filter((p) => p.dente_fdi)
      .forEach((p) => {
        mapaDentes[String(p.dente_fdi)] = p;
      });

    const renderArcada = (lista) =>
      lista
        .map((num) => {
          const item = mapaDentes[num];
          const stClass = item ? `st-${classeStatus(item.status)}` : '';
          const title = item ? `Dente ${num}: ${item.descricao} (${item.status})` : `Dente ${num}: Sem registro`;
          return `
            <button type="button" class="tooth-chip ${stClass}" title="${window.escapeHTML(title)}" onclick="ProntuarioModule.focarDente('${num}')">
              <span class="tooth-num">${num}</span>
              <span class="tooth-dot"></span>
            </button>`;
        })
        .join('');

    const supEl = document.getElementById('arcadaSuperior');
    const infEl = document.getElementById('arcadaInferior');
    if (supEl) supEl.innerHTML = renderArcada(ARCADA_SUP);
    if (infEl) infEl.innerHTML = renderArcada(ARCADA_INF);

    const quadContainer = document.getElementById('odontoQuadrantes');
    if (quadContainer) {
      quadContainer.innerHTML = QUADRANTES_FDI.map((q) => {
        const linhas = q.dentes
          .map((num) => {
            const reg = mapaDentes[num];
            const procId = reg ? reg.id : '';
            const desc = reg ? reg.descricao : '';
            const val = reg ? Number(reg.valor || 0) : '';
            const st = reg ? reg.status : 'Pendente';
            const btnDel = reg
              ? `<button type="button" class="btn-danger-sm" title="Excluir procedimento" onclick="ProntuarioModule.excluirProcedimento('${window.escapeHTML(procId)}')">×</button>`
              : '';

            return `
              <div class="tooth-plan-row" id="toothRow_${num}">
                <span class="tooth-badge">${num}</span>
                <input type="text" id="odDesc_${num}" value="${window.escapeHTML(desc)}" placeholder="O que fazer no dente ${num}..." />
                <input type="number" id="odVal_${num}" step="0.01" min="0" value="${val}" placeholder="R$ 0,00" />
                <select id="odStatus_${num}">
                  <option value="Pendente" ${st === 'Pendente' ? 'selected' : ''}>Pendente</option>
                  <option value="Em andamento" ${st === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
                  <option value="Realizado" ${st === 'Realizado' ? 'selected' : ''}>Realizado</option>
                </select>
                <div class="item-actions">
                  <button type="button" class="btn-edit-sm" onclick="ProntuarioModule.salvarDente('${num}', '${window.escapeHTML(procId)}')">Salvar</button>
                  ${btnDel}
                </div>
              </div>`;
          })
          .join('');

        return `<div class="quadrante-box"><h4>${q.titulo}</h4>${linhas}</div>`;
      }).join('');
    }

    // Procedimentos Adicionais (dente_fdi == null)
    const adicionais = procedimentosAtuais.filter((p) => !p.dente_fdi);
    const tbodyAdic = document.getElementById('listaProcAdicionaisBody');
    if (tbodyAdic) {
      if (adicionais.length === 0) {
        tbodyAdic.innerHTML = '<tr><td colspan="4">Nenhum procedimento adicional cadastrado.</td></tr>';
      } else {
        tbodyAdic.innerHTML = adicionais
          .map(
            (p) => `
            <tr>
              <td><input type="text" id="adicDesc_${window.escapeHTML(p.id)}" value="${window.escapeHTML(p.descricao)}" style="width:100%;" /></td>
              <td><input type="number" step="0.01" min="0" id="adicVal_${window.escapeHTML(p.id)}" value="${Number(p.valor || 0)}" style="width:105px;" /></td>
              <td>
                <select id="adicSt_${window.escapeHTML(p.id)}">
                  <option value="Pendente" ${p.status === 'Pendente' ? 'selected' : ''}>Pendente</option>
                  <option value="Em andamento" ${p.status === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
                  <option value="Realizado" ${p.status === 'Realizado' ? 'selected' : ''}>Realizado</option>
                </select>
              </td>
              <td class="item-actions">
                <button type="button" class="btn-edit-sm" onclick="ProntuarioModule.salvarProcedimentoAdicional('${window.escapeHTML(p.id)}')">Salvar</button>
                <button type="button" class="btn-danger-sm" onclick="ProntuarioModule.excluirProcedimento('${window.escapeHTML(p.id)}')">Excluir procedimento</button>
              </td>
            </tr>`
          )
          .join('');
      }
    }
  }

  function focarDente(num) {
    const inp = document.getElementById(`odDesc_${num}`);
    if (inp) {
      inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inp.focus();
    }
  }

  async function salvarDente(num, procId) {
    if (!pacienteAtualId) return;
    const descricao = document.getElementById(`odDesc_${num}`).value.trim();
    const valor = Number(document.getElementById(`odVal_${num}`).value) || 0;
    const status = document.getElementById(`odStatus_${num}`).value;

    if (!descricao) {
      alert(`Digite o procedimento necessário para o dente ${num} antes de salvar.`);
      return;
    }

    try {
      if (procId) {
        await DopinAPI.atualizarProcedimento(pacienteAtualId, procId, { descricao, valor, status });
      } else {
        await DopinAPI.criarProcedimento(pacienteAtualId, { dente_fdi: num, descricao, valor, status });
      }
      await carregarDadosProntuario(pacienteAtualId);
    } catch (err) {
      alert(`Erro ao salvar dente ${num}: ${err.message}`);
    }
  }

  async function salvarProcedimentoAdicional(procId) {
    if (!pacienteAtualId) return;
    const descricao = document.getElementById(`adicDesc_${procId}`).value.trim();
    const valor = Number(document.getElementById(`adicVal_${procId}`).value) || 0;
    const status = document.getElementById(`adicSt_${procId}`).value;
    if (!descricao) return;

    try {
      await DopinAPI.atualizarProcedimento(pacienteAtualId, procId, { descricao, valor, status });
      await carregarDadosProntuario(pacienteAtualId);
    } catch (err) {
      alert(`Erro ao atualizar procedimento: ${err.message}`);
    }
  }

  async function excluirProcedimento(procId) {
    if (!pacienteAtualId) return;
    if (!confirm('Deseja excluir este procedimento do planejamento e orçamento?')) return;
    try {
      await DopinAPI.excluirProcedimento(pacienteAtualId, procId);
      await carregarDadosProntuario(pacienteAtualId);
    } catch (err) {
      alert(`Erro ao excluir procedimento: ${err.message}`);
    }
  }

  // ==================== 3. ORÇAMENTO & CONTROLE FINANCEIRO ====================
  function renderizarOrcamento() {
    const totalOrcado = procedimentosAtuais.reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const totalPago = pagamentosAtuais.reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const totalUtilizado = procedimentosAtuais
      .filter((p) => Number(p.utilizado) === 1)
      .reduce((s, p) => s + (Number(p.valor_utilizado || p.valor) || 0), 0);

    const saldoDisponivel = totalPago - totalUtilizado;
    const valorAindaDevido = Math.max(0, totalOrcado - totalPago);

    document.getElementById('orcTotalOrcado').textContent = window.fmtBRL(totalOrcado);
    document.getElementById('orcTotalPago').textContent = window.fmtBRL(totalPago);
    document.getElementById('orcTotalUtilizado').textContent = window.fmtBRL(totalUtilizado);

    const elSaldo = document.getElementById('orcSaldoDisponivel');
    elSaldo.textContent = window.fmtBRL(saldoDisponivel);
    elSaldo.className = saldoDisponivel >= 0 ? 'text-success' : 'text-danger';

    document.getElementById('orcValorDevido').textContent = window.fmtBRL(valorAindaDevido);

    // Permissões: Profissional não registra/exclui pagamentos financeiros
    const isProf = window.sessaoAtual?.perfil === 'Profissional';
    document.getElementById('boxRegistrarPagamentoPaciente')?.classList.toggle('hidden', isProf);
    document.getElementById('thAcoesPagPac')?.classList.toggle('hidden', isProf);

    // Tabela de Procedimentos do Orçamento
    const tbodyProc = document.getElementById('orcProcedimentosBody');
    if (tbodyProc) {
      if (procedimentosAtuais.length === 0) {
        tbodyProc.innerHTML = '<tr><td colspan="5">Nenhum procedimento orçado no odontograma ainda.</td></tr>';
      } else {
        tbodyProc.innerHTML = procedimentosAtuais
          .map((p) => {
            const labelDente = p.dente_fdi ? `Dente ${window.escapeHTML(p.dente_fdi)}` : 'Geral';
            const utilCol =
              Number(p.utilizado) === 1
                ? `<span class="status-tag realizado">✓ Utilizado (${window.fmtBRL(p.valor_utilizado)} em ${fmtDataBR(p.data_utilizacao)})</span>`
                : `<button type="button" class="btn-success-sm" onclick="ProntuarioModule.abrirModalUtilizar('${window.escapeHTML(p.id)}')">Registrar Utilização</button>`;

            return `
              <tr>
                <td><strong>${labelDente}</strong></td>
                <td>${window.escapeHTML(p.descricao)}</td>
                <td><strong>${window.fmtBRL(p.valor)}</strong></td>
                <td><span class="status-tag ${classeStatus(p.status)}">${window.escapeHTML(p.status)}</span></td>
                <td>${utilCol}</td>
              </tr>`;
          })
          .join('');
      }
    }

    // Tabela de Pagamentos do Paciente
    const tbodyPag = document.getElementById('orcPagamentosBody');
    if (tbodyPag) {
      if (pagamentosAtuais.length === 0) {
        tbodyPag.innerHTML = `<tr><td colspan="${isProf ? 4 : 5}">Nenhum pagamento registrado para este paciente.</td></tr>`;
      } else {
        tbodyPag.innerHTML = pagamentosAtuais
          .map((pag) => {
            const acao = isProf
              ? ''
              : `<td><button type="button" class="btn-danger-sm" onclick="ProntuarioModule.excluirPagamentoPaciente('${window.escapeHTML(pag.id)}')">Excluir</button></td>`;
            return `
              <tr>
                <td>${fmtDataBR(pag.data_pagamento)}</td>
                <td>${window.escapeHTML(pag.forma_pagamento || '-')}</td>
                <td class="text-success"><strong>${window.fmtBRL(pag.valor)}</strong></td>
                <td>${window.escapeHTML(pag.observacao || '-')}</td>
                ${acao}
              </tr>`;
          })
          .join('');
      }
    }
  }

  function abrirModalUtilizar(procId) {
    const proc = procedimentosAtuais.find((p) => p.id === procId);
    if (!proc) return;

    document.getElementById('utilProcId').value = proc.id;
    document.getElementById('utilProcTitulo').textContent = `${proc.dente_fdi ? 'Dente ' + proc.dente_fdi + ' — ' : ''}${proc.descricao}`;
    document.getElementById('utilProcValor').value = Number(proc.valor || 0);
    document.getElementById('utilProcData').value = window.hojeISO();

    const dentSelect = document.getElementById('utilProcDentista');
    const dentistas = window.db?.config?.dentistas || [];
    dentSelect.innerHTML = dentistas.length
      ? dentistas.map((d) => `<option value="${window.escapeHTML(d.id)}">${window.escapeHTML(d.nome)}</option>`).join('')
      : `<option value="${window.escapeHTML(window.sessaoAtual?.dentistaId || 'admin')}">${window.escapeHTML(window.sessaoAtual?.usuario || 'Profissional')}</option>`;

    if (window.sessaoAtual?.dentistaId) dentSelect.value = window.sessaoAtual.dentistaId;

    const espSelect = document.getElementById('utilProcEsp');
    const esps = window.db?.config?.especialidades || [];
    espSelect.innerHTML = esps
      .map((e) => `<option value="${window.escapeHTML(e.nome)}">${window.escapeHTML(e.nome)}</option>`)
      .join('');

    document.getElementById('modalUtilizarProc').classList.remove('hidden');
  }

  async function excluirPagamentoPaciente(pagId) {
    if (!pacienteAtualId) return;
    if (!confirm('Deseja excluir este pagamento do paciente?')) return;
    try {
      await DopinAPI.excluirPagamentoPaciente(pacienteAtualId, pagId);
      await carregarDadosProntuario(pacienteAtualId);
    } catch (err) {
      alert(`Erro ao excluir pagamento: ${err.message}`);
    }
  }

  // ==================== 4. EVOLUÇÃO CLÍNICA ====================
  function renderizarEvolucoes() {
    const container = document.getElementById('listaEvolucoesContainer');
    if (!container) return;

    if (evolucoesAtuais.length === 0) {
      container.innerHTML = '<p class="hint">Nenhuma evolução clínica registrada para este paciente.</p>';
      return;
    }

    container.innerHTML = evolucoesAtuais
      .map(
        (ev) => `
        <div class="evolucao-card">
          <div class="evolucao-card-head">
            <div>
              <span class="evolucao-data">${fmtDataBR(ev.data_atendimento)}</span>
              ${ev.profissional_nome ? `<small class="hint" style="margin-left:8px;">• ${window.escapeHTML(ev.profissional_nome)}</small>` : ''}
            </div>
            <div class="item-actions">
              <button type="button" class="btn-edit-sm" onclick="ProntuarioModule.editarEvolucao('${window.escapeHTML(ev.id)}')">Editar</button>
              <button type="button" class="btn-danger-sm" onclick="ProntuarioModule.excluirEvolucao('${window.escapeHTML(ev.id)}')">Excluir</button>
            </div>
          </div>
          <div class="evolucao-texto">${window.escapeHTML(ev.descricao)}</div>
        </div>`
      )
      .join('');
  }

  function editarEvolucao(evolId) {
    const ev = evolucoesAtuais.find((e) => e.id === evolId);
    if (!ev) return;
    document.getElementById('evolEditId').value = ev.id;
    document.getElementById('evolData').value = ev.data_atendimento;
    document.getElementById('evolDescricao').value = ev.descricao;
    document.getElementById('tituloFormEvolucao').innerHTML = '<i data-lucide="edit-3"></i> Editar Evolução Clínica';
    document.getElementById('btnSalvarEvolucao').innerHTML = '<i data-lucide="save"></i> Atualizar Evolução';
    document.getElementById('btnCancelarEditEvol')?.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    document.getElementById('formEvolucao')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function excluirEvolucao(evolId) {
    if (!pacienteAtualId) return;
    if (!confirm('Deseja excluir permanentemente esta evolução clínica?')) return;
    try {
      await DopinAPI.excluirEvolucao(pacienteAtualId, evolId);
      await carregarDadosProntuario(pacienteAtualId);
    } catch (err) {
      alert(`Erro ao excluir evolução: ${err.message}`);
    }
  }

  // ==================== 5. DOCUMENTOS PRIVADOS (R2) ====================
  function renderizarDocumentosR2() {
    const tbody = document.getElementById('listaDocumentosBody');
    if (!tbody) return;
    if (documentosAtuais.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">Nenhum arquivo anexado para este paciente.</td></tr>';
      return;
    }

    tbody.innerHTML = documentosAtuais
      .map(
        (doc) => `
        <tr>
          <td><strong>${window.escapeHTML(doc.nome_original)}</strong></td>
          <td>${window.escapeHTML(doc.categoria || 'exame')}</td>
          <td>${fmtTamanhoBytes(doc.tamanho_bytes)}</td>
          <td class="item-actions">
            <button type="button" class="btn-edit-sm" onclick="ProntuarioModule.visualizarDocumento('${window.escapeHTML(doc.id)}')">Abrir</button>
            <button type="button" class="btn-danger-sm" onclick="ProntuarioModule.excluirDocumento('${window.escapeHTML(doc.id)}')">Excluir</button>
          </td>
        </tr>`
      )
      .join('');
  }

  async function visualizarDocumento(docId) {
    try {
      const blob = await DopinAPI.baixarArquivoBlob(docId);
      const urlTemp = URL.createObjectURL(blob);
      window.open(urlTemp, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(urlTemp), 60000);
    } catch (err) {
      alert(`Erro ao abrir arquivo: ${err.message}`);
    }
  }

  async function excluirDocumento(docId) {
    if (!confirm('Deseja excluir permanentemente este arquivo da nuvem?')) return;
    try {
      await DopinAPI.excluirDocumento(docId);
      if (pacienteAtualId) await carregarDadosProntuario(pacienteAtualId);
    } catch (err) {
      alert(`Erro ao excluir arquivo: ${err.message}`);
    }
  }

  window.ProntuarioModule = {
    init,
    renderizarListaPacientes,
    abrirProntuario,
    editarPaciente,
    excluirPaciente,
    focarDente,
    salvarDente,
    salvarProcedimentoAdicional,
    excluirProcedimento,
    abrirModalUtilizar,
    excluirPagamentoPaciente,
    editarEvolucao,
    excluirEvolucao,
    visualizarDocumento,
    excluirDocumento,
    getPacienteAtual
  };

  // Utilitários compartilhados com o Mapa Diário (script.js)
  window.PacienteUtils = {
    normalizarCPF,
    cpfValido,
    formatarCPF,
    buscarPorCPF,
    calcularStatusCadastro,
    isCadastroPendente,
    podeVerContato,
    tagPendente,
    avisarCPFDuplicado
  };
})();
