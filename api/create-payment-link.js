export const config = {
  runtime: "nodejs"
};

import crypto from "crypto";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const body = typeof req.body === "string"
  ? JSON.parse(req.body)
  : req.body;

const mensualidad = Number(body?.mensualidad);
const setup = Number(body?.setup || 0);
const modo = body?.modo || "inmediato";
const closer_id = Number(body?.closer_id);

    if (!closer_id || isNaN(closer_id)) {
  return res.status(400).json({ error: "Missing closer_id" });
}

    if (!mensualidad || isNaN(mensualidad) || mensualidad <= 0) {
  return res.status(400).json({ error: "Datos inválidos" });
}

    // ==============================
    // 1️⃣ REGISTRAR VENTA EN BD
    // ==============================

    const commission_percentage = 50; // puedes cambiarlo luego dinámicamente

    await pool.query(
      `
      INSERT INTO sales (
        closer_id,
        client_id,
        commission_percentage
      )
      VALUES ($1, NULL, $2)
      `,
      [closer_id, commission_percentage]
    );

    // ==============================
    // 2️⃣ GENERAR TOKEN
    // ==============================

    const payload = {
  mensualidad,
  setup,
  modo,
  closer_id,
  service_type: body?.service_type, // 👈 AÑADIR ESTO
  exp: Date.now() + 15 * 60 * 1000
};

    const payloadB64 = Buffer
      .from(JSON.stringify(payload))
      .toString("base64url");

    const signature = crypto
      .createHmac("sha256", process.env.PAYMENT_TOKEN_SECRET)
      .update(payloadB64)
      .digest("hex");

    const token = `${payloadB64}.${signature}`;

    const page =
      modo === "inmediato"
        ? "pago-inmediato.html"
        : "pago-setup.html";

    const url = `https://pricing-restaurantes.vercel.app/${page}?token=${token}`;

    return res.status(200).json({ url });

  } catch (err) {
    console.error("CREATE PAYMENT LINK ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
