// ==================== CLIENTE DA API CLOUDFLARE v2 (DÔPIN SAÚDE) ====================
const API_BASE_URL = 'https://dopinsaude-api.pedrosindeaux.workers.dev';
const TOKEN_KEY = 'dopin_saude_token_v1';

const DopinAPI = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  },

  setToken(token, manterSessao = true) {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (!token) return;
    if (manterSessao) localStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.setItem(TOKEN_KEY, token);
  },

  limparToken() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  },

  async request(rota, { method = 'GET', body = null, isFormData = false } = {}) {
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body && !isFormData) headers['Content-Type'] = 'application/json';

    const resp = await fetch(`${API_BASE_URL}${rota}`, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : null
    });

    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(dados.erro || `Erro HTTP ${resp.status}`);
    return dados;
  },

  // Super Admin (Master)
  masterListarClinicas() { return this.request('/master/clinicas'); },
  masterCriarClinica(payload) { return this.request('/master/clinicas', { method: 'POST', body: payload }); },
  masterAtualizarAssinatura(clinicaId, payload) {
    return this.request(`/master/clinicas/${encodeURIComponent(clinicaId)}/assinatura`, { method: 'PUT', body: payload });
  },
  masterResetarSenha(payload) { return this.request('/master/reset-senha', { method: 'POST', body: payload }); },

  // Auth & Senha
  registrarClinica(payload) { return this.request('/auth/registrar-clinica', { method: 'POST', body: payload }); },
  login(usuario, senha) { return this.request('/auth/login', { method: 'POST', body: { usuario, senha } }); },
  alterarSenha(payload) { return this.request('/auth/alterar-senha', { method: 'PUT', body: payload }); },

  // Dados Iniciais
  buscarDadosIniciais() { return this.request('/dados-iniciais'); },

  // Atendimentos, Saídas e Aprovações Retroativas
  criarAtendimento(payload) { return this.request('/atendimentos', { method: 'POST', body: payload }); },
  excluirAtendimento(id) { return this.request(`/atendimentos/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  criarSaida(payload) { return this.request('/saidas', { method: 'POST', body: payload }); },
  excluirSaida(id) { return this.request(`/saidas/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  listarAprovacoes() { return this.request('/aprovacoes'); },
  decidirAprovacao(tipo, id, decisao) {
    return this.request(`/aprovacoes/${encodeURIComponent(tipo)}/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: { decisao }
    });
  },

  // Repasses & Configurações & Logo (R2)
  registrarPagamento(payload) { return this.request('/pagamentos', { method: 'POST', body: payload }); },
  salvarClinica(payload) { return this.request('/config/clinica', { method: 'PUT', body: payload }); },
  uploadLogo(formData) { return this.request('/config/logo', { method: 'POST', body: formData, isFormData: true }); },
  async buscarLogoDataUrl() {
    const token = this.getToken();
    const resp = await fetch(`${API_BASE_URL}/config/logo`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  },
  criarEspecialidade(payload) { return this.request('/config/especialidades', { method: 'POST', body: payload }); },
  atualizarEspecialidade(id, percentual) {
    return this.request(`/config/especialidades/${encodeURIComponent(id)}`, { method: 'PUT', body: { percentual } });
  },
  excluirEspecialidade(id) {
    return this.request(`/config/especialidades/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  atualizarTaxa(id, taxa) {
    return this.request(`/config/taxas/${encodeURIComponent(id)}`, { method: 'PUT', body: { taxa } });
  },
  criarUsuario(payload) { return this.request('/usuarios', { method: 'POST', body: payload }); },
  desativarUsuario(id) { return this.request(`/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' }); },

  // Pacientes & Anamnese
  listarPacientes() { return this.request('/pacientes'); },
  criarPaciente(payload) { return this.request('/pacientes', { method: 'POST', body: payload }); },
  atualizarPaciente(id, payload) { return this.request(`/pacientes/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }); },
  excluirPaciente(id, motivo = '') {
    return this.request(`/pacientes/${encodeURIComponent(id)}`, { method: 'DELETE', body: motivo ? { motivo } : null });
  },

  // Odontograma / Procedimentos / Utilização do Orçamento
  listarProcedimentos(pacienteId) { return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/procedimentos`); },
  criarProcedimento(pacienteId, payload) {
    return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/procedimentos`, { method: 'POST', body: payload });
  },
  atualizarProcedimento(pacienteId, procId, payload) {
    return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/procedimentos/${encodeURIComponent(procId)}`, {
      method: 'PUT',
      body: payload
    });
  },
  excluirProcedimento(pacienteId, procId) {
    return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/procedimentos/${encodeURIComponent(procId)}`, {
      method: 'DELETE'
    });
  },
  utilizarProcedimento(pacienteId, procId, payload) {
    return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/procedimentos/${encodeURIComponent(procId)}/utilizar`, {
      method: 'POST',
      body: payload
    });
  },

  // Pagamentos do Paciente (Orçamento / Saldo)
  listarPagamentosPaciente(pacienteId) { return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/pagamentos`); },
  criarPagamentoPaciente(pacienteId, payload) {
    return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/pagamentos`, { method: 'POST', body: payload });
  },
  excluirPagamentoPaciente(pacienteId, pagId) {
    return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/pagamentos/${encodeURIComponent(pagId)}`, {
      method: 'DELETE'
    });
  },

  // Evoluções Clínicas
  listarEvolucoes(pacienteId) { return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/evolucoes`); },
  criarEvolucao(pacienteId, payload) {
    return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/evolucoes`, { method: 'POST', body: payload });
  },
  atualizarEvolucao(pacienteId, evolId, payload) {
    return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/evolucoes/${encodeURIComponent(evolId)}`, {
      method: 'PUT',
      body: payload
    });
  },
  excluirEvolucao(pacienteId, evolId) {
    return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/evolucoes/${encodeURIComponent(evolId)}`, {
      method: 'DELETE'
    });
  },

  // Banco de Medicamentos
  listarMedicamentos() { return this.request('/medicamentos'); },
  criarMedicamento(payload) { return this.request('/medicamentos', { method: 'POST', body: payload }); },
  atualizarMedicamento(id, payload) { return this.request(`/medicamentos/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }); },
  excluirMedicamento(id) { return this.request(`/medicamentos/${encodeURIComponent(id)}`, { method: 'DELETE' }); },

  // Documentos Emitidos (Snapshot histórico)
  listarDocumentosEmitidos(pacienteId) { return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/documentos-emitidos`); },
  salvarDocumentoEmitido(pacienteId, payload) {
    return this.request(`/pacientes/${encodeURIComponent(pacienteId)}/documentos-emitidos`, { method: 'POST', body: payload });
  },

  // Anexos Privados no R2
  listarDocumentos(pacienteId) { return this.request(`/documentos?paciente_id=${encodeURIComponent(pacienteId)}`); },
  uploadDocumento(formData) { return this.request('/documentos/upload', { method: 'POST', body: formData, isFormData: true }); },
  excluirDocumento(id) { return this.request(`/documentos/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  async baixarArquivoBlob(id) {
    const token = this.getToken();
    const resp = await fetch(`${API_BASE_URL}/documentos/${encodeURIComponent(id)}/arquivo`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.erro || `Erro HTTP ${resp.status}`);
    }
    return resp.blob();
  }
};
