// ============================================================
// SCRIPT PRINCIPAL — Cliente e Produção
// ============================================================

const apiBase = '/api';
let productsCache = [];
let cart = [];

// ------------------------------------------------------------
// 1️⃣ AUXILIARES
// ------------------------------------------------------------
async function fetchProducts() {
  try {
    const r = await fetch(apiBase + '/products');
    productsCache = await r.json();
  } catch (e) {
    console.error("Erro ao carregar produtos:", e);
  }
}

function formatMoney(v) {
  return v.toFixed(2);
}

// ------------------------------------------------------------
// 2️⃣ TELA DO CLIENTE (CARDÁPIO E PEDIDOS)
// ------------------------------------------------------------
async function renderProductsGrid() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  await fetchProducts();
  grid.innerHTML = '';

  const grouped = {};
  productsCache.forEach(p => {
    grouped[p.name] = grouped[p.name] || [];
    grouped[p.name].push(p);
  });

  Object.keys(grouped).forEach(name => {
    const opts = grouped[name];
    let img = opts[0].image;
      if (img && img.endsWith('.svg')) img = img.replace('.svg', '.jpg');
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `<img src="${img}" alt="${name}"><h3>${name}</h3>`;

    const select = document.createElement('select');
    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = JSON.stringify({ option: o.option_name, price: o.price });
      opt.textContent = `${o.option_name} - R$ ${formatMoney(o.price)}`;
      select.appendChild(opt);
    });
    card.appendChild(select);

    // controle de quantidade
    const qdiv = document.createElement('div');
    qdiv.className = 'quant';
    const minus = document.createElement('button');
    minus.textContent = '-';
    const qty = document.createElement('span');
    qty.textContent = '1';
    const plus = document.createElement('button');
    plus.textContent = '+';
    minus.onclick = () => { let n = +qty.textContent; if (n > 1) qty.textContent = n - 1; };
    plus.onclick = () => { let n = +qty.textContent; qty.textContent = n + 1; };
    qdiv.append(minus, qty, plus);
    card.appendChild(qdiv);

    // botão adicionar
    const add = document.createElement('button');
    add.className = 'btn alt';
    add.textContent = 'Adicionar';
    add.onclick = () => {
      const sel = JSON.parse(select.value);
      addToCart(name, sel.option, sel.price, +qty.textContent);
      add.textContent = '✅ Adicionado!';
      setTimeout(() => (add.textContent = 'Adicionar'), 1000);
    };
    card.appendChild(add);
    grid.appendChild(card);
  });
}

function addToCart(product_name, option_name, price_unit, quantidade) {
  cart.push({ product_name, option_name, price_unit, quantidade });
  renderCart();
}

function renderCart() {
  const list = document.getElementById('cartList');
  const totalEl = document.getElementById('cartTotal');
  if (!list) return;
  list.innerHTML = '';
  let total = 0;
  cart.forEach((it, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `${it.product_name} (${it.option_name}) x${it.quantidade} - R$ ${formatMoney(it.price_unit * it.quantidade)}
      <button class="btn" onclick="removeFromCart(${idx})">❌</button>`;
    list.appendChild(li);
    total += it.price_unit * it.quantidade;
  });
  totalEl.textContent = formatMoney(total);
}

function removeFromCart(i) {
  cart.splice(i, 1);
  renderCart();
}

async function sendOrder() {
  const cliente = document.getElementById('cliente').value.trim();
  const mesa = document.getElementById('numero-mesa').value.trim();

  if (!cliente || !mesa) {
    alert('⚠️ Informe nome do cliente e número da mesa.');
    return;
  }
  if (cart.length === 0) {
    alert('⚠️ Carrinho vazio.');
    return;
  }

  const payload = {
    cliente,
    numero_mesa: mesa,
    items: cart.map(i => ({
      product_name: i.product_name,
      option_name: i.option_name,
      quantidade: i.quantidade,
      price_unit: i.price_unit
    }))
  };

  try {
    const resp = await fetch(apiBase + '/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error("Erro ao enviar pedido");
    const p = await resp.json();
    cart = [];
    renderCart();
    showModalPedido(p);
  } catch (e) {
    alert("❌ " + e.message);
  }
}

function showModalPedido(p) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modalContent');
  content.innerHTML = `
    <div class="pedido-confirmado">
      <h2>🎉 Pedido enviado!</h2>
      <p><strong>Nº:</strong> ${p.id}</p>
      <p><strong>Cliente:</strong> ${p.cliente}</p>
      <p><strong>Mesa:</strong> ${p.numero_mesa}</p>
      <p><strong>Data:</strong> ${new Date(p.data_hora).toLocaleString('pt-BR')}</p>
      <ul>${p.items.map(i => `<li>${i.product_name} (${i.option_name}) x${i.quantidade}</li>`).join('')}</ul>
      <button class="btn alt" id="novoPedido">Novo Pedido</button>
    </div>`;
  modal.style.display = 'flex';
  document.getElementById('novoPedido').onclick = () => {
    modal.style.display = 'none';
    document.getElementById('cliente').value = '';
    document.getElementById('numero-mesa').value = '';
  };
}
// --------------------------------------------------
// TELA DE PRODUÇÃO (com filtro e persistência local)
// --------------------------------------------------
// --------------------------------------------------
// TELA DE PRODUÇÃO (com filtro múltiplo, persistência e cores)
// --------------------------------------------------
async function loadProduction() {
  const tbody = document.querySelector('#tabelaPedidos tbody');
  if (!tbody) return;

  // lê opção(s) selecionadas (multi-select)
  const filtroEl = document.getElementById('filtroStatus');
  let filtros = [];
  if (filtroEl) {
    const selected = [...filtroEl.selectedOptions].map(opt => opt.value);
    filtros = selected.length > 0 ? selected : ['__ALL__'];
  } else {
    filtros = ['__ALL__'];
  }

  const today = new Date().toISOString().slice(0, 10);
  const resp = await fetch(apiBase + '/pedidos?date=' + today);
  const pedidos = await resp.json();

  // carrega IDs ocultos do localStorage
  const hiddenOrders = JSON.parse(localStorage.getItem('hiddenOrders') || '[]');

  tbody.innerHTML = '';

  pedidos.forEach(p => {
    // ignora se o pedido está oculto
    if (hiddenOrders.includes(p.id)) return;

    // ignora se o status não bate com o(s) filtro(s) selecionado(s)
    if (!filtros.includes('__ALL__') && !filtros.includes(p.status)) return;

    const tr = document.createElement('tr');
    tr.setAttribute('data-id', p.id);

    // monta o conteúdo da linha
    tr.innerHTML = `
      <td>${new Date(p.data_hora).toLocaleString('pt-BR')}</td>
      <td>${p.numero_mesa}</td>
      <td>${p.cliente || ''}</td>
      <td>${(p.items || []).map(it => `${it.product_name} (${it.option_name}) x${it.quantidade}`).join('<br>')}</td>
      <td>${p.status}</td>
      <td>
        <button class="btn btn-start" data-id="${p.id}">Iniciar</button>
        <button class="btn btn-finish" data-id="${p.id}">Finalizar</button>
        <button class="btn danger" data-id="${p.id}">Excluir</button>
      </td>
    `;

    // aplica cor de fundo conforme o status (fora do template string)
    if (p.status === 'Em produção') {
      tr.classList.add('status-producao');
    } else if (p.status === 'Concluído') {
      tr.classList.add('status-concluido');
    } else {
      tr.classList.add('status-aguardando');
    }

    tbody.appendChild(tr);
  });
}

// Registra handlers globais (delegation) — execute uma vez no carregamento da página
function setupProductionHandlers() {
  // filtrar ao mudar seleção
  const filtroEl = document.getElementById('filtroStatus');
  if (filtroEl) filtroEl.addEventListener('change', loadProduction);

  // botão opcional de filtrar (se existir)
  const btnFiltrar = document.getElementById('btnFiltrar');
  if (btnFiltrar) btnFiltrar.addEventListener('click', loadProduction);

  // delegação de eventos para os botões da tabela (mais robusto que onclick inline)
  document.getElementById('tabelaPedidos')?.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const row = btn.closest('tr');
    const id = row?.dataset?.id ? Number(row.dataset.id) : null;
    if (!id) return;

    if (btn.classList.contains('danger')) {
      // excluir (persistente localmente)
      removeFromView(id);
      return;
    }
    if (btn.classList.contains('btn-start')) {
      updateStatus(id, 'Em produção');
      return;
    }
    if (btn.classList.contains('btn-finish')) {
      updateStatus(id, 'Concluído');
      return;
    }
  });
}

// chama setup uma vez quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
  setupProductionHandlers();
});
// --------------------------------------------------
// FUNÇÃO DE ORDENAÇÃO DA TABELA DE PRODUÇÃO
// --------------------------------------------------
let currentSort = { column: null, asc: true };

function sortTable(column) {
  const tbody = document.querySelector('#tabelaPedidos tbody');
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr'));
  if (rows.length === 0) return;

  // Define a função de comparação
  let compare;
  if (column === 'mesa') {
    compare = (a, b) => {
      const valA = parseInt(a.children[1].textContent.trim()) || 0;
      const valB = parseInt(b.children[1].textContent.trim()) || 0;
      return valA - valB;
    };
  } else if (column === 'hora') {
    compare = (a, b) => {
      const dateA = new Date(a.children[0].textContent.trim());
      const dateB = new Date(b.children[0].textContent.trim());
      return dateA - dateB;
    };
  } else if (column === 'cliente') {
    compare = (a, b) => {
      const dateA = new Date(a.children[0].textContent.trim());
      const dateB = new Date(b.children[0].textContent.trim());
      return dateA - dateB;
    };
  }


  

  // Alterna a direção da ordenação (ASC / DESC)
  if (currentSort.column === column) currentSort.asc = !currentSort.asc;
  else {
    currentSort.column = column;
    currentSort.asc = true;
  }

  rows.sort(compare);
  if (!currentSort.asc) rows.reverse();

  // Atualiza o DOM
  tbody.innerHTML = '';
  rows.forEach(r => tbody.appendChild(r));
}

async function updateStatus(id, status) {
  await fetch(apiBase + '/pedidos/' + id + '/status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  loadProduction();
}

// --------------------------------------------------
// REMOVE PEDIDO DA VISUALIZAÇÃO (com persistência local)
// --------------------------------------------------
function removeFromView(id) {
  // remove do DOM
  const row = document.querySelector(`#tabelaPedidos tr[data-id="${id}"]`);
  if (row) row.remove();

  // salva no localStorage
  let hiddenOrders = JSON.parse(localStorage.getItem('hiddenOrders') || '[]');
  if (!hiddenOrders.includes(id)) {
    hiddenOrders.push(id);
    localStorage.setItem('hiddenOrders', JSON.stringify(hiddenOrders));
  }

  console.log(`🗑️ Pedido ${id} removido da visualização (persistente).`);
}

// ------------------------------------------------------------
// 4️⃣ INICIALIZAÇÃO
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await fetchProducts();

  if (location.pathname.includes('index.html') || location.pathname === '/' || location.pathname === '/public/') {
    await renderProductsGrid();
    renderCart();
    document.getElementById('sendOrder')?.addEventListener('click', sendOrder);
  }

  if (location.pathname.includes('producao.html')) {
    loadProduction();
    setInterval(loadProduction, 15000);
  }
});

// ============================================================
// 🔹 GARANTE QUE O MODAL INICIA ESCONDIDO
// ============================================================
window.addEventListener('load', () => {
  const modal = document.getElementById('modal');
  if (modal) {
    modal.style.display = 'none';
    modal.hidden = true;
  }

  // botão de fechar (se existir)
  const closeBtn = document.getElementById('closeModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      modal.hidden = true;
    });
  }
});



function resetHiddenOrders() {
  localStorage.removeItem('hiddenOrders');
  loadProduction();
  alert("🔁 Todos os pedidos foram restaurados na visualização!");
}