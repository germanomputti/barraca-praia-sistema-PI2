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
  
// ========== 1️⃣ VENDAS POR MÊS (AGRUPANDO POR NOME DO MÊS) ==========
const byMonth = {};
const mesesNomes = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

pedidos.forEach(p => {
  if (!p.data_hora) return;
  const date = new Date(p.data_hora);
  const mesNome = mesesNomes[date.getMonth()]; // converte número em nome
  (p.items || []).forEach(it => {
    if (productSel === "__ALL__" || it.product_name === productSel) {
      byMonth[mesNome] = (byMonth[mesNome] || 0) + (it.quantidade || 0);
    }
  });
});

// Ordena os meses na ordem correta
const labels1 = mesesNomes.filter(m => byMonth[m]);
const data1 = labels1.map(m => byMonth[m]);
// ---------- criação/atualização do chart1 (LINHA) ----------
const ctx1Elem = document.getElementById("chart1");
const ctx1 = ctx1Elem?.getContext("2d");

if (ctx1) {
  // destrói se existir
  if (window.chart1 && typeof window.chart1.destroy === "function") {
    try { window.chart1.destroy(); } catch(e) { console.warn("destroy chart1:", e); }
  }

  // produto selecionado (para label)
  const productSel = document.getElementById("productFilter")?.value || "__ALL__";
  const nomeProduto = productSel === "__ALL__" ? "Todos os produtos" : productSel;

  // cria gráfico com interação e maiores áreas de clique
  window.chart1 = new Chart(ctx1, {
    type: "line",
    data: {
      labels: labels1,
      datasets: [{
        label: nomeProduto,
        data: data1,
        borderColor: "#0077B6",
        backgroundColor: "rgba(0,119,182,0.15)",
        fill: true,
        tension: 0.3,
        pointBackgroundColor: "#023E8A",
        pointRadius: 6,        // aumenta ponto (visível)
        pointHoverRadius: 9,
        // importante: hit radius para facilitar clique
        pointHitRadius: 12,
      }]
    },
    options: {
      responsive: true,
      interaction: {
        mode: 'nearest',      // modo 'nearest'
        intersect: false      // aceita clique próximo (com hit radius)
      },
      plugins: {
        legend: { display: true, position: "top" },
       
        tooltip: {
          enabled: true,
          // evitar que tooltip bloqueie clique: curto delay ao mostrar
          delay: { show: 50, hide: 100 },
          callbacks: {
            title: (ctx) => `🗓️ ${ctx[0].label}`,
            label: (ctx) => `📊 ${nomeProduto}: ${ctx.formattedValue} vendidos`
            
          }
        }
      },
      onClick: (evt) => {
        // console debug
        // console.log("chart1 onclick evt:", evt);

        // pega elementos mais próximos do clique (tolerância por pointHitRadius)
        const points = window.chart1.getElementsAtEventForMode(evt, 'nearest', { intersect: false }, true);
        if (!points || !points.length) {
          // nenhum ponto próximo
          // console.log("Nenhum ponto próximo clicado.");
          return;
        }

        const idx = points[0].index;
        const mesSelecionado = labels1[idx];
        // highlight temporário do ponto clicado
        highlightChartPoint(window.chart1, 0, idx);

        // chama popup após leve atraso (evita conflito com tooltip)
        setTimeout(() => showOrdersForMonth(mesSelecionado), 200);
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Quantidade vendida" } },
        x: { title: { display: true, text: "Mês" } }
      }
    }
  });
}  // ========== 2️⃣ VENDAS POR CHUVA ==========
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
// 🔍 Mostra pedidos detalhados ao clicar em um mês
// ============================================================
async function showOrdersForMonth(nomeMes) {
  // Remove popup antigo (se existir)
  const existente = document.getElementById("detalhesMes");
  if (existente) existente.remove();

  // Mapeamento de nome do mês → número (0 = janeiro)
  const meses = {
    Janeiro: 0, Fevereiro: 1, Março: 2, Abril: 3, Maio: 4, Junho: 5,
    Julho: 6, Agosto: 7, Setembro: 8, Outubro: 9, Novembro: 10, Dezembro: 11
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
// 🚀 Inicialização garantida após o DOM carregar
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  logDebug("✅ Página de análise carregada (DOM completamente pronto).");

  // Aguarda levemente para garantir que Chart.js esteja disponível
  setTimeout(async () => {
    await loadAnalysis();
  }, 800);
});


