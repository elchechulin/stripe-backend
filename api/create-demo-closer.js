import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const config = {
  runtime: "nodejs"
};

function generarPassword(longitud = 10) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < longitud; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

function generarUsername() {
  return "demo_" + Math.floor(Math.random() * 100000);
}

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const username = generarUsername();
    const plainPassword = generarPassword();
    const password_hash = await bcrypt.hash(plainPassword, 10);

    await pool.query(
      `
      INSERT INTO users (username, password_hash, role, full_name, is_active, is_demo)
      VALUES ($1, $2, 'closer', 'Usuario Demo', true, true)
      `,
      [username, password_hash]
    );

    return res.status(200).json({
      username,
      password: plainPassword
    });

  } catch (err) {
    console.error("CREATE DEMO ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
