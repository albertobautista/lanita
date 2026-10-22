// Category names are shown in the app, so they stay in Spanish.
export const EXPENSE_CATEGORIES = [
  "Súper", "Comida", "Transporte", "Casa", "Servicios", "Suscripciones", "Salud", "Ropa", "Entretenimiento",
  "Electrónica", "Educación", "Viajes", "Mascotas", "Regalos", "Sin identificar", "Otros",
] as const;
export const INCOME_CATEGORIES = ["Sueldo", "Freelance", "Venta", "Reembolso", "Intereses", "Otros"] as const;

/** Category used when the bank charged more than what was recorded. */
export const UNIDENTIFIED_CATEGORY = "Sin identificar";

// Dark enough for the white text on card plastics. New colors go at the end: sample data picks by index.
export const COLORS = [
  "#1f3f66", "#6b1d36", "#245a35", "#46368a", "#7d5212", "#23292f", "#0d6e7a", "#8a2f5b",
  "#111418", "#4a5560", "#1e3a8a", "#0b2545", "#b23a2e", "#c2410c", "#8a6d1f", "#a15c4f",
  "#3f6212", "#0f766e", "#6d28d9", "#9d174d",
];

export const INSTALLMENT_TERMS = [3, 6, 9, 10, 11, 12, 13, 15, 18, 20, 24, 36, 48];

// Keywords to suggest a category when importing or doing a quick capture.
export const CATEGORY_HINTS: [RegExp, string][] = [
  [/walmart|soriana|chedraui|costco|sams|heb|la comer|superama|bodega aurrera|oxxo|7-?eleven/i, "Súper"],
  [/uber eats|rappi|didi food|restaurant|starbucks|tacos|pizza|burger|cafe|café/i, "Comida"],
  [/uber|didi|gasolin|pemex|shell|bp |mobil|caseta|estacionamiento|metro|cabify/i, "Transporte"],
  [/netflix|spotify|disney|hbo|max |prime video|apple\.com|icloud|youtube|xbox|playstation|chatgpt|claude/i, "Suscripciones"],
  [/cfe|telmex|izzi|totalplay|megacable|telcel|at&t|movistar|agua|gas natural/i, "Servicios"],
  [/farmacia|similares|benavides|guadalajara|doctor|hospital|laboratorio/i, "Salud"],
  [/liverpool|palacio|zara|h&m|shein|coppel|suburbia/i, "Ropa"],
  [/amazon|mercado ?libre|best buy|apple store|steren/i, "Otros"],
  [/cinepolis|cinemex|ticketmaster|boletos/i, "Entretenimiento"],
  [/aeromexico|volaris|viva ?aerobus|airbnb|hotel|booking/i, "Viajes"],
];

export function suggestCategory(text: string) {
  for (const [re, category] of CATEGORY_HINTS) if (re.test(text)) return category;
  return "Otros";
}
