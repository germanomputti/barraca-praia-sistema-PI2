require("dotenv").config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./db.sqlite');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    option_name TEXT,
    price REAL,
    image TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS clima (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE,
    temp_mean REAL,
    temp_max REAL,
    temp_min REAL,
    precip_sum REAL,
    horas_chuva INTEGER,
    chuva_categoria TEXT,
    temp_categoria TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente TEXT,
    numero_mesa TEXT,
    status TEXT,
    data_hora TEXT,
    total REAL,
    clima_id INTEGER,
    FOREIGN KEY(clima_id) REFERENCES clima(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER,
    product_name TEXT,
    option_name TEXT,
    quantidade INTEGER,
    price_unit REAL,
    FOREIGN KEY(pedido_id) REFERENCES pedidos(id)
  )`);
});

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
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM clima WHERE date = ?', [dateStr], async (err, row) => {
      if (err) return reject(err);
      if (row) return resolve(row);

      try {

        // 🔹 Corrige o deslocamento de 1 dia (API Open-Meteo devolve o dia anterior)
        const d = new Date(dateStr);
        d.setDate(d.getDate() - 1);
        const dataCorrigida = d.toISOString().slice(0, 10);
        const lat = -24.00;
        const lon = -46.41;
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dataCorrigida}&end_date=${dataCorrigida}&daily=temperature_2m_max,temperature_2m_mean,temperature_2m_min,precipitation_sum&hourly=precipitation&timezone=America/Sao_Paulo`;
        const resp = await axios.get(url, { timeout: 10000 });
        const daily = resp.data.daily || {};
        const hourly = resp.data.hourly || {};
        const temp_mean = daily.temperature_2m_mean ? daily.temperature_2m_mean[0] : null;
        const temp_max  = daily.temperature_2m_max ? daily.temperature_2m_max[0] : null;
        const temp_min  = daily.temperature_2m_min ? daily.temperature_2m_min[0] : null;
        const precip_sum = daily.precipitation_sum ? daily.precipitation_sum[0] : 0;
        let horas_chuva = 0;
        if (hourly && hourly.precipitation && Array.isArray(hourly.precipitation)) {
          horas_chuva = hourly.precipitation.reduce((acc,v) => acc + (v>0?1:0), 0);
        }
        const chuva_categoria = classificarChuvaPorMm(precip_sum);
        const temp_categoria = classificarTempMax(temp_max);

        db.run(`INSERT INTO clima (date,temp_mean,temp_max,temp_min,precip_sum,horas_chuva,chuva_categoria,temp_categoria)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [dateStr, temp_mean, temp_max, temp_min, precip_sum, horas_chuva, chuva_categoria, temp_categoria], function(err2){
          if (err2) return reject(err2);
          db.get('SELECT * FROM clima WHERE id = ?', [this.lastID], (e,r) => {
            if (e) return reject(e);
            resolve(r);
          });
        });
      } catch (e) {
        resolve(null);
      }
    });
  });
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

app.get('/api/products', (req,res) => {
  db.all('SELECT * FROM products', [], (err,rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/seed-products', (req,res) => {
  const products = req.body.products || [];
  const stmt = db.prepare('INSERT INTO products (name, option_name, price, image) VALUES (?, ?, ?, ?)');
  for (const p of products) stmt.run([p.name, p.option_name, p.price, p.image]);
  stmt.finalize(() => res.json({ ok:true }));
});

app.post('/api/pedidos', async (req,res) => {
  try {
    const { cliente='', numero_mesa='', items=[] } = req.body;
    const data_hora = new Date().toISOString();
    const dateOnly = data_hora.split('T')[0];
      send("🌦️ Gerando histórico completo de clima 2024 → ontem...");
  await gerarHistoricoCompleto();
  send("✅ Clima de 2024 até ontem gerado!");
    const clima_id = clima ? clima.id : null;
    const total = items.reduce((acc,it) => acc + (it.price_unit||0)*(it.quantidade||1), 0);
    db.run('INSERT INTO pedidos (cliente, numero_mesa, status, data_hora, total, clima_id) VALUES (?, ?, ?, ?, ?, ?)', [cliente, numero_mesa, 'Aguardando', data_hora, total, clima_id], function(err){
      if (err) return res.status(500).json({ error: err.message });
      const pedido_id = this.lastID;
      const stmt = db.prepare('INSERT INTO pedido_items (pedido_id, product_name, option_name, quantidade, price_unit) VALUES (?, ?, ?, ?, ?)');
      for (const it of items) {
        stmt.run([pedido_id, it.product_name, it.option_name || '', it.quantidade || 1, it.price_unit || 0]);
      }
      stmt.finalize(() => {
        db.get('SELECT * FROM pedidos WHERE id = ?', [pedido_id], (e,pedidoRow) => {
          db.all('SELECT * FROM pedido_items WHERE pedido_id = ?', [pedido_id], (ee,itemRows) => {
            pedidoRow.items = itemRows;
            res.json(pedidoRow);
          });
        });
      });
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pedidos', (req,res) => {
  const date = req.query.date; // optional
  let sql = 'SELECT pedidos.*, clima.temp_mean, clima.precip_sum, clima.chuva_categoria, clima.temp_categoria FROM pedidos LEFT JOIN clima ON pedidos.clima_id = clima.id';
  const params = [];
  if (date) {
    sql += ' WHERE date(data_hora) = ?';
    params.push(date);
  }
  sql += ' ORDER BY data_hora DESC';
  db.all(sql, params, (err,rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const ids = rows.map(r=>r.id);
    if (ids.length===0) return res.json([]);
    db.all(`SELECT * FROM pedido_items WHERE pedido_id IN (${ids.join(',')})`, [], (e,items) => {
      if (e) return res.status(500).json({ error: e.message });
      const map={};
      items.forEach(it => { map[it.pedido_id]=map[it.pedido_id]||[]; map[it.pedido_id].push(it); });
      rows.forEach(r => r.items = map[r.id] || []);
      res.json(rows);
    });
  });
});

app.put('/api/pedidos/:id/status', (req,res) => {
  const id = req.params.id;
  const { status } = req.body;
  db.run('UPDATE pedidos SET status = ? WHERE id = ?', [status, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

// export app for tests if needed
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}



// ========================================
// ROTAS ADMIN
// ========================================
app.post('/admin/clear-db', (req, res) => {
  const pin = req.body.pin;
  if (pin !== process.env.ADMIN_PIN) {
    return res.status(401).json({ ok: false, msg: 'PIN incorreto' });
  }

  db.serialize(() => {
    db.run("DELETE FROM pedido_items");
    db.run("DELETE FROM pedidos");
    db.run("DELETE FROM clima");
    db.run("VACUUM");
  });

  res.json({ ok: true, msg: "Banco limpo com sucesso" });
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