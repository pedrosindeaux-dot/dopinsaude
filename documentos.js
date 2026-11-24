// ==================== MÓDULO: ATESTADOS, DECLARAÇÕES E RECEITUÁRIOS (COMUM + 2 VIAS) ====================
(function () {
  let pacienteAtual = null;
  let abaDocAtiva = 'atestados';
  let itensReceitaComum = [];
  let itensReceitaEspecial = [];
  let historicoEmitidos = [];

  function fmtDataBR(iso) {
    if (!iso) return new Date().toLocaleDateString('pt-BR');
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  }

  function dadosCabecalhoPadrao() {
    const c = window.db?.config?.clinica || {};
    const u = window.sessaoAtual || {};
    return {
      clinicaNome: c.nome || 'DôPin Saúde — Clínica Odontológica',
      clinicaRazao: c.razaoSocial || '',
      clinicaCnpj: c.cnpj || '',
      clinicaCro: c.cro || '',
      clinicaTelefone: c.telefone || '',
      clinicaEmail: c.email || '',
      clinicaEndereco: c.endereco || '',
      logoDataUrl: window.clinicLogoDataUrl || '',
      profissionalNome: u.usuario || 'Profissional Responsável'
    };
  }

  async function renderizar(pac) {
    pacienteAtual = pac;
    const container = document.getElementById('areaDocumentosClinicos');
    if (!container || !pac) return;

    container.innerHTML = `
      <div class="prontuario-subnav" style="margin-bottom:14px;">
        <button type="button" class="subtab-btn ${abaDocAtiva === 'atestados' ? 'active' : ''}" onclick="DocumentosModule.trocarAba('atestados')">
          <i data-lucide="file-badge"></i> Atestados e Declarações
        </button>
        <button type="button" class="subtab-btn ${abaDocAtiva === 'receita_comum' ? 'active' : ''}" onclick="DocumentosModule.trocarAba('receita_comum')">
          <i data-lucide="file-text"></i> Receituário Comum
        </button>
        <button type="button" class="subtab-btn ${abaDocAtiva === 'receita_especial' ? 'active' : ''}" onclick="DocumentosModule.trocarAba('receita_especial')">
          <i data-lucide="files"></i> Receituário Especial (2 Vias)
        </button>
        <button type="button" class="subtab-btn ${abaDocAtiva === 'historico' ? 'active' : ''}" onclick="DocumentosModule.trocarAba('historico')">
          <i data-lucide="history"></i> Histórico Emitido
        </button>
      </div>

      <div id="docPainelConteudo"></div>
    `;

    await carregarHistorico(pac.id);
    renderizarPainelAtivo();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  async function carregarHistorico(pacienteId) {
    try {
      const res = await DopinAPI.listarDocumentosEmitidos(pacienteId);
      historicoEmitidos = res.documentos || [];
    } catch {
      historicoEmitidos = [];
    }
  }

  function trocarAba(novaAba) {
    abaDocAtiva = novaAba;
    if (pacienteAtual) renderizar(pacienteAtual);
  }

  function renderizarPainelAtivo() {
    const el = document.getElementById('docPainelConteudo');
    if (!el || !pacienteAtual) return;

    if (abaDocAtiva === 'atestados') renderAtestadosDeclaracoes(el);
    else if (abaDocAtiva === 'receita_comum') renderReceituario(el, false);
    else if (abaDocAtiva === 'receita_especial') renderReceituario(el, true);
    else renderHistorico(el);

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // ==================== 1. ATESTADOS E DECLARAÇÕES (ÁREA ÚNICA) ====================
  function renderAtestadosDeclaracoes(el) {
    const cab = dadosCabecalhoPadrao();
    el.innerHTML = `
      <div class="card" style="box-shadow:none; background:var(--white);">
        <div class="card-header">
          <h3><i data-lucide="file-badge"></i> Atestados e Declarações</h3>
          <span class="hint">Dados da clínica, logo e paciente preenchidos automaticamente.</span>
        </div>

        <form id="formAtestadoDecl" class="grid-form">
          <div class="form-group">
            <label>Tipo de Documento *</label>
            <select id="atTipoDoc">
              <option value="atestado">Atestado Odontológico</option>
              <option value="declaracao">Declaração de Comparecimento</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data do Atendimento *</label>
            <input type="date" id="atData" value="${window.hojeISO()}" required />
          </div>
          <div class="form-group">
            <label>Profissional Responsável *</label>
            <input type="text" id="atProfNome" value="${window.escapeHTML(cab.profissionalNome)}" required />
          </div>
          <div class="form-group">
            <label>CRO do Profissional</label>
            <input type="text" id="atProfCro" value="${window.escapeHTML(cab.clinicaCro)}" placeholder="Ex: CRO-CE 12345" />
          </div>

          <div class="form-group" id="boxAtDias">
            <label>Dias de Afastamento / Repouso</label>
            <input type="number" id="atDias" min="0" value="1" />
          </div>
          <div class="form-group" id="boxAtCid">
            <label>CID (Opcional — somente com autorização do paciente)</label>
            <input type="text" id="atCid" placeholder="Ex: K08.9 (opcional)" />
          </div>
          <div class="form-group hidden" id="boxDeclHorario">
            <label>Horário de Permanência</label>
            <input type="text" id="atHorario" placeholder="Ex: das 14:00 às 15:30" />
          </div>
          <div class="form-group form-span-full">
            <label>Texto / Observações Adicionais</label>
            <textarea id="atTexto" rows="3" placeholder="Ex: Necessita de repouso pós-operatório ou compareceu para tratamento odontológico..."></textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">
              <i data-lucide="printer"></i> Salvar e Imprimir / PDF
            </button>
          </div>
        </form>
      </div>
    `;

    const selTipo = document.getElementById('atTipoDoc');
    const toggleCampos = () => {
      const isDecl = selTipo.value === 'declaracao';
      document.getElementById('boxAtDias').classList.toggle('hidden', isDecl);
      document.getElementById('boxAtCid').classList.toggle('hidden', isDecl);
      document.getElementById('boxDeclHorario').classList.toggle('hidden', !isDecl);
    };
    selTipo.addEventListener('change', toggleCampos);
    toggleCampos();

    document.getElementById('formAtestadoDecl').addEventListener('submit', async (e) => {
      e.preventDefault();
      const tipo = selTipo.value;
      const titulo = tipo === 'atestado' ? 'Atestado Odontológico' : 'Declaração de Comparecimento';
      const conteudo = {
        cabecalho: dadosCabecalhoPadrao(),
        paciente: { nome: pacienteAtual.nome, cpf: pacienteAtual.cpf || '', endereco: pacienteAtual.endereco || '' },
        profissional: {
          nome: document.getElementById('atProfNome').value.trim(),
          cro: document.getElementById('atProfCro').value.trim()
        },
        data: document.getElementById('atData').value,
        dias: document.getElementById('atDias').value,
        cid: document.getElementById('atCid').value.trim(),
        horario: document.getElementById('atHorario').value.trim(),
        texto: document.getElementById('atTexto').value.trim()
      };

      try {
        await DopinAPI.salvarDocumentoEmitido(pacienteAtual.id, { tipo, titulo, conteudo });
        await carregarHistorico(pacienteAtual.id);
        imprimirDocumento(tipo, conteudo);
      } catch (err) {
        alert(`Erro ao salvar documento: ${err.message}`);
      }
    });
  }

  // ==================== 2 & 3. RECEITUÁRIO COMUM E ESPECIAL (2 VIAS) ====================
  function renderReceituario(el, isEspecial) {
    const cab = dadosCabecalhoPadrao();
    const listaItens = isEspecial ? itensReceitaEspecial : itensReceitaComum;
    const prefixo = isEspecial ? 'recEsp' : 'recCom';
    const titulo = isEspecial ? 'Receituário Especial em Duas Vias' : 'Receituário Comum';

    el.innerHTML = `
      <div class="card" style="box-shadow:none; background:var(--white);">
        <div class="card-header">
          <h3><i data-lucide="${isEspecial ? 'files' : 'file-text'}"></i> ${titulo}</h3>
          <span class="hint">Integrado ao Banco de Medicamentos da clínica.</span>
        </div>

        <p class="hint" style="background:var(--turquoise-50); border:1px solid #99f6e4; padding:10px 12px; border-radius:8px; margin-bottom:14px;">
          <strong>Aviso profissional:</strong> Os dados do Banco de Medicamentos são modelos editáveis para agilizar o preenchimento. Revise sempre a indicação clínica, idade, alergias, contraindicações e a legislação sanitária vigente antes de emitir.
          ${isEspecial ? '<br><strong>Duas Vias:</strong> Serão geradas automaticamente a <em>1ª via (Retenção da farmácia/estabelecimento dispensador)</em> e a <em>2ª via (Orientação do paciente)</em>.' : ''}
        </p>

        <div class="grid-form" style="margin-bottom:14px;">
          <div class="form-group">
            <label>Profissional Prescritor *</label>
            <input type="text" id="${prefixo}ProfNome" value="${window.escapeHTML(cab.profissionalNome)}" />
          </div>
          <div class="form-group">
            <label>CRO do Prescritor *</label>
            <input type="text" id="${prefixo}ProfCro" value="${window.escapeHTML(cab.clinicaCro)}" placeholder="Ex: CRO-CE 12345" />
          </div>
          <div class="form-group">
            <label>Data da Receita *</label>
            <input type="date" id="${prefixo}Data" value="${window.hojeISO()}" />
          </div>
          ${isEspecial ? `
          <div class="form-group form-span-2">
            <label>Endereço do Paciente (quando aplicável)</label>
            <input type="text" id="${prefixo}PacEndereco" value="${window.escapeHTML(pacienteAtual.endereco || '')}" placeholder="Endereço completo do paciente" />
          </div>` : ''}
        </div>

        <!-- Seletor do Banco de Medicamentos -->
        <div style="background:var(--bg-page); border:1px solid var(--border); border-radius:9px; padding:14px; margin-bottom:16px;">
          <h4 style="font-size:0.9rem; color:var(--petrol-800); margin-bottom:10px;">Selecionar do Banco de Medicamentos ou Preencher Manualmente</h4>
          <div class="grid-form" style="margin-bottom:12px;">
            <div class="form-group">
              <label>Pesquisar no Banco (nome ou princípio ativo)</label>
              <input type="text" id="${prefixo}BuscaMed" placeholder="Digite para filtrar a lista..." />
            </div>
            <div class="form-group form-span-2">
              <label>Medicamento Cadastrado</label>
              <select id="${prefixo}SelectMed"></select>
            </div>
          </div>

          <form id="${prefixo}FormItem" class="grid-form">
            <div class="form-group">
              <label>Medicamento *</label>
              <input type="text" id="${prefixo}Nome" placeholder="Nome comercial ou genérico" required />
            </div>
            <div class="form-group">
              <label>Princípio Ativo</label>
              <input type="text" id="${prefixo}Principio" placeholder="Princípio ativo" />
            </div>
            <div class="form-group">
              <label>Concentração</label>
              <input type="text" id="${prefixo}Concentracao" placeholder="Ex: 500 mg" />
            </div>
            <div class="form-group">
              <label>Forma Farmacêutica / Apresentação</label>
              <input type="text" id="${prefixo}Forma" placeholder="Ex: Comprimido / Caixa c/ 21" />
            </div>
            <div class="form-group">
              <label>Via de Administração</label>
              <input type="text" id="${prefixo}Via" placeholder="Ex: Uso oral" />
            </div>
            <div class="form-group">
              <label>Quantidade</label>
              <input type="text" id="${prefixo}Qtd" placeholder="Ex: 1 caixa (21 comp.)" />
            </div>
            <div class="form-group">
              <label>Duração do Tratamento</label>
              <input type="text" id="${prefixo}Duracao" placeholder="Ex: 7 dias" />
            </div>
            <div class="form-group form-span-2">
              <label>Posologia *</label>
              <input type="text" id="${prefixo}Posologia" placeholder="Ex: Tomar 1 comprimido de 8 em 8 horas..." required />
            </div>
            <div class="form-group form-span-full">
              <label>Orientações Adicionais</label>
              <input type="text" id="${prefixo}Orientacoes" placeholder="Ex: Tomar após as refeições, não ingerir bebida alcoólica..." />
            </div>
            <div class="form-actions">
              <button type="button" id="${prefixo}BtnSalvarModelo" class="btn btn-outline btn-sm">
                <i data-lucide="bookmark-plus"></i> Salvar como Modelo no Banco
              </button>
              <button type="submit" class="btn btn-primary btn-sm">
                <i data-lucide="plus-circle"></i> Adicionar à Receita
              </button>
            </div>
          </form>
        </div>

        <!-- Itens adicionados na receita atual -->
        <h4 class="demo-section-title">Medicamentos nesta Receita (${listaItens.length})</h4>
        <div class="table-responsive" style="margin-bottom:16px;">
          <table>
            <thead>
              <tr>
                <th>Medicamento / Concentração</th>
                <th>Via / Quantidade</th>
                <th>Posologia / Duração</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody id="${prefixo}ItensBody"></tbody>
          </table>
        </div>

        <div class="form-actions">
          <button type="button" id="${prefixo}BtnEmitir" class="btn btn-primary" ${listaItens.length === 0 ? 'disabled' : ''}>
            <i data-lucide="printer"></i> Salvar no Histórico e Imprimir ${isEspecial ? '(2 Vias)' : '/ PDF'}
          </button>
        </div>
      </div>
    `;

    popularSelectMedicamentos(prefixo);
    renderTabelaItensReceita(prefixo, isEspecial);

    document.getElementById(`${prefixo}BuscaMed`).addEventListener('input', () => popularSelectMedicamentos(prefixo));
    document.getElementById(`${prefixo}SelectMed`).addEventListener('change', (e) => {
      const medId = e.target.value;
      const m = (window.MedicamentosModule?.getLista() || []).find((x) => x.id === medId);
      if (!m) return;
      document.getElementById(`${prefixo}Nome`).value = m.nome || '';
      document.getElementById(`${prefixo}Principio`).value = m.principio_ativo || '';
      document.getElementById(`${prefixo}Concentracao`).value = m.concentracao || '';
      document.getElementById(`${prefixo}Forma`).value = [m.forma_farmaceutica, m.apresentacao].filter(Boolean).join(' — ');
      document.getElementById(`${prefixo}Via`).value = m.via_administracao || '';
      document.getElementById(`${prefixo}Qtd`).value = m.quantidade_sugerida || '';
      document.getElementById(`${prefixo}Duracao`).value = m.duracao || '';
      document.getElementById(`${prefixo}Posologia`).value = m.posologia || '';
      document.getElementById(`${prefixo}Orientacoes`).value = m.orientacoes || '';
    });

    document.getElementById(`${prefixo}FormItem`).addEventListener('submit', (e) => {
      e.preventDefault();
      const item = {
        nome: document.getElementById(`${prefixo}Nome`).value.trim(),
        principio_ativo: document.getElementById(`${prefixo}Principio`).value.trim(),
        concentracao: document.getElementById(`${prefixo}Concentracao`).value.trim(),
        forma: document.getElementById(`${prefixo}Forma`).value.trim(),
        via: document.getElementById(`${prefixo}Via`).value.trim(),
        quantidade: document.getElementById(`${prefixo}Qtd`).value.trim(),
        duracao: document.getElementById(`${prefixo}Duracao`).value.trim(),
        posologia: document.getElementById(`${prefixo}Posologia`).value.trim(),
        orientacoes: document.getElementById(`${prefixo}Orientacoes`).value.trim()
      };
      if (!item.nome || !item.posologia) return;

      if (isEspecial) itensReceitaEspecial.push(item);
      else itensReceitaComum.push(item);

      e.target.reset();
      renderReceituario(el, isEspecial);
    });

    document.getElementById(`${prefixo}BtnSalvarModelo`).addEventListener('click', async () => {
      const nome = document.getElementById(`${prefixo}Nome`).value.trim();
      if (!nome) {
        alert('Preencha pelo menos o nome do medicamento para salvar como modelo.');
        return;
      }
      try {
        await DopinAPI.criarMedicamento({
          nome,
          principio_ativo: document.getElementById(`${prefixo}Principio`).value.trim(),
          concentracao: document.getElementById(`${prefixo}Concentracao`).value.trim(),
          forma_farmaceutica: document.getElementById(`${prefixo}Forma`).value.trim(),
          via_administracao: document.getElementById(`${prefixo}Via`).value.trim(),
          quantidade_sugerida: document.getElementById(`${prefixo}Qtd`).value.trim(),
          duracao: document.getElementById(`${prefixo}Duracao`).value.trim(),
          posologia: document.getElementById(`${prefixo}Posologia`).value.trim(),
          orientacoes: document.getElementById(`${prefixo}Orientacoes`).value.trim(),
          categoria: isEspecial ? 'Medicamentos sujeitos a controle especial' : 'Outros',
          controle_especial: isEspecial
        });
        await window.MedicamentosModule?.carregar();
        alert('Medicamento salvo no Banco de Medicamentos da clínica!');
      } catch (err) {
        alert(`Erro ao salvar modelo: ${err.message}`);
      }
    });

    document.getElementById(`${prefixo}BtnEmitir`).addEventListener('click', async () => {
      const itens = isEspecial ? [...itensReceitaEspecial] : [...itensReceitaComum];
      if (itens.length === 0) return;

      const tipo = isEspecial ? 'receita_especial' : 'receita_comum';
      const conteudo = {
        cabecalho: dadosCabecalhoPadrao(),
        paciente: {
          nome: pacienteAtual.nome,
          cpf: pacienteAtual.cpf || '',
          endereco: isEspecial
            ? (document.getElementById(`${prefixo}PacEndereco`)?.value.trim() || '')
            : (pacienteAtual.endereco || '')
        },
        profissional: {
          nome: document.getElementById(`${prefixo}ProfNome`).value.trim(),
          cro: document.getElementById(`${prefixo}ProfCro`).value.trim()
        },
        data: document.getElementById(`${prefixo}Data`).value,
        itens
      };

      try {
        await DopinAPI.salvarDocumentoEmitido(pacienteAtual.id, { tipo, titulo, conteudo });
        await carregarHistorico(pacienteAtual.id);
        imprimirDocumento(tipo, conteudo);
      } catch (err) {
        alert(`Erro ao salvar receita no histórico: ${err.message}`);
      }
    });
  }

  function popularSelectMedicamentos(prefixo) {
    const sel = document.getElementById(`${prefixo}SelectMed`);
    if (!sel) return;
    const termo = (document.getElementById(`${prefixo}BuscaMed`)?.value || '').trim().toLowerCase();
    const lista = (window.MedicamentosModule?.getLista() || []).filter(
      (m) =>
        !termo ||
        String(m.nome || '').toLowerCase().includes(termo) ||
        String(m.principio_ativo || '').toLowerCase().includes(termo)
    );

    sel.innerHTML =
      '<option value="">-- Selecione um medicamento cadastrado --</option>' +
      lista
        .map(
          (m) =>
            `<option value="${window.escapeHTML(m.id)}">${window.escapeHTML(m.nome)}${m.concentracao ? ' ' + window.escapeHTML(m.concentracao) : ''}${m.principio_ativo ? ' (' + window.escapeHTML(m.principio_ativo) + ')' : ''}</option>`
        )
        .join('');
  }

  function atualizarSelectMedicamentos() {
    popularSelectMedicamentos('recCom');
    popularSelectMedicamentos('recEsp');
  }

  function renderTabelaItensReceita(prefixo, isEspecial) {
    const tbody = document.getElementById(`${prefixo}ItensBody`);
    if (!tbody) return;
    const itens = isEspecial ? itensReceitaEspecial : itensReceitaComum;

    if (itens.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">Nenhum medicamento adicionado ainda.</td></tr>';
      return;
    }

    tbody.innerHTML = itens
      .map(
        (it, idx) => `
        <tr>
          <td><strong>${window.escapeHTML(it.nome)}</strong> ${window.escapeHTML(it.concentracao)}<br><small class="hint">${window.escapeHTML(it.forma)}</small></td>
          <td>${window.escapeHTML(it.via || '-')}<br><small class="hint">${window.escapeHTML(it.quantidade || '')}</small></td>
          <td>${window.escapeHTML(it.posologia)}${it.duracao ? `<br><small class="hint">Duração: ${window.escapeHTML(it.duracao)}</small>` : ''}</td>
          <td><button type="button" class="btn-danger-sm" onclick="DocumentosModule.removerItemReceita(${isEspecial}, ${idx})">Remover</button></td>
        </tr>`
      )
      .join('');
  }

  function removerItemReceita(isEspecial, idx) {
    if (isEspecial) itensReceitaEspecial.splice(idx, 1);
    else itensReceitaComum.splice(idx, 1);
    renderizarPainelAtivo();
  }

  // ==================== 4. HISTÓRICO IMUTÁVEL DE DOCUMENTOS EMITIDOS ====================
  function renderHistorico(el) {
    if (historicoEmitidos.length === 0) {
      el.innerHTML = '<div class="card" style="box-shadow:none;"><p class="hint">Nenhum documento emitido para este paciente ainda.</p></div>';
      return;
    }

    el.innerHTML = `
      <div class="card" style="box-shadow:none; background:var(--white);">
        <div class="card-header">
          <h3><i data-lucide="history"></i> Histórico de Documentos Emitidos (Preservado)</h3>
          <span class="hint">Alterações ou exclusões no Banco de Medicamentos não modificam receitas já emitidas.</span>
        </div>
        <div class="table-responsive">
          <table>
            <thead><tr><th>Data Emissão</th><th>Documento</th><th>Ação</th></tr></thead>
            <tbody>
              ${historicoEmitidos
                .map(
                  (d) => `
                <tr>
                  <td>${fmtDataBR(d.criado_em)}</td>
                  <td><strong>${window.escapeHTML(d.titulo || d.tipo)}</strong></td>
                  <td><button type="button" class="btn-edit-sm" onclick="DocumentosModule.reimprimir('${window.escapeHTML(d.id)}')">Visualizar / Imprimir</button></td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function reimprimir(docId) {
    const doc = historicoEmitidos.find((d) => d.id === docId);
    if (!doc) return;
    try {
      const conteudo = JSON.parse(doc.conteudo_json);
      imprimirDocumento(doc.tipo, conteudo);
    } catch {
      alert('Não foi possível ler os dados salvos deste documento.');
    }
  }

  // ==================== MOTOR DE IMPRESSÃO / PDF COM LOGO DO R2 ====================
  function montarCabecalhoHTML(cab) {
    const logo = cab.logoDataUrl
      ? `<img src="${cab.logoDataUrl}" style="max-height:60px; max-width:150px; object-fit:contain;" />`
      : '';
    const info = [
      cab.clinicaRazao ? cab.clinicaRazao : '',
      cab.clinicaCnpj ? `CNPJ/CPF: ${cab.clinicaCnpj}` : '',
      cab.clinicaCro ? `CRO: ${cab.clinicaCro}` : '',
      cab.clinicaTelefone ? `Tel: ${cab.clinicaTelefone}` : '',
      cab.clinicaEndereco ? cab.clinicaEndereco : ''
    ].filter(Boolean).join(' • ');

    return `
      <div class="doc-head">
        <div class="doc-brand">
          ${logo}
          <div>
            <h2>${window.escapeHTML(cab.clinicaNome)}</h2>
            <p>${window.escapeHTML(info)}</p>
          </div>
        </div>
      </div>`;
  }

  function montarCorpoReceita(conteudo, subtituloVia = '') {
    const itensHtml = (conteudo.itens || [])
      .map(
        (it, i) => `
        <div class="med-item">
          <div class="med-title">
            <span>${i + 1}. <strong>${window.escapeHTML(it.nome)}</strong> ${window.escapeHTML(it.concentracao || '')} ${it.forma ? `— ${window.escapeHTML(it.forma)}` : ''}</span>
            <span>${window.escapeHTML(it.quantidade || '')}</span>
          </div>
          ${it.principio_ativo ? `<div class="med-sub">Princípio ativo: ${window.escapeHTML(it.principio_ativo)}</div>` : ''}
          <div class="med-posologia">
            ${it.via ? `<strong>${window.escapeHTML(it.via)}:</strong> ` : ''}${window.escapeHTML(it.posologia)}
            ${it.duracao ? ` (Duração: ${window.escapeHTML(it.duracao)})` : ''}
          </div>
          ${it.orientacoes ? `<div class="med-sub">Orientações: ${window.escapeHTML(it.orientacoes)}</div>` : ''}
        </div>`
      )
      .join('');

    return `
      <div class="page-sheet">
        ${montarCabecalhoHTML(conteudo.cabecalho || dadosCabecalhoPadrao())}
        <div class="doc-title-bar">
          <h3>${subtituloVia ? 'RECEITUÁRIO DE CONTROLE ESPECIAL' : 'RECEITUÁRIO ODONTOLÓGICO'}</h3>
          ${subtituloVia ? `<span class="via-badge">${window.escapeHTML(subtituloVia)}</span>` : ''}
        </div>
        <div class="pac-box">
          <strong>Paciente:</strong> ${window.escapeHTML(conteudo.paciente?.nome || '')}
          ${conteudo.paciente?.cpf ? ` &nbsp;|&nbsp; <strong>CPF:</strong> ${window.escapeHTML(conteudo.paciente.cpf)}` : ''}
          ${conteudo.paciente?.endereco ? `<br><strong>Endereço:</strong> ${window.escapeHTML(conteudo.paciente.endereco)}` : ''}
        </div>
        <div class="med-list">${itensHtml}</div>
        <div class="doc-footer">
          <div>Data: ${fmtDataBR(conteudo.data)}</div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <strong>${window.escapeHTML(conteudo.profissional?.nome || '')}</strong><br>
            <span>${window.escapeHTML(conteudo.profissional?.cro || '')}</span>
          </div>
        </div>
      </div>`;
  }

  function imprimirDocumento(tipo, conteudo) {
    let htmlCorpo = '';

    if (tipo === 'atestado' || tipo === 'declaracao') {
      const isDecl = tipo === 'declaracao';
      const textoPadrao = isDecl
        ? `Declaro para os devidos fins que o(a) paciente <strong>${window.escapeHTML(conteudo.paciente?.nome || '')}</strong>${conteudo.paciente?.cpf ? `, portador(a) do CPF ${window.escapeHTML(conteudo.paciente.cpf)}` : ''}, compareceu a este consultório odontológico na data de <strong>${fmtDataBR(conteudo.data)}</strong>${conteudo.horario ? `, no horário ${window.escapeHTML(conteudo.horario)}` : ''}, para atendimento odontológico.`
        : `Atesto para os devidos fins que o(a) paciente <strong>${window.escapeHTML(conteudo.paciente?.nome || '')}</strong>${conteudo.paciente?.cpf ? `, portador(a) do CPF ${window.escapeHTML(conteudo.paciente.cpf)}` : ''}, esteve sob meus cuidados profissionais na data de <strong>${fmtDataBR(conteudo.data)}</strong>, necessitando de <strong>${window.escapeHTML(conteudo.dias || '1')} dia(s)</strong> de afastamento de suas atividades para recuperação.`;

      htmlCorpo = `
        <div class="page-sheet">
          ${montarCabecalhoHTML(conteudo.cabecalho || dadosCabecalhoPadrao())}
          <div class="doc-title-bar"><h3>${isDecl ? 'DECLARAÇÃO DE COMPARECIMENTO' : 'ATESTADO ODONTOLÓGICO'}</h3></div>
          <div class="atestado-body">
            <p>${textoPadrao}</p>
            ${conteudo.texto ? `<p style="margin-top:14px;">${window.escapeHTML(conteudo.texto)}</p>` : ''}
            ${!isDecl && conteudo.cid ? `<p style="margin-top:14px;"><strong>CID:</strong> ${window.escapeHTML(conteudo.cid)}</p>` : ''}
          </div>
          <div class="doc-footer">
            <div>Data: ${fmtDataBR(conteudo.data)}</div>
            <div class="sig-box">
              <div class="sig-line"></div>
              <strong>${window.escapeHTML(conteudo.profissional?.nome || '')}</strong><br>
              <span>${window.escapeHTML(conteudo.profissional?.cro || '')}</span>
            </div>
          </div>
        </div>`;
    } else if (tipo === 'receita_comum') {
      htmlCorpo = montarCorpoReceita(conteudo, '');
    } else if (tipo === 'receita_especial') {
      htmlCorpo =
        montarCorpoReceita(conteudo, '1ª VIA — Retenção da farmácia ou estabelecimento dispensador') +
        '<div class="page-break"></div>' +
        montarCorpoReceita(conteudo, '2ª VIA — Orientação do paciente');
    }

    const win = window.open('', '_blank', 'width=900,height=750');
    if (!win) {
      alert('Permita pop-ups no navegador para visualizar e imprimir o documento.');
      return;
    }

    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Documento — DôPin Saúde</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #f8fafc; }
        .page-sheet { background: #fff; max-width: 780px; margin: 0 auto 24px; padding: 32px; border: 1px solid #cbd5e1; border-radius: 8px; }
        .doc-head { border-bottom: 2px solid #06283d; padding-bottom: 14px; margin-bottom: 18px; }
        .doc-brand { display: flex; align-items: center; gap: 16px; }
        .doc-brand h2 { margin: 0; color: #06283d; font-size: 1.25rem; }
        .doc-brand p { margin: 4px 0 0; color: #475569; font-size: 0.82rem; }
        .doc-title-bar { text-align: center; margin: 18px 0; }
        .doc-title-bar h3 { margin: 0; color: #06283d; letter-spacing: 0.5px; }
        .via-badge { display: inline-block; margin-top: 6px; padding: 4px 12px; background: #f0fdfa; border: 1px solid #14b8a6; color: #0d9488; font-size: 0.78rem; font-weight: 700; border-radius: 999px; }
        .pac-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 6px; margin-bottom: 18px; font-size: 0.92rem; }
        .med-item { padding: 12px 0; border-bottom: 1px dashed #cbd5e1; }
        .med-title { display: flex; justify-content: space-between; font-size: 0.98rem; }
        .med-posologia { margin-top: 5px; font-size: 0.92rem; }
        .med-sub { margin-top: 3px; font-size: 0.82rem; color: #475569; }
        .atestado-body { font-size: 1rem; line-height: 1.75; margin: 28px 0 48px; text-align: justify; }
        .doc-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 52px; font-size: 0.88rem; }
        .sig-box { text-align: center; min-width: 240px; }
        .sig-line { border-top: 1px solid #334155; margin-bottom: 6px; }
        .page-break { page-break-before: always; }
        .print-bar { text-align: center; margin-bottom: 16px; }
        .print-bar button { background: #14b8a6; color: #fff; border: none; padding: 10px 20px; border-radius: 7px; font-weight: 600; cursor: pointer; font-size: 0.92rem; }
        @media print { body { background: #fff; padding: 0; } .print-bar { display: none; } .page-sheet { border: none; margin: 0; padding: 16px; } }
      </style></head><body>
      <div class="print-bar"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
      ${htmlCorpo}
      </body></html>`);
    win.document.close();
  }

  window.DocumentosModule = {
    renderizar,
    trocarAba,
    atualizarSelectMedicamentos,
    removerItemReceita,
    reimprimir
  };
})();
