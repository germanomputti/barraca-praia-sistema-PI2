/**
 * seed_products.js
 * -------------------------------
 * Lê o arquivo seed_products.json e insere no banco PostgreSQL.
 * Compatível com o Render.
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const seedPath = path.join(__dirname, "seed_products.json");

    console.log("📄 Lendo arquivo:", seedPath);

    if (!fs.existsSync(seedPath)) {
      console.error("❌ ERRO: Arquivo seed_products.json não encontrado!");
      process.exit(1);
    }

    const data = fs.readFileSync(seedPath, "utf8");
    const products = JSON.parse(data);

    console.log(`📦 ${products.length} produtos carregados do JSON.`);

    console.log("🧹 Limpando tabela products...");
    await pool.query("DELETE FROM products");

    console.log("🛠️ Inserindo novos produtos...");
    for (const p of products) {
      await pool.query(
        `INSERT INTO products (name, option_name, price, image)
         VALUES ($1, $2, $3, $4)`,
        [p.name, p.option_name, p.price, p.image]
      );
    }

    const result = await pool.query("SELECT COUNT(*) AS total FROM products");
    console.log(`✅ ${result.rows[0].total} produtos inseridos com sucesso!`);
  } catch (err) {
    console.error("❌ Erro ao popular produtos:", err.message);
  } finally {
    await pool.end();
    console.log("📦 Banco fechado com sucesso.");
  }
})();