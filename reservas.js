/* ============================================================
   LumiaPark — Popup de Reserva de Festa
   Controla os 3 passos do formulário (Pacote/Data/Horas/Crianças
   -> Aniversariante/Responsável -> Resumo/Confirmação), calcula
   o valor estimado consoante o pacote escolhido, gera os
   horários disponíveis consoante o dia da semana e a duração do
   pacote, valida os campos obrigatórios e envia os dados para
   /reservas.php.
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
  var dataHint = document.getElementById('lp-rv-data-hint');
  var horasSelect = document.getElementById('lp-rv-horas');
  var horasHint = document.getElementById('lp-rv-horas-hint');
  var criancasInput = document.getElementById('lp-rv-criancas');
  var criancasHint = document.getElementById('lp-rv-criancas-hint');

  var atividadeWrap = document.getElementById('lp-rv-atividade-wrap');
  var atividadeSelect = document.getElementById('lp-rv-atividade');

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

  /* ============================================================
     REGRAS DE FUNCIONAMENTO DO PARQUE
     dayOfWeek: 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta,
                5=Sexta, 6=Sábado (tal como Date.prototype.getDay())
     Estas mesmas regras estão replicadas no reservas.php, para
     que o valor e o horário sejam sempre validados outra vez no
     servidor e nunca só confiados ao que o browser calculou.
     ============================================================ */
  var REGRAS_DIA = {
    0: { aberto: true,  abre: '10:00', fecha: '20:00' }, // Domingo
    1: { aberto: false },                                 // Segunda — encerrado
    2: { aberto: false },                                 // Terça — encerrado
    3: { aberto: true,  abre: '15:00', fecha: '20:00' }, // Quarta
    4: { aberto: true,  abre: '15:00', fecha: '20:00' }, // Quinta
    5: { aberto: true,  abre: '10:00', fecha: '20:00' }, // Sexta
    6: { aberto: true,  abre: '10:00', fecha: '20:00' }  // Sábado
  };
  var ALMOCO_INICIO = '13:00';
  var ALMOCO_FIM = '14:00';
  var INTERVALO_SLOTS_MIN = 30; // horas de início possíveis, de 30 em 30 minutos

  function horaParaMinutos(hhmm) {
    var partes = hhmm.split(':');
    return parseInt(partes[0], 10) * 60 + parseInt(partes[1], 10);
  }
  function minutosParaHora(min) {
    var h = String(Math.floor(min / 60)).padStart(2, '0');
    var m = String(min % 60).padStart(2, '0');
    return h + ':' + m;
  }

  // Devolve o dia da semana (0-6) a partir de uma data "yyyy-mm-dd",
  // sem passar por new Date(string) para evitar problemas de fuso horário.
  function diaDaSemana(isoDate) {
    var partes = isoDate.split('-').map(Number);
    var d = new Date(partes[0], partes[1] - 1, partes[2]);
    return d.getDay();
  }

  // Gera a lista de horários {inicio, fim} possíveis para um dia da semana
  // e uma duração de festa (minutos), respeitando a janela de abertura e
  // excluindo qualquer festa que colida com o intervalo de almoço.
  function gerarHorariosDisponiveis(dayOfWeek, duracaoMin) {
    var regra = REGRAS_DIA[dayOfWeek];
    if (!regra || !regra.aberto) return [];

    var abreMin = horaParaMinutos(regra.abre);
    var fechaMin = horaParaMinutos(regra.fecha);
    var almocoInicioMin = horaParaMinutos(ALMOCO_INICIO);
    var almocoFimMin = horaParaMinutos(ALMOCO_FIM);

    var slots = [];
    for (var inicio = abreMin; inicio + duracaoMin <= fechaMin; inicio += INTERVALO_SLOTS_MIN) {
      var fim = inicio + duracaoMin;
      var colideComAlmoco = inicio < almocoFimMin && fim > almocoInicioMin;
      if (colideComAlmoco) continue;
      slots.push({ inicio: minutosParaHora(inicio), fim: minutosParaHora(fim) });
    }
    return slots;
  }

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

  /* ---------- Passo 1: Pacote ---------- */
  function pacoteAtual() {
    var opt = pacoteSelect.options[pacoteSelect.selectedIndex];
    if (!opt || !opt.value) return null;
    return {
      valor: opt.value,
      nome: opt.textContent.split(' — ')[0],
      preco: parseFloat(opt.getAttribute('data-preco')) || 0,
      min: parseInt(opt.getAttribute('data-min'), 10) || 1,
      max: opt.getAttribute('data-max') ? parseInt(opt.getAttribute('data-max'), 10) : null,
      fixo: parseFloat(opt.getAttribute('data-fixo')) || 0,
      duracaoMin: parseInt(opt.getAttribute('data-duracao'), 10) || 0
    };
  }

  // Repõe o campo de horas ao estado "escolhe primeiro pacote e data"
  function resetHorasSelect(texto) {
    horasSelect.innerHTML = '<option value="" disabled selected>' + texto + '</option>';
    horasSelect.disabled = true;
    horasHint.textContent = '';
  }

  // Recalcula os horários disponíveis sempre que o pacote OU a data mudam,
  // porque ambos entram na conta (duração do pacote + janela de abertura do dia).
  function atualizarHorariosDisponiveis() {
    var pacote = pacoteAtual();

    if (!pacote) {
      resetHorasSelect('Escolhe primeiro o pacote e a data');
      return;
    }
    if (!dataInput.value) {
      resetHorasSelect('Escolhe a data da festa');
      return;
    }

    var dow = diaDaSemana(dataInput.value);
    var regra = REGRAS_DIA[dow];

    if (!regra.aberto) {
      resetHorasSelect('O parque está encerrado neste dia');
      horasHint.textContent = 'Segundas e terças-feiras o Lumia Park está encerrado. Escolhe outra data.';
      return;
    }

    var slots = gerarHorariosDisponiveis(dow, pacote.duracaoMin);

    if (slots.length === 0) {
      resetHorasSelect('Sem horários disponíveis nesta data');
      horasHint.textContent = 'A duração do pacote ' + pacote.nome + ' não cabe no horário de funcionamento deste dia.';
      return;
    }

    horasSelect.innerHTML = '<option value="" disabled selected>Escolhe o horário</option>' +
      slots.map(function (s) {
        var valor = s.inicio + ' - ' + s.fim;
        return '<option value="' + valor + '">' + valor.replace(' - ', ' — ') + '</option>';
      }).join('');
    horasSelect.disabled = false;

    var horasTexto = (pacote.duracaoMin % 60 === 0)
      ? (pacote.duracaoMin / 60) + 'h00'
      : Math.floor(pacote.duracaoMin / 60) + 'h' + (pacote.duracaoMin % 60);
    var janelaTexto = regra.abre + '–' + regra.fecha;
    horasHint.textContent = 'Duração do pacote: ' + horasTexto + ' · Parque aberto ' + janelaTexto + ' (almoço ' + ALMOCO_INICIO + '–' + ALMOCO_FIM + ' indisponível).';
  }

  pacoteSelect.addEventListener('change', function () {
    var pacote = pacoteAtual();
    if (!pacote) return;

    // Desbloqueia o campo de data assim que há um pacote escolhido
    dataInput.disabled = false;
    dataInput.setAttribute('placeholder', '');

    // Nº de crianças
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

    // Mostrar/exigir a Atividade Extra apenas no pacote Lumia Moon
    var ehMoon = pacote.valor === 'moon';
    atividadeWrap.classList.toggle('lp-nl-step-hidden', !ehMoon);
    atividadeSelect.required = ehMoon;
    if (!ehMoon) atividadeSelect.value = '';

    pacoteHint.textContent = '';

    // A data pode já ter sido escolhida antes de trocar de pacote — recalcula horários
    atualizarHorariosDisponiveis();
  });

  dataInput.addEventListener('change', function () {
    atualizarHorariosDisponiveis();
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
    var dow = diaDaSemana(dataInput.value);
    if (!REGRAS_DIA[dow].aberto) {
      msg1.textContent = 'O parque está encerrado às segundas e terças-feiras. Escolhe outra data.';
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

    var pacote = pacoteAtual();

    // Atividade extra é obrigatória apenas quando o pacote é o Lumia Moon
    if (pacote && pacote.valor === 'moon' && !atividadeSelect.value) {
      msg2.textContent = 'Escolhe a atividade extra do pacote Lumia Moon (Karaokê ou Realidade Virtual).';
      msg2.classList.add('lp-nl-error');
      atividadeSelect.focus();
      return;
    }

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

  function nomeAtividade(valor) {
    if (valor === 'karaoke') return 'Karaokê';
    if (valor === 'realidade_virtual') return 'Realidade Virtual';
    return '—';
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
    var ehMoon = pacote && pacote.valor === 'moon';

    var linhas = [
      { label: 'Pacote', value: pacote ? pacote.nome : '—' },
      { label: 'Data da Festa', value: formatDataPT(dataInput.value) },
      { label: 'Horas da Festa', value: horasSelect.value || '—' },
      { label: 'Nº de Crianças', value: numCriancas }
    ];

    if (ehMoon) {
      linhas.push({ label: 'Atividade Extra', value: nomeAtividade(atividadeSelect.value) });
    }

    linhas.push(
      { label: 'Aniversariante', value: document.getElementById('lp-rv-aniv-nome').value.trim() + ' (' + document.getElementById('lp-rv-aniv-idade').value + ' anos)' },
      { label: 'Responsável', value: document.getElementById('lp-rv-resp-nome').value.trim() },
      { label: 'Contacto', value: document.getElementById('lp-rv-telefone').value.trim() + ' · ' + document.getElementById('lp-rv-email').value.trim() }
    );

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
    var ehMoon = pacote && pacote.valor === 'moon';

    var payload = {
      pacote: pacote ? pacote.valor : '',
      pacote_nome: pacote ? pacote.nome : '',
      data_festa: dataInput.value,
      horas_festa: horasSelect.value,
      numero_criancas: parseInt(criancasInput.value, 10) || 0,
      valor_estimado: calcularValor(),
      atividade_extra: ehMoon ? atividadeSelect.value : '',
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
          dataInput.disabled = true;
          resetHorasSelect('Escolhe primeiro o pacote e a data');
          atividadeWrap.classList.add('lp-nl-step-hidden');
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
