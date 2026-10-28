/* Página de ofertas: monta os planos a partir de planos.json, cuida do WhatsApp e do cadastro. */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const html = document.documentElement;

  // Prévia de demonstração (GitHub Pages ou arquivo aberto no computador): o cadastro não é gravado.
  const DEMO = /\.github\.io$/.test(location.hostname) || location.protocol === 'file:' || new URLSearchParams(location.search).has('demo');
  const ADS = html.dataset.ads || '';
  const ADS_CONVERSAO = html.dataset.adsConversao || '';
  const CATEGORIAS = [['residencial', 'Internet residencial'], ['combos', 'Combos'], ['empresarial', 'Empresas'], ['celular', 'Celular']];
  const MSG_PADRAO = 'Olá! Vim pelo site de ofertas e quero saber dos planos de internet.';
  const inicio = Date.now();
  let whatsapp = '';
  let planoHero = null;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "R$" nunca fica sozinho no fim da linha
  const juntaRs = (s) => String(s ?? '').replace(/R\$ (?=\d)/g, 'R$\u00a0');

  function partesPreco(p) {
    const s = String(p ?? '').replace(/R\$\s*/i, '').trim();
    const [i, c = '00'] = s.split(',');
    return [i || '0', ',' + (c + '00').slice(0, 2)];
  }

  function partesVelocidade(v) {
    const m = String(v ?? '').trim().match(/^([\d.,]+)\s*(.*)$/);
    if (!m) return { n: String(v ?? ''), u: '', mbps: 0 };
    let mbps = parseFloat(m[1].replace(',', '.'));
    const u = m[2];
    if (/^giga|^gbps/i.test(u)) mbps *= 1000;
    else if (!/^mega|^mbps/i.test(u)) mbps = 0; // ex.: "100 GB" é franquia de dados, não velocidade
    return { n: m[1], u, mbps };
  }

  const valor = (s) => parseFloat(String(s ?? '').replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.')) || 0;
  const temDe = (p) => p.preco_de && valor(p.preco_de) > valor(p.preco);
  const deHtml = (p) => `De <s>R$&nbsp;${esc(p.preco_de)}</s> por`;

  const textoPlano = (p) => `${p.nome} (R$ ${p.preco} por mês)`;
  const msgPlano = (p) => `Olá! Vim pelo site de ofertas e quero contratar o plano ${p.nome} de R$ ${p.preco} por mês. Pode me ajudar?`;

  function linkWa(msg) {
    const t = encodeURIComponent(msg || MSG_PADRAO);
    return whatsapp ? `https://wa.me/${whatsapp}?text=${t}` : `https://wa.me/?text=${t}`;
  }

  function ligaWa(a, msg) {
    a.dataset.msg = msg;
    a.href = linkWa(msg);
    a.target = '_blank';
    a.rel = 'noopener';
  }

  // ---------------------------------------------------------------- produtos inclusos (apps)
  let catalogo = {};
  const appsDo = (p) => (Array.isArray(p.apps) ? p.apps : []).map((id) => catalogo[id] && { id, ...catalogo[id] }).filter(Boolean);
  const MAX_ICONES = 5;

  // Linha "Produtos inclusos" com os ícones; o botão inteiro abre a janela com a lista.
  function blocoApps(p) {
    const lista = appsDo(p);
    if (!lista.length) return null;
    const div = document.createElement('div');
    div.className = 'apps';
    const resto = lista.length - MAX_ICONES;
    div.innerHTML = `
      <p class="apps-tit">Produtos inclusos</p>
      <button type="button" class="apps-btn" aria-haspopup="dialog" aria-label="Produtos inclusos no plano ${esc(p.nome)}: ${esc(lista.map((a) => a.nome).join(', '))}. Ver detalhes">
        ${lista.slice(0, resto > 0 ? MAX_ICONES - 1 : MAX_ICONES).map((a) => `<img src="${esc(a.icone)}" alt="" width="30" height="30" loading="lazy" decoding="async">`).join('')}
        <span class="apps-mais" aria-hidden="true">${resto > 0 ? '+' + (resto + 1) : '+'}</span>
      </button>`;
    const b = $('.apps-btn', div);
    b.addEventListener('click', () => abreApps(p, b));
    return div;
  }

  let origemModal = null;
  function abreApps(p, origem) {
    const dlg = $('#modal-apps');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    $('#modal-apps-plano').textContent = p.nome;
    $('#modal-apps-lista').innerHTML = appsDo(p).map((a) => `
      <li><img src="${esc(a.icone)}" alt="" width="44" height="44"><div><b>${esc(a.nome)}</b>${a.texto ? `<p>${esc(a.texto)}</p>` : ''}</div></li>`).join('');
    origemModal = origem;
    dlg.showModal();
    $('.modal-corpo', dlg).scrollTop = 0;
    $('.modal-fechar', dlg).focus();
  }

  function preparaModal() {
    const dlg = $('#modal-apps');
    if (!dlg) return;
    $('.modal-fechar', dlg).addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { if (origemModal && document.contains(origemModal)) origemModal.focus(); origemModal = null; });
  }

  // ---------------------------------------------------------------- cartões de plano
  function cartao(p) {
    const v = partesVelocidade(p.velocidade);
    const [int, cent] = partesPreco(p.preco);
    let extra = String(p.nome).replace(p.velocidade, '').replace(/^\s*(Internet|Empresa)\s*/i, '').trim();
    const pct = v.mbps ? Math.max(0.06, Math.min(1, v.mbps / 1000)) : 0;
    const el = document.createElement('article');
    el.className = 'plano' + (p.destaque ? ' destaque' : '');
    el.innerHTML = `
      ${p.destaque ? '<p class="selo">Mais escolhido</p>' : ''}
      <h3 class="plano-tit"><span class="n">${esc(v.n)}</span> <span class="u">${esc(v.u)}</span>${extra ? ` <span class="extra">${esc(extra)}</span>` : ''}</h3>
      ${pct ? `<div class="barra-vel" role="img" aria-label="Velocidade de ${esc(p.velocidade)}"><span style="--p:${pct.toFixed(3)}"></span></div>` : ''}
      ${temDe(p) ? `<p class="preco-de">${deHtml(p)}</p>` : ''}
      <p class="preco${temDe(p) ? ' com-de' : ''}"><span class="rs">R$</span><span class="int">${esc(int)}</span><span class="cent">${esc(cent)}</span><span class="mes">por mês</span></p>
      ${p.observacao ? `<p class="plano-obs">${esc(juntaRs(p.observacao))}</p>` : ''}
      <div class="js-apps"></div>
      <ul class="itens">${(p.itens || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <div class="plano-acoes">
        <a class="btn btn-principal js-quero" href="#cadastro">Quero este plano</a>
        <a class="btn btn-wa" href="#cadastro" aria-label="Pedir ${esc(p.nome)} pelo WhatsApp"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#i-wa"/></svg></a>
      </div>`;
    $('.js-quero', el).dataset.plano = textoPlano(p);
    ligaWa($('.btn-wa', el), msgPlano(p));
    const ap = blocoApps(p);
    if (ap) $('.js-apps', el).replaceWith(ap); else $('.js-apps', el).remove();
    return el;
  }

  function montaGrades(dados) {
    $$('.grade-planos').forEach((g) => {
      const lista = dados[g.dataset.categoria] || [];
      g.dataset.n = String(lista.length);
      g.replaceChildren(...lista.map(cartao));
      const secao = g.closest('section');
      if (secao) secao.hidden = lista.length === 0;
    });
  }

  // ---------------------------------------------------------------- seletor de velocidade (topo)
  function montaSeletor(lista) {
    const sel = $('#seletor');
    if (!lista.length) { $('.hero-texto .hero-sub').hidden = true; sel.hidden = true; return; }
    sel.style.setProperty('--n', String(Math.min(lista.length, 6)));
    sel.replaceChildren(...lista.map((p, i) => {
      const v = partesVelocidade(p.velocidade);
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.innerHTML = `${esc(v.n)}<small>${esc(v.u)}</small>`;
      b.setAttribute('aria-label', `${p.nome}, R$ ${p.preco} por mês`);
      b.addEventListener('click', () => escolheHero(i, true));
      return b;
    }));
    sel.addEventListener('keydown', (e) => {
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!k) return;
      e.preventDefault();
      const atual = lista.indexOf(planoHero);
      const novo = (atual + k + lista.length) % lista.length;
      escolheHero(novo, true);
      sel.children[novo].focus();
    });
    const ini = Math.max(0, lista.findIndex((p) => p.destaque));
    escolheHero(ini, false);
  }

  function escolheHero(i, animar) {
    const lista = window.__planos.residencial;
    const p = lista[i];
    if (!p) return;
    planoHero = p;
    $$('#seletor button').forEach((b, j) => {
      b.setAttribute('aria-checked', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    const v = partesVelocidade(p.velocidade);
    const [int, cent] = partesPreco(p.preco);
    $('#hero-num').textContent = v.n;
    $('#hero-uni').textContent = v.u;
    $('#oferta-nome').textContent = p.nome;
    $('#oferta-selo').hidden = !p.destaque;
    $('#oferta-de').innerHTML = temDe(p) ? deHtml(p) : '';
    $('#oferta-de').hidden = !temDe(p);
    $('#oferta-int').textContent = int;
    $('#oferta-cent').textContent = cent;
    $('#oferta-obs').textContent = juntaRs(p.observacao);
    const ap = blocoApps(p);
    $('#oferta-apps').replaceChildren(...(ap ? [ap] : []));
    $('#oferta-itens').innerHTML = (p.itens || []).slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join('');
    $('#oferta-itens').className = 'itens';
    $('#oferta-quero').dataset.plano = textoPlano(p);
    ligaWa($('#oferta-wa'), msgPlano(p));
    if (animar) {
      const vel = $('.velocimetro'), num = $('.numero');
      [vel, num].forEach((el) => { el.classList.remove(el === vel ? 'anda' : 'troca'); void el.offsetWidth; });
      vel.classList.add('anda');
      num.classList.add('troca');
    }
  }

  // ---------------------------------------------------------------- chip
  function montaChip(lista) {
    const sec = $('#chip');
    const p = lista && lista[0];
    if (!p) { sec.hidden = true; return; }
    sec.hidden = false;
    const [int, cent] = partesPreco(p.preco);
    $('#chip-titulo').textContent = p.nome;
    $('#chip-gb').textContent = p.velocidade;
    $('#chip-de').innerHTML = temDe(p) ? deHtml(p) : '';
    $('#chip-de').hidden = !temDe(p);
    $('#chip-int').textContent = int;
    $('#chip-cent').textContent = cent;
    $('#chip-obs').textContent = p.observacao && !/internet no celular/i.test(p.observacao) ? juntaRs(p.observacao) : '';
    const ap = blocoApps(p);
    $('#chip-apps').replaceChildren(...(ap ? [ap] : []));
    $('#chip-quero').dataset.plano = textoPlano(p);
    ligaWa($('#chip-wa'), msgPlano(p));
  }

  // ---------------------------------------------------------------- lista de planos do formulário
  function montaSelectPlanos(dados) {
    const sel = $('#f-plano');
    const partes = ['<option value="">Escolha um plano</option>'];
    CATEGORIAS.forEach(([k, rotulo]) => {
      const lista = dados[k] || [];
      if (!lista.length) return;
      partes.push(`<optgroup label="${esc(rotulo)}">${lista.map((p) => `<option>${esc(textoPlano(p))}</option>`).join('')}</optgroup>`);
    });
    partes.push('<option>Ainda não sei, quero ajuda para escolher</option>');
    sel.innerHTML = partes.join('');
  }

  function escolhePlanoNoForm(texto) {
    const sel = $('#f-plano');
    if (![...sel.options].some((o) => o.value === texto)) return;
    sel.value = texto;
    const campo = sel.closest('.campo');
    campo.classList.remove('erro', 'marcado');
    void campo.offsetWidth;
    campo.classList.add('marcado');
  }

  document.addEventListener('click', (e) => {
    const q = e.target.closest('.js-quero');
    if (q && q.dataset.plano) escolhePlanoNoForm(q.dataset.plano);
    const w = e.target.closest('a[href^="https://wa.me/"]');
    if (w) conversao();
  });

  // ---------------------------------------------------------------- cidades
  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  async function montaCidades() {
    let cidades = [];
    try { cidades = await (await fetch('cidades.json', { cache: 'no-cache' })).json(); } catch { return; }
    const itens = cidades.map((c) => { const [nome, uf] = c.split(/,\s*/); return { nome, uf, chave: semAcento(nome) }; });
    const porUf = {};
    itens.forEach((c) => { (porUf[c.uf] ||= []).push(c.nome); });
    $('#todas-cidades').innerHTML = Object.keys(porUf).sort().map((uf) => `<h3>${esc(uf)}</h3><p>${porUf[uf].map(esc).join(', ')}</p>`).join('');
    $('.todas-cidades summary').textContent = `Ver todas as ${itens.length} cidades da lista`;

    const busca = $('#busca-cidade'), res = $('#resultado-cidade'), ul = $('#lista-cidades');
    busca.addEventListener('input', () => {
      const q = semAcento(busca.value.trim());
      res.classList.remove('sim');
      if (q.length < 2) { res.textContent = ''; ul.replaceChildren(); return; }
      const achou = itens.filter((c) => c.chave.includes(q)).sort((a, b) => (b.chave.startsWith(q) - a.chave.startsWith(q)) || a.chave.localeCompare(b.chave)).slice(0, 8);
      if (!achou.length) {
        res.textContent = 'Essa cidade não está na lista. Faça o cadastro mesmo assim: o consultor confere a cobertura pelo endereço.';
        ul.replaceChildren();
        return;
      }
      const exata = achou.find((c) => c.chave === q);
      res.textContent = exata ? `Tem Brisanet em ${exata.nome} (${exata.uf}).` : 'Toque na sua cidade para pedir a instalação:';
      if (exata) res.classList.add('sim');
      ul.replaceChildren(...achou.map((c) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${c.nome}, ${c.uf}`;
        b.addEventListener('click', () => {
          $('#f-cidade').value = c.nome;
          $('#f-uf').value = c.uf;
          $('#cadastro').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        });
        li.append(b);
        return li;
      }));
    });
  }

  // ---------------------------------------------------------------- formulário
  const form = $('#form-cadastro');

  function mascaraTelefone(v) {
    let d = v.replace(/\D/g, '');
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  $('#f-tel').addEventListener('input', (e) => { e.target.value = mascaraTelefone(e.target.value); });

  let ultimoCep = '';
  $('#f-cep').addEventListener('input', async (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    const dica = $('#cep-dica');
    if (d.length !== 8 || d === ultimoCep) return;
    ultimoCep = d;
    dica.className = 'dica';
    dica.textContent = 'Buscando o endereço...';
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: ctl.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j.erro) throw new Error('cep');
      if (j.logradouro) $('#f-rua').value = j.logradouro;
      if (j.bairro) $('#f-bairro').value = j.bairro;
      if (j.localidade) $('#f-cidade').value = j.localidade;
      const uf = $('#f-uf');
      uf.value = [...uf.options].some((o) => o.value === j.uf) ? j.uf : 'Outro';
      ['f-rua', 'f-bairro', 'f-cidade', 'f-uf'].forEach((id) => $('#' + id).closest('.campo').classList.remove('erro'));
      dica.className = 'dica ok';
      dica.textContent = j.logradouro ? 'Endereço encontrado. Confira e informe o número.' : 'Cidade encontrada. Preencha a rua e o número.';
      (j.logradouro ? $('#f-num') : $('#f-rua')).focus();
    } catch {
      dica.textContent = 'Não achamos esse CEP. Preencha o endereço abaixo.';
    }
  });

  const OBRIGATORIOS = {
    plano: (v) => v !== '',
    nome: (v) => v.trim().length >= 3,
    telefone: (v) => { const d = v.replace(/\D/g, ''); return d.length === 10 || d.length === 11; },
    cep: (v) => { const d = v.replace(/\D/g, ''); return d.length === 0 || d.length === 8; },
    rua: (v) => v.trim() !== '',
    numero: (v) => v.trim() !== '',
    cidade: (v) => v.trim() !== '',
  };
  const MSG_CAMPO = {
    plano: 'Escolha um plano.', nome: 'Escreva seu nome completo.', telefone: 'Informe o WhatsApp com DDD.',
    cep: 'O CEP tem 8 números.', rua: 'Informe a rua.', numero: 'Informe o número (ou S/N).', cidade: 'Informe a cidade.',
  };

  function marcaErros(nomes) {
    $$('.campo', form).forEach((c) => { c.classList.remove('erro'); $('.msg-erro', c)?.remove(); });
    $('.aceite').classList.remove('erro');
    nomes.forEach((n) => {
      if (n === 'aceite') { $('.aceite').classList.add('erro'); return; }
      const el = form.elements[n];
      if (!el) return;
      const campo = el.closest('.campo');
      campo.classList.add('erro');
      el.setAttribute('aria-invalid', 'true');
      const m = document.createElement('p');
      m.className = 'msg-erro';
      m.id = `erro-${n}`;
      m.textContent = MSG_CAMPO[n] || 'Confira este campo.';
      el.setAttribute('aria-describedby', m.id);
      campo.append(m);
    });
    $$('[aria-invalid]', form).forEach((el) => { if (!nomes.includes(el.name)) { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); } });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const erroForm = $('#erro-form');
    erroForm.textContent = '';
    const f = form.elements;
    const ruins = Object.keys(OBRIGATORIOS).filter((k) => !OBRIGATORIOS[k](f[k].value));
    if (!f.aceite.checked) ruins.push('aceite');
    marcaErros(ruins);
    if (ruins.length) {
      erroForm.textContent = ruins.length === 1 && ruins[0] === 'aceite' ? 'Marque a autorização de contato para enviar.' : 'Confira os campos destacados.';
      const primeiro = ruins[0] === 'aceite' ? f.aceite : f[ruins[0]];
      primeiro.focus();
      return;
    }
    const dados = {
      plano: f.plano.value, nome: f.nome.value.trim(), telefone: f.telefone.value, cep: f.cep.value, rua: f.rua.value.trim(),
      numero: f.numero.value.trim(), complemento: f.complemento.value.trim(), bairro: f.bairro.value.trim(), cidade: f.cidade.value.trim(),
      uf: f.uf.value === 'Outro' ? '' : f.uf.value, aceite: f.aceite.checked ? 1 : 0, site_empresa: f.site_empresa.value, t: inicio,
      origem: (location.search + ' ' + document.referrer).trim().slice(0, 300),
    };
    const botao = $('.btn-enviar', form);
    botao.disabled = true;
    botao.textContent = 'Enviando...';
    try {
      if (DEMO) {
        await new Promise((r) => setTimeout(r, 700));
      } else {
        const r = await fetch('api/cadastro.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        let j = {};
        try { j = await r.json(); } catch { /* resposta vazia */ }
        if (!r.ok || !j.ok) {
          if (j.campos) marcaErros(j.campos);
          throw new Error(j.erro || 'Não foi possível enviar agora. Chame no WhatsApp que a gente atende na hora.');
        }
      }
      conversao();
      form.hidden = true;
      const ok = $('#sucesso');
      ok.hidden = false;
      $('#sucesso-demo').hidden = !DEMO;
      const primeiroNome = dados.nome.split(' ')[0];
      $('#sucesso-texto').textContent = `Obrigado, ${primeiroNome}! O consultor vai chamar você no WhatsApp para confirmar a cobertura e agendar a instalação.`;
      ligaWa($('#sucesso-wa'), `Olá! Acabei de fazer o cadastro no site. Sou ${dados.nome} e escolhi o plano ${dados.plano}.`);
      ok.focus();
    } catch (err) {
      erroForm.textContent = err.message;
      botao.disabled = false;
      botao.textContent = 'Enviar cadastro';
    }
  });

  // ---------------------------------------------------------------- barra fixa no celular
  function barraFixa() {
    const barra = $('#barra-fixa');
    const hero = $('.hero'), cad = $('#cadastro');
    let passouHero = false, vendoCadastro = false;
    const atualiza = () => barra.classList.toggle('visivel', passouHero && !vendoCadastro);
    new IntersectionObserver(([e]) => { passouHero = !e.isIntersecting; atualiza(); }).observe(hero);
    new IntersectionObserver(([e]) => { vendoCadastro = e.isIntersecting; atualiza(); }, { rootMargin: '0px 0px -30% 0px' }).observe(cad);
  }

  // ---------------------------------------------------------------- Google Ads (só no site publicado)
  let gtagPronto = false;
  function carregaGtag() {
    if (DEMO || !ADS || gtagPronto) return;
    gtagPronto = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ADS);
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ADS)}`;
    document.head.append(s);
  }
  function conversao() {
    if (DEMO || !ADS_CONVERSAO) return;
    carregaGtag();
    window.gtag('event', 'conversion', { send_to: ADS_CONVERSAO, value: 1, currency: 'BRL' });
  }
  ['scroll', 'pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, carregaGtag, { once: true, passive: true }));
  setTimeout(carregaGtag, 4000);

  // ---------------------------------------------------------------- início
  function aplicaSite(site) {
    const op = (site && site.operadora) || 'Brisanet';
    $$('.js-operadora').forEach((el) => { el.textContent = op; });
    if (site && site.consultor) $$('.js-consultor').forEach((el) => { el.textContent = site.consultor; });
    const num = String((site && site.whatsapp) || '').replace(/\D/g, '');
    whatsapp = DEMO ? '' : num;
    $$('.js-wa').forEach((a) => ligaWa(a, a.dataset.msg || MSG_PADRAO));
  }

  // Na prévia, avisa que os preços vieram do site oficial e precisam ser confirmados.
  function avisoPrevia(site) {
    const av = $('#aviso-precos');
    if (!av) return;
    av.hidden = !(DEMO && site.precos_origem);
    if (!av.hidden) $('#aviso-precos-txt').textContent = `Prévia para conferência: planos e preços copiados do ${site.precos_origem}. Confirme os valores que você vende.`;
  }

  async function inicia() {
    let dados;
    try {
      const r = await fetch('planos.json', { cache: 'no-cache' });
      dados = await r.json();
    } catch {
      dados = { site: {}, residencial: [], combos: [], empresarial: [], celular: [] };
      $('#planos .cabeca p').textContent = 'Não foi possível carregar os preços agora. Chame no WhatsApp para saber as ofertas do dia.';
    }
    window.__planos = dados;
    catalogo = dados.apps && typeof dados.apps === 'object' ? dados.apps : {};
    aplicaSite(dados.site || {});
    avisoPrevia(dados.site || {});
    montaGrades(dados);
    montaSeletor(dados.residencial || []);
    montaChip(dados.celular || []);
    montaSelectPlanos(dados);
    // reaplica os links de WhatsApp agora que o número foi lido
    $$('.js-wa').forEach((a) => ligaWa(a, a.dataset.msg || MSG_PADRAO));
  }

  if (DEMO) html.classList.add('demo');
  preparaModal();
  aplicaSite({});
  barraFixa();
  montaCidades();
  inicia();
})();
