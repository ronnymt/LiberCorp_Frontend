import { login } from '../lib/auth.js';
import { showToast } from '../v4/toast.js';

const form = document.getElementById('login-form');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = form.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    try {
      await login(email, password);
      window.location.href = 'index.html';
    } catch (err) {
      // El backend informa intentos restantes / minutos de bloqueo (ver AuthService) --
      // mostrar ese mensaje puntual, no uno generico que lo tape.
      showToast(err.message || 'Correo o contrasena incorrectos', { variant: 'error' });
      submitBtn.disabled = false;
    }
  });
}

const togglePwdBtn = document.getElementById('toggle-pwd');
if (togglePwdBtn) {
  togglePwdBtn.addEventListener('click', () => {
    const input = document.getElementById('password');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
}

/**
 * Fondo animado de topologia de red en el login -- puramente decorativo (no
 * representa datos reales de la red). Toma los colores de --primary/--indigo
 * de _tokens.scss en vez de valores fijos, para no desincronizarse si el
 * primary vuelve a cambiar. Vive en este modulo (no inline en login.html)
 * porque el CSP del proyecto (ver vite.config.js) no permite <script> inline
 * fuera del hash del pre-paint de tema.
 */
const canvas = document.getElementById('topology');
if (canvas) {
  // Arranca despues del primer pintado -- initNodes() hace un chequeo O(n^2)
  // de distancias entre nodos que competia con el FCP/LCP del formulario de
  // login (hallazgo de auditoria Lighthouse: esta era la pagina mas simple
  // de las 4 evaluadas y aun asi tenia el FCP mas lento). safari no tiene
  // requestIdleCallback, ahi cae al setTimeout.
  const iniciarCuandoLibre = window.requestIdleCallback ? window.requestIdleCallback.bind(window) : (cb) => setTimeout(cb, 1);
  iniciarCuandoLibre(iniciarFondoAnimado);
}

function iniciarFondoAnimado() {
  const canvas = document.getElementById('topology');
  const ctx = canvas.getContext('2d');
  const styles = getComputedStyle(document.documentElement);

  const hexToRgb = (hex) => {
    const limpio = hex.trim().replace('#', '');
    const n = parseInt(limpio.length === 3 ? limpio.split('').map((c) => c + c).join('') : limpio, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [tr, tg, tb] = hexToRgb(styles.getPropertyValue('--primary') || '#1ABB9C');
  const [ir, ig, ib] = hexToRgb(styles.getPropertyValue('--indigo') || '#4263eb');

  let W;
  let H;
  let nodes = [];
  let edges = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function initNodes() {
    const count = Math.max(18, Math.floor((W * H) / 90000));
    nodes = [];
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: Math.random() * 1.4 + 1.1
      });
    }
    edges = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 230 && Math.random() > 0.72) {
          edges.push({ a: i, b: j, pulse: Math.random(), speed: 0.002 + Math.random() * 0.003 });
        }
      }
    }
  }
  initNodes();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function draw() {
    ctx.clearRect(0, 0, W, H);

    edges.forEach((e) => {
      const a = nodes[e.a];
      const b = nodes[e.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 260) {return;}

      const alpha = Math.max(0, 1 - dist / 260) * 0.16;
      ctx.strokeStyle = `rgba(${ir},${ig},${ib},${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      if (!reduceMotion) {
        e.pulse += e.speed;
        if (e.pulse > 1) {e.pulse = 0;}
      }
      const px = a.x + dx * e.pulse;
      const py = a.y + dy * e.pulse;
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tr},${tg},${tb},${alpha * 3.2})`;
      ctx.fill();
    });

    nodes.forEach((n) => {
      if (!reduceMotion) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > W) {n.vx *= -1;}
        if (n.y < 0 || n.y > H) {n.vy *= -1;}
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();
}
