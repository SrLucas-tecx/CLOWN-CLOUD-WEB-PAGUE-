/* ============================================================
   CLOWN CLOUD — app.js
   Arquitectura:
   - DB: un solo objeto de estado guardado en localStorage.
   - PAGES: registro de "renderers" por página. Para agregar una
     sección nueva solo hace falta: botón .nav-item + <section
     class="page-section"> en el HTML + una entrada aquí.
   - PRODUCT_TYPES: para agregar un tipo de producto nuevo (ej.
     "llavero" como categoría propia) solo se agrega aquí y su
     nav+section en el HTML; el tipo "otro" ya admite cualquier
     categoría libre (figuras, mangas, etc.) sin tocar el código.
   ============================================================ */

const STORAGE_KEY = 'clowncloud_db_v1';
const DARK_KEY = 'clowncloud_dark';

const BRAND_COLORS = [
  '#FB6204','#E988B3','#C34804','#A263CB','#F4B903','#ED5399',
  '#2B2B2B','#049459','#468AC9','#8E98DD','#3A200F','#5E3C19',
  '#EFD9C4','#BBB8BF','#918BB7','#000000'
];
const CHART_PALETTES = {
  verde:   ['#049459','#036f43','#8E98DD','#F4B903','#C34804','#918BB7'],
  lavanda: ['#8E98DD','#918BB7','#049459','#468AC9','#A263CB','#C34804'],
  rojizo:  ['#C34804','#ED5399','#F4B903','#049459','#8E98DD','#3A200F']
};

const PRODUCT_TYPES = {
  pin:     { label: 'Pines',    singular: 'Pin',     icon: '📌' },
  sticker: { label: 'Stickers', singular: 'Sticker', icon: '✂️' },
  otro:    { label: 'Otros productos', singular: 'Producto', icon: '🎁', freeCategory: true }
};

const ESTADOS = {
  inventario: 'En inventario',
  vendido:    'Vendido',
  agotado:    'Agotado'
};

/* ---------------- ESTADO ---------------- */
let DB = loadDB();
let currentPage = 'cotizador';
let currentQuote = { items: [], costs: [], clienteId: null };
let confirmCallback = null;
let npSelectedColor = BRAND_COLORS[0];
let pmSelectedColor = BRAND_COLORS[0];
let pmEditingId = null;
let bmEditingId = null;
let cmEditingId = null;
let gmEditingId = null;
let quickAddFromQuote = false;
let inventoryFilters = { pin: 'todos', sticker: 'todos', otro: 'todos' };
let otroCategoriaFilter = 'todas';

function defaultDB(){
  return {
    productos: [],      // {id, tipo, nombre, etiquetaId, categoriaLibre, color, cantidad, costoCompra, precioVenta, estado, fechaCompra, fechaVenta, bazarVentaId, ingresoExtra, notas}
    cotizaciones: [],    // {id, folio, clienteId, fecha, bazarId, items:[], costs:[], totalCosto, totalPrecio, ganancia}
    clientes: [],        // {id, nombre, telefono, notas}
    etiquetas: [
      { id: uid(), nombre: 'Colección Circo', color: '#049459' },
      { id: uid(), nombre: 'Kawaii',           color: '#8E98DD' }
    ],
    bazares: [],
    bazarActivoId: null,
    ajustes: { costoPin: 15, costoSticker: 8, empaque: 5, comision: 10, margen: 60 },
    graficas: [],
    recommendedChartStyles: {},
    folioCounter: 1
  };
}

function loadDB(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultDB();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultDB(), parsed);
  }catch(e){ return defaultDB(); }
}
function saveDB(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }
function uid(){ return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function money(n){ return '$' + (Number(n)||0).toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function toast(msg, type=''){
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast-item' + (type ? ' ' + type : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function askConfirm(text, cb){
  document.getElementById('confirm-text').textContent = text;
  confirmCallback = cb;
  openModal('confirm-modal');
}

/* ================= NAVEGACIÓN ================= */
const PAGE_TITLES = {
  cotizador: 'Cotizador rápido', cotizaciones: 'Cotizaciones guardadas', clientes: 'Clientes',
  nuevo: 'Producto nuevo (otros)', pin: 'Inventario de Pines', sticker: 'Inventario de Stickers',
  otro: 'Otros productos', etiquetas: 'Etiquetas y colores', bazares: 'Mis Bazares',
  estadisticas: 'Estadísticas', ajustes: 'Ajustes de costos'
};
const PAGE_RENDERERS = {
  cotizador: renderQuoteEditor,
  cotizaciones: renderCotizacionesGuardadas,
  clientes: renderClientes,
  nuevo: renderNuevoProducto,
  pin: () => renderInventoryGrid('pin'),
  sticker: () => renderInventoryGrid('sticker'),
  otro: renderOtroPage,
  etiquetas: renderEtiquetas,
  bazares: renderBazares,
  estadisticas: renderEstadisticas,
  ajustes: renderAjustes
};

function switchPage(page){
  currentPage = page;
  document.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page-section').forEach(s => s.classList.toggle('active', s.id === 'page-' + page));
  document.getElementById('header-title').textContent = PAGE_TITLES[page] || '';
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  if(PAGE_RENDERERS[page]) PAGE_RENDERERS[page]();
}

/* ================= SELECTS COMPARTIDOS ================= */
function fillBazarSelect(select, includeNone=true){
  select.innerHTML = (includeNone ? '<option value="">— Ninguno —</option>' : '') +
    DB.bazares.map(b => `<option value="${b.id}">${esc(b.nombre)}</option>`).join('');
}
function fillEtiquetaSelect(select){
  select.innerHTML = '<option value="">— Sin etiqueta —</option>' +
    DB.etiquetas.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
}
function fillClienteSelect(select){
  select.innerHTML = '<option value="">— Sin cliente —</option>' +
    DB.clientes.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
}
function fillCategoriaDatalist(datalist){
  const cats = [...new Set(DB.productos.filter(p=>p.tipo==='otro' && p.categoriaLibre).map(p=>p.categoriaLibre))];
  datalist.innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
}
function refreshHeaderBazarSelect(){
  const sel = document.getElementById('bazar-activo-select');
  fillBazarSelect(sel, false);
  if(!sel.options.length){ sel.innerHTML = '<option value="">Sin bazares</option>'; }
  sel.value = DB.bazarActivoId || (DB.bazares[0] && DB.bazares[0].id) || '';
  DB.bazarActivoId = sel.value || null;
}

/* ================= COLOR PICKER ================= */
function renderColorPicker(container, selectedColor, onPick){
  container.innerHTML = BRAND_COLORS.map(c =>
    `<span class="color-swatch-opt${c===selectedColor?' active':''}" data-color="${c}" style="background:${c}"></span>`
  ).join('');
  container.querySelectorAll('.color-swatch-opt').forEach(el => {
    el.onclick = () => {
      container.querySelectorAll('.color-swatch-opt').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      onPick(el.dataset.color);
    };
  });
}

/* ================================================================
   COTIZADOR (con clientes, estilo factura)
   ================================================================ */
function renderQuoteEditor(){
  document.getElementById('q-fecha').value = document.getElementById('q-fecha').value || todayStr();
  document.getElementById('q-folio').textContent = '#' + String(DB.folioCounter).padStart(4,'0');
  fillBazarSelect(document.getElementById('q-bazar'));
  fillClienteSelect(document.getElementById('q-cliente'));
  document.getElementById('q-cliente').value = currentQuote.clienteId || '';
  renderQuoteItems();
  renderQuoteCosts();
  updateQuoteSummary();
}
function renderQuoteItems(){
  const body = document.getElementById('q-items-body');
  if(!currentQuote.items.length){
    body.innerHTML = `<tr><td colspan="7" class="empty-hint">Sin productos aún — agrega el primero abajo.</td></tr>`;
    return;
  }
  body.innerHTML = currentQuote.items.map((it, i) => `
    <tr>
      <td>
        <select onchange="updateQuoteItem(${i},'tipo',this.value)">
          <option value="pin" ${it.tipo==='pin'?'selected':''}>📌 Pin</option>
          <option value="sticker" ${it.tipo==='sticker'?'selected':''}>✂️ Sticker</option>
          <option value="otro" ${it.tipo==='otro'?'selected':''}>🎁 Otro</option>
        </select>
      </td>
      <td><input type="text" value="${esc(it.desc)}" onchange="updateQuoteItem(${i},'desc',this.value)" placeholder="Descripción"></td>
      <td><input type="number" min="1" value="${it.cant}" onchange="updateQuoteItem(${i},'cant',this.value)"></td>
      <td><input type="number" min="0" step="0.01" value="${it.costo}" onchange="updateQuoteItem(${i},'costo',this.value)"></td>
      <td><input type="number" min="0" step="0.01" value="${it.precio}" onchange="updateQuoteItem(${i},'precio',this.value)"></td>
      <td class="readonly-cell">${money(it.cant*it.precio)}</td>
      <td><button class="remove-row" onclick="removeQuoteItem(${i})">✕</button></td>
    </tr>
  `).join('');
}
function renderQuoteCosts(){
  const body = document.getElementById('q-costs-body');
  if(!currentQuote.costs.length){
    body.innerHTML = `<tr><td colspan="3" class="empty-hint">Sin costos extra.</td></tr>`;
    return;
  }
  body.innerHTML = currentQuote.costs.map((c, i) => `
    <tr>
      <td><input type="text" value="${esc(c.concepto)}" onchange="updateQuoteCost(${i},'concepto',this.value)" placeholder="Ej. Empaque"></td>
      <td><input type="number" min="0" step="0.01" value="${c.monto}" onchange="updateQuoteCost(${i},'monto',this.value)"></td>
      <td><button class="remove-row" onclick="removeQuoteCost(${i})">✕</button></td>
    </tr>
  `).join('');
}
function updateQuoteItem(i, field, val){
  currentQuote.items[i][field] = (field==='cant'||field==='costo'||field==='precio') ? Number(val)||0 : val;
  renderQuoteItems(); updateQuoteSummary();
}
function removeQuoteItem(i){ currentQuote.items.splice(i,1); renderQuoteItems(); updateQuoteSummary(); }
function updateQuoteCost(i, field, val){
  currentQuote.costs[i][field] = field==='monto' ? Number(val)||0 : val;
  updateQuoteSummary();
}
function removeQuoteCost(i){ currentQuote.costs.splice(i,1); renderQuoteCosts(); updateQuoteSummary(); }
function updateQuoteSummary(){
  const costoItems = currentQuote.items.reduce((s,it)=>s+it.cant*it.costo,0);
  const precioItems = currentQuote.items.reduce((s,it)=>s+it.cant*it.precio,0);
  const costoExtra = currentQuote.costs.reduce((s,c)=>s+c.monto,0);
  const totalCosto = costoItems + costoExtra;
  const totalPrecio = precioItems + costoExtra;
  const ganancia = totalPrecio - totalCosto;
  document.getElementById('q-sum-costo').textContent = money(totalCosto);
  document.getElementById('q-sum-precio').textContent = money(totalPrecio);
  document.getElementById('q-sum-ganancia').textContent = money(ganancia);
}

function resetQuote(){
  currentQuote = { items: [], costs: [], clienteId: null };
  document.getElementById('q-fecha').value = todayStr();
  renderQuoteEditor();
}

function saveQuote(){
  if(!currentQuote.items.length){ toast('Agrega al menos un producto', 'error'); return; }
  const costoItems = currentQuote.items.reduce((s,it)=>s+it.cant*it.costo,0);
  const precioItems = currentQuote.items.reduce((s,it)=>s+it.cant*it.precio,0);
  const costoExtra = currentQuote.costs.reduce((s,c)=>s+c.monto,0);
  const totalCosto = costoItems + costoExtra;
  const totalPrecio = precioItems + costoExtra;
  DB.cotizaciones.unshift({
    id: uid(),
    folio: String(DB.folioCounter).padStart(4,'0'),
    clienteId: document.getElementById('q-cliente').value || null,
    fecha: document.getElementById('q-fecha').value || todayStr(),
    bazarId: document.getElementById('q-bazar').value || null,
    items: JSON.parse(JSON.stringify(currentQuote.items)),
    costs: JSON.parse(JSON.stringify(currentQuote.costs)),
    totalCosto, totalPrecio, ganancia: totalPrecio - totalCosto
  });
  DB.folioCounter++;
  saveDB();
  toast('Cotización guardada ✅', 'success');
  resetQuote();
}

function exportQuotePDF(){
  const el = document.createElement('div');
  el.style.cssText = 'padding:24px;font-family:sans-serif;color:#2B2B2B;';
  const clienteId = document.getElementById('q-cliente').value;
  const cliente = DB.clientes.find(c=>c.id===clienteId);
  const fecha = document.getElementById('q-fecha').value || todayStr();
  const folio = document.getElementById('q-folio').textContent;
  el.innerHTML = `
    <h1 style="color:#049459;">CLOWN CLOUD</h1>
    <h3>Cotización ${folio} ${cliente ? '— '+esc(cliente.nombre) : ''}</h3>
    <p>Fecha: ${fecha}${cliente && cliente.telefono ? ' · Tel: '+esc(cliente.telefono) : ''}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">
      <thead><tr style="background:#eee;"><th style="text-align:left;padding:6px;">Producto</th><th style="padding:6px;">Cant.</th><th style="padding:6px;">Precio</th><th style="padding:6px;">Subtotal</th></tr></thead>
      <tbody>${currentQuote.items.map(it=>`<tr><td style="padding:6px;border-bottom:1px solid #ddd;">${esc(it.desc||PRODUCT_TYPES[it.tipo].singular)}</td><td style="padding:6px;text-align:center;border-bottom:1px solid #ddd;">${it.cant}</td><td style="padding:6px;text-align:right;border-bottom:1px solid #ddd;">${money(it.precio)}</td><td style="padding:6px;text-align:right;border-bottom:1px solid #ddd;">${money(it.cant*it.precio)}</td></tr>`).join('')}</tbody>
    </table>
    ${currentQuote.costs.length ? `<h4 style="margin-top:12px;">Costos extra</h4><ul>${currentQuote.costs.map(c=>`<li>${esc(c.concepto)}: ${money(c.monto)}</li>`).join('')}</ul>` : ''}
    <h3 style="margin-top:16px;">Total a cobrar: ${document.getElementById('q-sum-precio').textContent}</h3>
  `;
  html2pdf().set({filename:`cotizacion-${folio}.pdf`, margin:10}).from(el).save();
}

function renderCotizacionesGuardadas(){
  const wrap = document.getElementById('cotizaciones-list');
  if(!DB.cotizaciones.length){
    wrap.innerHTML = `<div class="empty-hint">Aún no guardas ninguna cotización.</div>`;
    return;
  }
  wrap.innerHTML = DB.cotizaciones.map(q => {
    const cliente = DB.clientes.find(c=>c.id===q.clienteId);
    return `
    <div class="card">
      <div class="card-top">
        <span class="card-title">${cliente ? esc(cliente.nombre) : 'Sin cliente'} <span style="color:var(--color-text-muted);font-weight:600;">#${q.folio||''}</span></span>
        <span class="card-badge badge-inventario">${money(q.ganancia)}</span>
      </div>
      <div class="card-meta"><span>📅 ${q.fecha}</span><span>🧾 ${q.items.length} producto(s)</span></div>
      <div class="card-row"><span>Costo total</span><span>${money(q.totalCosto)}</span></div>
      <div class="card-row"><span>Total a cobrar</span><span>${money(q.totalPrecio)}</span></div>
      <div class="card-actions">
        <button onclick="reopenQuote('${q.id}')">↩️ Reabrir</button>
        <button class="danger" onclick="deleteQuote('${q.id}')">🗑️ Eliminar</button>
      </div>
    </div>`;
  }).join('');
}
function reopenQuote(id){
  const q = DB.cotizaciones.find(x=>x.id===id);
  if(!q) return;
  currentQuote = { items: JSON.parse(JSON.stringify(q.items)), costs: JSON.parse(JSON.stringify(q.costs)), clienteId: q.clienteId };
  switchPage('cotizador');
  document.getElementById('q-fecha').value = q.fecha;
  renderQuoteEditor();
  document.getElementById('q-bazar').value = q.bazarId || '';
  toast('Cotización cargada en el editor');
}
function deleteQuote(id){
  askConfirm('¿Eliminar esta cotización guardada?', () => {
    DB.cotizaciones = DB.cotizaciones.filter(x=>x.id!==id);
    saveDB(); renderCotizacionesGuardadas(); toast('Cotización eliminada');
  });
}

/* ================================================================
   CLIENTES
   ================================================================ */
function renderClientes(){
  const body = document.getElementById('clientes-body');
  if(!DB.clientes.length){
    body.innerHTML = `<tr><td colspan="4" class="empty-hint">Aún no registras clientes.</td></tr>`;
    return;
  }
  body.innerHTML = DB.clientes.map(c => {
    const nCot = DB.cotizaciones.filter(q=>q.clienteId===c.id).length;
    return `
    <tr>
      <td class="name-cell">👤 ${esc(c.nombre)}</td>
      <td>${esc(c.telefono||'—')}</td>
      <td>${nCot}</td>
      <td>
        <div class="row-actions">
          <button onclick="openClienteModal('${c.id}')">✏️</button>
          <button class="danger" onclick="deleteCliente('${c.id}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}
function openClienteModal(id, fromQuote){
  cmEditingId = id || null;
  quickAddFromQuote = !!fromQuote;
  const c = id ? DB.clientes.find(x=>x.id===id) : {nombre:'',telefono:'',notas:''};
  document.getElementById('cm-title').textContent = id ? 'Editar cliente' : 'Nuevo cliente';
  document.getElementById('cm-nombre').value = c.nombre;
  document.getElementById('cm-telefono').value = c.telefono || '';
  document.getElementById('cm-notas').value = c.notas || '';
  document.getElementById('cm-delete-btn').style.display = id ? 'inline-block' : 'none';
  openModal('cliente-modal');
}
function saveClienteModal(){
  const nombre = document.getElementById('cm-nombre').value.trim();
  if(!nombre){ toast('Ponle un nombre al cliente', 'error'); return; }
  const data = { nombre, telefono: document.getElementById('cm-telefono').value.trim(), notas: document.getElementById('cm-notas').value.trim() };
  let newId = cmEditingId;
  if(cmEditingId){
    const idx = DB.clientes.findIndex(x=>x.id===cmEditingId);
    DB.clientes[idx] = Object.assign({id:cmEditingId}, data);
  } else {
    newId = uid();
    DB.clientes.push(Object.assign({id:newId}, data));
  }
  saveDB();
  closeModal('cliente-modal');
  toast('Cliente guardado ✅', 'success');
  if(quickAddFromQuote){
    fillClienteSelect(document.getElementById('q-cliente'));
    document.getElementById('q-cliente').value = newId;
    quickAddFromQuote = false;
  }
  if(currentPage==='clientes') renderClientes();
}
function deleteClienteModal(){
  if(!cmEditingId) return;
  askConfirm('¿Eliminar este cliente? Sus cotizaciones guardadas se conservan sin cliente asignado.', () => {
    DB.clientes = DB.clientes.filter(x=>x.id!==cmEditingId);
    DB.cotizaciones.forEach(q => { if(q.clienteId===cmEditingId) q.clienteId = null; });
    saveDB(); closeModal('cliente-modal'); renderClientes(); toast('Cliente eliminado');
  });
}
function deleteCliente(id){
  askConfirm('¿Eliminar este cliente? Sus cotizaciones guardadas se conservan sin cliente asignado.', () => {
    DB.clientes = DB.clientes.filter(x=>x.id!==id);
    DB.cotizaciones.forEach(q => { if(q.clienteId===id) q.clienteId = null; });
    saveDB(); renderClientes(); toast('Cliente eliminado');
  });
}

/* ================================================================
   PRODUCTO NUEVO (fuera de pines y stickers: figuras, mangas, etc.)
   ================================================================ */
function renderNuevoProducto(){
  fillEtiquetaSelect(document.getElementById('np-etiqueta'));
  fillBazarSelect(document.getElementById('np-bazar-venta'));
  fillCategoriaDatalist(document.getElementById('np-categoria-list'));
  renderColorPicker(document.getElementById('np-color-picker'), npSelectedColor, c => npSelectedColor = c);
  document.getElementById('np-fecha-compra').value = todayStr();
}
function toggleVentaFields(estadoSelect, ventaFieldsId){
  document.getElementById(ventaFieldsId).style.display = estadoSelect.value === 'vendido' ? 'block' : 'none';
}
function submitNuevoProducto(e){
  e.preventDefault();
  const nombre = document.getElementById('np-nombre').value.trim();
  if(!nombre){ toast('Ponle un nombre al producto', 'error'); return; }
  const estado = document.getElementById('np-estado').value;
  DB.productos.push({
    id: uid(), tipo: 'otro', nombre,
    categoriaLibre: document.getElementById('np-categoria').value.trim() || 'Sin categoría',
    etiquetaId: document.getElementById('np-etiqueta').value || null,
    color: npSelectedColor,
    cantidad: Number(document.getElementById('np-cantidad').value)||0,
    costoCompra: Number(document.getElementById('np-costo').value)||0,
    precioVenta: Number(document.getElementById('np-precio').value)||0,
    estado,
    fechaCompra: document.getElementById('np-fecha-compra').value || todayStr(),
    fechaVenta: estado==='vendido' ? (document.getElementById('np-fecha-venta').value || todayStr()) : null,
    bazarVentaId: estado==='vendido' ? (document.getElementById('np-bazar-venta').value || null) : null,
    ingresoExtra: estado==='vendido' ? (Number(document.getElementById('np-ingreso-extra').value)||0) : 0,
    notas: document.getElementById('np-notas').value.trim()
  });
  saveDB();
  toast('Producto agregado a inventario ✅', 'success');
  document.getElementById('np-form').reset();
  renderNuevoProducto();
  document.getElementById('np-venta-fields').style.display = 'none';
}

/* ================================================================
   INVENTARIO (genérico para cualquier PRODUCT_TYPES)
   ================================================================ */
function renderInventoryGrid(tipo){
  const grid = document.getElementById('grid-' + tipo);
  const filtro = inventoryFilters[tipo];
  const search = (document.getElementById('global-search').value || '').toLowerCase();
  let list = DB.productos.filter(p => p.tipo === tipo);
  if(filtro !== 'todos') list = list.filter(p => p.estado === filtro);
  if(tipo==='otro' && otroCategoriaFilter !== 'todas') list = list.filter(p => (p.categoriaLibre||'Sin categoría') === otroCategoriaFilter);
  if(search) list = list.filter(p => p.nombre.toLowerCase().includes(search));

  if(!list.length){
    grid.innerHTML = `<div class="empty-hint">No hay ${PRODUCT_TYPES[tipo].label.toLowerCase()} que coincidan. Usa "＋ Nuevo" para agregar uno.</div>`;
    return;
  }
  grid.innerHTML = list.map(p => {
    const etiqueta = DB.etiquetas.find(t=>t.id===p.etiquetaId);
    const bazar = DB.bazares.find(b=>b.id===p.bazarVentaId);
    const ingresos = p.estado==='vendido' ? (p.precioVenta + (p.ingresoExtra||0)) : 0;
    return `
    <div class="card">
      <div class="card-top">
        <span class="card-title">${esc(p.nombre)}</span>
        <span class="card-swatch" style="background:${p.color}"></span>
      </div>
      <div class="card-meta">
        <span class="card-badge badge-${p.estado}">${ESTADOS[p.estado]}</span>
        ${p.tipo==='otro' && p.categoriaLibre ? `<span class="card-badge badge-otro">${esc(p.categoriaLibre)}</span>` : ''}
        ${etiqueta ? `<span>🏷️ ${esc(etiqueta.nombre)}</span>` : ''}
      </div>
      <div class="card-row"><span>Día de compra</span><span>${p.fechaCompra||'—'}</span></div>
      <div class="card-row"><span>Stock</span><span>${p.cantidad}</span></div>
      <div class="card-row"><span>Costo / Precio</span><span>${money(p.costoCompra)} / ${money(p.precioVenta)}</span></div>
      ${p.estado==='vendido' ? `
      <div class="card-row"><span>Fecha de venta</span><span>${p.fechaVenta||'—'}</span></div>
      ${bazar ? `<div class="card-row"><span>Bazar</span><span>${esc(bazar.nombre)}</span></div>` : ''}
      <div class="card-row"><span>Ingresos (venta+extra)</span><span>${money(ingresos)}</span></div>
      ` : ''}
      <div class="card-actions">
        <button onclick="openProductModal('${p.id}')">✏️ Editar</button>
        <button class="danger" onclick="deleteProduct('${p.id}')">🗑️ Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

function renderOtroPage(){
  const bar = document.getElementById('filter-otro-categoria');
  const cats = ['todas', ...new Set(DB.productos.filter(p=>p.tipo==='otro').map(p=>p.categoriaLibre||'Sin categoría'))];
  bar.innerHTML = cats.map(c => `<button class="filter-chip${c===otroCategoriaFilter?' active':''}" data-cat="${esc(c)}">${c==='todas'?'Todas las categorías':esc(c)}</button>`).join('');
  bar.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      otroCategoriaFilter = chip.dataset.cat;
      renderOtroPage();
    });
  });
  renderInventoryGrid('otro');
}

function openProductModal(id, tipoForNew){
  pmEditingId = id;
  fillEtiquetaSelect(document.getElementById('pm-etiqueta'));
  fillBazarSelect(document.getElementById('pm-bazar-venta'));
  fillCategoriaDatalist(document.getElementById('pm-categoria-list'));
  const isNew = !id;
  const tipo = isNew ? tipoForNew : DB.productos.find(x=>x.id===id).tipo;
  document.getElementById('pm-title').textContent = isNew ? `Nuevo ${PRODUCT_TYPES[tipo].singular}` : 'Editar producto';
  document.getElementById('pm-delete-btn').style.display = isNew ? 'none' : 'inline-block';

  const p = isNew ? {
    tipo, nombre:'', categoriaLibre:'', etiquetaId:null, color: BRAND_COLORS[0], cantidad:1,
    costoCompra: tipo==='pin'?DB.ajustes.costoPin: tipo==='sticker'?DB.ajustes.costoSticker : 0,
    precioVenta:0, estado:'inventario', fechaCompra: todayStr(), fechaVenta:null,
    bazarVentaId:null, ingresoExtra:0, notas:''
  } : DB.productos.find(x=>x.id===id);

  document.getElementById('pm-nombre').value = p.nombre;
  document.getElementById('pm-etiqueta').value = p.etiquetaId || '';
  document.getElementById('pm-categoria-group').style.display = tipo==='otro' ? 'block' : 'none';
  document.getElementById('pm-categoria').value = p.categoriaLibre || '';
  pmSelectedColor = p.color;
  renderColorPicker(document.getElementById('pm-color-picker'), pmSelectedColor, c => pmSelectedColor = c);
  document.getElementById('pm-cantidad').value = p.cantidad;
  document.getElementById('pm-costo').value = p.costoCompra;
  document.getElementById('pm-precio').value = p.precioVenta;
  document.getElementById('pm-fecha-compra').value = p.fechaCompra || todayStr();
  document.getElementById('pm-estado').value = p.estado;
  document.getElementById('pm-fecha-venta').value = p.fechaVenta || '';
  document.getElementById('pm-bazar-venta').value = p.bazarVentaId || '';
  document.getElementById('pm-ingreso-extra').value = p.ingresoExtra || 0;
  document.getElementById('pm-notas').value = p.notas || '';
  toggleVentaFields(document.getElementById('pm-estado'), 'pm-venta-fields');
  document.getElementById('product-modal').dataset.tipo = tipo;
  openModal('product-modal');
}

function saveProductModal(){
  const nombre = document.getElementById('pm-nombre').value.trim();
  if(!nombre){ toast('Ponle un nombre al producto', 'error'); return; }
  const estado = document.getElementById('pm-estado').value;
  const tipo = document.getElementById('product-modal').dataset.tipo;
  const data = {
    tipo, nombre,
    categoriaLibre: tipo==='otro' ? (document.getElementById('pm-categoria').value.trim() || 'Sin categoría') : null,
    etiquetaId: document.getElementById('pm-etiqueta').value || null,
    color: pmSelectedColor,
    cantidad: Number(document.getElementById('pm-cantidad').value)||0,
    costoCompra: Number(document.getElementById('pm-costo').value)||0,
    precioVenta: Number(document.getElementById('pm-precio').value)||0,
    estado,
    fechaCompra: document.getElementById('pm-fecha-compra').value || todayStr(),
    fechaVenta: estado==='vendido' ? (document.getElementById('pm-fecha-venta').value || todayStr()) : null,
    bazarVentaId: estado==='vendido' ? (document.getElementById('pm-bazar-venta').value || null) : null,
    ingresoExtra: estado==='vendido' ? (Number(document.getElementById('pm-ingreso-extra').value)||0) : 0,
    notas: document.getElementById('pm-notas').value.trim()
  };
  if(pmEditingId){
    const idx = DB.productos.findIndex(x=>x.id===pmEditingId);
    DB.productos[idx] = Object.assign({id:pmEditingId}, data);
  } else {
    DB.productos.push(Object.assign({id: uid()}, data));
  }
  saveDB();
  closeModal('product-modal');
  toast('Producto guardado ✅', 'success');
  if(PAGE_RENDERERS[currentPage]) PAGE_RENDERERS[currentPage]();
}
function deleteProductFromModal(){
  if(!pmEditingId) return;
  askConfirm('¿Eliminar este producto del inventario?', () => {
    DB.productos = DB.productos.filter(x=>x.id!==pmEditingId);
    saveDB(); closeModal('product-modal'); toast('Producto eliminado');
    if(PAGE_RENDERERS[currentPage]) PAGE_RENDERERS[currentPage]();
  });
}
function deleteProduct(id){
  askConfirm('¿Eliminar este producto del inventario?', () => {
    DB.productos = DB.productos.filter(x=>x.id!==id);
    saveDB();
    if(PAGE_RENDERERS[currentPage]) PAGE_RENDERERS[currentPage]();
    toast('Producto eliminado');
  });
}

/* ================================================================
   ETIQUETAS Y COLORES
   ================================================================ */
function renderEtiquetas(){
  const wrap = document.getElementById('tags-list');
  if(!DB.etiquetas.length){ wrap.innerHTML = `<div class="empty-hint">Sin etiquetas todavía.</div>`; return; }
  wrap.innerHTML = DB.etiquetas.map(t => `
    <div class="chip-item">
      <span class="chip-swatch" style="background:${t.color}"></span>
      <span>${esc(t.nombre)}</span>
      <button onclick="deleteEtiqueta('${t.id}')">✕</button>
    </div>
  `).join('');
}
function addEtiqueta(){
  const nombre = document.getElementById('tag-nombre').value.trim();
  if(!nombre){ toast('Escribe un nombre de etiqueta', 'error'); return; }
  DB.etiquetas.push({ id: uid(), nombre, color: document.getElementById('tag-color').value });
  saveDB();
  document.getElementById('tag-nombre').value = '';
  renderEtiquetas();
  toast('Etiqueta agregada', 'success');
}
function deleteEtiqueta(id){
  askConfirm('¿Eliminar esta etiqueta?', () => {
    DB.etiquetas = DB.etiquetas.filter(t=>t.id!==id);
    DB.productos.forEach(p => { if(p.etiquetaId===id) p.etiquetaId = null; });
    saveDB(); renderEtiquetas(); toast('Etiqueta eliminada');
  });
}

/* ================================================================
   MIS BAZARES
   ================================================================ */
function renderBazares(){
  const body = document.getElementById('bazares-body');
  if(!DB.bazares.length){
    body.innerHTML = `<tr><td colspan="4" class="empty-hint">Aún no registras bazares.</td></tr>`;
    return;
  }
  body.innerHTML = DB.bazares.map(b => `
    <tr class="${b.id===DB.bazarActivoId?'is-active':''}">
      <td class="name-cell">🎪 ${esc(b.nombre)}</td>
      <td>${b.fecha||'—'}</td>
      <td>${esc(b.ubicacion||'—')}</td>
      <td>
        <div class="row-actions">
          <button class="${b.id===DB.bazarActivoId?'active-badge':''}" onclick="setBazarActivo('${b.id}')">${b.id===DB.bazarActivoId?'✓ Activo':'Marcar activo'}</button>
          <button onclick="openBazarModal('${b.id}')">✏️</button>
          <button class="danger" onclick="deleteBazar('${b.id}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}
function setBazarActivo(id){ DB.bazarActivoId = id; saveDB(); refreshHeaderBazarSelect(); renderBazares(); toast('Bazar activo actualizado'); }
function openBazarModal(id){
  bmEditingId = id || null;
  const b = id ? DB.bazares.find(x=>x.id===id) : {nombre:'',fecha:todayStr(),ubicacion:''};
  document.getElementById('bm-title').textContent = id ? 'Editar bazar' : 'Nuevo bazar';
  document.getElementById('bm-nombre').value = b.nombre;
  document.getElementById('bm-fecha').value = b.fecha || todayStr();
  document.getElementById('bm-ubicacion').value = b.ubicacion || '';
  openModal('bazar-modal');
}
function saveBazarModal(){
  const nombre = document.getElementById('bm-nombre').value.trim();
  if(!nombre){ toast('Ponle un nombre al bazar', 'error'); return; }
  const data = { nombre, fecha: document.getElementById('bm-fecha').value, ubicacion: document.getElementById('bm-ubicacion').value.trim() };
  if(bmEditingId){
    const idx = DB.bazares.findIndex(x=>x.id===bmEditingId);
    DB.bazares[idx] = Object.assign({id:bmEditingId}, data);
  } else {
    const nb = Object.assign({id: uid()}, data);
    DB.bazares.push(nb);
    if(!DB.bazarActivoId) DB.bazarActivoId = nb.id;
  }
  saveDB(); closeModal('bazar-modal'); refreshHeaderBazarSelect(); renderBazares();
  toast('Bazar guardado', 'success');
}
function deleteBazar(id){
  askConfirm('¿Eliminar este bazar?', () => {
    DB.bazares = DB.bazares.filter(b=>b.id!==id);
    if(DB.bazarActivoId===id) DB.bazarActivoId = DB.bazares[0] ? DB.bazares[0].id : null;
    saveDB(); refreshHeaderBazarSelect(); renderBazares(); toast('Bazar eliminado');
  });
}

/* ================================================================
   ESTADÍSTICAS — guía de métricas + combinaciones + gráficas propias
   ================================================================ */
const RECOMMENDED_COMBINATIONS = [
  { id:'etiqueta-ganancia', title:'Etiqueta + ganancia', description:'Identifica qué etiquetas dejan más ganancia.', fuente:'inventario', dimension:'etiqueta', metrica:'ganancia', tipo:'bar' },
  { id:'color-ventas',      title:'Color + ingresos',    description:'Descubre qué colores se venden mejor.',        fuente:'inventario', dimension:'color',    metrica:'ingresos', tipo:'bar' },
  { id:'tipo-ingresos',     title:'Tipo de producto + ingresos', description:'Compara pines, stickers y otros productos.', fuente:'inventario', dimension:'tipo', metrica:'ingresos', tipo:'doughnut' },
  { id:'categoria-stock',   title:'Categoría (otros) + stock', description:'Detecta qué figuras/mangas debes reponer.', fuente:'inventario', dimension:'categoria', metrica:'stock', tipo:'bar' },
  { id:'bazar-ingresos',    title:'Bazar + ingresos',    description:'Compara en qué bazares te conviene vender.',    fuente:'bazares', tipo:'bar' },
  { id:'estado-inventario', title:'Estado del inventario', description:'Mira cuánto tienes disponible vs. vendido.',  fuente:'estado', tipo:'doughnut' }
];

let chartInstances = {};
let recommendedChart = null;
let selectedRecommendedCombination = 'etiqueta-ganancia';

function getRecommendedStyle(id){
  const saved = (DB.recommendedChartStyles || {})[id] || {};
  const combination = RECOMMENDED_COMBINATIONS.find(c=>c.id===id) || RECOMMENDED_COMBINATIONS[0];
  return { tipo: saved.tipo || combination.tipo, paleta: saved.paleta || 'verde' };
}

function datosGrafica(fuente, dimension, metrica){
  if(fuente === 'bazares'){
    const labels = DB.bazares.map(b=>b.nombre);
    const values = DB.bazares.map(b => DB.productos.filter(p=>p.bazarVentaId===b.id && p.estado==='vendido').reduce((s,p)=>s+p.precioVenta+(p.ingresoExtra||0),0));
    return { labels: labels.length?labels:['Sin bazares'], values: labels.length?values:[0], label:'Ingresos ($)' };
  }
  if(fuente === 'estado'){
    return {
      labels: ['En inventario','Vendido','Agotado'],
      values: [
        DB.productos.filter(p=>p.estado==='inventario').length,
        DB.productos.filter(p=>p.estado==='vendido').length,
        DB.productos.filter(p=>p.estado==='agotado').length
      ],
      label:'Productos'
    };
  }
  if(fuente === 'tipo-producto'){
    return {
      labels: Object.values(PRODUCT_TYPES).map(t=>t.label),
      values: Object.keys(PRODUCT_TYPES).map(k => DB.productos.filter(p=>p.tipo===k && p.estado==='vendido').reduce((s,p)=>s+p.precioVenta+(p.ingresoExtra||0),0)),
      label:'Ingresos ($)'
    };
  }
  // fuente === 'inventario' (agrupado por dimension, medido por metrica)
  const grupos = {};
  const agregar = (grupo, p) => {
    const cant = p.cantidad || 0;
    const costo = p.costoCompra * cant;
    const ingresos = p.estado==='vendido' ? (p.precioVenta + (p.ingresoExtra||0)) : 0;
    const ganancia = p.estado==='vendido' ? (ingresos - p.costoCompra) : 0;
    grupos[grupo] = (grupos[grupo]||0) + ({stock:cant, costo, ingresos, ganancia}[metrica] || 0);
  };
  DB.productos.forEach(p => {
    let grupo;
    if(dimension === 'etiqueta'){
      const et = DB.etiquetas.find(t=>t.id===p.etiquetaId);
      grupo = et ? et.nombre : 'Sin etiqueta';
    } else if(dimension === 'color'){
      grupo = p.color;
    } else if(dimension === 'tipo'){
      grupo = PRODUCT_TYPES[p.tipo] ? PRODUCT_TYPES[p.tipo].label : p.tipo;
    } else if(dimension === 'categoria'){
      if(p.tipo !== 'otro') return;
      grupo = p.categoriaLibre || 'Sin categoría';
    } else if(dimension === 'estado'){
      grupo = ESTADOS[p.estado] || p.estado;
    } else {
      grupo = 'Sin dato';
    }
    agregar(grupo, p);
  });
  const labels = Object.keys(grupos);
  const metricLabels = { stock:'Piezas', costo:'Costo ($)', ingresos:'Ingresos ($)', ganancia:'Ganancia ($)' };
  return { labels: labels.length?labels:['Sin datos'], values: labels.length?labels.map(l=>grupos[l]):[0], label: metricLabels[metrica]||'Inventario' };
}

function renderEstadisticas(){
  const productos = DB.productos;
  const enInventario = productos.filter(p=>p.estado==='inventario').reduce((s,p)=>s+p.cantidad,0);
  const vendidos = productos.filter(p=>p.estado==='vendido');
  const ingresos = vendidos.reduce((s,p)=>s+p.precioVenta+(p.ingresoExtra||0),0);
  const costoVendidos = vendidos.reduce((s,p)=>s+p.costoCompra,0);

  document.getElementById('st-inventario').textContent = enInventario;
  document.getElementById('st-vendidos').textContent = vendidos.length;
  document.getElementById('st-ingresos').textContent = money(ingresos);
  document.getElementById('st-ganancia').textContent = money(ingresos - costoVendidos);

  renderCombinacionesRecomendadas();
  renderGraficasPersonalizadas();
}

function renderCombinacionesRecomendadas(){
  const list = document.getElementById('recommended-combinations');
  if(!list) return;
  list.innerHTML = RECOMMENDED_COMBINATIONS.map(c => `
    <button class="recommended-combination${c.id===selectedRecommendedCombination?' active':''}" data-combo="${c.id}">
      <span class="recommended-combination-title">${c.title}</span>
      <span class="recommended-combination-meta">${c.description}</span>
    </button>`).join('');
  list.querySelectorAll('[data-combo]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRecommendedCombination = btn.dataset.combo;
      renderCombinacionesRecomendadas();
    });
  });
  renderCombinacionSeleccionada(selectedRecommendedCombination);
}

function renderCombinacionSeleccionada(id){
  const combo = RECOMMENDED_COMBINATIONS.find(c=>c.id===id) || RECOMMENDED_COMBINATIONS[0];
  const style = getRecommendedStyle(combo.id);
  const canvas = document.getElementById('recommended-chart');
  const empty = document.getElementById('recommended-chart-empty');
  if(!canvas) return;
  document.getElementById('recommended-chart-title').textContent = combo.title;
  document.getElementById('recommended-chart-description').textContent = combo.description;
  document.getElementById('recommended-chart-type').value = style.tipo;
  document.getElementById('recommended-chart-palette').value = style.paleta;
  const data = datosGrafica(combo.fuente, combo.dimension, combo.metrica);
  if(recommendedChart) recommendedChart.destroy();
  const hasData = data.labels.length && data.values.some(v=>Number(v)>0);
  canvas.style.display = hasData ? 'block' : 'none';
  empty.style.display = hasData ? 'none' : 'block';
  if(!hasData) return;
  recommendedChart = new Chart(canvas, {
    type: style.tipo,
    data: { labels: data.labels, datasets: [{ label: data.label, data: data.values, backgroundColor: CHART_PALETTES[style.paleta], borderColor: CHART_PALETTES[style.paleta][0], borderWidth:2, borderRadius: style.tipo==='bar'?6:0, tension:.25 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales: (style.tipo==='doughnut'||style.tipo==='pie') ? {} : { y:{beginAtZero:true} } }
  });
}

function applyRecommendedStyle(){
  DB.recommendedChartStyles[selectedRecommendedCombination] = {
    tipo: document.getElementById('recommended-chart-type').value,
    paleta: document.getElementById('recommended-chart-palette').value
  };
  saveDB();
  renderCombinacionSeleccionada(selectedRecommendedCombination);
  toast('Estilo de la gráfica actualizado ✅', 'success');
}

function openGraficaModal(id){
  gmEditingId = id || null;
  document.getElementById('gm-title').textContent = id ? 'Editar gráfica' : 'Nueva gráfica';
  const g = id ? DB.graficas.find(x=>x.id===id) : null;
  document.getElementById('gm-titulo').value = g ? g.titulo : '';
  document.getElementById('gm-fuente').value = g ? g.fuente : 'inventario';
  document.getElementById('gm-tipo').value = g ? g.tipo : 'bar';
  document.getElementById('gm-dimension').value = g ? (g.dimension||'etiqueta') : 'etiqueta';
  document.getElementById('gm-metrica').value = g ? (g.metrica||'stock') : 'stock';
  toggleGraficaInventarioOptions();
  openModal('grafica-modal');
}
function toggleGraficaInventarioOptions(){
  document.getElementById('gm-inventario-options').style.display = document.getElementById('gm-fuente').value === 'inventario' ? 'flex' : 'none';
}
function saveGrafica(){
  const titulo = document.getElementById('gm-titulo').value.trim();
  if(!titulo){ toast('Escribe un título para la gráfica', 'error'); return; }
  const data = {
    titulo,
    fuente: document.getElementById('gm-fuente').value,
    tipo: document.getElementById('gm-tipo').value,
    dimension: document.getElementById('gm-dimension').value || 'etiqueta',
    metrica: document.getElementById('gm-metrica').value || 'stock'
  };
  if(gmEditingId){
    Object.assign(DB.graficas.find(g=>g.id===gmEditingId), data);
  } else {
    DB.graficas.push(Object.assign({id: uid()}, data));
  }
  saveDB();
  closeModal('grafica-modal');
  renderGraficasPersonalizadas();
  toast(gmEditingId ? 'Gráfica actualizada ✅' : 'Gráfica agregada ✅', 'success');
}
function deleteGrafica(id){
  askConfirm('¿Eliminar esta gráfica?', () => {
    DB.graficas = DB.graficas.filter(g=>g.id!==id);
    if(chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id]; }
    saveDB(); renderGraficasPersonalizadas(); toast('Gráfica eliminada');
  });
}
function renderGraficasPersonalizadas(){
  const grid = document.getElementById('custom-charts-grid');
  const empty = document.getElementById('custom-charts-empty');
  if(!grid) return;
  Object.keys(chartInstances).forEach(id => { chartInstances[id].destroy(); delete chartInstances[id]; });
  empty.style.display = DB.graficas.length ? 'none' : 'block';
  grid.innerHTML = DB.graficas.map(g => `
    <div class="custom-chart-card">
      <div class="card-top" style="margin-bottom:var(--space-2);">
        <span class="card-title" style="font-size:var(--fs-sm);">${esc(g.titulo)}</span>
        <div class="row-actions">
          <button onclick="openGraficaModal('${g.id}')">✏️</button>
          <button class="danger" onclick="deleteGrafica('${g.id}')">🗑️</button>
        </div>
      </div>
      <canvas id="chart-custom-${g.id}" class="custom-chart-canvas"></canvas>
    </div>`).join('');
  DB.graficas.forEach(g => {
    const canvas = document.getElementById('chart-custom-' + g.id);
    if(!canvas) return;
    const data = datosGrafica(g.fuente, g.dimension, g.metrica);
    chartInstances[g.id] = new Chart(canvas, {
      type: g.tipo,
      data: { labels: data.labels, datasets: [{ label: data.label, data: data.values, backgroundColor: CHART_PALETTES.verde, borderColor: '#049459', borderWidth:2, tension:.25 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales: (g.tipo==='doughnut'||g.tipo==='pie') ? {} : { y:{beginAtZero:true} } }
    });
  });
}

/* ================================================================
   AJUSTES DE COSTOS
   ================================================================ */
function renderAjustes(){
  const a = DB.ajustes;
  document.getElementById('cfg-costo-pin').value = a.costoPin;
  document.getElementById('cfg-costo-sticker').value = a.costoSticker;
  document.getElementById('cfg-empaque').value = a.empaque;
  document.getElementById('cfg-comision').value = a.comision;
  document.getElementById('cfg-margen').value = a.margen;
}
function saveAjustes(){
  DB.ajustes = {
    costoPin: Number(document.getElementById('cfg-costo-pin').value)||0,
    costoSticker: Number(document.getElementById('cfg-costo-sticker').value)||0,
    empaque: Number(document.getElementById('cfg-empaque').value)||0,
    comision: Number(document.getElementById('cfg-comision').value)||0,
    margen: Number(document.getElementById('cfg-margen').value)||0
  };
  saveDB();
  toast('Ajustes guardados ✅', 'success');
}

/* ================================================================
   RESPALDO: JSON / CSV
   ================================================================ */
function downloadFile(filename, content, mime){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function exportJSON(){
  downloadFile(`clowncloud-respaldo-${todayStr()}.json`, JSON.stringify(DB, null, 2), 'application/json');
  toast('Respaldo JSON descargado', 'success');
}
function exportCSV(){
  const rows = [['Tipo','Categoría','Nombre','Etiqueta','Color','Cantidad','Costo compra','Precio venta','Estado','Fecha compra','Fecha venta','Bazar venta','Ingreso extra','Notas']];
  DB.productos.forEach(p => {
    const etiqueta = DB.etiquetas.find(t=>t.id===p.etiquetaId);
    const bazar = DB.bazares.find(b=>b.id===p.bazarVentaId);
    rows.push([p.tipo, p.categoriaLibre||'', p.nombre, etiqueta?etiqueta.nombre:'', p.color, p.cantidad, p.costoCompra, p.precioVenta, ESTADOS[p.estado], p.fechaCompra||'', p.fechaVenta||'', bazar?bazar.nombre:'', p.ingresoExtra||0, (p.notas||'').replace(/\n/g,' ')]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(`clowncloud-inventario-${todayStr()}.csv`, csv, 'text/csv');
  toast('CSV de inventario descargado', 'success');
}
function importJSON(file){
  const reader = new FileReader();
  reader.onload = e => {
    try{
      const data = JSON.parse(e.target.result);
      DB = Object.assign(defaultDB(), data);
      saveDB();
      toast('Respaldo importado ✅', 'success');
      boot();
    }catch(err){ toast('Archivo inválido', 'error'); }
  };
  reader.readAsText(file);
}

/* ================================================================
   MODO OSCURO
   ================================================================ */
function applyDarkMode(){
  const isLight = localStorage.getItem(DARK_KEY) === 'light';
  document.body.classList.toggle('light', isLight);
  document.getElementById('dark-mode-btn').innerHTML = isLight ? '🌙 <span>Modo oscuro</span>' : '☀️ <span>Modo claro</span>';
}
function toggleDarkMode(){
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem(DARK_KEY, isLight ? 'light' : 'dark');
  document.getElementById('dark-mode-btn').innerHTML = isLight ? '🌙 <span>Modo oscuro</span>' : '☀️ <span>Modo claro</span>';
  if(currentPage==='estadisticas') renderEstadisticas();
}

/* ================================================================
   ARRANQUE Y EVENTOS
   ================================================================ */
function boot(){
  refreshHeaderBazarSelect();
  applyDarkMode();
  switchPage(currentPage);
}

document.addEventListener('DOMContentLoaded', () => {
  boot();

  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  });

  document.getElementById('global-search').addEventListener('input', () => {
    if(currentPage==='pin' || currentPage==='sticker' || currentPage==='otro') renderInventoryGrid(currentPage);
  });

  document.getElementById('bazar-activo-select').addEventListener('change', e => {
    DB.bazarActivoId = e.target.value || null; saveDB();
  });
  document.getElementById('header-bazar-add').addEventListener('click', () => openBazarModal(null));

  document.getElementById('dark-mode-btn').addEventListener('click', toggleDarkMode);
  document.getElementById('backup-btn').addEventListener('click', () => document.getElementById('backup-menu').classList.toggle('open'));
  document.addEventListener('click', e => {
    if(!e.target.closest('#backup-btn') && !e.target.closest('#backup-menu')) document.getElementById('backup-menu').classList.remove('open');
  });
  document.getElementById('export-json-btn').addEventListener('click', exportJSON);
  document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
  document.getElementById('import-json-input').addEventListener('change', e => {
    if(e.target.files[0]) importJSON(e.target.files[0]);
  });

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if(e.target===ov) closeModal(ov.id); });
  });
  document.getElementById('confirm-ok-btn').addEventListener('click', () => {
    if(confirmCallback) confirmCallback();
    closeModal('confirm-modal');
  });

  document.getElementById('q-add-item').addEventListener('click', () => {
    currentQuote.items.push({ tipo:'pin', desc:'', cant:1, costo:DB.ajustes.costoPin, precio:0 });
    renderQuoteItems(); updateQuoteSummary();
  });
  document.getElementById('q-add-cost').addEventListener('click', () => {
    currentQuote.costs.push({ concepto:'', monto:0 });
    renderQuoteCosts(); updateQuoteSummary();
  });
  document.getElementById('q-reset-btn').addEventListener('click', () => askConfirm('¿Empezar una cotización nueva? Se perderá lo no guardado.', resetQuote));
  document.getElementById('q-save-btn').addEventListener('click', saveQuote);
  document.getElementById('q-pdf-btn').addEventListener('click', exportQuotePDF);
  document.getElementById('q-cliente-add').addEventListener('click', () => openClienteModal(null, true));

  document.getElementById('np-estado').addEventListener('change', e => toggleVentaFields(e.target, 'np-venta-fields'));
  document.getElementById('np-form').addEventListener('submit', submitNuevoProducto);

  document.querySelectorAll('[data-add-tipo]').forEach(btn => {
    btn.addEventListener('click', () => openProductModal(null, btn.dataset.addTipo));
  });
  document.querySelectorAll('.filter-bar[data-filter-for]').forEach(bar => {
    const tipo = bar.dataset.filterFor;
    bar.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        bar.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        inventoryFilters[tipo] = chip.dataset.estado;
        renderInventoryGrid(tipo);
      });
    });
  });
  document.querySelectorAll('#filter-otro-estado .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#filter-otro-estado .filter-chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      inventoryFilters.otro = chip.dataset.estado;
      renderInventoryGrid('otro');
    });
  });

  document.getElementById('pm-estado').addEventListener('change', e => toggleVentaFields(e.target, 'pm-venta-fields'));
  document.getElementById('pm-save-btn').addEventListener('click', saveProductModal);
  document.getElementById('pm-delete-btn').addEventListener('click', deleteProductFromModal);

  document.getElementById('tag-add-btn').addEventListener('click', addEtiqueta);

  document.getElementById('bazar-add-btn').addEventListener('click', () => openBazarModal(null));
  document.getElementById('bm-save-btn').addEventListener('click', saveBazarModal);

  document.getElementById('cliente-add-btn').addEventListener('click', () => openClienteModal(null, false));
  document.getElementById('cm-save-btn').addEventListener('click', saveClienteModal);
  document.getElementById('cm-delete-btn').addEventListener('click', deleteClienteModal);

  document.getElementById('recommended-chart-apply').addEventListener('click', applyRecommendedStyle);
  document.getElementById('grafica-add-btn').addEventListener('click', () => openGraficaModal(null));
  document.getElementById('gm-fuente').addEventListener('change', toggleGraficaInventarioOptions);
  document.getElementById('gm-save-btn').addEventListener('click', saveGrafica);

  document.getElementById('cfg-save-btn').addEventListener('click', saveAjustes);
});