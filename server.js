require("dotenv").config();
const express = require('express');

const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');



const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
// =====================================
// CRIAÇÃO DAS TABELAS (postgres)
// =====================================

async function initTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT,
      option_name TEXT,
      price REAL,
      image TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clima (
      id SERIAL PRIMARY KEY,
      date DATE UNIQUE,
      temp_mean REAL,
      temp_max REAL,
      temp_min REAL,
      precip_sum REAL,
      horas_chuva INTEGER,
      chuva_categoria TEXT,
      temp_categoria TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      cliente TEXT,
      numero_mesa TEXT,
      status TEXT,
      data_hora TIMESTAMP,
      total REAL,
      clima_id INTEGER REFERENCES clima(id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedido_items (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER REFERENCES pedidos(id),
      product_name TEXT,
      option_name TEXT,
      quantidade INTEGER,
      price_unit REAL
    );
  `);

  console.log("✅ Tabelas Postgres verificadas/criadas");
}

initTables();
function classificarChuvaPorMm(mm) {
  if (mm === null || mm === undefined) return null;
  if (mm <= 2.4) return "Sem/Muito fraca";
  if (mm <= 25) return "Fraca/Moderada";
  return "Forte/Muito forte";
}
function classificarTempMax(t) {
  if (t === null || t === undefined) return null;
  if (t <= 24) return "Ameno/Fresco";
  if (t <= 30) return "Quente";
  return "Muito quente";
}

async function getClimaForDate(dateStr) {
  // verifica se já existe no banco
  const existing = await pool.query("SELECT * FROM clima WHERE date = $1", [dateStr]);
  if (existing.rows.length > 0) return existing.rows[0];

  // não corrige mais nada — usa a data exata do pedido
  const dataCorrigida = dateStr;

  const lat = -24.00;
  const lon = -46.41;
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dataCorrigida}&end_date=${dataCorrigida}&daily=temperature_2m_max,temperature_2m_mean,temperature_2m_min,precipitation_sum&hourly=precipitation&timezone=America/Sao_Paulo`;

  try {
    const resp = await axios.get(url, { timeout: 10000 });
    const daily = resp.data.daily || {};
    const hourly = resp.data.hourly || {};

    const temp_mean = daily.temperature_2m_mean ? daily.temperature_2m_mean[0] : null;
    const temp_max  = daily.temperature_2m_max ? daily.temperature_2m_max[0] : null;
    const temp_min  = daily.temperature_2m_min ? daily.temperature_2m_min[0] : null;
    const precip_sum = daily.precipitation_sum ? daily.precipitation_sum[0] : 0;

    let horas_chuva = 0;
    if (hourly && hourly.precipitation && Array.isArray(hourly.precipitation)) {
      horas_chuva = hourly.precipitation.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
    }

    const chuva_categoria = classificarChuvaPorMm(precip_sum);
    const temp_categoria = classificarTempMax(temp_max);

    // INSERE NO POSTGRES
    const inserted = await pool.query(`
      INSERT INTO clima(date,temp_mean,temp_max,temp_min,precip_sum,horas_chuva,chuva_categoria,temp_categoria)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [dateStr, temp_mean, temp_max, temp_min, precip_sum, horas_chuva, chuva_categoria, temp_categoria]);

    return inserted.rows[0];
  } catch (e) {
    console.error("Erro clima:", e.message);
    return null;
  }
}
app.get('/api/clima/:date', async (req,res) => {
  const date = req.params.date;
  try {
    const c = await getClimaForDate(date);
    if (!c) return res.status(404).json({ error: 'Clima não disponível' });
    res.json(c);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/products', async (req,res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY name ASC");
    res.json(result.rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/seed-only-products', async (req, res) => {
  try {
    const data = req.body.products;
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({error: "envie {products:[...]} no body"});
    }

    // limpa products antes
    await pool.query(`DELETE FROM products`);

    for (const p of data) {
      await pool.query(
        `INSERT INTO products(name, option_name, price, image)
         VALUES($1,$2,$3,$4)`,
        [p.name, p.option_name, p.price, p.image]
      );
    }

    res.json({ok:true, inserted:data.length});
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

app.post('/api/seed-products', async (req,res) => {
  try {
    const products = req.body.products || [];
    for (const p of products) {
      await pool.query(
        "INSERT INTO products(name, option_name, price, image) VALUES($1,$2,$3,$4)",
        [p.name, p.option_name, p.price, p.image]
      );
    }
    res.json({ ok:true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pedidos', async (req,res) => {
  try {
    const { cliente='', numero_mesa='', items=[] } = req.body;
    const data_hora = new Date().toISOString();
    const dataDia = data_hora.slice(0,10);

    // 🔹 GARANTE QUE O CLIMA DO DIA EXISTE NO BANCO
await getClimaForDate(dataDia);
    // clima do dia (já existe porque seed já fez)
    const clima = await pool.query(`SELECT id FROM clima WHERE date=$1`, [dataDia]);
    const clima_id = clima.rows[0]?.id || null;

    const r = await pool.query(
      `INSERT INTO pedidos(cliente,numero_mesa,status,data_hora,total,clima_id)
       VALUES($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [cliente, numero_mesa, "Aguardando", data_hora,
       items.reduce((acc,i)=>acc+(i.price_unit*i.quantidade),0),
       clima_id]
    );

    const pedido_id = r.rows[0].id;

    // insere items
    for (const it of items) {
      await pool.query(
        `INSERT INTO pedido_items(pedido_id,product_name,option_name,quantidade,price_unit)
         VALUES($1,$2,$3,$4,$5)`,
        [pedido_id,it.product_name,it.option_name,it.quantidade,it.price_unit]
      );
    }

    // agora retorna o pedido completo (com items)
    const respPedido = await pool.query(
      `SELECT pedidos.*, clima.temp_mean, clima.precip_sum, clima.chuva_categoria, clima.temp_categoria
       FROM pedidos
       LEFT JOIN clima ON pedidos.clima_id = clima.id
       WHERE pedidos.id=$1`,
      [pedido_id]
    );

    const pedido = respPedido.rows[0];

    const itensPedido = await pool.query(`SELECT * FROM pedido_items WHERE pedido_id=$1`, [pedido_id]);
    pedido.items = itensPedido.rows;

    res.json(pedido);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pedidos', async (req,res) => {
  try {
    const date = req.query.date;
    let sql = `
      SELECT pedidos.*, clima.temp_mean, clima.precip_sum, clima.chuva_categoria, clima.temp_categoria
      FROM pedidos
      LEFT JOIN clima ON pedidos.clima_id = clima.id
    `;
    const params = [];
    if (date) {
      sql += ` WHERE DATE(data_hora) = $1`;
      params.push(date);
    }
    sql += ` ORDER BY data_hora DESC`;

    const result = await pool.query(sql, params);
    const rows = result.rows;

    if (!rows.length) return res.json([]);

    const ids = rows.map(r=>r.id);
    const items = await pool.query(
      `SELECT * FROM pedido_items WHERE pedido_id = ANY($1)`,
      [ids]
    );

    const map = {};
    items.rows.forEach(it => {
      map[it.pedido_id] = map[it.pedido_id] || [];
      map[it.pedido_id].push(it);
    });

    rows.forEach(r => r.items = map[r.id] || []);

    res.json(rows);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// PUT - atualizar status do pedido (produção)
// ========================================
app.put("/api/pedidos/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const r = await pool.query(
      `UPDATE pedidos SET status=$1 WHERE id=$2`,
      [status, id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ ok:false, msg:"pedido não encontrado" });
    }

    res.json({ ok:true });

  } catch (e) {
    res.status(500).json({ ok:false, msg:e.message });
  }
});

// export app for tests if needed
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}



// ========================================
// ROTAS ADMIN
// ========================================
app.post('/admin/clear-db', async (req, res) => {
  const pin = req.body.pin;
  if (pin !== process.env.ADMIN_PIN) {
    return res.status(401).json({ ok: false, msg: 'PIN incorreto' });
  }

  try {
    await pool.query("DELETE FROM pedido_items");
    await pool.query("DELETE FROM pedidos");
    await pool.query("DELETE FROM clima");
    res.json({ ok:true, msg:"Banco limpo com sucesso" });
  } catch(e) {
    res.status(500).json({ error:e.message });
  }
});

const { execFile } = require("child_process");




app.post("/admin/seed", (req, res) => {
  const { pin } = req.body;
  if (pin !== process.env.ADMIN_PIN) {
    res.status(401).setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("❌ PIN incorreto\n");
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  const send = (txt) => res.write((txt.endsWith("\n") ? txt : txt+"\n"));

  send("⏳ Iniciando seed completo...");

  const seedProductsPath = path.join(__dirname, "seed_products.js");
  const seedOrdersPath   = path.join(__dirname, "seed_fake_orders.js");

  // primeiro: seed_products
  const child1 = execFile("node", [seedProductsPath]);

  child1.stdout.on("data", (data) => send("📦 seed_products: " + data.toString()));
  child1.stderr.on("data", (data) => send("❌ seed_products: " + data.toString()));

  child1.on("exit", (code) => {
    if (code !== 0) {
      send("❌ seed_products terminou com erro. Abortando.");
      return res.end();
    }

    send("✅ Produtos inseridos. Agora gerando pedidos...");

    // depois: seed_fake_orders
    const child2 = execFile("node", [seedOrdersPath]);

    child2.stdout.on("data", (data) => send("🧾 seed_pedidos: " + data.toString()));
    child2.stderr.on("data", (data) => send("❌ seed_pedidos: " + data.toString()));

    child2.on("exit", (code2) => {
      send(code2 === 0 ? "✅ Finalizado!" : "❌ Finalizado com erro");
      res.end();
    });
  });
});