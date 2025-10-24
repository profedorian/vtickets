/*v0.5*/
/* ===== Helpers UI ===== */
const $ = (s, r=document)=>r.querySelector(s);
function setLoading(btn, on=true){
  if(!btn) return;
  btn.disabled = !!on;
  btn.classList.toggle('is-loading', !!on);
  if(on) btn.setAttribute('aria-busy','true'); else btn.removeAttribute('aria-busy');
}

/* ===== Config ===== */
const BASE = 'https://script.google.com/macros/s/AKfycbxEuW5orH9hSyljDjjRQdgazNqZ5zcfmAklwCWP5jmQ_thBDLoAACezdpYzwj3vChlkqg/exec';
const qs = o => new URLSearchParams(o);              /* ← una sola vez */
const getToken = () => localStorage.getItem('vk_token') || '';
const setToken = t => localStorage.setItem('vk_token', t);
const clearToken = () => localStorage.removeItem('vk_token');
// === Rol simple en localStorage ===
const setIsAdmin = v => localStorage.setItem('vk_is_admin', v ? '1' : '0');
const getIsAdmin = () => localStorage.getItem('vk_is_admin') === '1';

async function withTimeout(executor, ms=15000){
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(), ms);
  try{ const res = await executor(ac.signal); clearTimeout(t); return res; }
  catch(e){ clearTimeout(t); throw e; }
}

/* ===== API sin preflight ===== */
async function apiGet(path, params={}){
  const url = new URL(BASE);
  url.search = qs({ path, token:getToken(), ...params }).toString();
  return withTimeout(async (signal)=>{
	const res = await fetch(url.toString(), { method:'GET', mode:'cors', cache:'no-store', signal });
	const j = await res.json().catch(()=> ({}));
	if(!j.ok) throw Object.assign(new Error(j.message||'Error API'), { code:j.code||'API_ERROR', raw:j });
	return j;
  });
}

async function apiPost(path, data={}){
  // Incluye token automáticamente en TODOS los POST excepto login
  const payload = (path === 'login') ? data : { token:getToken(), ...data };
  const res = await fetch(`${BASE}?path=${encodeURIComponent(path)}`, {
	method:'POST',
	headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
	body: qs(payload),
	cache:'no-store'
  });
  const j = await res.json().catch(()=> ({}));
  if(!j.ok) throw Object.assign(new Error(j.message||'Error API'), { code:j.code||'API_ERROR', raw:j });
  return j;
}

/* ===== App logic ===== */
const loginView = $('#loginView');
const appView   = $('#appView');
const adminView = $('#adminView');
const loginBtn  = $('#loginBtn');
//const scanBtn   = $('#scanBtn');
const logoutBtn = $('#logoutBtn');
const logoutBtnAdmin = $('#logoutBtnAdmin');
const animaBackground = $('#anima-bg');

function showView(viewName){
  console.log("Comprobando vista: " + viewName);
  //ocultar el fondo animado
  animaBackground.classList.add('hidden');
  
  loginView.classList.add('hidden');
  appView.classList.add('hidden');
  adminView.classList.add('hidden');
  
  if(viewName === 'login') {
	  loginView.classList.remove('hidden');
	  //volver a mostrar el fondo animado
	  animaBackground.classList.remove('hidden');
  }
  else if(viewName === 'admin') 
	  adminView.classList.remove('hidden');
  else appView.classList.remove('hidden'); // 'scan'
}

function showLogin(){
  showView('login');
  $('#loginMsg').textContent = '';
  $('#statusMsg') && ($('#statusMsg').textContent = 'Listo');
}

async function ping(){
  const el = $('#pingMsg');
  if(!el) return;
  el.textContent = 'Comprobando servicio…';
  try{ const j = await apiGet('ping'); el.textContent = `Servicio: ${j.service || 'ok'}`; }
  catch{ el.textContent = 'Servicio no disponible'; }
}

async function fetchStats(){
  const stTotal = $('#st_total'), stUsed = $('#st_used'), stPending = $('#st_pending');
  $('#statusMsg').textContent = 'Cargando estadísticas…';
  try{
	const j = await apiGet('stats');
	const d = j.data || {};
	stTotal.textContent = d.tickets_total ?? '—';
	stUsed.textContent = d.tickets_used ?? '—';
	stPending.textContent = d.tickets_pending ?? '—';
	$('#statusMsg').textContent = 'Listo';
  }
  catch(e){
	if(e.code==='UNAUTHORIZED' || e.message==='NO_TOKEN'){
	  $('#statusMsg').textContent = 'Sesión expirada. Vuelve a iniciar sesión.';
	  clearToken(); showLogin();
	}else{
	  $('#statusMsg').textContent = 'No se pudieron cargar las estadísticas.';
	}
  }
}

async function doLogin(){
  const msg = $('#loginMsg');
  const u = $('#u').value.trim(), p = $('#p').value;
  if(!u || !p){ msg.textContent = 'Completa usuario y contraseña'; return; }
  setLoading(loginBtn, true); msg.textContent = 'Validando…';
  try{
	const j = await apiPost('login', { username:u, password:p });
	setToken(j.token);
	setIsAdmin(!!j.is_admin);
	msg.textContent = '';
	showView(getIsAdmin() ? 'admin' : 'scan');
	await ping();
	await fetchStats();
  }catch(e){
	msg.textContent = (e.raw?.message==='NO_TOKEN') ? 'Falta autorización (flujo de token).' : (e.message||'Usuario o contraseña incorrectos');
  }finally{
	setLoading(loginBtn, false);
  }
}

async function scanTicket(){
  const msg = $('#scanMsg');
  const serial = $('#scanInput').value.trim();
  if(!serial){ msg.textContent = 'Captura un serial'; return; }
  //setLoading(scanBtn, true); msg.textContent = 'Validando ticket…';
  try{
	const j = await apiPost('scan', { serial }); // ahora incluye token
	const r = j.result || {};
	msg.classList.toggle('msg--good', !!r.valid);
	msg.classList.toggle('msg--bad', !r.valid);
	msg.textContent = r.valid ? `Ticket válido. Producto: ${r.product || '-'}` : `Ticket inválido${r.reason ? `: ${r.reason}` : ''}`;
	await fetchStats();
  }catch(e){
	if(e.code==='UNAUTHORIZED' || e.message==='NO_TOKEN'){
	  msg.textContent = 'Sesión expirada. Inicia sesión nuevamente.';
	  clearToken(); showLogin();
	}else{
	  msg.textContent = e.message || 'Error al escanear';
	}
  }finally{
	//setLoading(scanBtn, false);
  }
}

function doLogout(){
  clearToken();
  setIsAdmin(false);
  showLogin();
}

/* ===== Wire-up ===== */
loginBtn.addEventListener('click', doLogin);
$('#u').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
$('#p').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
//scanBtn.addEventListener('click', scanTicket);
//$('#scanInput').addEventListener('keydown', e=>{ if(e.key==='Enter') scanTicket(); });
logoutBtn.addEventListener('click', doLogout);
logoutBtnAdmin.addEventListener('click', doLogout);

/* ===== Arranque ===== */
function hideSplash(){ const s = document.getElementById('splash'); if(s) s.classList.add('is-hidden'); }

// 1) Oculta por tiempo (por si no hay red)
setTimeout(hideSplash, 1200);

// 2) Cuando arranca tu app (boot), ocúltalo después de ping()
async function bootGreen(){
  if(getToken()){
	let viewName = getIsAdmin() ? 'admin' : 'scan';
	console.log("Comprobando vista: " + viewName);
	showView(viewName);
	await ping();
	hideSplash();
	await fetchStats();
  }else{
    hideSplash();
    showView('login');
  }
}

// reemplaza tu IIFE de arranque por:
bootGreen();

// Toggle de "ojo" centralizado (sin JS inline)
(() => {
  document.querySelectorAll('.field__password').forEach(wrap => {
    const input = wrap.querySelector('.field__input[type="password"], .field__input[type="text"]');
    const btn   = wrap.querySelector('.field__toggle');
    if(!input || !btn) return;

    const syncUI = () => {
      const showing = input.type === 'text';
      btn.setAttribute('aria-pressed', String(showing));
      btn.title = showing ? 'Ocultar contraseña' : 'Mostrar contraseña';
      btn.ariaLabel = btn.title;
      btn.textContent = showing ? '🙈' : '🐵';
    };

    // estado inicial
    syncUI();

    btn.addEventListener('click', () => {
      input.type = (input.type === 'password') ? 'text' : 'password';
      syncUI();
      // mantener foco y cursor al final
      input.focus({ preventScroll: true });
      const v = input.value; input.value = ''; input.value = v;
    });

    // por si otro script cambia el tipo
    const obs = new MutationObserver(syncUI);
    obs.observe(input, { attributes: true, attributeFilter: ['type'] });
  });
})();


//======== eventos 
// Simulación inicial (después se llenará desde App Script)
const events = [
  { event: 'KERMES2025_28OCT', date_event: '2025-10-28', total_tickets: 50, tickets_changes: 15, status: 'CERRADO' },
  { event: 'KERMES2025_29NOV', date_event: '2025-11-29', total_tickets: 20, tickets_changes: 0, status: 'PENDIENTE' },
];

function renderEvents() {
  const body = document.getElementById('eventsBody');
  body.innerHTML = events.map(e => {
    const now = new Date();
    const eventDate = new Date(e.date_event);
    const diffDays = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));

    const canOpen = diffDays <= 1 && diffDays >= 0;
    const canClose = diffDays < 0 && e.status === 'ABIERTO';

    return `
      <tr>
        <td>${e.event}</td>
        <td>${e.date_event}</td>
        <td>${e.total_tickets}</td>
        <td>${e.tickets_changes}</td>
        <td>${e.status}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="showTickets('${e.event}')">Tickets</button>
          <button class="btn btn-sm btn-warning" ${!canOpen && !canClose ? 'disabled' : ''} 
            onclick="toggleEvent('${e.event}')">
            ${e.status === 'ABIERTO' ? 'Cerrar' : 'Abrir'}
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteEvent('${e.event}')">Borrar</button>
        </td>
      </tr>`;
  }).join('');
}

function showTickets(eventName) {
  document.getElementById('ticketsTitle').textContent = `Tickets del evento: ${eventName}`;
  document.getElementById('ticketsPanel').classList.remove('hidden');
  document.getElementById('tblEvents').parentElement.classList.add('hidden');
}

function toggleEvent(eventName) {
  alert(`Abrir/Cerrar evento: ${eventName}`);
}

function deleteEvent(eventName) {
  const choice = confirm(`¿Deseas borrar solo los tickets o el evento completo?\n\nAceptar = Tickets\nCancelar = Evento completo`);
  alert(choice ? `Borrando tickets de ${eventName}` : `Borrando evento ${eventName}`);
}

document.getElementById('btnBackEvents').onclick = () => {
  document.getElementById('ticketsPanel').classList.add('hidden');
  document.getElementById('tblEvents').parentElement.classList.remove('hidden');
};

renderEvents();

// --- generar tickets ---
/*const res = await fetch(GAS_URL + '?path=tickets.generate', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({
    event: 'KERMES2025_28OCT',
    product: 'GENERAL',
    count: 100,
    expiration_date: '2025-10-28'
  })
});
const data = await res.json();*/


// --- scan camera
const video = document.getElementById('video');
const btnStart = document.getElementById('btnStart');
const btnStop  = document.getElementById('btnStop');
const statusEl = document.getElementById('status');

let stream = null;
let rafId = null;
let running = false;
let detector = ('BarcodeDetector' in window) ? new BarcodeDetector({formats:['qr_code']}) : null;
let zxingReader = null;

async function startCamera(){
  if(running) return;
  statusEl.textContent = 'Solicitando cámara…';
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } , width: {ideal:1280}, height:{ideal:720} },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  running = true;
  btnStart.disabled = true;
  btnStop.disabled  = false;
  statusEl.textContent = detector ? 'Escaneando con detector nativo…' : 'Escaneando con ZXing…';
  loop();
}

function stopCamera(){
  running = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
  cancelAnimationFrame(rafId);
  if(stream){
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.srcObject = null;
  statusEl.textContent = 'Cámara detenida.';
}

async function loop(){
  if(!running) return;
  try{
    if(detector){
      const barcodes = await detector.detect(video);
      if(barcodes.length){
        const serial = barcodes[0].rawValue.trim();
        onScan(serial);
        return;
      }
    }else{
      // Fallback dinámico a ZXing
      if(!zxingReader){
        const { BrowserMultiFormatReader } = await import('https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/esm5/index.min.js');
        zxingReader = new BrowserMultiFormatReader();
        await zxingReader.decodeFromVideoDevice(null, video, (res, err) => {
          if(res && running){
            onScan(res.getText().trim());
          }
        });
      }
    }
  }catch(e){
    // ignorar errores transitorios
  }
  rafId = requestAnimationFrame(loop);
}

async function onScan(serial){
  stopCamera();
  statusEl.textContent = `QR detectado: ${serial}. Validando…`;

  try{
    const url = GAS_URL + `?path=validate&serial=${encodeURIComponent(serial)}`;
    const r = await fetch(url, {headers:{'Content-Type':'application/json'}});
    const data = await r.json();
    if(data.ok){
      statusEl.textContent = '✅ Ticket válido';
    }else{
      statusEl.textContent = `❌ Inválido: ${data.code || data.error || 'unknown'}`;
    }
  }catch(err){
    statusEl.textContent = '⚠️ Error al validar';
  }
}

btnStart.onclick = startCamera;
btnStop.onclick  = stopCamera;





