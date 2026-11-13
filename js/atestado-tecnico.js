(function () {
  'use strict';
  const form = document.getElementById('atestado-form');
  if (!form) return;
  const validacao = window.RealPontoAtestado;
  const lista = document.getElementById('equipamentos-lista');
  const template = document.getElementById('equipamento-template');
  const adicionar = document.getElementById('adicionar-equipamento');
  const enviar = document.getElementById('enviar-solicitacao');
  const resumo = document.getElementById('form-erros');
  const disponibilidade = document.getElementById('form-disponibilidade');
  const contador = document.getElementById('equipamentos-contador');
  const limiteFoto = 5 * 1024 * 1024;
  let contexto = null;
  let proximoId = 0;
  let enviando = false;

  function atualizarLista() {
    const itens = lista.querySelectorAll('[data-equipamento]');
    itens.forEach(function (item, i) {
      item.querySelector('[data-numero]').textContent = String(i + 1).padStart(2, '0');
      item.querySelector('[data-titulo]').textContent = 'Equipamento ' + (i + 1);
      const remover = item.querySelector('[data-remover]');
      remover.disabled = itens.length === 1;
      remover.setAttribute('aria-label', 'Remover equipamento ' + (i + 1));
    });
    adicionar.disabled = itens.length >= 20;
    contador.textContent = itens.length + (itens.length === 1 ? ' equipamento cadastrado' : ' equipamentos cadastrados') + ' · máximo de 20';
  }

  function criarEquipamento(focar) {
    const id = proximoId++;
    const conteudo = template.content.cloneNode(true);
    conteudo.querySelector('[data-equipamento]').dataset.equipamento = String(id);
    conteudo.querySelectorAll('[data-campo]').forEach(function (campo) {
      const nome = campo.dataset.campo + '_' + id;
      const label = conteudo.querySelector('[data-label="' + campo.dataset.campo + '"]');
      campo.id = nome;
      campo.name = nome;
      label.htmlFor = nome;
      campo.setAttribute('aria-describedby', nome + '_erro' + (campo.type === 'file' ? ' fotos-ajuda' : ''));
      const erro = conteudo.querySelector('[data-erro="' + campo.dataset.campo + '"]');
      erro.id = nome + '_erro';
    });
    lista.appendChild(conteudo);
    atualizarLista();
    if (focar) document.getElementById('fabricante_' + id).focus();
  }

  adicionar.addEventListener('click', function () {
    if (lista.children.length < 20) criarEquipamento(true);
  });
  lista.addEventListener('click', function (event) {
    const remover = event.target.closest('[data-remover]');
    if (!remover || lista.children.length < 2) return;
    remover.closest('[data-equipamento]').remove();
    atualizarLista();
    limparErros();
    adicionar.focus();
  });

  ['cnpj', 'telefone'].forEach(function (nome) {
    const campo = document.getElementById(nome);
    campo.addEventListener('input', function () {
      const posicao = campo.selectionStart;
      const noFinal = posicao === campo.value.length;
      campo.value = nome === 'cnpj' ? validacao.mascaraCnpj(campo.value) : validacao.mascaraTelefone(campo.value);
      if (!noFinal && posicao !== null) campo.setSelectionRange(posicao, posicao);
    });
  });

  function limparErros() {
    form.querySelectorAll('[aria-invalid="true"]').forEach(campo => campo.removeAttribute('aria-invalid'));
    form.querySelectorAll('.at-campo-erro').forEach(erro => { erro.textContent = ''; });
    resumo.replaceChildren();
    resumo.hidden = true;
  }

  function mostrarErros(mensagem, campos) {
    limparErros();
    const titulo = document.createElement('p');
    titulo.textContent = mensagem;
    resumo.appendChild(titulo);
    const ul = document.createElement('ul');
    Object.entries(campos || {}).forEach(function ([nome, texto]) {
      const campo = document.getElementById(nome);
      const erro = document.getElementById(nome + '_erro');
      if (campo && campo.matches('input, select')) campo.setAttribute('aria-invalid', 'true');
      if (erro) erro.textContent = texto;
      const li = document.createElement('li');
      if (campo) {
        const link = document.createElement('a');
        link.href = '#' + nome;
        link.textContent = texto;
        link.addEventListener('click', function (event) { event.preventDefault(); campo.focus(); });
        li.appendChild(link);
      } else li.textContent = texto;
      ul.appendChild(li);
    });
    if (ul.children.length) resumo.appendChild(ul);
    resumo.hidden = false;
    resumo.focus();
  }

  function validarFormulario() {
    const erros = {};
    const equipamentos = [];
    const series = new Set();
    let totalFotos = 0;
    form.querySelectorAll('input[required], select[required]').forEach(function (campo) {
      if ((campo.type === 'checkbox' && !campo.checked) || (campo.type !== 'checkbox' && !campo.value.trim())) {
        erros[campo.id] = campo.type === 'checkbox' ? 'Confirme a declaração de responsabilidade para enviar.' : 'Preencha o campo ' + (campo.labels[0]?.textContent || '').replace('*', '').trim() + '.';
      } else if (campo.validity.typeMismatch || campo.validity.tooLong || /[<>\x00-\x1F\x7F]/.test(campo.value)) {
        erros[campo.id] = 'Confira o formato do campo ' + (campo.labels[0]?.textContent || '').replace('*', '').trim() + '.';
      }
    });
    ['razao_social', 'responsavel'].forEach(function (nome) {
      if (document.getElementById(nome).value.trim().length < 2) erros[nome] = nome === 'razao_social' ? 'Informe a razão social.' : 'Informe o nome do responsável.';
    });
    if (!validacao.cnpjValido(form.elements.cnpj.value)) erros.cnpj = 'Informe um CNPJ válido, incluindo os dígitos verificadores.';
    if (!validacao.telefoneValido(form.elements.telefone.value)) erros.telefone = 'Informe um telefone com DDD e 10 ou 11 dígitos.';
    // Mesma restrição de e-mail ASCII adotada pelo servidor.
    if (!/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(form.elements.email.value.trim()) || /[^\x21-\x7E]/.test(form.elements.email.value.trim())) erros.email = 'Informe um e-mail válido.';
    lista.querySelectorAll('[data-equipamento]').forEach(function (item) {
      const id = Number(item.dataset.equipamento);
      const obter = nome => document.getElementById(nome + '_' + id);
      const serie = obter('numero_serie').value.trim();
      const normalizada = validacao.normalizarSerie(serie);
      if (!/^[a-z0-9 ._\/-]+$/i.test(serie) || !normalizada) erros['numero_serie_' + id] = 'Informe o número de série usando letras, números, espaços, ponto, traço ou barra.';
      else if (series.has(normalizada)) erros['numero_serie_' + id] = 'Este número de série já foi informado nesta solicitação.';
      series.add(normalizada);
      const foto = obter('foto').files[0];
      if (foto) {
        totalFotos += foto.size;
        if (foto.size > limiteFoto || foto.size === 0 || !/\.(jpe?g|png|webp)$/i.test(foto.name) || (foto.type && !['image/jpeg', 'image/png', 'image/webp'].includes(foto.type))) erros['foto_' + id] = 'Use uma foto em JPG, PNG ou WebP de até 5 MB.';
      }
      equipamentos.push({ id, fabricante: obter('fabricante').value, modelo: obter('modelo').value.trim(), numero_serie: serie });
    });
    if (totalFotos > 20 * 1024 * 1024) erros.equipamentos = 'As fotos juntas devem ter no máximo 20 MB.';
    return { erros, equipamentos };
  }

  async function carregarContexto() {
    enviar.disabled = true;
    disponibilidade.textContent = 'Preparando o formulário…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('api/atestado-tecnico.php', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      const dados = await response.json();
      if (!response.ok || !dados.csrf || !dados.envio || dados.declaracao_versao !== form.dataset.declaracaoVersao || dados.privacidade_versao !== form.dataset.privacidadeVersao) throw new Error('indisponivel');
      contexto = dados;
      document.getElementById('retencao-dias').textContent = String(dados.retencao_dias);
      disponibilidade.textContent = 'Formulário pronto para envio. Campos com * são obrigatórios.';
      disponibilidade.classList.remove('at-indisponivel');
      enviar.disabled = false;
    } catch (_) {
      contexto = null;
      disponibilidade.textContent = 'O envio está temporariamente indisponível. Tente novamente mais tarde ou fale com o suporte Realponto.';
      disponibilidade.classList.add('at-indisponivel');
    } finally {
      clearTimeout(timeout);
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (enviando) return;
    limparErros();
    const { erros, equipamentos } = validarFormulario();
    if (Object.keys(erros).length) {
      mostrarErros('Confira os campos indicados antes de enviar.', erros);
      return;
    }
    if (!contexto) {
      mostrarErros('O envio está temporariamente indisponível. Tente novamente mais tarde ou fale com o suporte Realponto.', {});
      return;
    }
    const dados = new FormData(form);
    dados.set('equipamentos', JSON.stringify(equipamentos));
    dados.set('csrf', contexto.csrf);
    dados.set('envio', contexto.envio);
    dados.set('declaracao_versao', contexto.declaracao_versao);
    dados.set('privacidade_versao', contexto.privacidade_versao);
    enviando = true;
    enviar.disabled = true;
    enviar.textContent = 'ENVIANDO SOLICITAÇÃO…';
    form.setAttribute('aria-busy', 'true');
    // Congela as edições enquanto o corpo já está sendo transmitido.
    const controles = Array.from(form.querySelectorAll('input, select, button')).filter(c => !c.disabled);
    controles.forEach(c => { c.disabled = true; });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('api/atestado-tecnico.php', { method: 'POST', body: dados, credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      const resultado = await response.json();
      if (!response.ok) {
        mostrarErros(resultado.mensagem || 'Não foi possível enviar. Tente novamente.', resultado.campos || {});
        return;
      }
      if (!/^RP-AT-\d{8}-[A-F0-9]{12}$/.test(resultado.protocolo || '')) throw new Error('resposta');
      document.getElementById('protocolo-recebido').textContent = resultado.protocolo;
      const avisoEmail = document.getElementById('notificacao-recebimento');
      if (avisoEmail) {
        const estadoEmail = resultado.notificacoes?.estado;
        if (estadoEmail === 'pendente') {
          avisoEmail.textContent = 'Seu pedido está registrado. A confirmação por e-mail está pendente. Guarde o protocolo; não é necessário reenviar a solicitação.';
        } else if (estadoEmail === 'aceitas_pelo_transporte') {
          avisoEmail.textContent = 'Guarde seu protocolo. Confira a confirmação no seu e-mail, inclusive na pasta de spam. Nossa equipe entrará em contato pelo endereço cadastrado.';
        } else {
          avisoEmail.textContent = 'Guarde seu protocolo. Nossa equipe entrará em contato pelo e-mail cadastrado.';
        }
      }
      form.hidden = true;
      document.getElementById('atestado-orientacoes').hidden = true;
      const sucesso = document.getElementById('atestado-sucesso');
      sucesso.hidden = false;
      sucesso.focus();
      form.reset();
    } catch (_) {
      mostrarErros('Não foi possível confirmar o recebimento. Seus dados continuam no formulário. Tente enviar novamente para recuperar o mesmo protocolo, caso o pedido já tenha sido registrado.', {});
    } finally {
      clearTimeout(timeout);
      enviando = false;
      controles.forEach(c => { c.disabled = false; });
      atualizarLista();
      enviar.disabled = !contexto;
      enviar.textContent = 'ENVIAR SOLICITAÇÃO';
      form.removeAttribute('aria-busy');
    }
  });

  criarEquipamento(false);
  carregarContexto();
})();
