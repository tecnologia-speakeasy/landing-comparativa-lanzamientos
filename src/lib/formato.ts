/** Formatos es-CO, los mismos que usa la tabla de Métricas de inventario. */

const enteros = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const porcentaje = new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: 1 });
// Las conversiones rondan el 1 %: con un decimal no se distinguen.
const tasa = new Intl.NumberFormat('es-CO', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compacto = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtNumero = (n: number) => enteros.format(n);
export const fmtCompacto = (n: number) => compacto.format(n);
export const fmtPorcentaje = (n: number) => porcentaje.format(n);
/** 0.00547 → "0,55 %". */
export const fmtTasa = (n: number) => tasa.format(n);
/** 3.21 → "3,2×". */
export const fmtVeces = (n: number) => `${decimal.format(n)}×`;

const cacheMoneda = new Map<string, Intl.NumberFormat>();
function formatoMoneda(moneda: string, decimales: number) {
  const clave = `${moneda}|${decimales}`;
  let f = cacheMoneda.get(clave);
  if (!f) {
    try {
      f = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: moneda,
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      });
    } catch {
      f = new Intl.NumberFormat('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    }
    cacheMoneda.set(clave, f);
  }
  return f;
}

/** Centavos → "US$ 2.070,09". */
export function fmtMoneda(centavos: number, moneda: string, decimales = 2): string {
  return formatoMoneda(moneda, decimales).format(centavos / 100);
}

/** Centavos → "US$ 12,0 mil" para ejes. */
export function fmtMonedaCompacta(centavos: number, moneda: string): string {
  const unidades = centavos / 100;
  if (Math.abs(unidades) < 1000) return fmtMoneda(centavos, moneda, 0);
  const simbolo = formatoMoneda(moneda, 0)
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value ?? moneda;
  return `${simbolo} ${compacto.format(unidades)}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-09-29' → '29 sep'. */
export function fmtFechaCorta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

/** '2026-09-29' → '29 sep 2026'. */
export function fmtFechaLarga(iso: string): string {
  const [a] = iso.split('-');
  return `${fmtFechaCorta(iso)} ${a}`;
}

/** -6 → 'D-6', 0 → 'D0', 3 → 'D+3'. */
export function fmtDia(dia: number): string {
  if (dia === 0) return 'D0';
  return dia < 0 ? `D${dia}` : `D+${dia}`;
}

/** Texto largo del día relativo. */
export function fmtDiaLargo(dia: number): string {
  if (dia === 0) return 'Día de la Clase 1';
  const n = Math.abs(dia);
  const dias = n === 1 ? 'día' : 'días';
  return dia < 0 ? `${n} ${dias} antes de la Clase 1` : `${n} ${dias} después de la Clase 1`;
}

/** Diferencia relativa con signo: "+52,3 %". */
export function fmtVariacion(actual: number, base: number): string | null {
  if (!base) return null;
  const v = (actual - base) / base;
  const texto = fmtPorcentaje(Math.abs(v));
  return `${v >= 0 ? '+' : '−'}${texto}`;
}
