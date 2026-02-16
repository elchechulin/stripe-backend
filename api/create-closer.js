import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/* ======================================================
   🔹 UTILIDADES
====================================================== */

// Quitar acentos y caracteres especiales
function limpiarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // elimina acentos
    .replace(/ñ/g, "n")
    .replace(/[^a-zA-Z0-9\s]/g, "") // elimina símbolos raros
    .trim();
}

// Generador de password segura
function generarPassword(longitud = 10) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < longitud; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

// Generador base de username profesional
function generarUsernameBase(nombre, municipio) {
  const nombreLimpio = limpiarTexto(nombre);
  const municipioLimpio = limpiarTexto(municipio);

  const nombreBase = nombreLimpio.split(" ")[0].toLowerCase();
  const ciudadBase = municipioLimpio.toLowerCase().replace(/\s+/g, "");

  return `${nombreBase}_${ciudadBase}`;
}

// Garantizar username único absoluto
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

/* ======================================================
   🔹 HANDLER
====================================================== */

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

    /* ==========================
       VALIDACIÓN PROFESIONAL
    ========================== */

    if (!full_name || !city) {
      return res.status(400).json({
        error: "Nombre completo y municipio son obligatorios"
      });
    }

    if (full_name.length < 3) {
      return res.status(400).json({
        error: "Nombre demasiado corto"
      });
    }

    if (city.length < 2) {
      return res.status(400).json({
        error: "Municipio inválido"
      });
    }

    /* ==========================
       GENERAR USERNAME SEGURO
    ========================== */

    const baseUsername = generarUsernameBase(full_name, city);
    const username = await generarUsernameUnico(baseUsername);

    /* ==========================
       GENERAR PASSWORD SEGURA
    ========================== */

    const plainPassword = generarPassword();
    const password_hash = await bcrypt.hash(plainPassword, 10);

    /* ==========================
       INSERTAR EN BD
    ========================== */

    const result = await pool.query(
  `
  INSERT INTO users (
    username,
    password_hash,
    role,
    full_name,
    city,
    phone,
    is_active,
    is_demo,
    commission_start_at
  )
  VALUES ($1, $2, 'closer', $3, $4, $5, true, false, NOW())
  RETURNING id
  `,
  [
    username,
    password_hash,
    full_name.trim(),
    city.trim(),
    phone || null
  ]
);

    const userId = result.rows[0].id;

    return res.status(200).json({
      id: userId,
      username,
      password: plainPassword
    });

  } catch (err) {
    console.error("CREATE CLOSER ERROR:", err);
    return res.status(500).json({
      error: "Error interno del servidor"
    });
  }
}
