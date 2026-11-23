// ==================== CLIENTE DA API CLOUDFLARE (DÔPIN SAÚDE) ====================
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
    if (manterSessao) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
    }
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
    if (!resp.ok) {
      throw new Error(dados.erro || `Erro HTTP ${resp.status}`);
    }
    return dados;
  },

  // Autenticação e Cadastro SaaS
  registrarClinica(payload) {
    return this.request('/auth/registrar-clinica', { method: 'POST', body: payload });
  },

  login(usuario, senha) {
    return this.request('/auth/login', { method: 'POST', body: { usuario, senha } });
  },

  // Dados completos da clínica
  buscarDadosIniciais() {
    return this.request('/dados-iniciais');
  },

  // Atendimentos (Mapa Diário)
  criarAtendimento(payload) {
    return this.request('/atendimentos', { method: 'POST', body: payload });
  },

  excluirAtendimento(id) {
    return this.request(`/atendimentos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // Saídas
  criarSaida(payload) {
    return this.request('/saidas', { method: 'POST', body: payload });
  },

  excluirSaida(id) {
    return this.request(`/saidas/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // Pagamentos aos dentistas
  registrarPagamento(payload) {
    return this.request('/pagamentos', { method: 'POST', body: payload });
  },

  // Configurações e Usuários
  salvarClinica(payload) {
    return this.request('/config/clinica', { method: 'PUT', body: payload });
  },

  criarUsuario(payload) {
    return this.request('/usuarios', { method: 'POST', body: payload });
  },

  desativarUsuario(id) {
    return this.request(`/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // Pacientes e Documentos (Cloudflare R2)
  listarPacientes() {
    return this.request('/pacientes');
  },

  criarPaciente(payload) {
    return this.request('/pacientes', { method: 'POST', body: payload });
  },

  listarDocumentos(pacienteId) {
    return this.request(`/documentos?paciente_id=${encodeURIComponent(pacienteId)}`);
  },

  uploadDocumento(formData) {
    return this.request('/documentos/upload', { method: 'POST', body: formData, isFormData: true });
  },

  excluirDocumento(id) {
    return this.request(`/documentos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

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
