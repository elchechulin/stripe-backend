import crypto from "crypto";
import { savePaymentToken } from "../lib/paymentTokens.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mensualidad, setup } = req.body;

  if (!mensualidad || !setup) {
    return res.status(400).json({ error: "Missing payment data" });
  }

  const token = crypto.randomUUID();

  savePaymentToken(token, {
    mensualidad,
    setup
  });

  return res.status(200).json({
    url: `https://pricing-restaurantes.vercel.app/pago-setup.html?token=${token}`
  });
}
