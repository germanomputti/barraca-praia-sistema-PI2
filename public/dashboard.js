// =========================================================
// DASHBOARD.JS — cuida exclusivamente da tela analise.html
// =========================================================

// Exibe mensagens de depuração visíveis
function logDebug(msg) {
  const box = document.getElementById("debug");
  if (box) box.innerHTML += msg + "<br>";
  console.log(msg);
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
    const pf = document.getElementById('productFilter');
    if (!pf) {
      console.error("❌ Elemento #productFilter não encontrado no DOM!");
    } else {
      const produtos = await fetchProductsForAnalysis();
      console.log("📦 Produtos retornados:", produtos);

      pf.innerHTML = '<option value="__ALL__" selected>Todos os produtos</option>';

      const nomesUnicos = [...new Set(produtos.map(p => p.name))].sort();
      console.log("🧾 Nomes únicos:", nomesUnicos);

      nomesUnicos.forEach(nome => {
        const opt = document.createElement('option');
        opt.value = nome;
        opt.textContent = nome;
        pf.appendChild(opt);
      });

      // 🔹 Atualiza gráficos ao trocar o filtro
      pf.addEventListener('change', () => {
        const produtoSelecionado = pf.value;
        console.log("🎯 Produto selecionado:", produtoSelecionado);
        renderCharts(pedidos, produtoSelecionado);
      });
    }

    // ========================================================
    // 🔹 Renderiza os gráficos
    // ========================================================
    renderCharts(pedidos);

    // ========================================================
    // 🔹 Preenche tabela de histórico agregada por dia
    // ========================================================
    const tbody = document.querySelector('#histTable tbody');
    if (tbody) {
      tbody.innerHTML = '';

      const groupedByDate = {};
      pedidos.forEach(p => {
        const data = p.data_hora.slice(0, 10);
        groupedByDate[data] = groupedByDate[data] || [];
        groupedByDate[data].push(p);
      });

      Object.keys(groupedByDate)
        .sort()
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

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${new Date(data).toLocaleDateString('pt-BR')}</td>
            <td>${Object.entries(produtosResumo)
              .map(([nome, qtd]) => `${nome} x${qtd}`)
              .join('<br>')}</td>
            <td>${catChuva}</td>
            <td>${catTemp}</td>
          `;
          tbody.appendChild(tr);
        });
    }

  } catch (e) {
    logDebug("❌ Erro ao carregar análise: " + e.message);
  }
}
// Função que cria os 3 gráficos principais


  function renderCharts(pedidos, selectedProduct = null) {
  logDebug("🎨 Renderizando gráficos...");

  // Usa o valor do seletor ou o que for passado via argumento
  const productSel = selectedProduct || document.getElementById("productFilter")?.value || "__ALL__";
  // ========== 1️⃣ VENDAS POR MÊS ==========
  const byMonth = {};
  pedidos.forEach(p => {
    const mes = p.data_hora ? p.data_hora.slice(0, 7) : "Desconhecido";
    (p.items || []).forEach(it => {
      if (productSel === "__ALL__" || it.product_name === productSel) {
        byMonth[mes] = (byMonth[mes] || 0) + (it.quantidade || 0);
      }
    });
  });

  const labels1 = Object.keys(byMonth);
  const data1 = labels1.map(l => byMonth[l]);
  const ctx1 = document.getElementById("chart1")?.getContext("2d");

  if (ctx1) {
    if (window.chart1 && typeof window.chart1.destroy === "function") window.chart1.destroy();
    window.chart1 = new Chart(ctx1, {
      type: "bar",
      data: { labels: labels1, datasets: [{ label: "Vendas por mês", data: data1, backgroundColor: "#219EBC" }] },
      options: { scales: { y: { beginAtZero: true } } }
    });
  }

  // ========== 2️⃣ VENDAS POR CHUVA ==========
  const byChuva = {};
  pedidos.forEach(p => {
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

  if (ctx2) {
    if (window.chart2 && typeof window.chart2.destroy === "function") window.chart2.destroy();
    window.chart2 = new Chart(ctx2, {
      type: "bar",
      data: { labels: labels2, datasets: [{ label: "Por chuva", data: data2, backgroundColor: "#00B4D8" }] },
      options: { scales: { y: { beginAtZero: true } } }
    });
  }

  // ========== 3️⃣ VENDAS POR TEMPERATURA ==========
  const byTemp = {};
  pedidos.forEach(p => {
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

  if (ctx3) {
    if (window.chart3 && typeof window.chart3.destroy === "function") window.chart3.destroy();
    window.chart3 = new Chart(ctx3, {
      type: "bar",
      data: { labels: labels3, datasets: [{ label: "Por temperatura", data: data3, backgroundColor: "#FF6B6B" }] },
      options: { scales: { y: { beginAtZero: true } } }
    });
  }

  logDebug("✅ Gráficos renderizados com sucesso!");
}

// ============================================================
// 🔹 Alternar visibilidade do histórico de pedidos
// ============================================================
function setupHistoricoToggle() {
  const btn = document.getElementById('toggleHistorico');
  const tabela = document.getElementById('histTable');

  if (!btn || !tabela) return;

  btn.addEventListener('click', () => {
    const visivel = tabela.style.display === 'block';
    tabela.style.display = visivel ? 'none' : 'block';
    btn.textContent = visivel ? '📋 Mostrar histórico de pedidos' : '❌ Ocultar histórico de pedidos';
  });
}

// Garante que o botão funcione após o carregamento
window.addEventListener('load', () => {
  setupHistoricoToggle();
});


// ============================================================
// 🚀 Inicialização garantida após o DOM carregar
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  logDebug("✅ Página de análise carregada (DOM completamente pronto).");

  // Aguarda levemente para garantir que Chart.js esteja disponível
  setTimeout(async () => {
    await loadAnalysis();
  }, 800);
});