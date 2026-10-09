/**
 * Cálculos sobre las series alineadas por día relativo. Funciones puras: se
 * usan en el navegador para responder a la selección y al día de comparación.
 */
import type { Lanzamiento, Plataforma, PuntoVentas, SerieVentas } from './tipos';

export type TipoValor = 'exacto' | 'estimado' | 'antes' | 'cierre';

export interface ValorEnDia {
  valor: number;
  /**
   * - exacto: ese día hay registro.
   * - estimado: el día cae entre dos registros (p. ej. un fin de semana sin
   *   cargar); se interpola en línea recta entre ambos.
   * - antes: el lanzamiento aún no había empezado a captar → 0.
   * - cierre: el día es posterior al último registro de una etapa que ya
   *   cerró (la captación pasada la Clase 1, o una ventana de ventas): vale
   *   su valor final.
   */
  tipo: TipoValor;
}

/** Un valor calculado con otros es estimado si alguno lo es, y de cierre si todos lo son. */
const tipoCombinado = (...valores: ValorEnDia[]): TipoValor => {
  if (valores.some((v) => v.tipo === 'estimado')) return 'estimado';
  return valores.every((v) => v.tipo === 'cierre') ? 'cierre' : 'exacto';
};

interface ConDia {
  dia: number;
}

/**
 * Valor ACUMULADO de una serie en un día relativo. `null` si el día es
 * posterior al último registro (todavía no hay dato: no se inventa).
 */
export function valorEn<T extends ConDia>(puntos: T[], dia: number, valor: (p: T) => number): ValorEnDia | null {
  if (puntos.length === 0) return null;
  if (dia < puntos[0].dia) return { valor: 0, tipo: 'antes' };
  if (dia > puntos[puntos.length - 1].dia) return null;
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i];
    if (p.dia === dia) return { valor: valor(p), tipo: 'exacto' };
    if (p.dia > dia) {
      const a = puntos[i - 1];
      const t = (dia - a.dia) / (p.dia - a.dia);
      return { valor: valor(a) + (valor(p) - valor(a)) * t, tipo: 'estimado' };
    }
  }
  return null;
}

export interface Incremento {
  dia: number;
  valor: number;
  /** Cuántos días cubre el registro (más de 1 si hubo días sin cargar). */
  cubre: number;
}

/**
 * Lo nuevo de cada día registrado: diferencia con el registro anterior. El
 * primer registro cuenta completo (se parte de 0).
 */
export function incrementos<T extends ConDia>(puntos: T[], valor: (p: T) => number): Map<number, Incremento> {
  const salida = new Map<number, Incremento>();
  puntos.forEach((p, i) => {
    const previo = puntos[i - 1];
    salida.set(p.dia, {
      dia: p.dia,
      valor: valor(p) - (previo ? valor(previo) : 0),
      cubre: previo ? p.dia - previo.dia : 1,
    });
  });
  return salida;
}

export interface ValorDiario extends Incremento {
  /** Día registrado que trae el dato (≠ dia si se repartió). */
  diaRegistro: number;
}

/**
 * Serie diaria continua para las gráficas: cuando un registro cubre varios
 * días (p. ej. el lunes trae viernes-sábado-domingo), se reparte en partes
 * iguales entre ellos para no dibujar un pico falso.
 */
export function diarioRepartido<T extends ConDia>(puntos: T[], valor: (p: T) => number): Map<number, ValorDiario> {
  const salida = new Map<number, ValorDiario>();
  for (const inc of incrementos(puntos, valor).values()) {
    for (let k = 0; k < inc.cubre; k++) {
      const dia = inc.dia - k;
      salida.set(dia, { dia, valor: inc.valor / inc.cubre, cubre: inc.cubre, diaRegistro: inc.dia });
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Métricas de un lanzamiento en un día
// ---------------------------------------------------------------------------

/**
 * Registros e inversión: pasada la Clase 1 la captación ya cerró, así que
 * después de su último registro vale el valor final (las ventas se comparan
 * contra él). Antes de la Clase 1 no se inventa: puede ser un día sin cargar.
 */
function captacionEn<T extends ConDia>(puntos: T[], dia: number, valor: (p: T) => number): ValorEnDia | null {
  const v = valorEn(puntos, dia, valor);
  if (v || dia <= 0 || puntos.length === 0) return v;
  return { valor: valor(puntos[puntos.length - 1]), tipo: 'cierre' };
}

export const registrosEn = (l: Lanzamiento, dia: number) => captacionEn(l.registros, dia, (p) => p.total);
export const pautaEn = (l: Lanzamiento, dia: number) => captacionEn(l.registros, dia, (p) => p.pauta);
export const organicoEn = (l: Lanzamiento, dia: number) => captacionEn(l.registros, dia, (p) => p.total - p.pauta);
export const fuenteEn = (l: Lanzamiento, clave: string, dia: number) =>
  captacionEn(l.registros, dia, (p) => p.porFuente[clave] ?? 0);
export const inversionEn = (l: Lanzamiento, dia: number) => captacionEn(l.inversion.puntos, dia, (p) => p.acumulado);

/** Ventas de una serie: pasada su ventana, después de la última venta vale el total final. */
function ventasSerieEn(serie: SerieVentas, dia: number, valor: (p: PuntoVentas) => number): ValorEnDia | null {
  const v = valorEn(serie.puntos, dia, valor);
  if (v || !serie.cerrada || serie.puntos.length === 0) return v;
  return { valor: valor(serie.puntos[serie.puntos.length - 1]), tipo: 'cierre' };
}

export const ventasEn = (l: Lanzamiento, dia: number) => ventasSerieEn(l.ventas, dia, (p) => p.ventas);
/** Centavos de USD. */
export const cobradoEn = (l: Lanzamiento, dia: number) => ventasSerieEn(l.ventas, dia, (p) => p.cobrado);
export const downsellEn = (l: Lanzamiento, dia: number) => ventasSerieEn(l.downsell, dia, (p) => p.ventas);
/** Centavos de USD. */
export const cobradoDownsellEn = (l: Lanzamiento, dia: number) => ventasSerieEn(l.downsell, dia, (p) => p.cobrado);

type ValorDe = (l: Lanzamiento, dia: number) => ValorEnDia | null;

/** Lanzamiento + downsell. Sin ventas de downsell, este cuenta 0. */
const conDownsell =
  (principal: ValorDe, downsell: ValorDe): ValorDe =>
  (l, dia) => {
    const a = principal(l, dia);
    const b: ValorEnDia | null = l.downsell.puntos.length ? downsell(l, dia) : { valor: 0, tipo: 'antes' };
    if (!a || !b) return null;
    return { valor: a.valor + b.valor, tipo: tipoCombinado(a, b) };
  };

export const ventasTotalesEn = conDownsell(ventasEn, downsellEn);
/** Centavos de USD. */
export const cobradoTotalEn = conDownsell(cobradoEn, cobradoDownsellEn);

/** Inversión acumulada / registros de pauta acumulados (centavos por registro). */
export function costoPorRegistroEn(l: Lanzamiento, dia: number): ValorEnDia | null {
  const inv = inversionEn(l, dia);
  const pauta = pautaEn(l, dia);
  if (!inv || !pauta || inv.valor <= 0 || pauta.valor <= 0) return null;
  return { valor: inv.valor / pauta.valor, tipo: tipoCombinado(inv, pauta) };
}

/** Ventas (del lanzamiento, o las que se pidan) / registros totales (fracción). */
export function conversionEn(l: Lanzamiento, dia: number, ventas: ValorDe = ventasEn): ValorEnDia | null {
  const ven = ventas(l, dia);
  const reg = registrosEn(l, dia);
  if (!ven || !reg || ven.valor <= 0 || reg.valor <= 0) return null;
  return { valor: ven.valor / reg.valor, tipo: tipoCombinado(ven, reg) };
}

/** Inversión acumulada / ventas (centavos por venta). */
export function costoPorVentaEn(l: Lanzamiento, dia: number): ValorEnDia | null {
  const inv = inversionEn(l, dia);
  const ven = ventasEn(l, dia);
  if (!inv || !ven || inv.valor <= 0 || ven.valor <= 0) return null;
  return { valor: inv.valor / ven.valor, tipo: tipoCombinado(inv, ven) };
}

/**
 * Cobrado (del lanzamiento, o lo que se pida) / inversión: cuántas veces se
 * recuperó lo invertido. Solo si la inversión está en USD.
 */
export function retornoEn(l: Lanzamiento, dia: number, cobrado: ValorDe = cobradoEn): ValorEnDia | null {
  if (l.moneda !== 'USD') return null;
  const cob = cobrado(l, dia);
  const inv = inversionEn(l, dia);
  if (!cob || !inv || cob.valor <= 0 || inv.valor <= 0) return null;
  return { valor: cob.valor / inv.valor, tipo: tipoCombinado(cob, inv) };
}

/** Suma de los valores diarios de una plataforma hasta un día (incluido). */
export function plataformaHasta(p: Plataforma, dia: number) {
  let registros = 0;
  let inversion = 0;
  let conDatos = false;
  for (const punto of p.puntos) {
    if (punto.dia > dia) continue;
    if (punto.registros != null) {
      registros += punto.registros;
      conDatos = true;
    }
    if (punto.inversion != null) {
      inversion += punto.inversion;
      conDatos = true;
    }
  }
  return { registros, inversion, conDatos };
}

export interface Rango {
  desde: number;
  hasta: number;
}

function rango(dias: number[]): Rango | null {
  if (dias.length === 0) return null;
  return { desde: Math.min(...dias), hasta: Math.max(...dias) };
}

/** Primer y último día con datos de captación (registros o inversión). */
export const rangoCaptacionDe = (l: Lanzamiento) =>
  rango([...l.registros.map((p) => p.dia), ...l.inversion.puntos.map((p) => p.dia)]);

/** Primer y último día con ventas del lanzamiento. */
export const rangoVentasDe = (l: Lanzamiento) => rango(l.ventas.puntos.map((p) => p.dia));

/** Primer y último día con ventas de downsell. */
export const rangoDownsellDe = (l: Lanzamiento) => rango(l.downsell.puntos.map((p) => p.dia));

/** Primer y último día con cualquier dato (captación, ventas o downsell). */
export const rangoDe = (l: Lanzamiento) =>
  rango([...l.registros, ...l.inversion.puntos, ...l.ventas.puntos, ...l.downsell.puntos].map((p) => p.dia));

/**
 * Cierre de captación: último registro hasta la Clase 1 (o el último que
 * haya, si solo hay datos posteriores).
 */
export function diaCierre(l: Lanzamiento): number | null {
  if (l.registros.length === 0) return null;
  const antes = l.registros.filter((p) => p.dia <= 0);
  const lista = antes.length ? antes : l.registros;
  return lista[lista.length - 1].dia;
}
