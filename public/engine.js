// Wingman Pilot — detection + generation engine.
// Pure, deterministic, no network: detection is keyword/pattern based and
// generation is templated, so the streaming loop is reliable every run.
// Both are behind narrow interfaces (detect() / generate()) so a real LLM
// or ASR can be dropped in later without touching the UI.

// ------------------------------------------------------------------- rules
// Each rule: regex patterns for client speech, a base confidence, and a
// boost added per additional distinct pattern hit. Buyer and seller sides
// have separate rule sets so the same words can mean different things.
const RULES = {
  seller: [
    {
      category: 'commission',
      label: 'Commission pushback',
      base: 78,
      boost: 8,
      patterns: [
        /commiss/i,
        /percent|%\s*|\bpercent/i,
        /fee/,
        /negotiable/,
        /keep more/,
        /in my pocket/,
      ],
    },
    {
      category: 'existing_agent',
      label: 'Already have an agent',
      base: 80,
      boost: 8,
      patterns: [
        /another agent/,
        /other agent/,
        /already (?:been )?talking|working with/,
        /already have an? agent/,
        /real estate agent/,
      ],
    },
    {
      category: 'testing_market',
      label: 'Just testing the market',
      base: 76,
      boost: 8,
      patterns: [
        /just testing|just seeing|just curious/,
        /not in a (huge )?rush/,
        /might not (actually )?sell/,
        /see what (the place|it)'?s worth|what (the place|it) is worth/,
        /not ready/,
      ],
    },
    {
      category: 'price_timing',
      label: 'Price / timing hesitation',
      base: 72,
      boost: 8,
      patterns: [
        /lower than (we|i) (was|were) expecting/,
        /too low/,
        /wait (until|till)/,
        /maybe we should (wait|hold)/,
        /not the right time/,
        /hold off/,
      ],
    },
  ],
  buyer: [
    {
      category: 'financing',
      label: 'Financing concerns',
      base: 80,
      boost: 8,
      patterns: [
        /pre.?approv/,
        /qualif/,
        /lender/,
        /mortgage/,
        /down ?payment/,
        /afford/,
        /financ/,
      ],
    },
    {
      category: 'inspection',
      label: 'Inspection worries',
      base: 78,
      boost: 8,
      patterns: [
        /inspect/,
        /roof/,
        /foundation/,
        /water heater/,
        /turns? up/,
        /repair/,
        /disclos/,
        /makes? me nervous/,
      ],
    },
    {
      category: 'more_options',
      label: 'Wants to see more first',
      base: 76,
      boost: 8,
      patterns: [
        /see (a few )?more/,
        /more (properties|homes|houses)/,
        /keep looking/,
        /look around/,
        /before we (decide|commit)/,
        /not ready to (commit|decide)/,
      ],
    },
    {
      category: 'price',
      label: 'Price too high',
      base: 80,
      boost: 8,
      patterns: [
        /too (high|expensive|much)/,
        /above (our|what we)/,
        /out of (our )?budget/,
        /over ?budget/,
        /can'?t afford/,
        /stretch/,
        /comfort zone/,
      ],
    },
  ],
};

// ------------------------------------------------------------------ detect
// Look at the client's running transcript text and return the strongest
// objection match, or null when nothing objection-like is detected.
function detect(clientText, side) {
  const ruleSet = RULES[side];
  if (!ruleSet) return null;

  let best = null;
  for (const rule of ruleSet) {
    let hits = 0;
    let firstIndex = -1;
    for (const pattern of rule.patterns) {
      const m = clientText.match(pattern);
      if (m) {
        hits += 1;
        if (firstIndex === -1) firstIndex = m.index;
      }
    }
    if (hits === 0) continue;

    const confidence = Math.min(rule.base + (hits - 1) * rule.boost, 98);
    if (!best || confidence > best.confidence) {
      best = { category: rule.category, label: rule.label, confidence, firstIndex, hits };
    }
  }
  if (!best) return null;

  // Quote the clause the client actually said, so the "why" reads like
  // something a human would point at rather than a raw regex fragment.
  const clause = clauseAround(clientText, best.firstIndex);
  const extra = best.hits > 1 ? ` (${best.hits} signals matched)` : "";
  return {
    category: best.category,
    label: best.label,
    confidence: best.confidence,
    why: `Heard \u201c${clause}\u201d \u2014 matches ${best.label}${extra}.`,
  };
}

// Return the sentence or comma-delimited clause containing `index`, trimmed
// to a readable length. This is what makes the "why" line human-legible.
function clauseAround(text, index) {
  if (index < 0) return text.trim();
  const bounds = /[.!?;,]|\u2014/;
  let start = 0;
  let end = text.length;

  // Walk backwards to the nearest boundary before the match.
  for (let i = index - 1; i >= 0; i--) {
    if (bounds.test(text[i])) { start = i + 1; break; }
  }
  // Walk forwards to the nearest boundary after the match.
  for (let i = index; i < text.length; i++) {
    if (bounds.test(text[i])) { end = i; break; }
  }

  let clause = text.slice(start, end).trim().replace(/^[,\s]+/, "");
  if (clause.length > 110) clause = clause.slice(0, 107).trimEnd() + "\u2026";
  return clause || text.trim();
}

// ------------------------------------------------------------------ coaching
// One short EN + one short ES line per category, with three variants (angles)
// each. Regenerate cycles to the next variant so it reads as a fresh angle.
const LINES = {
  commission: [
    {
      en: "I get that six percent feels like a lot. Can I show you the breakdown of what it buys — staging, photography, and top-dollar offers?",
      es: "Entiendo que el seis por ciento parezca mucho. ¿Puedo mostrarle el desglose de lo que incluye: home staging, fotografía y ofertas al mejor precio?",
    },
    {
      en: "Instead of defending the fee, let's talk about your net — what you walk away with, not the percentage.",
      es: "En lugar de defender la comisión, hablemos de lo neto: con cuánto se queda usted, no del porcentaje.",
    },
    {
      en: "Most of my sellers find the fee pays for itself when the marketing brings a stronger offer. Want to see a recent example?",
      es: "La mayoría de mis vendedores ve que la comisión se paga sola cuando el marketing trae una mejor oferta. ¿Quiere ver un ejemplo reciente?",
    },
  ],
  existing_agent: [
    {
      en: "That's fair — loyalty matters. What would you want to see from me that they aren't already doing?",
      es: "Es justo, la lealtad importa. ¿Qué le gustaría ver de mi parte que ellos no estén haciendo?",
    },
    {
      en: "No pressure to switch. Here's what a second opinion from me would add, so you can compare side by side.",
      es: "Sin presión de cambiar. Esto es lo que aportaría una segunda opinión mía, para que pueda comparar.",
    },
    {
      en: "If they're already doing a great job, you're in good hands. If you ever want a second set of eyes, I'm here.",
      es: "Si ya están haciendo un gran trabajo, está en buenas manos. Si alguna vez quiere una segunda opinión, aquí estoy.",
    },
  ],
  testing_market: [
    {
      en: "No problem — a market analysis is free and you're under no obligation to list. Want to see the numbers?",
      es: "No hay problema: el análisis de mercado es gratis y no está obligado a vender. ¿Quiere ver los números?",
    },
    {
      en: "Let's find out what it's worth, and if the timing isn't right, you'll at least know your number.",
      es: "Averigüemos cuánto vale y, si el momento no es el indicado, al menos sabrá su número.",
    },
    {
      en: "Even just to plan, knowing the value now helps you decide with confidence later.",
      es: "Aunque sea solo para planificar, conocer el valor ahora le ayuda a decidir con confianza después.",
    },
  ],
  price_timing: [
    {
      en: "That number reflects today's comps — let me walk you through them. If we wait, the data can move either way.",
      es: "Ese número refleja las comparables de hoy: se las explico. Si esperamos, los datos pueden moverse en cualquier dirección.",
    },
    {
      en: "Let's compare a spring listing against the buyers who are active right now, so you can see the trade-off.",
      es: "Comparemos una venta en primavera con los compradores activos ahora mismo, para que vea la diferencia.",
    },
    {
      en: "The data says now, but this is your call. Let's map both timelines so you can choose with confidence.",
      es: "Los datos dicen ahora, pero la decisión es suya. Tracemos ambos escenarios para que elija con confianza.",
    },
  ],
  financing: [
    {
      en: "Let's get you pre-approved before we worry about the amount — you may qualify for more than you think.",
      es: "Obtengamos su preaprobación antes de preocuparnos por el monto: puede calificar para más de lo que cree.",
    },
    {
      en: "I can connect you with a lender today, and they'll tell us your real number in about ten minutes.",
      es: "Puedo ponerlo en contacto con un prestamista hoy, y nos dirá su número real en unos diez minutos.",
    },
    {
      en: "Pre-approval also makes your offer stronger, so it's the single best next step.",
      es: "La preaprobación también fortalece su oferta, así que es el mejor siguiente paso.",
    },
  ],
  inspection: [
    {
      en: "We'll order the inspection and see the facts before any decision — you're never locked in.",
      es: "Ordenaremos la inspección y veremos los hechos antes de decidir: usted nunca queda comprometido.",
    },
    {
      en: "Every home has age. The inspection tells us what's real, and we can negotiate repairs if needed.",
      es: "Toda casa tiene años. La inspección nos dice qué es real, y podemos negociar reparaciones si hace falta.",
    },
    {
      en: "You can make the offer contingent on inspection, so you're protected if something big shows up.",
      es: "Puede hacer la oferta sujeta a inspección, así queda protegido si aparece algo importante.",
    },
  ],
  more_options: [
    {
      en: "Let's see those few more this week — but if this is your favorite, we should keep it in the running.",
      es: "Veamos esas pocas más esta semana, pero si esta es su favorita, mantengámosla en la lista.",
    },
    {
      en: "Totally fair to compare. I'll line up showings quickly so you can decide without losing this one.",
      es: "Totalmente justo comparar. Organizaré visitas rápido para que decida sin perder esta.",
    },
    {
      en: "What would a better property have that this one doesn't? That tells us whether to keep looking.",
      es: "¿Qué tendría una mejor propiedad que esta no tenga? Eso nos dice si seguimos buscando.",
    },
  ],
  price: [
    {
      en: "Let's look at the comps together — if it's priced at market, we negotiate from the data, not the feeling.",
      es: "Veamos las comparables juntos: si está a precio de mercado, negociamos desde los datos, no desde la sensación.",
    },
    {
      en: "A strong offer doesn't always need full price. What monthly payment would feel comfortable?",
      es: "Una buena oferta no siempre necesita el precio completo. ¿Qué pago mensual le resultaría cómodo?",
    },
    {
      en: "The list price is a starting point. Let me find out how motivated the sellers are before you walk.",
      es: "El precio de lista es un punto de partida. Déjeme averiguar qué tan motivados están los vendedores antes de que se retire.",
    },
  ],
};

// generate(category, angle) -> { en, es }. angle 0/1/2 picks the variant.
function generate(category, angle = 0) {
  const variants = LINES[category] || LINES.price;
  const pick = variants[angle % variants.length];
  return { en: pick.en, es: pick.es, variant: angle % variants.length, variants: variants.length };
}

// Expose for the browser (loaded as a classic script) and for Node tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detect, generate };
} else {
  window.Engine = { detect, generate };
}
