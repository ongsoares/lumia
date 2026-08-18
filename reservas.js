/* ============================================================
   LumiaPark — Popup de Reserva de Festa
   Controla os 3 passos do formulário (Pacote/Data/Horas/Crianças
   -> Aniversariante/Responsável -> Resumo/Confirmação), calcula
   o valor estimado consoante o pacote escolhido, valida os
   campos obrigatórios e envia os dados para /reservas.php.
   ============================================================ */
(function () {
  'use strict';

  var overlay = document.getElementById('lp-reserva-overlay');
  var openBtn = document.getElementById('lp-open-reserva');
  var closeBtn = document.getElementById('lp-rv-close');
  var form = document.getElementById('lp-rv-form');

  var steps = {
    1: document.getElementById('lp-rv-step-1'),
    2: document.getElementById('lp-rv-step-2'),
    3: document.getElementById('lp-rv-step-3')
  };
  var dots = document.querySelectorAll('[data-step-dot]');

  var pacoteSelect = document.getElementById('lp-rv-pacote');
  var pacoteHint = document.getElementById('lp-rv-pacote-hint');
  var dataInput = document.getElementById('lp-rv-data');
  var horasSelect = document.getElementById('lp-rv-horas');
  var criancasInput = document.getElementById('lp-rv-criancas');
  var criancasHint = document.getElementById('lp-rv-criancas-hint');

  var anivNascInput = document.getElementById('lp-rv-aniv-nasc');

  var nextBtn1 = document.getElementById('lp-rv-next-1');
  var nextBtn2 = document.getElementById('lp-rv-next-2');
  var backBtn2 = document.getElementById('lp-rv-back-2');
  var backBtn3 = document.getElementById('lp-rv-back-3');
  var submitBtn = document.getElementById('lp-rv-submit');

  var msg1 = document.getElementById('lp-rv-msg-1');
  var msg2 = document.getElementById('lp-rv-msg-2');
  var msg3 = document.getElementById('lp-rv-msg-3');

  var summaryEl = document.getElementById('lp-rv-summary');
  var totalValueEl = document.getElementById('lp-rv-total-value');

  if (!overlay || !openBtn || !form) return; // segurança: se algo faltar no HTML, não parte a página

  var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- Data mínima: não deixar escolher datas passadas ---------- */
  (function setMinDate() {
    var hoje = new Date();
    var yyyy = hoje.getFullYear();
    var mm = String(hoje.getMonth() + 1).padStart(2, '0');
    var dd = String(hoje.getDate()).padStart(2, '0');
    var hojeStr = yyyy + '-' + mm + '-' + dd;
    dataInput.setAttribute('min', hojeStr);
    anivNascInput.setAttribute('max', hojeStr); // data de nascimento não pode ser no futuro
  })();

  /* ---------- Abrir / Fechar popup ---------- */
  function openPopup() {
    overlay.classList.add('lp-nl-visible');
    goToStep(1);
  }
  function closePopup() {
    overlay.classList.remove('lp-nl-visible');
  }

  openBtn.addEventListener('click', openPopup);
  closeBtn.addEventListener('click', closePopup);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closePopup();
  });

  /* ---------- Navegação entre passos ---------- */
  function goToStep(n) {
    Object.keys(steps).forEach(function (key) {
      steps[key].classList.toggle('lp-nl-step-hidden', Number(key) !== n);
    });
    dots.forEach(function (dot) {
      dot.classList.toggle('active', Number(dot.getAttribute('data-step-dot')) === n);
    });
  }

  /* ---------- Passo 1: Pacote -> ajusta o campo Nº de Crianças ---------- */
  function pacoteAtual() {
    var opt = pacoteSelect.options[pacoteSelect.selectedIndex];
    if (!opt || !opt.value) return null;
    return {
      valor: opt.value,
      nome: opt.textContent.split(' — ')[0],
      preco: parseFloat(opt.getAttribute('data-preco')) || 0,
      min: parseInt(opt.getAttribute('data-min'), 10) || 1,
      max: opt.getAttribute('data-max') ? parseInt(opt.getAttribute('data-max'), 10) : null,
      fixo: parseFloat(opt.getAttribute('data-fixo')) || 0
    };
  }

  pacoteSelect.addEventListener('change', function () {
    var pacote = pacoteAtual();
    if (!pacote) return;

    criancasInput.disabled = false;
    criancasInput.setAttribute('min', pacote.min);

    if (pacote.max) {
      // Pacote Lumia Moon: nº de crianças limitado ao máximo, valor fixo (não multiplica)
      criancasInput.setAttribute('max', pacote.max);
      criancasInput.value = pacote.max;
      criancasHint.textContent = 'Até ' + pacote.max + ' crianças · valor fixo de ' + formatEuro(pacote.fixo) + ' (não varia com o nº de crianças).';
    } else {
      criancasInput.removeAttribute('max');
      criancasInput.value = pacote.min;
      criancasHint.textContent = 'Mínimo de ' + pacote.min + ' crianças para este pacote · ' + formatEuro(pacote.preco) + ' por criança.';
    }

    pacoteHint.textContent = '';
  });

  nextBtn1.addEventListener('click', function () {
    msg1.textContent = '';
    msg1.className = 'lp-rv-msg';

    var pacote = pacoteAtual();
    if (!pacote) {
      msg1.textContent = 'Escolhe um pacote para continuares.';
      msg1.classList.add('lp-nl-error');
      return;
    }
    if (!dataInput.value) {
      msg1.textContent = 'Escolhe a data da festa.';
      msg1.classList.add('lp-nl-error');
      return;
    }
    if (!horasSelect.value) {
      msg1.textContent = 'Escolhe o horário da festa.';
      msg1.classList.add('lp-nl-error');
      return;
    }
    var numCriancas = parseInt(criancasInput.value, 10);
    if (!numCriancas || numCriancas < 1) {
      msg1.textContent = 'Indica o número de crianças.';
      msg1.classList.add('lp-nl-error');
      return;
    }
    if (!pacote.max && numCriancas < pacote.min) {
      msg1.textContent = 'O pacote ' + pacote.nome + ' exige um mínimo de ' + pacote.min + ' crianças.';
      msg1.classList.add('lp-nl-error');
      return;
    }
    if (pacote.max && numCriancas > pacote.max) {
      msg1.textContent = 'O pacote ' + pacote.nome + ' aceita no máximo ' + pacote.max + ' crianças.';
      msg1.classList.add('lp-nl-error');
      return;
    }

    goToStep(2);
  });

  /* ---------- Passo 2: Aniversariante + Responsável ---------- */
  backBtn2.addEventListener('click', function () {
    goToStep(1);
  });

  nextBtn2.addEventListener('click', function () {
    msg2.textContent = '';
    msg2.className = 'lp-rv-msg';

    var obrigatorios = [
      document.getElementById('lp-rv-aniv-nome'),
      document.getElementById('lp-rv-aniv-idade'),
      document.getElementById('lp-rv-aniv-nasc'),
      document.getElementById('lp-rv-resp-nome'),
      document.getElementById('lp-rv-telefone'),
      document.getElementById('lp-rv-email')
    ];

    for (var i = 0; i < obrigatorios.length; i++) {
      if (!obrigatorios[i].value || !obrigatorios[i].value.trim()) {
        msg2.textContent = 'Preenche todos os campos obrigatórios (*).';
        msg2.classList.add('lp-nl-error');
        obrigatorios[i].focus();
        return;
      }
    }

    var email = document.getElementById('lp-rv-email').value.trim();
    if (!EMAIL_REGEX.test(email)) {
      msg2.textContent = 'Introduz um email válido (ex: nome@gmail.com).';
      msg2.classList.add('lp-nl-error');
      return;
    }

    var telefone = document.getElementById('lp-rv-telefone').value.trim();
    if (telefone.replace(/\D/g, '').length < 9) {
      msg2.textContent = 'Introduz um número de telefone válido.';
      msg2.classList.add('lp-nl-error');
      return;
    }

    buildSummary();
    goToStep(3);
  });

  /* ---------- Passo 3: Resumo + valor + confirmação ---------- */
  function formatEuro(valor) {
    return valor.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  function formatDataPT(isoDate) {
    if (!isoDate) return '—';
    var partes = isoDate.split('-'); // yyyy-mm-dd
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  function calcularValor() {
    var pacote = pacoteAtual();
    if (!pacote) return 0;
    var numCriancas = parseInt(criancasInput.value, 10) || 0;

    if (pacote.max) {
      return pacote.fixo; // Lumia Moon: valor fixo, não multiplica pelo nº de crianças
    }
    return pacote.preco * numCriancas;
  }

  function buildSummary() {
    var pacote = pacoteAtual();
    var numCriancas = parseInt(criancasInput.value, 10) || 0;
    var valor = calcularValor();

    var linhas = [
      { label: 'Pacote', value: pacote ? pacote.nome : '—' },
      { label: 'Data da Festa', value: formatDataPT(dataInput.value) },
      { label: 'Horas da Festa', value: horasSelect.value || '—' },
      { label: 'Nº de Crianças', value: numCriancas },
      { label: 'Aniversariante', value: document.getElementById('lp-rv-aniv-nome').value.trim() + ' (' + document.getElementById('lp-rv-aniv-idade').value + ' anos)' },
      { label: 'Responsável', value: document.getElementById('lp-rv-resp-nome').value.trim() },
      { label: 'Contacto', value: document.getElementById('lp-rv-telefone').value.trim() + ' · ' + document.getElementById('lp-rv-email').value.trim() }
    ];

    summaryEl.innerHTML = linhas.map(function (l) {
      return '<div class="lp-rv-summary-row">' +
        '<span class="lp-rv-summary-label">' + l.label + '</span>' +
        '<span class="lp-rv-summary-value">' + l.value + '</span>' +
        '</div>';
    }).join('');

    totalValueEl.textContent = formatEuro(valor);
  }

  backBtn3.addEventListener('click', function () {
    goToStep(2);
  });

  /* ---------- Envio do formulário ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg3.textContent = '';
    msg3.className = 'lp-rv-msg';

    var pacote = pacoteAtual();
    var payload = {
      pacote: pacote ? pacote.valor : '',
      pacote_nome: pacote ? pacote.nome : '',
      data_festa: dataInput.value,
      horas_festa: horasSelect.value,
      numero_criancas: parseInt(criancasInput.value, 10) || 0,
      valor_estimado: calcularValor(),
      aniversariante_nome: document.getElementById('lp-rv-aniv-nome').value.trim(),
      aniversariante_idade: document.getElementById('lp-rv-aniv-idade').value,
      aniversariante_nascimento: document.getElementById('lp-rv-aniv-nasc').value,
      responsavel_nome: document.getElementById('lp-rv-resp-nome').value.trim(),
      telefone: document.getElementById('lp-rv-telefone').value.trim(),
      nif: document.getElementById('lp-rv-nif').value.trim(),
      email: document.getElementById('lp-rv-email').value.trim(),
      observacoes: document.getElementById('lp-rv-obs').value.trim()
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'A enviar...';

    fetch('/reservas.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar Pedido de Reserva';

        if (data.success) {
          msg3.textContent = 'Pedido enviado com sucesso! A nossa equipa vai contactar-te em breve para confirmar todos os detalhes.';
          msg3.classList.add('lp-nl-success');
          form.reset();
          criancasInput.disabled = true;
          criancasInput.setAttribute('placeholder', 'Escolhe um pacote primeiro');
          setTimeout(closePopup, 3200);
        } else {
          msg3.textContent = data.message || 'Ocorreu um erro. Tenta novamente.';
          msg3.classList.add('lp-nl-error');
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar Pedido de Reserva';
        msg3.textContent = 'Erro de ligação. Tenta novamente mais tarde.';
        msg3.classList.add('lp-nl-error');
      });
  });

})();
