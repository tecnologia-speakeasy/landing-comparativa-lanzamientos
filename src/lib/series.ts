/**
 * Cálculos sobre las series alineadas por día relativo. Funciones puras: se
 * usan en el navegador para responder a la selección y al día de comparación.
 */
import type { Lanzamiento, Plataforma } from './tipos';

export type TipoValor = 'exacto' | 'estimado' | 'antes';

export interface ValorEnDia {
  valor: number;
  /**
   * - exacto: ese día hay registro.
   * - estimado: el día cae entre dos registros (p. ej. un fin de semana sin
   *   cargar); se interpola en línea recta entre ambos.
   * - antes: el lanzamiento aún no había empezado a captar → 0.
   */
  tipo: TipoValor;
}

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

export const registrosEn = (l: Lanzamiento, dia: number) => valorEn(l.registros, dia, (p) => p.total);
export const pautaEn = (l: Lanzamiento, dia: number) => valorEn(l.registros, dia, (p) => p.pauta);
export const organicoEn = (l: Lanzamiento, dia: number) => valorEn(l.registros, dia, (p) => p.total - p.pauta);
export const fuenteEn = (l: Lanzamiento, clave: string, dia: number) =>
  valorEn(l.registros, dia, (p) => p.porFuente[clave] ?? 0);
export const inversionEn = (l: Lanzamiento, dia: number) => valorEn(l.inversion.puntos, dia, (p) => p.acumulado);

/** Inversión acumulada / registros de pauta acumulados (centavos por registro). */
export function costoPorRegistroEn(l: Lanzamiento, dia: number): ValorEnDia | null {
  const inv = inversionEn(l, dia);
  const pauta = pautaEn(l, dia);
  if (!inv || !pauta || inv.valor <= 0 || pauta.valor <= 0) return null;
  return {
    valor: inv.valor / pauta.valor,
    tipo: inv.tipo === 'exacto' && pauta.tipo === 'exacto' ? 'exacto' : 'estimado',
  };
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

/** Primer y último día con datos (registros o inversión). */
export function rangoDe(l: Lanzamiento): { desde: number; hasta: number } | null {
  const dias = [...l.registros.map((p) => p.dia), ...l.inversion.puntos.map((p) => p.dia)];
  if (dias.length === 0) return null;
  return { desde: Math.min(...dias), hasta: Math.max(...dias) };
}

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
