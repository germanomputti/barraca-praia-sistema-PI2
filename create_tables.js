// create_tables.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// ajuste aqui se o seu DB estiver em outro lugar
const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente TEXT,
    numero_mesa INTEGER,
    status TEXT,
    data_hora TEXT,
    total REAL,
    chuva_categoria TEXT,
    temp_categoria TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pedido_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER,
    product_name TEXT,
    option_name TEXT,
    quantidade INTEGER,
    price_unit REAL,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  )`);
});

db.close(() => {
  console.log("✅ Estrutura do banco (tabelas) criada/confirmada em:", dbPath);
});