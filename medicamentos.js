// ==================== MÓDULO: BANCO DE MEDICAMENTOS E POSOLOGIAS (D1) ====================
(function () {
  const CATEGORIAS_PADRAO = [
    'Analgésicos',
    'Anti-inflamatórios',
    'Antibióticos',
    'Antissépticos',
    'Anestésicos',
    'Medicamentos sujeitos a controle especial',
    'Outros'
  ];

  let medicamentosCache = [];

  function init() {
    const form = document.getElementById('formMedicamento');
    if (form) {
      form.addEventListener('submit', salvarMedicamento);
    }

    document.getElementById('btnCancelarEditMed')?.addEventListener('click', resetarForm);
    document.getElementById('buscaMedicamento')?.addEventListener('input', renderizarTabela);
    document.getElementById('filtroCatMedicamento')?.addEventListener('change', renderizarTabela);
  }

  async function carregar() {
    try {
      const res = await DopinAPI.listarMedicamentos();
      medicamentosCache = res.medicamentos || [];
      window.db.medicamentos = medicamentosCache;
      renderizarTabela();
      notificarAtualizacao();
    } catch (err) {
      console.error('Erro ao carregar banco de medicamentos:', err);
    }
  }

  function notificarAtualizacao() {
    if (window.DocumentosModule && typeof window.DocumentosModule.atualizarSelectMedicamentos === 'function') {
      window.DocumentosModule.atualizarSelectMedicamentos();
    }
  }

  function getLista() {
    return medicamentosCache;
  }

  async function salvarMedicamento(e) {
    e.preventDefault();
    const editId = document.getElementById('medEditId').value;
    const payload = {
      nome: document.getElementById('medNome').value.trim(),
      principio_ativo: document.getElementById('medPrincipio').value.trim(),
      concentracao: document.getElementById('medConcentracao').value.trim(),
      forma_farmaceutica: document.getElementById('medForma').value.trim(),
      apresentacao: document.getElementById('medApresentacao').value.trim(),
      via_administracao: document.getElementById('medVia').value.trim(),
      posologia: document.getElementById('medPosologia').value.trim(),
      duracao: document.getElementById('medDuracao').value.trim(),
      quantidade_sugerida: document.getElementById('medQuantidade').value.trim(),
      orientacoes: document.getElementById('medOrientacoes').value.trim(),
      categoria: document.getElementById('medCategoria').value,
      controle_especial: document.getElementById('medControleEspecial').checked
    };

    if (!payload.nome) {
      alert('Informe o nome do medicamento.');
      return;
    }

    const btn = document.getElementById('btnSalvarMed');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      if (editId) {
        await DopinAPI.atualizarMedicamento(editId, payload);
      } else {
        await DopinAPI.criarMedicamento(payload);
      }
      resetarForm();
      await carregar();
    } catch (err) {
      alert(`Erro ao salvar medicamento: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="save"></i> Salvar Medicamento';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  function resetarForm() {
    document.getElementById('formMedicamento')?.reset();
    document.getElementById('medEditId').value = '';
    document.getElementById('tituloFormMed').innerHTML =
      '<i data-lucide="pill"></i> Adicionar Medicamento ao Banco';
    document.getElementById('btnCancelarEditMed')?.classList.add('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function editar(id) {
    const m = medicamentosCache.find((item) => item.id === id);
    if (!m) return;

    document.getElementById('medEditId').value = m.id;
    document.getElementById('medNome').value = m.nome || '';
    document.getElementById('medPrincipio').value = m.principio_ativo || '';
    document.getElementById('medConcentracao').value = m.concentracao || '';
    document.getElementById('medForma').value = m.forma_farmaceutica || '';
    document.getElementById('medApresentacao').value = m.apresentacao || '';
    document.getElementById('medVia').value = m.via_administracao || '';
    document.getElementById('medPosologia').value = m.posologia || '';
    document.getElementById('medDuracao').value = m.duracao || '';
    document.getElementById('medQuantidade').value = m.quantidade_sugerida || '';
    document.getElementById('medOrientacoes').value = m.orientacoes || '';
    document.getElementById('medCategoria').value = m.categoria || 'Outros';
    document.getElementById('medControleEspecial').checked = Number(m.controle_especial) === 1;

    document.getElementById('tituloFormMed').innerHTML =
      `<i data-lucide="edit-3"></i> Editando Medicamento — ${window.escapeHTML(m.nome)}`;
    document.getElementById('btnCancelarEditMed')?.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    document.getElementById('formMedicamento')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function excluir(id) {
    if (!confirm('Deseja excluir este medicamento do banco? Receitas já emitidas permanecerão preservadas.')) return;
    try {
      await DopinAPI.excluirMedicamento(id);
      await carregar();
    } catch (err) {
      alert(`Erro ao excluir medicamento: ${err.message}`);
    }
  }

  function renderizarTabela() {
    const tbody = document.getElementById('tabelaMedicamentosBody');
    if (!tbody) return;

    const termo = (document.getElementById('buscaMedicamento')?.value || '').trim().toLowerCase();
    const cat = document.getElementById('filtroCatMedicamento')?.value || '';

    const filtrados = medicamentosCache.filter((m) => {
      const matchTermo =
        !termo ||
        String(m.nome || '').toLowerCase().includes(termo) ||
        String(m.principio_ativo || '').toLowerCase().includes(termo);
      const matchCat = !cat || m.categoria === cat;
      return matchTermo && matchCat;
    });

    if (filtrados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">Nenhum medicamento encontrado no banco desta clínica.</td></tr>';
      return;
    }

    const podeGerenciar = window.sessaoAtual?.perfil !== 'Recepção';

    tbody.innerHTML = filtrados
      .map((m) => {
        const badgeCtrl =
          Number(m.controle_especial) === 1
            ? '<span class="status-tag pendente" style="margin-left:6px;">2 Vias / Especial</span>'
            : '';
        const acoes = podeGerenciar
          ? `<td class="item-actions">
               <button type="button" class="btn-edit-sm" onclick="MedicamentosModule.editar('${window.escapeHTML(m.id)}')">Editar</button>
               <button type="button" class="btn-danger-sm" onclick="MedicamentosModule.excluir('${window.escapeHTML(m.id)}')">Excluir</button>
             </td>`
          : '<td>-</td>';

        return `
          <tr>
            <td>
              <strong>${window.escapeHTML(m.nome)}</strong>${badgeCtrl}
              ${m.principio_ativo ? `<br><small class="hint">${window.escapeHTML(m.principio_ativo)}</small>` : ''}
            </td>
            <td>${window.escapeHTML(m.concentracao || '-')}<br><small class="hint">${window.escapeHTML(m.forma_farmaceutica || '')} ${window.escapeHTML(m.apresentacao || '')}</small></td>
            <td>${window.escapeHTML(m.categoria || 'Outros')}</td>
            <td>${window.escapeHTML(m.via_administracao || '-')}</td>
            <td><small>${window.escapeHTML(m.posologia || '-')}</small>${m.duracao ? `<br><small class="hint">Duração: ${window.escapeHTML(m.duracao)}</small>` : ''}</td>
            ${acoes}
          </tr>`;
      })
      .join('');
  }

  window.MedicamentosModule = {
    CATEGORIAS_PADRAO,
    init,
    carregar,
    getLista,
    editar,
    excluir,
    renderizarTabela
  };
})();
