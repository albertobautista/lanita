// Category names are shown in the app, so they stay in Spanish.
export const EXPENSE_CATEGORIES = [
  "Súper", "Comida", "Transporte", "Casa", "Servicios", "Suscripciones", "Salud", "Ropa", "Entretenimiento",
  "Electrónica", "Educación", "Viajes", "Mascotas", "Regalos", "Sin identificar", "Otros",
] as const;
export const INCOME_CATEGORIES = ["Sueldo", "Freelance", "Venta", "Reembolso", "Intereses", "Otros"] as const;

/** Category used when the bank charged more than what was recorded. */
export const UNIDENTIFIED_CATEGORY = "Sin identificar";

// The usual plastics first: gold, black, silver, red, blue, purple. Then more choices.
export const COLORS = [
  "#c9a646", "#111418", "#b9bec4", "#b23a2e", "#1e3a8a", "#46368a",
  "#1f3f66", "#6b1d36", "#245a35", "#7d5212", "#23292f", "#0d6e7a", "#8a2f5b",
  "#4a5560", "#0b2545", "#c2410c", "#a15c4f", "#3f6212", "#0f766e", "#6d28d9", "#9d174d",
];

export const COLOR_NAMES: Record<string, string> = {
  "#c9a646": "Oro", "#111418": "Negra", "#b9bec4": "Plata", "#b23a2e": "Roja", "#1e3a8a": "Azul", "#46368a": "Morada",
};

/** Gold and silver are drawn as metal, with dark text; any other color is used as is, with white text. */
const METALLIC: Record<string, string> = {
  "#c9a646": "linear-gradient(135deg, #ecd893 0%, #c9a646 45%, #a8862f 70%, #dcc274 100%)",
  "#b9bec4": "linear-gradient(135deg, #eef0f2 0%, #c3c8cd 45%, #9aa1a8 70%, #d7dbdf 100%)",
};
export const cardBackground = (color: string) => METALLIC[color] ?? color;
export const cardInk = (color: string) => (METALLIC[color] ? "#1b1e21" : "#fff");

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
