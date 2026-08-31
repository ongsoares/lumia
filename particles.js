/* ============================================================
   LumiaPark — Fundo animado (partículas dos quatro elementos)
   Fogo, Terra, Água e Ar desenhados em <canvas id="bg">, com
   parallax suave ao mover o rato / tocar no ecrã.
   ============================================================ */
   (function(){
    'use strict';

    const canvas = document.getElementById('bg');
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0, H = 0, DPR = 1;

    function resize(){
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function debounce(fn, ms){
      let id;
      return function(){ clearTimeout(id); id = setTimeout(fn, ms); };
    }

    window.addEventListener('resize', debounce(resize, 150));
    resize();

    /* ---------- rato / toque: parallax suave ---------- */
    const mouse  = { x:0, y:0 };
    const target = { x:0, y:0 };
    let lastInput = Date.now() - 9999;

    function setTarget(nx, ny){
      target.x = nx; target.y = ny; lastInput = Date.now();
    }
    window.addEventListener('mousemove', function(e){
      setTarget((e.clientX / W - 0.5) * 2, (e.clientY / H - 0.5) * 2);
    }, { passive:true });
    window.addEventListener('touchmove', function(e){
      const t = e.touches[0];
      if (!t) return;
      setTarget((t.clientX / W - 0.5) * 2, (t.clientY / H - 0.5) * 2);
    }, { passive:true });

    /* ---------- sprite de brilho (evita criar gradientes a cada frame) ---------- */
    function makeGlowSprite(rgb, size){
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const cx = c.getContext('2d');
      const g = cx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      g.addColorStop(0, 'rgba(' + rgb + ',1)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      cx.fillStyle = g;
      cx.beginPath();
      cx.arc(size/2, size/2, size/2, 0, Math.PI*2);
      cx.fill();
      return c;
    }
    const fireSprite = makeGlowSprite('255,170,110', 64);

    function rand(a,b){ return a + Math.random() * (b - a); }
    function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

    /* ---------- contagens adaptadas ao dispositivo ---------- */
    const isSmall = window.innerWidth < 720;
    const counts = reduceMotion
      ? { fire:12, earth:20 }
      : isSmall ? { fire:24, earth:42 } : { fire:42, earth:86 };

    /* ---------- Fogo: partículas a subir ---------- */
    function makeFire(){
      return {
        x: rand(0, W), y: H + rand(0, 80),
        r: rand(0.8, 2.4), sp: rand(0.22, 0.6),
        ph: rand(0, Math.PI*2), depth: rand(0.3, 1)
      };
    }
    function resetFire(p){
      p.x = rand(0, W); p.y = H + rand(0, 80);
      p.r = rand(0.8, 2.4); p.sp = rand(0.22, 0.6); p.ph = rand(0, Math.PI*2);
    }
    const fires = Array.from({ length: counts.fire }, makeFire);

    /* ---------- Terra: motas lentas ---------- */
    function makeEarth(){
      return {
        x: rand(0, W), y: rand(0, H),
        r: rand(0.6, 1.7), vx: rand(-0.035, 0.035), vy: rand(-0.025, 0.045),
        depth: rand(0.2, 0.8), a: rand(0.14, 0.42)
      };
    }
    const earths = Array.from({ length: counts.earth }, makeEarth);

    /* ---------- Água: ondulações ---------- */
    function makeWave(i){
      return {
        amp: rand(10, 20), len: rand(220, 420),
        speed: rand(0.15, 0.3) * (i % 2 ? 1 : -1),
        phase: rand(0, Math.PI*2), yBase: H * rand(0.6, 0.82), depth: rand(0.15, 0.4)
      };
    }
    const waterWaves = Array.from({ length: isSmall ? 2 : 3 }, function(_,i){ return makeWave(i); });

    /* ---------- Ar: véus etéreos ---------- */
    function makeWisp(i){
      return {
        y: rand(H*0.08, H*0.48), speed: rand(0.12, 0.24) * (i % 2 ? 1 : -1),
        phase: rand(0, Math.PI*2), depth: rand(0.2, 0.5), len: rand(260, 420), amp: rand(14, 28)
      };
    }
    const airWisps = Array.from({ length: isSmall ? 2 : 4 }, function(_,i){ return makeWisp(i); });

    let t = 0;

    function drawFire(mx, my){
      for (let i = 0; i < fires.length; i++){
        const p = fires[i];
        p.y -= p.sp;
        p.x += Math.sin(t * 0.02 + p.ph) * 0.3;
        if (p.y < -20) resetFire(p);
        const dx = p.x + mx * p.depth * 16;
        const dy = p.y + my * p.depth * 8;
        const alpha = clamp(0.55 * (1 - (H - p.y) / H * 0.15), 0, 0.55);
        const size = p.r * 12;
        ctx.globalAlpha = alpha;
        ctx.drawImage(fireSprite, dx - size/2, dy - size/2, size, size);
      }
      ctx.globalAlpha = 1;
    }

    function drawEarth(mx, my){
      for (let i = 0; i < earths.length; i++){
        const p = earths[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        const dx = p.x + mx * p.depth * 22;
        const dy = p.y + my * p.depth * 14;
        ctx.fillStyle = 'rgba(176,138,99,' + p.a + ')';
        ctx.beginPath();
        ctx.arc(dx, dy, p.r, 0, Math.PI*2);
        ctx.fill();
      }
    }

    function drawWater(mx, my){
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(63,209,201,0.15)';
      for (let i = 0; i < waterWaves.length; i++){
        const w = waterWaves[i];
        w.phase += w.speed * 0.02;
        const dy = my * w.depth * 16;
        ctx.beginPath();
        for (let x = -40; x <= W + 40; x += 12){
          const y = w.yBase + dy + Math.sin(x / w.len * Math.PI*2 + w.phase) * w.amp;
          if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function drawAir(mx){
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(214,222,242,0.09)';
      for (let i = 0; i < airWisps.length; i++){
        const a = airWisps[i];
        a.phase += a.speed * 0.015;
        const dx = mx * a.depth * 20;
        ctx.beginPath();
        for (let x = -60; x <= W + 60; x += 14){
          const y = a.y + Math.sin(x / a.len * Math.PI*2 + a.phase) * a.amp;
          const xx = x + dx;
          if (x === -60) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
        }
        ctx.stroke();
      }
    }

    function frame(){
      if (document.hidden){ requestAnimationFrame(frame); return; }

      t += reduceMotion ? 0.12 : 0.6;
      mouse.x += (target.x - mouse.x) * 0.045;
      mouse.y += (target.y - mouse.y) * 0.045;

      let mx = mouse.x, my = mouse.y;
      if (Date.now() - lastInput > 4500 && !reduceMotion){
        mx += Math.sin(t * 0.004) * 0.22;
        my += Math.cos(t * 0.003) * 0.16;
      }

      ctx.clearRect(0, 0, W, H);
      drawWater(mx, my);
      drawAir(mx);
      drawEarth(mx, my);
      drawFire(mx, my);

      document.documentElement.style.setProperty('--mx', mx.toFixed(3));
      document.documentElement.style.setProperty('--my', my.toFixed(3));

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  })();

  /* ============================================================
   Contagem decrescente até à abertura do Lumia Park
   ============================================================ */
(function () {
  'use strict';

  var el = document.getElementById('lp-countdown');
  if (!el) return;

  var abertura = new Date(el.getAttribute('data-abertura'));
  var diasEl = document.getElementById('cd-dias');
  var horasEl = document.getElementById('cd-horas');
  var minEl = document.getElementById('cd-min');

  function atualizar() {
    var agora = new Date();
    var diff = abertura - agora;

    if (diff <= 0) {
      diasEl.textContent = '00';
      horasEl.textContent = '00';
      minEl.textContent = '00';
      return;
    }

    var dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    var horas = Math.floor((diff / (1000 * 60 * 60)) % 24);
    var minutos = Math.floor((diff / (1000 * 60)) % 60);

    diasEl.textContent = String(dias).padStart(2, '0');
    horasEl.textContent = String(horas).padStart(2, '0');
    minEl.textContent = String(minutos).padStart(2, '0');
  }

  atualizar();
  setInterval(atualizar, 60000); // atualiza a cada minuto
})();