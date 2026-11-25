// ==================== MÓDULO: RESPONSIVIDADE (CELULAR / TABLET) ====================
// 1) Rotula automaticamente cada <td> com o título da coluna (data-label),
//    permitindo que as tabelas virem "cartões" no celular via CSS.
// 2) Mantém a aba ativa visível na barra de abas com rolagem lateral.
// 3) No celular, ao trocar de aba, volta ao topo do conteúdo.
(function () {
  const SELETOR_TABELAS = '.table-responsive table:not(.simple-table)';
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  function rotularTabela(table) {
    const titulos = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim());
    if (titulos.length === 0) return;

    table.querySelectorAll('tbody tr, tfoot tr').forEach((tr) => {
      const celulas = Array.from(tr.children).filter((c) => c.tagName === 'TD');
      let coluna = 0;
      celulas.forEach((td) => {
        const span = Number(td.getAttribute('colspan') || 1);
        const ehMensagemVazia = celulas.length === 1 && span > 1;
        td.classList.toggle('td-vazio', ehMensagemVazia);
        const rotulo = ehMensagemVazia ? '' : titulos[coluna] || '';
        if (td.dataset.label !== rotulo) td.dataset.label = rotulo;
        coluna += span;
      });
    });

    table.classList.add('tabela-cards');
  }

  function rotularTudo() {
    document.querySelectorAll(SELETOR_TABELAS).forEach(rotularTabela);
  }

  // Re-rotula sempre que o conteúdo das tabelas é re-renderizado pelos módulos
  let agendado = false;
  function agendarRotulagem() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      rotularTudo();
    });
  }

  function manterAbaVisivel(btn) {
    if (!btn || !btn.closest('.tabs-nav')) return;
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  document.addEventListener('DOMContentLoaded', () => {
    rotularTudo();

    // Observa apenas inserção/remoção de nós (não atributos), evitando laço infinito
    const observer = new MutationObserver(agendarRotulagem);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab-btn');
      if (tab) {
        // Aguarda a troca de aba (feita pelo script.js) antes de rolar
        setTimeout(() => {
          manterAbaVisivel(document.querySelector('.tabs-nav .tab-btn.active'));
          if (isMobile() && tab.classList.contains('active')) {
            const container = document.querySelector('#appShell .container');
            const nav = document.querySelector('.tabs-nav');
            if (container && nav) {
              const topo = container.getBoundingClientRect().top + window.scrollY - nav.offsetHeight - 8;
              if (window.scrollY > topo) window.scrollTo({ top: Math.max(0, topo), behavior: 'smooth' });
            }
          }
        }, 60);
      }
    });
  });

  window.ResponsiveModule = { rotularTudo };
})();
