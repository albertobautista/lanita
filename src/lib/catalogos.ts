export const CATEGORIAS_GASTO = [
  "Súper", "Comida", "Transporte", "Casa", "Servicios", "Suscripciones", "Salud", "Ropa", "Entretenimiento",
  "Electrónica", "Educación", "Viajes", "Mascotas", "Regalos", "Sin identificar", "Otros",
] as const;
export const CATEGORIAS_INGRESO = ["Sueldo", "Freelance", "Venta", "Reembolso", "Intereses", "Otros"] as const;

export const COLORES = ["#1f3f66", "#6b1d36", "#245a35", "#46368a", "#7d5212", "#23292f", "#0d6e7a", "#8a2f5b"];

export const PLAZOS = [3, 6, 9, 10, 11, 12, 13, 15, 18, 20, 24, 36, 48];

// Palabras clave para sugerir categoría al importar o capturar rápido.
export const PISTAS_CATEGORIA: [RegExp, string][] = [
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

export function sugerirCategoria(texto: string) {
  for (const [re, cat] of PISTAS_CATEGORIA) if (re.test(texto)) return cat;
  return "Otros";
}
