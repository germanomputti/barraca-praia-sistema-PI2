const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Caminho absoluto do banco e do seed JSON
const dbPath = path.join(__dirname, "db.sqlite");
const seedPath = path.join(__dirname, "seed_products.json");

console.log("📂 Usando banco de dados:", dbPath);
console.log("📄 Lendo arquivo:", seedPath);

// Verifica se o JSON existe
if (!fs.existsSync(seedPath)) {
  console.error("❌ ERRO: Arquivo seed_products.json não encontrado!");
  process.exit(1);
}

// Abre conexão com o banco
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error("❌ ERRO ao abrir o banco:", err.message);
    process.exit(1);
  }
  console.log("✅ Conectado ao banco de dados com sucesso.");
});

// Lê e parseia o JSON
let products;
try {
  const data = fs.readFileSync(seedPath, "utf-8");
  products = JSON.parse(data);
  console.log(`📦 ${products.length} produtos carregados do JSON.`);
} catch (e) {
  console.error("❌ Erro ao ler o JSON:", e.message);
  process.exit(1);
}

// Popula a tabela
db.serialize(() => {
  console.log("🧹 Limpando tabela products...");
  db.run(`DELETE FROM products`, (err) => {
    if (err) {
      console.error("❌ Erro ao limpar tabela:", err.message);
      process.exit(1);
    }

    console.log("🛠️ Inserindo novos produtos...");
    const stmt = db.prepare(`
      INSERT INTO products (name, option_name, price, image)
      VALUES (?, ?, ?, ?)
    `);

    products.forEach((p) => {
      stmt.run(p.name, p.option_name, p.price, p.image, (err) => {
        if (err) console.error("⚠️ Erro ao inserir:", p.name, err.message);
      });
    });

    stmt.finalize(() => {
      console.log(`✅ ${products.length} produtos inseridos com sucesso!`);
      db.get(`SELECT COUNT(*) as total FROM products`, (err, row) => {
        if (!err) console.log(`📊 Total atual na tabela: ${row.total}`);
        db.close(() => console.log("📦 Banco fechado com sucesso."));
      });
    });
  });
});