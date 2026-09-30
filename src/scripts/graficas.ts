/**
 * Chart.js con el estilo de la landing: marcas finas, grilla tenue, tooltip
 * con línea guía y marcas verticales para la Clase 1, hoy y el día que se
 * está comparando.
 */
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type ChartType,
  type Plugin,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, BarController, BarElement, CategoryScale, LinearScale, Tooltip);

export const TINTA = {
  primaria: '#1f1a2e',
  secundaria: '#4b4760',
  tenue: '#6f6a80',
  grilla: '#ece9f2',
  eje: '#d5d1de',
  superficie: '#ffffff',
};

/**
 * Un color por lanzamiento, en orden cronológico (el color sigue al
 * lanzamiento, no a su posición en la selección). Morado y fucsia de marca
 * primero; el orden se validó para daltonismo (ΔE entre vecinos ≥ 9).
 */
export const PALETA = ['#6b46c1', '#ff327d', '#2a78d6', '#eda100', '#1baf7a'];

const FUENTE = "'Montserrat Variable', Montserrat, Arial, sans-serif";
Chart.defaults.font.family = FUENTE;
Chart.defaults.font.size = 12;
Chart.defaults.color = TINTA.tenue;
// Sin animaciones si la persona pidió reducir el movimiento.
if (matchMedia('(prefers-reduced-motion: reduce)').matches) Chart.defaults.animation = false;

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

export interface OpcionesMarcas {
  /** Índice de la categoría del día 0 (Clase 1), si está en el eje. */
  clase1?: number;
  /** Índices de "hoy" (uno por lanzamiento en curso). */
  hoy?: { indice: number; texto: string }[];
  /** Índice del día que se está comparando: se sombrea la columna. */
  comparado?: number;
}

declare module 'chart.js' {
  interface PluginOptionsByType<TType extends ChartType> {
    marcas?: OpcionesMarcas;
    etiquetasFinales?: { formato: (v: number) => string } | false;
    etiquetasBarras?: { formato: (v: number) => string } | false;
  }
}

function anchoCategoria(chart: Chart): number {
  const x = chart.scales.x;
  const n = chart.data.labels?.length ?? 0;
  if (n < 2) return x.width;
  return Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0));
}

const marcas: Plugin = {
  id: 'marcas',
  beforeDatasetsDraw(chart, _args, opciones: OpcionesMarcas) {
    if (opciones?.comparado == null) return;
    const { ctx, chartArea } = chart;
    const x = chart.scales.x.getPixelForValue(opciones.comparado);
    const ancho = Math.max(anchoCategoria(chart), 8);
    ctx.save();
    ctx.fillStyle = 'rgba(65, 39, 107, 0.07)';
    ctx.fillRect(x - ancho / 2, chartArea.top, ancho, chartArea.bottom - chartArea.top);
    ctx.restore();
  },
  afterDatasetsDraw(chart, _args, opciones: OpcionesMarcas) {
    if (!opciones) return;
    const { ctx, chartArea } = chart;
    // Tinta neutra: el morado y el fucsia ya identifican lanzamientos.
    // Las etiquetas van arriba, a la izquierda de su línea; si una pisa a la
    // anterior (gráfica angosta), baja al pie del área de datos.
    let limiteIzquierdo = Infinity;
    const linea = (indice: number, texto: string, discontinua: boolean) => {
      const x = Math.round(chart.scales.x.getPixelForValue(indice)) + 0.5;
      ctx.save();
      ctx.strokeStyle = TINTA.secundaria;
      ctx.lineWidth = 1;
      ctx.setLineDash(discontinua ? [3, 3] : []);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.font = `600 11px ${FUENTE}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      const ancho = ctx.measureText(texto).width;
      const arriba = x - 4 < limiteIzquierdo - 6;
      const y = arriba ? chartArea.top - 4 : chartArea.bottom - 4;
      if (!arriba) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(x - 8 - ancho, y - 14, ancho + 6, 14);
      }
      ctx.fillStyle = TINTA.secundaria;
      ctx.fillText(texto, x - 4, y);
      if (arriba) limiteIzquierdo = Math.min(limiteIzquierdo, x - 4 - ancho);
      ctx.restore();
    };
    if (opciones.clase1 != null) linea(opciones.clase1, 'Clase 1', false);
    for (const h of opciones.hoy ?? []) linea(h.indice, h.texto, true);
  },
};

/** Línea guía vertical bajo el tooltip. */
const guia: Plugin = {
  id: 'guia',
  afterDatasetsDraw(chart) {
    const activos = chart.tooltip?.getActiveElements() ?? [];
    if (activos.length === 0 || chart.options.indexAxis === 'y') return;
    const { ctx, chartArea } = chart;
    const x = Math.round(activos[0].element.x) + 0.5;
    ctx.save();
    ctx.strokeStyle = TINTA.eje;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

/**
 * Valor al final de cada línea, encima y a la izquierda del punto. Se
 * dibujan del lanzamiento más reciente al más antiguo; si una etiqueta pisa
 * a otra no se dibuja (el tooltip y la tabla la siguen mostrando): apilarlas
 * las separaría de su línea.
 */
const etiquetasFinales: Plugin = {
  id: 'etiquetasFinales',
  afterDatasetsDraw(chart, _args, opciones) {
    if (!opciones || !('formato' in opciones)) return;
    const { ctx, chartArea } = chart;
    const ocupadas: { x1: number; x2: number; y: number }[] = [];
    ctx.save();
    ctx.font = `600 12px ${FUENTE}`;
    ctx.fillStyle = TINTA.primaria;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (let i = chart.data.datasets.length - 1; i >= 0; i--) {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) continue;
      const datos = chart.data.datasets[i].data as (number | null)[];
      const ultimo = datos.findLastIndex((v) => v != null);
      if (ultimo === -1) continue;
      const punto = meta.data[ultimo];
      const texto = opciones.formato(datos[ultimo] as number);
      const ancho = ctx.measureText(texto).width;
      const x1 = Math.max(chartArea.left + 2, punto.x - 6 - ancho);
      const y = Math.max(chartArea.top + 8, punto.y - 14);
      const choca = ocupadas.some((o) => Math.abs(o.y - y) < 18 && x1 - 4 < o.x2 && x1 + ancho + 4 > o.x1);
      if (choca) continue;
      ocupadas.push({ x1, x2: x1 + ancho, y });
      ctx.fillText(texto, x1, y);
    }
    ctx.restore();
  },
};

/** Valor en la punta de cada barra horizontal. */
const etiquetasBarras: Plugin = {
  id: 'etiquetasBarras',
  afterDatasetsDraw(chart, _args, opciones) {
    if (!opciones || !('formato' in opciones)) return;
    const { ctx } = chart;
    ctx.save();
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = TINTA.secundaria;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      (ds.data as (number | null)[]).forEach((v, k) => {
        if (v == null) return;
        const barra = meta.data[k] as unknown as { x: number; y: number };
        ctx.fillText(opciones.formato(v), barra.x + 6, barra.y);
      });
    });
    ctx.restore();
  },
};

Chart.register(marcas, guia, etiquetasFinales, etiquetasBarras);

// ---------------------------------------------------------------------------
// Opciones compartidas
// ---------------------------------------------------------------------------

export const estiloTooltip = {
  backgroundColor: '#ffffff',
  titleColor: TINTA.primaria,
  bodyColor: TINTA.secundaria,
  footerColor: TINTA.tenue,
  borderColor: 'rgba(31, 26, 46, 0.14)',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
  boxPadding: 4,
  usePointStyle: true,
  titleFont: { weight: 600 as const },
  footerFont: { weight: 400 as const, size: 11 },
};

export const ejeX = {
  grid: { display: false },
  border: { color: TINTA.eje },
  ticks: { color: TINTA.tenue, maxRotation: 0, autoSkipPadding: 12 },
};

export function ejeY(formato: (v: number) => string) {
  return {
    beginAtZero: true,
    grid: { color: TINTA.grilla },
    border: { display: false },
    ticks: { color: TINTA.tenue, maxTicksLimit: 6, callback: (v: number | string) => formato(Number(v)) },
  };
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

const graficas = new Map<string, Chart>();

/**
 * Crea o actualiza la gráfica del canvas. Si cambia el tipo (línea ↔ barras)
 * se recrea; si no, se actualizan datos y opciones sin parpadeo. Sin
 * `animar` (p. ej. al mover el deslizador) el cambio es inmediato.
 */
export function pintar(canvas: HTMLCanvasElement, config: ChartConfiguration, animar = true) {
  const actual = graficas.get(canvas.id);
  if (actual && (actual.config as ChartConfiguration).type === config.type) {
    actual.data = config.data;
    actual.options = config.options ?? {};
    actual.update(animar ? undefined : 'none');
    return;
  }
  actual?.destroy();
  graficas.set(canvas.id, new Chart(canvas, config));
}
