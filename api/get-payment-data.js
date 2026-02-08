import { getPaymentToken } from "../lib/paymentTokens";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  const data = getPaymentToken(token);

  if (!data) {
    return res.status(410).json({ error: "Token expired or invalid" });
  }

  return res.status(200).json({
    mensualidad: data.mensualidad,
    setup: data.setup
  });
}
