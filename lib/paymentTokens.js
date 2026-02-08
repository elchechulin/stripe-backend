// lib/paymentTokens.js

const tokens = new Map();

// Crear token válido 1 hora
export function createPaymentToken({ mensualidad, setup }) {
  const token = crypto.randomUUID();

  tokens.set(token, {
    mensualidad,
    setup,
    expiresAt: Date.now() + 60 * 60 * 1000 // 1 hora
  });

  return token;
}

// Obtener datos y validar token
export function getPaymentData(token) {
  const data = tokens.get(token);

  if (!data) return null;
  if (Date.now() > data.expiresAt) {
    tokens.delete(token);
    return null;
  }

  return data;
}

// Consumir token (una sola vez)
export function consumeToken(token) {
  tokens.delete(token);
}
