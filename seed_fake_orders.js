/**
 * seed_fake_orders.js (versão corrigida com timezone local)
 * ------------------------------------------------------------
 * Gera pedidos simulados para 1 ano, com dados reais de clima
 * obtidos da API Open-Meteo já ajustados para o fuso de Brasília.
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const fetch = require("node-fetch");

// Configurações principais
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
const products = JSON.parse(fs.readFileSync(path.join(__dirname, "seed_products.json"), "utf8"));

// Local da barraca: Praia Grande - SP
const LAT = -24.00;
const LON = -46.41;
// sempre começa em 01-01-2024
const START_DATE = "2024-01-01";

// data final = ontem
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const END_DATE = ontem.toISOString().slice(0,10);

// Funções auxiliares
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Classificações de clima
function classifyChuva(mm) {
  if (mm <= 2.4) return "Sem/Muito fraca";
  if (mm <= 25) return "Fraca/Moderada";
  return "Forte/Muito forte";
}
function classifyTemp(temp) {
  if (temp < 24) return "Ameno/Fresco";
  if (temp < 30) return "Quente";
  return "Muito quente";
}

// ------------------------------------------------------------
// 1️⃣ Obter dados de clima da API Open-Meteo (fuso corrigido)
// ------------------------------------------------------------
async function getClimateData() {
  const start = START_DATE;
  const end = END_DATE;

  // ✅ CORRIGIDO: adiciona timezone local para evitar "avanço de dia"
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum&timezone=America/Sao_Paulo`;

  console.log("🌦️  Baixando dados climáticos (com timezone local)...");
  const resp = await fetch(url);
  const dados = await resp.json();

  if (!dados.daily) throw new Error("❌ Erro ao obter dados climáticos da API.");

// ✅ CORRIGIDO: recua um dia (Open-Meteo associa ao dia de término)
const clima = dados.daily.time.map((data, i) => {
  const d = new Date(data);
  d.setDate(d.getDate() + 1); // 🔹 corrige deslocamento
  const dataCorrigida = d.toISOString().slice(0, 10);

  return {
    data: dataCorrigida,
    temp_mean: dados.daily.temperature_2m_mean[i],
    temp_max: dados.daily.temperature_2m_max[i],
    temp_min: dados.daily.temperature_2m_min[i],
    precip_sum: dados.daily.precipitation_sum[i],
    chuva_categoria: classifyChuva(dados.daily.precipitation_sum[i]),
    temp_categoria: classifyTemp(dados.daily.temperature_2m_max[i]),
  };
});

  console.log(`✅ Dados de clima obtidos (${clima.length} dias).`);
  return clima;
}

// ------------------------------------------------------------
// 2️⃣ Gera pedidos simulados coerentes com o clima
// ------------------------------------------------------------
function gerarPedidos(clima) {
  console.log("🧾 Gerando pedidos simulados com base no clima...");
  const pedidos = [];

  clima.forEach((dia) => {
    const nPedidos = randomInt(5, 15); // pedidos por dia
    for (let i = 0; i < nPedidos; i++) {
      const hora = `${String(randomInt(10, 18)).padStart(2, "0")}:${String(randomInt(0, 59)).padStart(2, "0")}`;

      // ✅ CORRIGIDO: salva data local no formato ISO sem UTC
      const data_hora = `${dia.data} ${hora}:00`;

      const items = [];

      const bebidas = products.filter((p) =>
        ["Caipirinha", "Água de coco", "Refrigerante", "Sorvete"].includes(p.name)
      );
      const comidas = products.filter((p) => !bebidas.includes(p));

      const isQuente = dia.temp_max > 28;
      const baseProdutos = isQuente
        ? bebidas.concat(randomElement(comidas))
        : comidas.concat(randomElement(bebidas));

      const nItens = randomInt(1, 4);
      for (let j = 0; j < nItens; j++) {
        const produto = randomElement(baseProdutos);
        items.push({
          product_name: produto.name,
          option_name: produto.option_name,
          quantidade: randomInt(1, 3),
          price_unit: produto.price,
        });
      }

      const total = items.reduce((s, i) => s + i.quantidade * i.price_unit, 0);

      pedidos.push({
        cliente: `Cliente ${randomInt(1, 100)}`,
        numero_mesa: randomInt(1, 20),
        status: "Concluído",
        data_hora, // sem UTC
        total,
        chuva_categoria: dia.chuva_categoria,
        temp_categoria: dia.temp_categoria,
        items,
      });
    }
  });

  console.log(`✅ Gerados ${pedidos.length} pedidos simulados.`);
  return pedidos;
}

// ------------------------------------------------------------
// 3️⃣ Inserir no banco SQLite
// ------------------------------------------------------------
async function inserirPedidos(pedidos) {
  console.log("💾 Inserindo pedidos simulados... modo rápido!");

  // 1) CLIMA - agrupar por data única
  const mapaClima = new Map();
  for (const p of pedidos) {
    const dia = p.data_hora.slice(0,10);
    if (!mapaClima.has(dia)) {
      mapaClima.set(dia, {
        date: dia,
        temp_mean: p.temp_mean,
        temp_max: p.temp_max,
        temp_min: p.temp_min,
        precip_sum: p.precip_sum,
        horas_chuva: p.horas_chuva || 0,
        chuva_categoria: p.chuva_categoria,
        temp_categoria: p.temp_categoria
      });
    }
  }
  const climaList = Array.from(mapaClima.values());

  console.log("   -> inserindo clima em bulk…");
  for (const c of climaList) {
    await pool.query(
      `INSERT INTO clima(date,temp_mean,temp_max,temp_min,precip_sum,horas_chuva,chuva_categoria,temp_categoria)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (date) DO NOTHING`,
      [c.date,c.temp_mean,c.temp_max,c.temp_min,c.precip_sum,c.horas_chuva,c.chuva_categoria,c.temp_categoria]
    );
  }

  // 2) pedidos em chunks
  const chunk = 1000;
  for (let i=0; i<pedidos.length; i+=chunk) {
    const fatia = pedidos.slice(i, i+chunk);

    const insertPedidosSQL = `
      INSERT INTO pedidos(cliente,numero_mesa,status,data_hora,total,clima_id)
      VALUES ${fatia.map((_,idx)=>`($${idx*6+1},$${idx*6+2},$${idx*6+3},$${idx*6+4},$${idx*6+5},(SELECT id FROM clima WHERE date=$${idx*6+6}))`).join(",")}
      RETURNING id
    `;

    const params = [];
    for (const p of fatia) {
      params.push(p.cliente,p.numero_mesa,"Concluído",p.data_hora,p.total,p.data_hora.slice(0,10));
    }

    const resPedidos = await pool.query(insertPedidosSQL,params);

    // 3) now insert items for this chunk
    let valuesItems = [];
    let paramsItems = [];
    let k = 1;

    for (let idx=0; idx<fatia.length; idx++) {
      const pedidoId = resPedidos.rows[idx].id;
      for (const it of fatia[idx].items) {
        valuesItems.push(`($${k},$${k+1},$${k+2},$${k+3},$${k+4})`);
        paramsItems.push(pedidoId,it.product_name,it.option_name,it.quantidade,it.price_unit);
        k+=5;
      }
    }
    if (valuesItems.length>0){
      await pool.query(
        `INSERT INTO pedido_items(pedido_id,product_name,option_name,quantidade,price_unit)
         VALUES ${valuesItems.join(",")}`,
        paramsItems
      );
    }
  }
  console.log("✅ tudo inserido (Postgres bulk)");
}
// ------------------------------------------------------------
// EXECUÇÃO PRINCIPAL
// ------------------------------------------------------------


(async () => {
  try {
    const clima = await getClimateData();
    const pedidos = gerarPedidos(clima);
    await inserirPedidos(pedidos);
  } catch (err) {
    console.error("❌ Erro:", err.message);
  }
})();