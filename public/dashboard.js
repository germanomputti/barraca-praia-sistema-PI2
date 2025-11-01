// =========================================================
// DASHBOARD.JS — cuida exclusivamente da tela analise.html
// =========================================================

// Exibe mensagens de depuração visíveis
function logDebug(msg) {
  const box = document.getElementById("debug");
  if (box) box.innerHTML += msg + "<br>";
  console.log(msg);
}
// mensagem de criacao de DB
function seedPrint(msg) {
  const box = document.getElementById("seedLog");
  box.style.display = "block";
  box.textContent += msg + "\n";
  box.scrollTop = box.scrollHeight;
}

// ============================================================
// 🔹 FUNÇÃO PARA BUSCAR PRODUTOS (para o filtro da análise)
// ============================================================
async function fetchProductsForAnalysis() {
  try {
    const resp = await fetch('/api/products');
    const data = await resp.json();
    console.log("✅ Produtos carregados para análise:", data.length);
    return data;
  } catch (e) {
    console.error("❌ Erro ao carregar produtos para análise:", e);
    return [];
  }
}
async function loadAnalysis() {
  try {
    logDebug("🔍 Carregando pedidos para análise...");
    const resp = await fetch('/api/pedidos');
    const pedidos = await resp.json();
    logDebug("✅ Pedidos recebidos: " + pedidos.length);

    if (!pedidos || pedidos.length === 0) {
      logDebug("⚠️ Nenhum pedido encontrado.");
      return;
    }

    // Mostra JSON de debug (opcional)
    logDebug("<pre style='font-size:12px;background:#eee;padding:10px;'>" + JSON.stringify(pedidos.slice(0, 2), null, 2) + "</pre>");

    // Aguarda Chart.js carregar
    if (typeof Chart === "undefined") {
      logDebug("⚠️ Chart.js ainda não disponível. Aguardando...");
      setTimeout(loadAnalysis, 800);
      return;
    }

    // ========================================================
    // 🔹 Cria seletor de produtos dinamicamente
    // ========================================================
// ========================================================
// 🔹 Cria seletor de produtos dinamicamente
// ========================================================
const pf = document.getElementById('productFilter');
if (!pf) {
  console.error("❌ Elemento #productFilter não encontrado no DOM!");
} else {

  // pega direto do banco!
  const produtos = await fetch("/api/products").then(r=>r.json());
  console.log("📦 Produtos retornados:", produtos);

  pf.innerHTML = '<option value="__ALL__" selected>Todos os produtos</option>';

  // nomes únicos
  const nomesUnicos = [...new Set(produtos.map(p => p.name))].sort();
  console.log("🧾 Nomes únicos:", nomesUnicos);

  nomesUnicos.forEach(nome => {
    const opt = document.createElement('option');
    opt.value = nome;
    opt.textContent = nome;
    pf.appendChild(opt);
  });

  // muda o filtro
  pf.addEventListener('change', () => {
    const produtoSelecionado = pf.value;
    console.log("🎯 Produto selecionado:", produtoSelecionado);
    renderCharts(pedidos, produtoSelecionado);
  });
}

    // ========================================================
// 🔹 Cria seletor de ano dinamicamente
// ========================================================
const yearSelect = document.getElementById("yearFilter");
if (yearSelect) {
  const anosUnicos = [
    ...new Set(pedidos.map(p => new Date(p.data_hora).getFullYear()))
  ].sort((a, b) => b - a); // ordena decrescente

  // Limpa e recria opções
  yearSelect.innerHTML = '<option value="__ALL__">Todos os anos</option>';
  anosUnicos.forEach(ano => {
    const opt = document.createElement("option");
    opt.value = ano;
    opt.textContent = ano;
    yearSelect.appendChild(opt);
  });

  // Atualiza gráficos ao trocar o ano
  yearSelect.onchange = () => renderCharts(pedidos);
}
    // ========================================================
    // 🔹 Renderiza os gráficos
    // ========================================================
    renderCharts(pedidos);


  // ============================================================
// 📅 Novo formato: uma linha por dia, agregando todos os pedidos
// ============================================================
const tabela = document.getElementById('histTable');
const tbody = tabela ? tabela.querySelector('tbody') : null;

if (tbody) {
  tbody.innerHTML = '';

  const groupedByDate = {};
  pedidos.forEach(p => {
    const data = p.data_hora.slice(0, 10);
    groupedByDate[data] = groupedByDate[data] || [];
    groupedByDate[data].push(p);
  });

  Object.keys(groupedByDate)
  .sort((a, b) => new Date(b) - new Date(a)) // ← ordena por data DESC (mais recente primeiro)
  .forEach(data => {
    const pedidosDoDia = groupedByDate[data];
      const produtosResumo = {};

      pedidosDoDia.forEach(p => {
        (p.items || []).forEach(it => {
          const key = `${it.product_name} (${it.option_name})`;
          produtosResumo[key] = (produtosResumo[key] || 0) + it.quantidade;
        });
      });

      const catChuva = pedidosDoDia[0].chuva_categoria || '-';
      const catTemp = pedidosDoDia[0].temp_categoria || '-';

      const [y, m, d] = data.split('-').map(Number);
const dtLocal = new Date(y, m - 1, d);

const tr = document.createElement('tr');
tr.innerHTML = `
  <td>${dtLocal.toLocaleDateString('pt-BR')}</td>
  <td>${Object.entries(produtosResumo).map(([nome, qtd]) => `${nome} x${qtd}`).join('<br>')}</td>
  <td>${catChuva}</td>
  <td>${catTemp}</td>
`;
tbody.appendChild(tr);
    });

  console.log(`✅ Histórico preenchido com ${Object.keys(groupedByDate).length} dias.`);
}
  } catch (e) {
    logDebug("❌ Erro ao carregar análise: " + e.message);
  }

}
// Função que cria os 3 gráficos principais


function renderCharts(pedidos) {
  logDebug("🎨 Renderizando gráficos...");

  // 🧠 Lê seletores
  const productSel = document.getElementById("productFilter")?.value || "__ALL__";
  const yearSel = document.getElementById("yearFilter")?.value || "__ALL__";

  // 🔍 Aplica filtros de produto e ano
  const pedidosFiltrados = pedidos.filter(p => {
    const ano = new Date(p.data_hora).getFullYear();
    const produtoOk =
      productSel === "__ALL__" ||
      (p.items || []).some(i => i.product_name === productSel);
    const anoOk = yearSel === "__ALL__" || ano.toString() === yearSel;
    return produtoOk && anoOk;
  });

  // 🚨 Caso não haja dados após o filtro
  if (!pedidosFiltrados.length) {
    logDebug("⚠️ Nenhum pedido encontrado com os filtros atuais.");
    const ctxs = ["chart1", "chart2", "chart3"];
    ctxs.forEach(id => {
      const c = document.getElementById(id)?.getContext("2d");
      if (c) {
        c.clearRect(0, 0, c.canvas.width, c.canvas.height);
        c.font = "16px Arial";
        c.fillStyle = "#666";
        c.fillText("Nenhum dado para exibir", 30, 50);
      }
    });
    return;
  }

  // ========== 1️⃣ VENDAS POR MÊS ==========
  // ---------- substitua o bloco do chart1 por este ----------
const mesesNome = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez"
];

// monta byMonth usando apenas pedidosFiltrados
const byMonth = {};
pedidosFiltrados.forEach(p => {
  const dt = new Date(p.data_hora);
  const mesIdx = dt.getMonth(); // 0..11
  (p.items || []).forEach(it => {
    if (productSel === "__ALL__" || it.product_name === productSel) {
      byMonth[mesIdx] = (byMonth[mesIdx] || 0) + (it.quantidade || 0);
    }
  });
});

// transforma em arrays ordenadas por mês (0..11)
const monthKeys = Object.keys(byMonth).map(k => Number(k)).sort((a,b)=>a-b);
const labels1 = monthKeys.map(m => mesesNome[m]);
const data1 = monthKeys.map(m => byMonth[m]);

const ctx1 = document.getElementById("chart1")?.getContext("2d");
if (ctx1) {
  if (window.chart1 && typeof window.chart1.destroy === "function") {
    try { window.chart1.destroy(); } catch(e){console.warn(e)}
  }

  window.chart1 = new Chart(ctx1, {
    type: "line",
    data: {
      labels: labels1,
      datasets: [{
        label: productSel === "__ALL__" ? "Todos os produtos" : productSel,
        data: data1,
        fill: false,
        borderColor: "#0077B6",
        backgroundColor: "#0077B6",
        tension: 0.25,
        pointRadius: 6,
        pointHoverRadius: 9,
        pointHitRadius: 14   // aumenta área de hit do ponto
      }]
    },
    options: {
      responsive: true,
      interaction: {
        mode: 'nearest',
        intersect: true   // exige estar sobre o ponto (mas hit radius ajuda)
      },
      plugins: {
        title: { display: true, text: "📈 Vendas por mês" },
        tooltip: { enabled: false },
        legend: { display: false }
      },
      onHover: (evt, activeEls, chart) => {
  const elset = activeEls && activeEls.length
    ? activeEls
    : chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);

  if (elset && elset.length) {
    const idx = elset[0].index;
    const monthIndex = monthKeys[idx];
    const productSelLocal = document.getElementById("productFilter")?.value || "__ALL__";

    // 🔹 Filtra pedidos daquele mês
    const filtrados = pedidos.filter(p => {
      const dt = new Date(p.data_hora);
      return dt.getMonth() === monthIndex;
    });

    // 🔹 Monta resumo por subtipo
    const resumo = {};
    filtrados.forEach(p => {
      (p.items || []).forEach(it => {
        if (productSelLocal !== "__ALL__" && it.product_name !== productSelLocal) return;
        const key = `${it.product_name} (${it.option_name})`;
        resumo[key] = (resumo[key] || 0) + (it.quantidade || 0);
      });
    });

    const resumoHTML = Object.entries(resumo)
      .map(([k, v]) => `<li>${k}: <strong>${v}</strong></li>`)
      .join("") || "<li>Nenhum item</li>";

    const clientX =
      evt.native?.clientX ??
      (evt.x ? evt.chart?.canvas?.getBoundingClientRect().left + evt.x : window.innerWidth / 2);
    const clientY =
      evt.native?.clientY ??
      (evt.y ? evt.chart?.canvas?.getBoundingClientRect().top + evt.y : window.innerHeight / 2);

    // 🔹 Passa pedidos reais (filtrados) para contar corretamente no popup
    showHoverPopupDetailed(
      `📅 ${mesesNome[monthIndex]} — Detalhes por subtipo`,
      resumoHTML,
      filtrados, // ← agora passamos o array de pedidos!
      "mes",
      clientX,
      clientY,
      productSelLocal
    );
  } else {
    hideHoverPopupDetailed();
  }
},
      onLeave: () => hideHoverPopupDetailed(),
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Quantidade" } },
        x: { title: { display: true, text: "Mês" } }
      }
    }
  });
}
  // ========== 2️⃣ VENDAS POR CHUVA ==========
  const byChuva = {};
  pedidosFiltrados.forEach(p => {
    const cat = p.chuva_categoria || "Sem dado";
    (p.items || []).forEach(it => {
      if (productSel === "__ALL__" || it.product_name === productSel) {
        byChuva[cat] = (byChuva[cat] || 0) + (it.quantidade || 0);
      }
    });
  });

  const labels2 = Object.keys(byChuva);
  const data2 = labels2.map(l => byChuva[l]);
  const ctx2 = document.getElementById("chart2")?.getContext("2d");
// ========== 2️⃣ Gráfico: Vendas por chuva (hover popup preciso) ==========
// ========== 2️⃣ Gráfico: Vendas por chuva (hover por coluna) ==========
if (ctx2) {
  if (window.chart2 && typeof window.chart2.destroy === "function") window.chart2.destroy();
  window.chart2 = new Chart(ctx2, {
    type: "bar",
    data: {
      labels: labels2,
      datasets: [{
        label: "Por chuva",
        data: data2,
        backgroundColor: "#00B4D8"
      }]
    },
    options: {
      plugins: { title: { display: true, text: "🌧️ Vendas por categoria de chuva" }, legend: { display: false }, tooltip: { enabled: false } },
      interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true } },
      // onHover usando a API getElementsAtEventForMode para pegar a coluna inteira
      onHover: (evt, activeEls, chart) => {
        try {
          const elset = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false);
          if (elset && elset.length) {
            const idx = elset[0].index;
            const categoria = labels2[idx];

            // client coords robustos
            const clientX = evt.native?.clientX ?? (evt.x ? (evt.chart?.canvas?.getBoundingClientRect().left + evt.x) : 0);
            const clientY = evt.native?.clientY ?? (evt.y ? (evt.chart?.canvas?.getBoundingClientRect().top + evt.y) : 0);

            const productSelLocal = document.getElementById("productFilter")?.value || "__ALL__";
            showHoverPopupDetailed(`🌧️ Categoria de chuva: ${categoria}`, categoria, pedidosFiltrados, "chuva", clientX, clientY, productSelLocal);
          } else {
            hideHoverPopupDetailed();
          }
        } catch (e) {
          // fallback: esconde popup em caso de erro
          hideHoverPopupDetailed();
        }
      },
      onLeave: () => hideHoverPopupDetailed()
    }
  });
}

  // ========== 3️⃣ VENDAS POR TEMPERATURA ==========
  const byTemp = {};
  pedidosFiltrados.forEach(p => {
    const cat = p.temp_categoria || "Sem dado";
    (p.items || []).forEach(it => {
      if (productSel === "__ALL__" || it.product_name === productSel) {
        byTemp[cat] = (byTemp[cat] || 0) + (it.quantidade || 0);
      }
    });
  });

  const labels3 = Object.keys(byTemp);
  const data3 = labels3.map(l => byTemp[l]);
  const ctx3 = document.getElementById("chart3")?.getContext("2d");

 // ========== 3️⃣ Gráfico: Vendas por temperatura (hover popup preciso) ==========
// ========== 3️⃣ Gráfico: Vendas por temperatura (hover por coluna) ==========
if (ctx3) {
  if (window.chart3 && typeof window.chart3.destroy === "function") window.chart3.destroy();
  window.chart3 = new Chart(ctx3, {
    type: "bar",
    data: {
      labels: labels3,
      datasets: [{
        label: "Por temperatura",
        data: data3,
        backgroundColor: "#FF6B6B"
      }]
    },
    options: {
      plugins: { title: { display: true, text: "🌡️ Vendas por categoria de temperatura" }, legend: { display: false }, tooltip: { enabled: false } },
      interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true } },
      onHover: (evt, activeEls, chart) => {
        try {
          const elset = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false);
          if (elset && elset.length) {
            const idx = elset[0].index;
            const categoria = labels3[idx];

            const clientX = evt.native?.clientX ?? (evt.x ? (evt.chart?.canvas?.getBoundingClientRect().left + evt.x) : 0);
            const clientY = evt.native?.clientY ?? (evt.y ? (evt.chart?.canvas?.getBoundingClientRect().top + evt.y) : 0);

            const productSelLocal = document.getElementById("productFilter")?.value || "__ALL__";
            showHoverPopupDetailed(`🌡️ Categoria de temperatura: ${categoria}`, categoria, pedidosFiltrados, "temperatura", clientX, clientY, productSelLocal);
          } else {
            hideHoverPopupDetailed();
          }
        } catch (e) {
          hideHoverPopupDetailed();
        }
      },
      onLeave: () => hideHoverPopupDetailed()
    }
  });
}


// 🔧 Garante que o popup desapareça ao sair do gráfico
['chart1', 'chart2', 'chart3'].forEach(id => {
  const canvas = document.getElementById(id);
  if (canvas) {
    canvas.addEventListener('mouseleave', () => {
      hideHoverPopupDetailed();
    });
  }
});
  logDebug("✅ Gráficos renderizados com sucesso!");
}


// destaca temporariamente um ponto do gráfico (datasetIndex, pointIndex)
function highlightChartPoint(chart, datasetIndex, pointIndex) {
  if (!chart) return;
  // guarda valores originais
  const ds = chart.data.datasets[datasetIndex];
  const origRadius = ds.pointRadius;
  ds.pointRadius = ds.pointRadius || [];
  // se pointRadius for único, converte para array
  if (!Array.isArray(ds.pointRadius)) {
    const r = ds.pointRadius;
    ds.pointRadius = new Array(chart.data.labels.length).fill(r);
  }
  // aumenta o ponto clicado
  ds.pointRadius[pointIndex] = (ds.pointRadius[pointIndex] || 6) + 6;
  chart.update();

  // volta ao normal em 900ms
  setTimeout(() => {
    ds.pointRadius[pointIndex] = (ds.pointRadius[pointIndex] || 12) - 6;
    chart.update();
  }, 900);
}


// Mostra popup genérico com detalhes por categoria (mês, chuva ou temperatura)
function showOrdersForCategory(titulo, categoria, pedidos, tipo = "categoria") {
  // filtra os pedidos do tipo selecionado
  const filtrados = pedidos.filter(p => {
    if (tipo === "mês") {
      const mes = new Date(p.data_hora).getMonth();
      return mes === categoria;
    } else if (tipo === "chuva") {
      return (p.chuva_categoria || "Sem dado") === categoria;
    } else if (tipo === "temperatura") {
      return (p.temp_categoria || "Sem dado") === categoria;
    }
    return false;
  });

  // conta produtos no conjunto filtrado
  const produtosResumo = {};
  filtrados.forEach(p => {
    (p.items || []).forEach(it => {
      const key = `${it.product_name} (${it.option_name})`;
      produtosResumo[key] = (produtosResumo[key] || 0) + it.quantidade;
    });
  });

  // monta conteúdo
  const produtosHTML = Object.entries(produtosResumo)
    .map(([nome, qtd]) => `<li>${nome}: <strong>${qtd}</strong></li>`)
    .join("");

  // cria caixa flutuante (popup)
  const box = document.createElement("div");
  box.className = "popup-detalhes";
  box.innerHTML = `
    <h3>${titulo}</h3>
    <p><strong>${filtrados.length}</strong> pedidos encontrados</p>
    <ul>${produtosHTML || "<li>Nenhum item encontrado.</li>"}</ul>
    <button class="btn alt" onclick="this.parentElement.remove()">Fechar</button>
  `;
  Object.assign(box.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#fff",
    border: "2px solid #0077B6",
    borderRadius: "10px",
    padding: "20px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    zIndex: 1000,
    maxWidth: "400px",
    textAlign: "left"
  });
  document.body.appendChild(box);
}
// === Popup flutuante para hover (posicionamento preciso + respeita filtro de produto) ===
// === Popup flutuante para hover (preciso: posicionamento por clientX/clientY + respeita produto) ===
// popup flutuante robusto — funciona para tipo = "mes", "chuva", "temperatura"
let hoverPopupEl = null;
let hoverPopupTimer = null;
function showHoverPopupDetailed(titulo, categoria, pedidos, tipo, clientX, clientY, productSel) {
  // limpa timeout anterior (evita fechamento prematuro)
  if (hoverPopupTimer) {
    clearTimeout(hoverPopupTimer);
    hoverPopupTimer = null;
  }

  // --- obtém base de pedidos: pode ser array passado, ou usa pedidosGlobais como fallback
  let base = Array.isArray(pedidos) ? pedidos.slice() : (Array.isArray(pedidosGlobais) ? pedidosGlobais.slice() : []);

  // --- aplica filtro por categoria quando necessário (mes/chuva/temperatura)
  if (tipo === "mes") {
    // se categoria for mês (string ou index), já foi tratado pelo chamador — assume base já contém apenas esse mês
    // não faz nada adicional aqui
  } else if (tipo === "chuva") {
    base = base.filter(p => (p.chuva_categoria || "Sem dado") === categoria);
  } else if (tipo === "temperatura") {
    base = base.filter(p => (p.temp_categoria || "Sem dado") === categoria);
  } else if (tipo === "linha") {
    // caso especial: chamador passou pedidosFiltradosAno e categoria é nome do mês, mas chamador já filtrou
  }

  // --- aplica filtro de produto (se houver)
  const produtoSelecionado = productSel || document.getElementById("productFilter")?.value || "__ALL__";
  const baseComProduto = produtoSelecionado === "__ALL__"
    ? base
    : base.filter(p => (p.items || []).some(it => it.product_name === produtoSelecionado));

  // --- total de pedidos: conta pedidos que contêm o produto selecionado (ou todos, se __ALL__)
  const totalPedidos = baseComProduto.length;

  // --- monta resumo por subtipo (product + option)
  const resumo = {};
  baseComProduto.forEach(p => {
    (p.items || []).forEach(it => {
      if (produtoSelecionado !== "__ALL__" && it.product_name !== produtoSelecionado) return;
      const key = `${it.product_name} (${it.option_name})`;
      resumo[key] = (resumo[key] || 0) + (it.quantidade || 0);
    });
  });

  const resumoHTML = Object.entries(resumo)
    .map(([k, v]) => `<li>${k}: <strong>${v}</strong></li>`)
    .join("") || "<li>Nenhum item</li>";

  // cria ou reutiliza elemento popup
  if (!hoverPopupEl) {
    hoverPopupEl = document.createElement("div");
    hoverPopupEl.className = "hover-popup-detalhe";
    document.body.appendChild(hoverPopupEl);
  }

  hoverPopupEl.innerHTML = `
    <h4 style="margin:0 0 6px 0;">${titulo}</h4>
    <div style="font-size:13px; color:#333; margin-bottom:6px;">
      <strong>${totalPedidos}</strong> pedidos
    </div>
    <ul style="margin:0; padding-left:14px;">${resumoHTML}</ul>
  `;

  // posiciona popup (mesma lógica que já tinha)
  const pad = 12;
  const maxWidth = 360;
  hoverPopupEl.style.display = "block";
  hoverPopupEl.style.opacity = "1";
  hoverPopupEl.style.maxWidth = maxWidth + "px";

  const pageW = window.innerWidth;
  const pageH = window.innerHeight;
  let left = (clientX != null) ? clientX + pad : (pageW / 2 - maxWidth / 2);
  let top = (clientY != null) ? clientY - 30 : (pageH / 2 - 80);
  if (left + maxWidth + 10 > pageW) left = (clientX != null) ? clientX - maxWidth - pad : pageW - maxWidth - 10;
  if (top + 150 > pageH) top = pageH - 170;
  if (top < 10) top = 10;

  hoverPopupEl.style.left = left + "px";
  hoverPopupEl.style.top = top + "px";

  // segurança extra: fecha popup se mouse sair da janela
  window.onmouseleave = () => hideHoverPopupDetailed();
}

// ------------------------------------------------------------
// Função para esconder o popup de detalhes (todas as telas)
// ------------------------------------------------------------
function hideHoverPopupDetailed() {
  if (!hoverPopupEl) return;
  if (hoverPopupTimer) {
    clearTimeout(hoverPopupTimer);
    hoverPopupTimer = null;
  }

  // Faz o popup desaparecer rapidamente
  hoverPopupEl.style.transition = "opacity 0.12s ease-out";
  hoverPopupEl.style.opacity = "0";

  hoverPopupTimer = setTimeout(() => {
    try {
      hoverPopupEl.style.display = "none";
    } catch (e) {}
    hoverPopupTimer = null;
  }, 120);
}



// ============================================================
// 🔍 Mostra pedidos detalhados ao clicar em um mês
// ============================================================
async function showOrdersForMonth(nomeMes) {
  // Remove popup antigo (se existir)
  alert(`📅 Detalhes de ${mesSelecionado}: ${pedidosFiltrados.length} pedidos.`);
  const existente = document.getElementById("detalhesMes");
  if (existente) existente.remove();

  // Mapeamento de nome do mês → número (0 = janeiro)
  const meses = {
    Jan: 0, Fev: 1, Mar: 2, Abr: 3, Mai: 4, Jun: 5,
    Jul: 6, Ago: 7, Set: 8, Out: 9, Nov: 10, Dez: 11
  };
  const mesNumero = meses[nomeMes];
  if (mesNumero === undefined) return;

  // Busca todos os pedidos
  const resp = await fetch('/api/pedidos');
  const pedidos = await resp.json();

  // Filtra pedidos do mês selecionado
  const filtrados = pedidos.filter(p => new Date(p.data_hora).getMonth() === mesNumero);

  // Se não houver pedidos, mostra mensagem
  if (filtrados.length === 0) {
    alert(`Nenhum pedido encontrado para ${nomeMes}.`);
    return;
  }

  // Cria conteúdo HTML da janela
  let html = `
    <div id="detalhesMes" class="popup-mes">
      <h2>📅 Pedidos de ${nomeMes}</h2>
      <button onclick="document.getElementById('detalhesMes').remove()" class="btn danger" style="float:right;">❌ Fechar</button>
      <table>
        <thead>
          <tr><th>Data/Hora</th><th>Mesa</th><th>Cliente</th><th>Itens</th></tr>
        </thead>
        <tbody>
          ${filtrados
            .map(
              (p) => `
              <tr>
                <td>${new Date(p.data_hora).toLocaleString("pt-BR")}</td>
                <td>${p.numero_mesa}</td>
                <td>${p.cliente || "-"}</td>
                <td>${(p.items || [])
                  .map((it) => `${it.product_name} (${it.option_name}) x${it.quantidade}`)
                  .join("<br>")}
                </td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  // Insere logo abaixo dos gráficos
  const container = document.querySelector(".graficos-container");
  container.insertAdjacentHTML("afterend", html);
}
// ============================================================
// 🔹 Alternar visibilidade do histórico de pedidos
// ============================================================
function setupHistoricoToggle() {
  const btn = document.getElementById('toggleHistorico');
  const tabela = document.getElementById('histTable');

  if (!btn || !tabela) {
    console.warn("⚠️ Elementos de histórico não encontrados no DOM.");
    return;
  }

  // Começa oculta
  tabela.style.display = 'none';

  btn.addEventListener('click', () => {
    const visivel = tabela.style.display === 'block';
    tabela.style.display = visivel ? 'none' : 'block';
    btn.textContent = visivel
      ? '📋 Mostrar histórico de pedidos'
      : '❌ Ocultar histórico de pedidos';
    console.log(`📋 Histórico agora está ${visivel ? 'oculto' : 'visível'}.`);
  });

  console.log("✅ Alternância do histórico configurada.");
}


// ============================================================
// 🔹 Função para ordenar a tabela de histórico por data
// ============================================================
function setupTableSorting() {
  const thData = document.getElementById('thData');
  const tabela = document.getElementById('histTable');
  if (!thData || !tabela) return;

  let ordemAsc = true; // estado inicial

  thData.addEventListener('click', () => {
    const tbody = tabela.querySelector('tbody');
    const linhas = Array.from(tbody.querySelectorAll('tr'));

    // ordena as linhas conforme a data na primeira coluna
    linhas.sort((a, b) => {
      const dataA = new Date(a.cells[0].textContent.split('/').reverse().join('-'));
      const dataB = new Date(b.cells[0].textContent.split('/').reverse().join('-'));
      return ordemAsc ? dataA - dataB : dataB - dataA;
    });

    // recria o corpo da tabela com as linhas ordenadas
    tbody.innerHTML = '';
    linhas.forEach(l => tbody.appendChild(l));

    // alterna ordem para o próximo clique
    ordemAsc = !ordemAsc;
    thData.textContent = ordemAsc ? '📅 Data ⬆️' : '📅 Data ⬇️';
  });

  console.log("✅ Ordenação por data configurada.");
}


// adicionando funcao para limpar banco de dados e criar novos dados fake
async function clearDB(){
  const pin = prompt("Digite o PIN de administrador:");
  if(!pin) return;
  
  const r = await fetch('/admin/clear-db',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({pin})
  });
  const j = await r.json();
  alert(j.msg || "OK");
  location.reload();
}

function seedPrint(msg) {
  const box = document.getElementById("seedLog");
  if (!box) return;
  box.style.display = "block";
  box.textContent += msg;
  if (!msg.endsWith("\n")) box.textContent += "\n";
  box.scrollTop = box.scrollHeight;
}

async function runSeed() {
  const pin = prompt("Digite o PIN de administrador:");
  if (!pin) return;

  const box = document.getElementById("seedLog");
  if (box) {
    box.style.display = "block";
    box.textContent = "";
  }
  seedPrint("⏳ Iniciando seed...(dashboard");

  try {
    const resp = await fetch("/admin/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });

    // Se o servidor devolveu erro imediatamente (ex.: PIN incorreto)
    if (!resp.ok && resp.body == null) {
      const txt = await resp.text();
      seedPrint("❌ Erro: " + txt);
      return;
    }

    // Streaming
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    let allText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      allText += chunk;
      seedPrint(chunk);

      if (chunk.includes("Finalizado!")) {
        setTimeout(() => location.reload(), 1000);
      }
    }

    // Caso o servidor responda 401 com corpo em texto (PIN incorreto via stream)
    if (!resp.ok) {
      seedPrint("❌ Erro HTTP " + resp.status);
      return;
    }
  } catch (e) {
    seedPrint("❌ Falha na requisição: " + e.message);
  }
}

// Garante que a função esteja realmente no escopo global para o onclick do HTML
window.runSeed = runSeed;
// ============================================================
// 🧭 Inicialização segura — garante ordem correta de execução
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  console.log("✅ Página de análise carregada (DOMContentLoaded).");

  await new Promise(r => setTimeout(r, 800));
  await loadAnalysis();
  setupHistoricoToggle();
  setupTableSorting(); // 🔹 adiciona ordenação por data
});


