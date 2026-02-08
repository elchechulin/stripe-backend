// api/create-payment-link.js

import { createPaymentToken } from "../lib/paymentTokens.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { modo, mensualidad, setup } = req.body;

    if (!mensualidad || typeof mensualidad !== "number") {
      return res.status(400).json({ error: "Mensualidad inválida" });
    }

    if (modo === "setup" && (!setup || typeof setup !== "number")) {
      return res.status(400).json({ error: "Setup inválido" });
    }

    // Crear token temporal (1h)
    const token = createPaymentToken({
      mensualidad,
      setup: modo === "setup" ? setup : null
    });

    // Enlace final que se enviará al cliente
    const baseUrl = "https://pricing-restaurantes.vercel.app";
    const redirect =
      modo === "setup"
        ? `${baseUrl}/pago-setup.html?token=${token}`
        : `${baseUrl}/pago-inmediato.html?token=${token}`;

    return res.status(200).json({
      url: redirect,
      expiresIn: 3600
    });

  } catch (err) {
    console.error("CREATE PAYMENT LINK ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
