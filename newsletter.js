/* ============================================================
   LumiaPark — Popup de Newsletter
   Mostra o popup 3s após o carregamento da página, controla os
   dois passos (pergunta sim/não -> formulário) e envia os dados
   para /subscribe.php.
   ============================================================ */
  (function () {
    var STORAGE_KEY = "lp_newsletter_dismissed"; // não mostra outra vez se já respondeu (sim, não, ou subscreveu)
    var SHOW_AFTER_MS = 3000; // aparece 3 segundos depois de carregar a página

    var overlay = document.getElementById("lp-newsletter-overlay");
    var closeBtn = document.getElementById("lp-nl-close");
    var stepAsk = document.getElementById("lp-nl-step-ask");
    var stepForm = document.getElementById("lp-nl-step-form");
    var yesBtn = document.getElementById("lp-nl-yes");
    var noBtn = document.getElementById("lp-nl-no");
    var backBtn = document.getElementById("lp-nl-back");
    var form = document.getElementById("lp-nl-form");
    var msg = document.getElementById("lp-nl-msg");
    var submitBtn = document.getElementById("lp-nl-submit");
    var consentCheckbox = document.getElementById("lp-nl-consent");

    function alreadyDismissed() {
      try {
        return localStorage.getItem(STORAGE_KEY) === "1";
      } catch (e) {
        return false;
      }
    }
    function markDismissed() {
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch (e) {}
    }

    function showPopup() {
      if (alreadyDismissed()) return;
      overlay.classList.add("lp-nl-visible");
    }
    function hidePopup() {
      overlay.classList.remove("lp-nl-visible");
    }

    if (!alreadyDismissed()) {
      setTimeout(showPopup, SHOW_AFTER_MS);
    }

    // Fechar (X) conta como "agora não" — não volta a incomodar
    closeBtn.addEventListener("click", function () {
      markDismissed();
      hidePopup();
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        markDismissed();
        hidePopup();
      }
    });

    // "Agora não" — fecha e não volta a mostrar
    noBtn.addEventListener("click", function () {
      markDismissed();
      hidePopup();
    });

    // "Sim, quero" — avança para o formulário
    yesBtn.addEventListener("click", function () {
      stepAsk.classList.add("lp-nl-step-hidden");
      stepForm.classList.remove("lp-nl-step-hidden");
    });

    // "Voltar" — regressa à pergunta inicial
    backBtn.addEventListener("click", function () {
      stepForm.classList.add("lp-nl-step-hidden");
      stepAsk.classList.remove("lp-nl-step-hidden");
      msg.textContent = "";
      msg.className = "lp-nl-msg";
    });

    // Valida o formato do email (ex: nome@gmail.com, nome@lumiapark.pt).
    // Confirma que existe "@", um domínio, e uma extensão (.com, .pt, etc).
    var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      msg.textContent = "";
      msg.className = "lp-nl-msg";

      var nome = document.getElementById("lp-nl-nome").value.trim();
      var email = document.getElementById("lp-nl-email").value.trim();

      if (!nome || !email) {
        msg.textContent = "Por favor preenche o nome e o email.";
        msg.classList.add("lp-nl-error");
        return;
      }

      if (!EMAIL_REGEX.test(email)) {
        msg.textContent = "Introduz um email válido (ex: nome@gmail.com).";
        msg.classList.add("lp-nl-error");
        return;
      }

      if (!consentCheckbox.checked) {
        msg.textContent = "Tens de aceitar o uso dos teus dados para poderes subscrever.";
        msg.classList.add("lp-nl-error");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "A enviar...";

      fetch("/subscribe.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome, email: email, consentimento: true, origem: "popup_landing" })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Confirmar subscrição";

          if (data.success) {
            msg.textContent = "Obrigado! A tua subscrição foi confirmada.";
            msg.classList.add("lp-nl-success");
            markDismissed();
            setTimeout(hidePopup, 1800);
          } else {
            msg.textContent = data.message || "Ocorreu um erro. Tenta novamente.";
            msg.classList.add("lp-nl-error");
          }
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = "Confirmar subscrição";
          msg.textContent = "Erro de ligação. Tenta novamente mais tarde.";
          msg.classList.add("lp-nl-error");
        });
    });
  })();
