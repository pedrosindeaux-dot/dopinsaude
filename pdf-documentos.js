// ==================== GERADOR DE PDF NATIVO (SEM BIBLIOTECAS) ====================
// Escreve o arquivo PDF diretamente (texto vetorial com as fontes padrão do PDF),
// sem "fotografar" a tela e sem depender da impressão do navegador.
// Usado no iPhone/iPad, onde window.print() e a captura por canvas não são confiáveis.
(function () {
  // Larguras oficiais (1/1000 em) das fontes padrão Helvetica, códigos WinAnsi 32–255
  const LARG = {
    F1: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500],
    F2: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556]
  };

  // Unicode → WinAnsi (cp1252). Latin-1 (0xA0–0xFF) é direto; 0x80–0x9F tem símbolos próprios.
  const CP1252_EXTRA = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
    0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
    0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f
  };

  function codigo(ch) {
    const u = ch.codePointAt(0);
    if (u === 9) return 32;
    if (u >= 32 && u <= 126) return u;
    if (u >= 0xa0 && u <= 0xff) return u;
    if (CP1252_EXTRA[u]) return CP1252_EXTRA[u];
    return 63; // '?'
  }

  const limpar = (s) => String(s ?? '').normalize('NFC').replace(/\r/g, '');

  function largura(texto, tam, negrito) {
    const t = LARG[negrito ? 'F2' : 'F1'];
    let soma = 0;
    for (const ch of limpar(texto)) soma += t[codigo(ch) - 32] || 556;
    return (soma * tam) / 1000;
  }

  function hexTexto(texto) {
    let h = '';
    for (const ch of limpar(texto)) h += codigo(ch).toString(16).padStart(2, '0');
    return `<${h}>`;
  }

  const COR = {
    petroleo: [0.024, 0.157, 0.239],
    texto: [0.059, 0.09, 0.165],
    cinza: [0.278, 0.333, 0.412],
    turquesa: [0.051, 0.58, 0.533],
    borda: [0.796, 0.835, 0.882],
    fundo: [0.973, 0.98, 0.988],
    fundoTurq: [0.941, 0.992, 0.98]
  };
  const n = (v) => (Math.round(v * 100) / 100).toString();
  const cor = (c) => c.map(n).join(' ');

  function fmtData(iso) {
    if (!iso) return new Date().toLocaleDateString('pt-BR');
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
  }

  // ---------- Documento / páginas ----------
  function novoDoc(paisagem) {
    return { W: paisagem ? 841.89 : 595.28, H: paisagem ? 595.28 : 841.89, paginas: [], imagem: null };
  }

  function pagina(doc, i) {
    while (doc.paginas.length <= i) doc.paginas.push({ ops: [] });
    return doc.paginas[i];
  }

  // Coordenadas de cima para baixo (y = distância do topo)
  function texto(doc, pi, x, y, str, tam, negrito = false, c = COR.texto) {
    if (!String(str ?? '').length) return;
    pagina(doc, pi).ops.push(
      `BT /${negrito ? 'F2' : 'F1'} ${n(tam)} Tf ${cor(c)} rg 1 0 0 1 ${n(x)} ${n(doc.H - y)} Tm ${hexTexto(str)} Tj ET`
    );
  }

  function linha(doc, pi, x1, y1, x2, y2, esp = 0.8, c = COR.borda, tracejado = false) {
    pagina(doc, pi).ops.push(
      `${tracejado ? '[2 2] 0 d ' : ''}${cor(c)} RG ${n(esp)} w ${n(x1)} ${n(doc.H - y1)} m ${n(x2)} ${n(doc.H - y2)} l S${tracejado ? ' [] 0 d' : ''}`
    );
  }

  function retangulo(doc, pi, x, y, w, h, { preenchimento = null, contorno = null, esp = 0.8 } = {}) {
    const op = preenchimento && contorno ? 'B' : preenchimento ? 'f' : 'S';
    pagina(doc, pi).ops.push(
      `${preenchimento ? cor(preenchimento) + ' rg ' : ''}${contorno ? cor(contorno) + ' RG ' : ''}${n(esp)} w ${n(x)} ${n(doc.H - y - h)} ${n(w)} ${n(h)} re ${op}`
    );
  }

  function imagem(doc, pi, x, y, w, h) {
    pagina(doc, pi).ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(doc.H - y - h)} cm /Im1 Do Q`);
  }

  // Quebra de linhas com trechos em negrito: runs = [{ t: 'texto', b: true }]
  function quebrarRuns(runs, tam, maxW) {
    const linhas = [];
    let atual = [];
    let larg = 0;
    let espacoPendente = false;
    const pushPalavra = (palavra, b) => {
      const esp = espacoPendente && atual.length ? largura(' ', tam, b) : 0;
      const w = largura(palavra, tam, b);
      if (atual.length && larg + esp + w > maxW) {
        linhas.push(atual);
        atual = [];
        larg = 0;
        espacoPendente = false;
        return pushPalavra(palavra, b);
      }
      if (!atual.length && w > maxW) {
        // palavra maior que a linha: quebra por caracteres
        let pedaco = '';
        for (const ch of palavra) {
          if (largura(pedaco + ch, tam, b) > maxW && pedaco) {
            linhas.push([{ t: pedaco, b }]);
            pedaco = '';
          }
          pedaco += ch;
        }
        atual = [{ t: pedaco, b }];
        larg = largura(pedaco, tam, b);
        espacoPendente = false;
        return;
      }
      const ult = atual[atual.length - 1];
      const txt = (esp ? ' ' : '') + palavra;
      if (ult && ult.b === b) ult.t += txt;
      else atual.push({ t: txt, b });
      larg += esp + w;
      espacoPendente = false;
    };
    for (const run of runs) {
      const partes = limpar(run.t).split(/(\n|[ \t]+)/);
      for (const p of partes) {
        if (!p) continue;
        if (p === '\n') {
          linhas.push(atual);
          atual = [];
          larg = 0;
          espacoPendente = false;
        } else if (/^[ \t]+$/.test(p)) espacoPendente = true;
        else pushPalavra(p, Boolean(run.b));
      }
    }
    if (atual.length) linhas.push(atual);
    return linhas;
  }

  const quebrar = (str, tam, maxW, negrito = false) => quebrarRuns([{ t: str, b: negrito }], tam, maxW);

  function desenharLinhaRuns(doc, pi, x, y, runs, tam, c = COR.texto, alinhar = 'left', maxW = 0) {
    const total = runs.reduce((s, r) => s + largura(r.t, tam, r.b), 0);
    let cx = alinhar === 'center' ? x + (maxW - total) / 2 : alinhar === 'right' ? x + maxW - total : x;
    for (const r of runs) {
      texto(doc, pi, cx, y, r.t, tam, r.b, c);
      cx += largura(r.t, tam, r.b);
    }
  }

  // ---------- Fluxo (quebra de página automática) ----------
  function criarFluxo(doc, x, w, topo, base) {
    return { doc, x, w, topo, base, pi: 0, y: topo };
  }
  function garantir(f, h) {
    if (f.y + h > f.base) {
      f.pi += 1;
      f.y = f.topo;
    }
  }

  function paragrafo(f, runs, tam, { entre = 1.45, c = COR.texto, alinhar = 'left' } = {}) {
    const alt = tam * entre;
    for (const l of quebrarRuns(runs, tam, f.w)) {
      garantir(f, alt);
      f.y += alt;
      desenharLinhaRuns(f.doc, f.pi, f.x, f.y - (alt - tam) / 2 - tam * 0.18, l, tam, c, alinhar, f.w);
    }
  }

  // ---------- Logo (JPEG embutido; PNG/WEBP convertidos para JPEG) ----------
  async function prepararLogo(dataUrl) {
    if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return null;
    const img = await new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = dataUrl;
    });
    if (!img || !img.naturalWidth) return null;
    let jpegUrl = dataUrl;
    if (!/^data:image\/jpe?g/i.test(dataUrl)) {
      const cv = document.createElement('canvas');
      const escala = Math.min(1, 600 / img.naturalWidth);
      cv.width = Math.max(1, Math.round(img.naturalWidth * escala));
      cv.height = Math.max(1, Math.round(img.naturalHeight * escala));
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      jpegUrl = cv.toDataURL('image/jpeg', 0.92);
    }
    const bin = atob(jpegUrl.split(',')[1] || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // dimensões reais do JPEG (marcador SOF)
    let w = img.naturalWidth, h = img.naturalHeight;
    for (let i = 2; i < bytes.length - 9; ) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        h = (bytes[i + 5] << 8) | bytes[i + 6];
        w = (bytes[i + 7] << 8) | bytes[i + 8];
        break;
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
    return { bytes, w, h };
  }

  // ---------- Blocos comuns ----------
  function cabecalho(doc, pi, x, y, w, cab, escala) {
    const altLogo = 46 * escala;
    let xTexto = x;
    if (doc.imagem) {
      const prop = doc.imagem.w / doc.imagem.h;
      let lw = altLogo * prop, lh = altLogo;
      if (lw > 112 * escala) { lw = 112 * escala; lh = lw / prop; }
      imagem(doc, pi, x, y + (altLogo - lh) / 2, lw, lh);
      xTexto = x + lw + 12 * escala;
    }
    const wTexto = x + w - xTexto;
    let cy = y;
    const tNome = 15 * escala;
    for (const l of quebrar(cab.clinicaNome || 'DôPin Saúde', tNome, wTexto, true)) {
      cy += tNome * 1.2;
      desenharLinhaRuns(doc, pi, xTexto, cy - tNome * 0.2, l, tNome, COR.petroleo);
    }
    const info = [
      cab.clinicaRazao || '',
      cab.clinicaCnpj ? `CNPJ/CPF: ${cab.clinicaCnpj}` : '',
      cab.clinicaCro ? `CRO: ${cab.clinicaCro}` : '',
      cab.clinicaTelefone ? `Tel: ${cab.clinicaTelefone}` : '',
      cab.clinicaEndereco || ''
    ].filter(Boolean).join(' • ');
    const tInfo = 8.5 * escala;
    if (info) {
      cy += 3 * escala;
      for (const l of quebrar(info, tInfo, wTexto)) {
        cy += tInfo * 1.35;
        desenharLinhaRuns(doc, pi, xTexto, cy - tInfo * 0.2, l, tInfo, COR.cinza);
      }
    }
    const fim = Math.max(y + (doc.imagem ? altLogo : 0), cy) + 10 * escala;
    linha(doc, pi, x, fim, x + w, fim, 1.6 * escala, COR.petroleo);
    return fim;
  }

  function tituloCentral(f, str, tam) {
    garantir(f, tam * 2.2);
    f.y += tam * 1.9;
    desenharLinhaRuns(f.doc, f.pi, f.x, f.y, [{ t: str, b: true }], tam, COR.petroleo, 'center', f.w);
  }

  function rodapeAssinatura(f, data, prof, escala) {
    const altura = 70 * escala;
    garantir(f, altura);
    f.y += 44 * escala;
    const tam = 9.5 * escala;
    const larguraAss = Math.min(190 * escala, f.w * 0.55);
    const xAss = f.x + f.w - larguraAss;
    linha(f.doc, f.pi, xAss, f.y, xAss + larguraAss, f.y, 0.8, COR.cinza);
    desenharLinhaRuns(f.doc, f.pi, xAss, f.y + tam * 1.4, [{ t: prof?.nome || '', b: true }], tam, COR.texto, 'center', larguraAss);
    desenharLinhaRuns(f.doc, f.pi, xAss, f.y + tam * 2.7, [{ t: prof?.cro || '', b: false }], tam * 0.95, COR.cinza, 'center', larguraAss);
    texto(f.doc, f.pi, f.x, f.y + tam * 2.7, `Data: ${fmtData(data)}`, tam, false, COR.texto);
    f.y += tam * 3.2;
  }

  // ---------- Atestado / Declaração ----------
  function montarAtestado(doc, tipo, c) {
    const m = 50;
    const x = m, w = doc.W - 2 * m;
    const topoConteudo = cabecalho(doc, 0, x, m, w, c.cabecalho || {}, 1);
    const f = criarFluxo(doc, x, w, m, doc.H - m);
    f.y = topoConteudo;
    const isDecl = tipo === 'declaracao';
    tituloCentral(f, isDecl ? 'DECLARAÇÃO DE COMPARECIMENTO' : 'ATESTADO ODONTOLÓGICO', 13);
    f.y += 18;

    const nome = c.paciente?.nome || '';
    const cpf = c.paciente?.cpf ? `, portador(a) do CPF ${c.paciente.cpf}` : '';
    const runs = isDecl
      ? [
          { t: 'Declaro para os devidos fins que o(a) paciente ' }, { t: nome, b: true },
          { t: `${cpf}, compareceu a este consultório odontológico na data de ` }, { t: fmtData(c.data), b: true },
          { t: `${c.horario ? `, no horário ${c.horario}` : ''}, para atendimento odontológico.` }
        ]
      : [
          { t: 'Atesto para os devidos fins que o(a) paciente ' }, { t: nome, b: true },
          { t: `${cpf}, esteve sob meus cuidados profissionais na data de ` }, { t: fmtData(c.data), b: true },
          { t: ', necessitando de ' }, { t: `${c.dias || '1'} dia(s)`, b: true },
          { t: ' de afastamento de suas atividades para recuperação.' }
        ];
    paragrafo(f, runs, 12, { entre: 1.75 });
    if (c.texto) { f.y += 12; paragrafo(f, [{ t: c.texto }], 12, { entre: 1.75 }); }
    if (!isDecl && c.cid) { f.y += 12; paragrafo(f, [{ t: 'CID: ', b: true }, { t: c.cid }], 12, { entre: 1.75 }); }
    f.y += 24;
    rodapeAssinatura(f, c.data, c.profissional, 1);
  }

  // ---------- Receituário (comum = 1 folha retrato; especial = 2 vias lado a lado) ----------
  function montarReceitaColuna(doc, c, x, w, topo, base, via, escala) {
    const f = criarFluxo(doc, x, w, topo, base);
    f.y = cabecalho(doc, 0, x, topo, w, c.cabecalho || {}, escala);
    tituloCentral(f, via ? 'RECEITUÁRIO DE CONTROLE ESPECIAL' : 'RECEITUÁRIO ODONTOLÓGICO', 13 * escala);
    if (via) {
      const tv = 8 * escala;
      const lv = largura(via, tv, true) + 18 * escala;
      const lvMax = Math.min(lv, w);
      // folga de 2pt evita quebra indevida por arredondamento (as duas vias precisam ter a mesma altura)
      const linhasVia = quebrar(via, tv, lvMax - 16 * escala, true);
      const hv = linhasVia.length * tv * 1.35 + 8 * escala;
      f.y += 6 * escala;
      const xv = x + (w - lvMax) / 2;
      retangulo(doc, f.pi, xv, f.y, lvMax, hv, { preenchimento: COR.fundoTurq, contorno: COR.turquesa, esp: 0.8 });
      let yv = f.y + 4 * escala;
      for (const l of linhasVia) {
        yv += tv * 1.35;
        desenharLinhaRuns(doc, f.pi, xv, yv - tv * 0.3, l, tv, COR.turquesa, 'center', lvMax);
      }
      f.y += hv;
    }
    f.y += 14 * escala;

    // Caixa do paciente
    const tp = 9.5 * escala;
    const linhasPac = quebrarRuns(
      [{ t: 'Paciente: ', b: true }, { t: c.paciente?.nome || '' },
       ...(c.paciente?.cpf ? [{ t: '  |  ' }, { t: 'CPF: ', b: true }, { t: c.paciente.cpf }] : []),
       ...(c.paciente?.endereco ? [{ t: '\n' }, { t: 'Endereço: ', b: true }, { t: c.paciente.endereco }] : [])],
      tp, w - 20 * escala
    );
    const hp = linhasPac.length * tp * 1.45 + 12 * escala;
    garantir(f, hp);
    retangulo(doc, f.pi, x, f.y, w, hp, { preenchimento: COR.fundo, contorno: COR.borda });
    let yp = f.y + 6 * escala;
    for (const l of linhasPac) {
      yp += tp * 1.45;
      desenharLinhaRuns(doc, f.pi, x + 10 * escala, yp - tp * 0.35, l, tp);
    }
    f.y += hp + 6 * escala;

    // Itens
    const ti = 10 * escala, ts = 8.5 * escala;
    (c.itens || []).forEach((it, i) => {
      const qtd = it.quantidade || '';
      const wQtd = qtd ? largura(qtd, ti, false) + 10 * escala : 0;
      const tituloRuns = [{ t: `${i + 1}. ` }, { t: it.nome || '', b: true },
        { t: `${it.concentracao ? ' ' + it.concentracao : ''}${it.forma ? ' — ' + it.forma : ''}` }];
      const lt = quebrarRuns(tituloRuns, ti, w - wQtd);
      const lpa = it.principio_ativo ? quebrar(`Princípio ativo: ${it.principio_ativo}`, ts, w) : [];
      const lpos = quebrarRuns([...(it.via ? [{ t: `${it.via}: `, b: true }] : []), { t: it.posologia || '' },
        ...(it.duracao ? [{ t: ` (Duração: ${it.duracao})` }] : [])], 9.5 * escala, w);
      const lori = it.orientacoes ? quebrar(`Orientações: ${it.orientacoes}`, ts, w) : [];
      const altItem = 10 * escala + lt.length * ti * 1.35 + lpa.length * ts * 1.4 + 4 * escala +
        lpos.length * 9.5 * escala * 1.4 + lori.length * ts * 1.4 + 10 * escala;
      garantir(f, Math.min(altItem, f.base - f.topo));
      f.y += 10 * escala;
      lt.forEach((l, k) => {
        f.y += ti * 1.35;
        desenharLinhaRuns(doc, f.pi, x, f.y - ti * 0.3, l, ti);
        if (k === 0 && qtd) desenharLinhaRuns(doc, f.pi, x, f.y - ti * 0.3, [{ t: qtd }], ti, COR.texto, 'right', w);
      });
      lpa.forEach((l) => { f.y += ts * 1.4; desenharLinhaRuns(doc, f.pi, x, f.y - ts * 0.3, l, ts, COR.cinza); });
      f.y += 4 * escala;
      lpos.forEach((l) => { f.y += 9.5 * escala * 1.4; desenharLinhaRuns(doc, f.pi, x, f.y - 9.5 * escala * 0.3, l, 9.5 * escala); });
      lori.forEach((l) => { f.y += ts * 1.4; desenharLinhaRuns(doc, f.pi, x, f.y - ts * 0.3, l, ts, COR.cinza); });
      f.y += 10 * escala;
      linha(doc, f.pi, x, f.y, x + w, f.y, 0.7, COR.borda, true);
    });

    f.y += 10 * escala;
    rodapeAssinatura(f, c.data, c.profissional, escala);
    return f.pi;
  }

  function montarReceita(doc, tipo, c) {
    if (tipo !== 'receita_especial') {
      const m = 50;
      montarReceitaColuna(doc, c, m, doc.W - 2 * m, m, doc.H - m, '', 1);
      return;
    }
    // 2 vias lado a lado em A4 paisagem (paginação idêntica nas duas colunas)
    const m = 22, gap = 18, pad = 14;
    const wCol = (doc.W - 2 * m - gap) / 2;
    const vias = ['1ª VIA — Retenção da farmácia ou estabelecimento dispensador', '2ª VIA — Orientação do paciente'];
    let ultima = 0;
    vias.forEach((via, k) => {
      const xCol = m + k * (wCol + gap);
      ultima = Math.max(ultima, montarReceitaColuna(doc, c, xCol + pad, wCol - 2 * pad, m + pad, doc.H - m - pad, via, 0.86));
    });
    for (let p = 0; p <= ultima; p++) {
      vias.forEach((_, k) => {
        const xCol = m + k * (wCol + gap);
        retangulo(doc, p, xCol, m, wCol, doc.H - 2 * m, { contorno: COR.borda, esp: 0.9 });
      });
    }
  }

  // ---------- Serialização do arquivo PDF ----------
  function serializar(doc) {
    const enc = new TextEncoder();
    const partes = [];
    const offsets = [];
    let tamanho = 0;
    const add = (dado) => {
      const b = typeof dado === 'string' ? enc.encode(dado) : dado;
      partes.push(b);
      tamanho += b.length;
    };

    const objs = []; // cada item: string ou { dicionario, stream(Uint8Array) }
    const novoObj = (conteudo) => { objs.push(conteudo); return objs.length; };

    const idCatalogo = novoObj(null);
    const idPaginas = novoObj(null);
    const idF1 = novoObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const idF2 = novoObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    let idImg = null;
    if (doc.imagem) {
      idImg = novoObj({
        dic: `<< /Type /XObject /Subtype /Image /Width ${doc.imagem.w} /Height ${doc.imagem.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${doc.imagem.bytes.length} >>`,
        stream: doc.imagem.bytes
      });
    }
    const recursos = `<< /Font << /F1 ${idF1} 0 R /F2 ${idF2} 0 R >>${idImg ? ` /XObject << /Im1 ${idImg} 0 R >>` : ''} >>`;
    const idsPag = [];
    (doc.paginas.length ? doc.paginas : [{ ops: [] }]).forEach((pg) => {
      const conteudo = enc.encode(pg.ops.join('\n'));
      const idCont = novoObj({ dic: `<< /Length ${conteudo.length} >>`, stream: conteudo });
      idsPag.push(novoObj(
        `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${n(doc.W)} ${n(doc.H)}] /Resources ${recursos} /Contents ${idCont} 0 R >>`
      ));
    });
    objs[idCatalogo - 1] = `<< /Type /Catalog /Pages ${idPaginas} 0 R >>`;
    objs[idPaginas - 1] = `<< /Type /Pages /Kids [${idsPag.map((i) => `${i} 0 R`).join(' ')}] /Count ${idsPag.length} >>`;

    add('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'); // comentário com bytes > 127 (recomendado pela especificação PDF)
    objs.forEach((o, i) => {
      offsets[i] = tamanho;
      add(`${i + 1} 0 obj\n`);
      if (typeof o === 'string') add(`${o}\n`);
      else { add(`${o.dic}\nstream\n`); add(o.stream); add('\nendstream\n'); }
      add('endobj\n');
    });
    const inicioXref = tamanho;
    add(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`);
    offsets.forEach((off) => add(`${String(off).padStart(10, '0')} 00000 n \n`));
    add(`trailer\n<< /Size ${objs.length + 1} /Root ${idCatalogo} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);
    return new Blob(partes, { type: 'application/pdf' });
  }

  async function gerar(tipo, conteudo) {
    const doc = novoDoc(tipo === 'receita_especial');
    try {
      doc.imagem = await prepararLogo(conteudo?.cabecalho?.logoDataUrl);
    } catch {
      doc.imagem = null; // sem logo o documento continua válido
    }
    if (tipo === 'atestado' || tipo === 'declaracao') montarAtestado(doc, tipo, conteudo || {});
    else montarReceita(doc, tipo, conteudo || {});
    return serializar(doc);
  }

  window.PdfDocumentos = { gerar };
})();
