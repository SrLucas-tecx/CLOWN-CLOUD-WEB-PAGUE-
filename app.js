/* ============================================================
   CLOWN CLOUD — app.js
   Arquitectura:
   - DB: un solo objeto de estado guardado en localStorage.
   - PAGES: registro de "renderers" por página. Para agregar una
     sección nueva solo hace falta: botón .nav-item + <section
     class="page-section"> en el HTML + una entrada aquí.
   - PRODUCT_TYPES: para agregar un tipo de producto nuevo (ej.
     "llavero") solo se agrega aquí y su nav+section en el HTML;
     todo el CRUD de inventario ya es genérico.
   ============================================================ */

const STORAGE_KEY = 'clowncloud_db_v1';
const DARK_KEY = 'clowncloud_dark';

const BRAND_COLORS = [
  '#FB6204','#E988B3','#C34804','#A263CB','#F4B903','#ED5399',
  '#2B2B2B','#049459','#468AC9','#8E98DD','#3A200F','#5E3C19',
  '#EFD9C4','#BBB8BF','#918BB7','#000000'
];

const PRODUCT_TYPES = {
  pin:     { label: 'Pines',    singular: 'Pin',     icon: '📌' },
  sticker: { label: 'Stickers', singular: 'Sticker', icon: '✂️' }
};

const ESTADOS = {
  inventario: 'En inventario',
  vendido:    'Vendido',
  agotado:    'Agotado'
};

/* ---------------- ESTADO ---------------- */
let DB = loadDB();
let currentPage = 'cotizador';
let currentQuote = { items: [], costs: [] };
let confirmCallback = null;
let npSelectedTipo = 'pin';
let npSelectedColor = BRAND_COLORS[0];
let pmSelectedColor = BRAND_COLORS[0];
let pmEditingId = null;
let bmEditingId = null;
let inventoryFilters = { pin: 'todos', sticker: 'todos' };

function defaultDB(){
  return {
    productos: [],      // {id, tipo, nombre, etiquetaId, color, cantidad, costoCompra, precioVenta, estado, fechaCompra, fechaVenta, bazarVentaId, ingresoExtra, notas}
    cotizaciones: [],    // {id, cliente, fecha, bazarId, items:[], costs:[], totalCosto, totalPrecio, ganancia}
    etiquetas: [
      { id: uid(), nombre: 'Colección Circo', color: '#FB6204' },
      { id: uid(), nombre: 'Kawaii',           color: '#E988B3' }
    ],
    bazares: [],
    bazarActivoId: null,
    ajustes: { costoPin: 15, costoSticker: 8, empaque: 5, comision: 10, margen: 60 }
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
  cotizador: 'Cotizador rápido', cotizaciones: 'Cotizaciones guardadas',
  nuevo: 'Producto nuevo', pin: 'Inventario de Pines', sticker: 'Inventario de Stickers',
  etiquetas: 'Etiquetas y colores', bazares: 'Mis Bazares',
  estadisticas: 'Estadísticas', ajustes: 'Ajustes de costos'
};
const PAGE_RENDERERS = {
  cotizador: renderQuoteEditor,
  cotizaciones: renderCotizacionesGuardadas,
  nuevo: renderNuevoProducto,
  pin: () => renderInventoryGrid('pin'),
  sticker: () => renderInventoryGrid('sticker'),
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

/* ================= SELECTS COMPARTIDOS (bazares) ================= */
function fillBazarSelect(select, includeNone=true){
  select.innerHTML = (includeNone ? '<option value="">— Ninguno —</option>' : '') +
    DB.bazares.map(b => `<option value="${b.id}">${esc(b.nombre)}</option>`).join('');
}
function fillEtiquetaSelect(select){
  select.innerHTML = '<option value="">— Sin etiqueta —</option>' +
    DB.etiquetas.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
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
   COTIZADOR
   ================================================================ */
function renderQuoteEditor(){
  document.getElementById('q-fecha').value = document.getElementById('q-fecha').value || todayStr();
  fillBazarSelect(document.getElementById('q-bazar'));
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
  currentQuote = { items: [], costs: [] };
  document.getElementById('q-cliente').value = '';
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
    cliente: document.getElementById('q-cliente').value || 'Sin nombre',
    fecha: document.getElementById('q-fecha').value || todayStr(),
    bazarId: document.getElementById('q-bazar').value || null,
    items: JSON.parse(JSON.stringify(currentQuote.items)),
    costs: JSON.parse(JSON.stringify(currentQuote.costs)),
    totalCosto, totalPrecio, ganancia: totalPrecio - totalCosto
  });
  saveDB();
  toast('Cotización guardada ✅', 'success');
  resetQuote();
}

function exportQuotePDF(){
  const el = document.createElement('div');
  el.style.cssText = 'padding:24px;font-family:sans-serif;color:#2B2B2B;';
  const cliente = document.getElementById('q-cliente').value || 'Sin nombre';
  const fecha = document.getElementById('q-fecha').value || todayStr();
  el.innerHTML = `
    <h1 style="color:#FB6204;">CLOWN CLOUD</h1>
    <h3>Cotización — ${esc(cliente)}</h3>
    <p>Fecha: ${fecha}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">
      <thead><tr style="background:#eee;"><th style="text-align:left;padding:6px;">Producto</th><th style="padding:6px;">Cant.</th><th style="padding:6px;">Precio</th><th style="padding:6px;">Subtotal</th></tr></thead>
      <tbody>${currentQuote.items.map(it=>`<tr><td style="padding:6px;border-bottom:1px solid #ddd;">${esc(it.desc||PRODUCT_TYPES[it.tipo].singular)}</td><td style="padding:6px;text-align:center;border-bottom:1px solid #ddd;">${it.cant}</td><td style="padding:6px;text-align:right;border-bottom:1px solid #ddd;">${money(it.precio)}</td><td style="padding:6px;text-align:right;border-bottom:1px solid #ddd;">${money(it.cant*it.precio)}</td></tr>`).join('')}</tbody>
    </table>
    ${currentQuote.costs.length ? `<h4 style="margin-top:12px;">Costos extra</h4><ul>${currentQuote.costs.map(c=>`<li>${esc(c.concepto)}: ${money(c.monto)}</li>`).join('')}</ul>` : ''}
    <h3 style="margin-top:16px;">Total a cobrar: ${document.getElementById('q-sum-precio').textContent}</h3>
  `;
  html2pdf().set({filename:`cotizacion-${cliente}.pdf`, margin:10}).from(el).save();
}

function renderCotizacionesGuardadas(){
  const wrap = document.getElementById('cotizaciones-list');
  if(!DB.cotizaciones.length){
    wrap.innerHTML = `<div class="empty-hint">Aún no guardas ninguna cotización.</div>`;
    return;
  }
  wrap.innerHTML = DB.cotizaciones.map(q => `
    <div class="card">
      <div class="card-top">
        <span class="card-title">${esc(q.cliente)}</span>
        <span class="card-badge badge-inventario">${money(q.ganancia)}</span>
      </div>
      <div class="card-meta"><span>📅 ${q.fecha}</span><span>🧾 ${q.items.length} producto(s)</span></div>
      <div class="card-row"><span>Costo total</span><span>${money(q.totalCosto)}</span></div>
      <div class="card-row"><span>Total a cobrar</span><span>${money(q.totalPrecio)}</span></div>
      <div class="card-actions">
        <button onclick="reopenQuote('${q.id}')">↩️ Reabrir</button>
        <button class="danger" onclick="deleteQuote('${q.id}')">🗑️ Eliminar</button>
      </div>
    </div>
  `).join('');
}
function reopenQuote(id){
  const q = DB.cotizaciones.find(x=>x.id===id);
  if(!q) return;
  currentQuote = { items: JSON.parse(JSON.stringify(q.items)), costs: JSON.parse(JSON.stringify(q.costs)) };
  switchPage('cotizador');
  document.getElementById('q-cliente').value = q.cliente;
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
   PRODUCTO NUEVO
   ================================================================ */
function renderNuevoProducto(){
  fillEtiquetaSelect(document.getElementById('np-etiqueta'));
  fillBazarSelect(document.getElementById('np-bazar-venta'));
  renderColorPicker(document.getElementById('np-color-picker'), npSelectedColor, c => npSelectedColor = c);
  document.getElementById('np-fecha-compra').value = todayStr();
  const ajustes = DB.ajustes;
  document.getElementById('np-costo').value = npSelectedTipo==='pin' ? ajustes.costoPin : ajustes.costoSticker;
}
function setNpTipo(tipo){
  npSelectedTipo = tipo;
  document.querySelectorAll('#np-type-toggle .type-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.tipo===tipo));
  document.getElementById('np-costo').value = tipo==='pin' ? DB.ajustes.costoPin : DB.ajustes.costoSticker;
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
    id: uid(), tipo: npSelectedTipo, nombre,
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
  toast(`${PRODUCT_TYPES[npSelectedTipo].singular} agregado a inventario ✅`, 'success');
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

function openProductModal(id, tipoForNew){
  pmEditingId = id;
  fillEtiquetaSelect(document.getElementById('pm-etiqueta'));
  fillBazarSelect(document.getElementById('pm-bazar-venta'));
  const isNew = !id;
  document.getElementById('pm-title').textContent = isNew ? `Nuevo ${PRODUCT_TYPES[tipoForNew].singular}` : 'Editar producto';
  document.getElementById('pm-delete-btn').style.display = isNew ? 'none' : 'inline-block';

  const p = isNew ? {
    tipo: tipoForNew, nombre:'', etiquetaId:null, color: BRAND_COLORS[0], cantidad:1,
    costoCompra: tipoForNew==='pin'?DB.ajustes.costoPin:DB.ajustes.costoSticker,
    precioVenta:0, estado:'inventario', fechaCompra: todayStr(), fechaVenta:null,
    bazarVentaId:null, ingresoExtra:0, notas:''
  } : DB.productos.find(x=>x.id===id);

  document.getElementById('pm-nombre').value = p.nombre;
  document.getElementById('pm-etiqueta').value = p.etiquetaId || '';
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
  document.getElementById('product-modal').dataset.tipo = p.tipo;
  openModal('product-modal');
}

function saveProductModal(){
  const nombre = document.getElementById('pm-nombre').value.trim();
  if(!nombre){ toast('Ponle un nombre al producto', 'error'); return; }
  const estado = document.getElementById('pm-estado').value;
  const tipo = document.getElementById('product-modal').dataset.tipo;
  const data = {
    tipo, nombre,
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
   ESTADÍSTICAS
   ================================================================ */
let chartIngresos=null, chartEstado=null, chartTipo=null;
function renderEstadisticas(){
  const productos = DB.productos;
  const enInventario = productos.filter(p=>p.estado==='inventario').reduce((s,p)=>s+p.cantidad,0);
  const vendidos = productos.filter(p=>p.estado==='vendido');
  const agotados = productos.filter(p=>p.estado==='agotado').length;
  const ingresos = vendidos.reduce((s,p)=>s+p.precioVenta+(p.ingresoExtra||0),0);
  const costoVendidos = vendidos.reduce((s,p)=>s+p.costoCompra,0);

  document.getElementById('st-inventario').textContent = enInventario;
  document.getElementById('st-vendidos').textContent = vendidos.length;
  document.getElementById('st-ingresos').textContent = money(ingresos);
  document.getElementById('st-ganancia').textContent = money(ingresos - costoVendidos);

  // Ingresos por mes (últimos 6 meses con datos)
  const monthMap = {};
  vendidos.forEach(p => {
    if(!p.fechaVenta) return;
    const key = p.fechaVenta.slice(0,7);
    monthMap[key] = (monthMap[key]||0) + p.precioVenta + (p.ingresoExtra||0);
  });
  const months = Object.keys(monthMap).sort().slice(-6);
  const ctx1 = document.getElementById('chart-ingresos').getContext('2d');
  if(chartIngresos) chartIngresos.destroy();
  chartIngresos = new Chart(ctx1, {
    type:'bar',
    data:{ labels: months.length?months:['Sin datos'], datasets:[{ label:'Ingresos', data: months.length?months.map(m=>monthMap[m]):[0], backgroundColor:'#FB6204', borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false}}, y:{beginAtZero:true} } }
  });

  const ctx2 = document.getElementById('chart-estado').getContext('2d');
  if(chartEstado) chartEstado.destroy();
  chartEstado = new Chart(ctx2, {
    type:'doughnut',
    data:{ labels:['En inventario','Vendido','Agotado'], datasets:[{ data:[
      productos.filter(p=>p.estado==='inventario').length, vendidos.length, agotados
    ], backgroundColor:['#049459','#468AC9','#C34804'] }] },
    options:{ responsive:true, maintainAspectRatio:false }
  });

  const ctx3 = document.getElementById('chart-tipo').getContext('2d');
  if(chartTipo) chartTipo.destroy();
  chartTipo = new Chart(ctx3, {
    type:'doughnut',
    data:{ labels:['Pines vendidos','Stickers vendidos'], datasets:[{ data:[
      vendidos.filter(p=>p.tipo==='pin').length, vendidos.filter(p=>p.tipo==='sticker').length
    ], backgroundColor:['#FB6204','#ED5399'] }] },
    options:{ responsive:true, maintainAspectRatio:false }
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
  const rows = [['Tipo','Nombre','Etiqueta','Color','Cantidad','Costo compra','Precio venta','Estado','Fecha compra','Fecha venta','Bazar venta','Ingreso extra','Notas']];
  DB.productos.forEach(p => {
    const etiqueta = DB.etiquetas.find(t=>t.id===p.etiquetaId);
    const bazar = DB.bazares.find(b=>b.id===p.bazarVentaId);
    rows.push([p.tipo, p.nombre, etiqueta?etiqueta.nombre:'', p.color, p.cantidad, p.costoCompra, p.precioVenta, ESTADOS[p.estado], p.fechaCompra||'', p.fechaVenta||'', bazar?bazar.nombre:'', p.ingresoExtra||0, (p.notas||'').replace(/\n/g,' ')]);
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

  // Navegación
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

  // Búsqueda global (filtra inventario si estamos en pin/sticker)
  document.getElementById('global-search').addEventListener('input', () => {
    if(currentPage==='pin' || currentPage==='sticker') renderInventoryGrid(currentPage);
  });

  // Bazar activo (header)
  document.getElementById('bazar-activo-select').addEventListener('change', e => {
    DB.bazarActivoId = e.target.value || null; saveDB();
  });
  document.getElementById('header-bazar-add').addEventListener('click', () => openBazarModal(null));

  // Dark mode + backup menu
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

  // Modales genéricos
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

  // Cotizador
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

  // Producto nuevo
  document.querySelectorAll('#np-type-toggle .type-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => setNpTipo(btn.dataset.tipo));
  });
  document.getElementById('np-estado').addEventListener('change', e => toggleVentaFields(e.target, 'np-venta-fields'));
  document.getElementById('np-form').addEventListener('submit', submitNuevoProducto);

  // Inventario: botones "+ Nuevo" y filtros por tipo
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

  // Modal producto
  document.getElementById('pm-estado').addEventListener('change', e => toggleVentaFields(e.target, 'pm-venta-fields'));
  document.getElementById('pm-save-btn').addEventListener('click', saveProductModal);
  document.getElementById('pm-delete-btn').addEventListener('click', deleteProductFromModal);

  // Etiquetas
  document.getElementById('tag-add-btn').addEventListener('click', addEtiqueta);

  // Bazares
  document.getElementById('bazar-add-btn').addEventListener('click', () => openBazarModal(null));
  document.getElementById('bm-save-btn').addEventListener('click', saveBazarModal);

  // Ajustes
  document.getElementById('cfg-save-btn').addEventListener('click', saveAjustes);
});
