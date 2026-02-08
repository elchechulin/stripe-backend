import crypto from "crypto";

// almacenamiento temporal en memoria
// (válido para Vercel mientras no escale)
const links = global.paymentLinks || {};
global.paymentLinks = links;

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { modo, mensualidad, setup } = req.body;

  if (!modo || !mensualidad) {
    return res.status(400).json({ error: "Missing data" });
  }

  if (modo === "setup" && !setup) {
    return res.status(400).json({ error: "Missing setup" });
  }

  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hora

  links[token] = {
    modo,
    mensualidad,
    setup: setup || null,
    expiresAt
  };

  const url = `${req.headers.origin}/pago-${modo}.html?token=${token}`;

  return res.status(200).json({ url });
}
