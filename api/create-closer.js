import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 🔹 Generador de contraseña segura
function generarPassword(longitud = 10) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < longitud; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

// 🔹 Generador base de username
function generarUsernameBase(nombre, municipio) {
  if (nombre && municipio) {
    return (
      nombre.split(" ")[0].toLowerCase() +
      "_" +
      municipio.toLowerCase().replace(/\s+/g, "")
    );
  }
  return "closer";
}

// 🔹 Garantizar username único
async function generarUsernameUnico(base) {
  let username = base;
  let contador = 1;

  while (true) {
    const existe = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (existe.rows.length === 0) break;

    username = `${base}${contador}`;
    contador++;
  }

  return username;
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
    const { full_name, city, phone } = req.body;

    // 🔹 Base username
    const baseUsername = generarUsernameBase(full_name, city);
    const username = await generarUsernameUnico(baseUsername);

    // 🔹 Password
    const plainPassword = generarPassword();
    const password_hash = await bcrypt.hash(plainPassword, 10);

    // 🔹 Insertar en BD
    const result = await pool.query(
      `
      INSERT INTO users (username, password_hash, role, full_name, city)
      VALUES ($1, $2, 'closer', $3, $4)
      RETURNING id
      `,
      [username, password_hash, full_name || null, city || null]
    );

    const userId = result.rows[0].id;

    return res.status(200).json({
      id: userId,
      username,
      password: plainPassword
    });

  } catch (err) {
    console.error("CREATE CLOSER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
