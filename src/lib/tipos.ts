/**
 * Datos que el servidor arma a partir de la base y entrega a la página.
 * El navegador los recibe como JSON, así que todo es serializable.
 *
 * Convención de fechas: `fecha` es siempre 'YYYY-MM-DD' (columnas DATE, sin
 * zona horaria) y `dia` es la distancia en días a la fecha del lanzamiento
 * (Clase 1). Día 0 = Clase 1, día -6 = seis días antes. Ese `dia` es el eje
 * común que alinea lanzamientos de fechas distintas.
 */

/** Fuente de registros normalizada entre lanzamientos (RSS y PAUTA → pauta). */
export interface FuenteCanonica {
  clave: string;
  etiqueta: string;
  esPauta: boolean;
  orden: number;
}

/** Registros ACUMULADOS de un lanzamiento en un día registrado. */
export interface PuntoRegistros {
  dia: number;
  fecha: string;
  total: number;
  /** Parte del total que viene de fuentes pagas. */
  pauta: number;
  /** Acumulado por clave de fuente canónica. */
  porFuente: Record<string, number>;
}

/** Inversión ACUMULADA (en centavos) hasta un día registrado. */
export interface PuntoInversion {
  dia: number;
  fecha: string;
  acumulado: number;
}

/** Valores DIARIOS de una plataforma paga (Meta Ads, TikTok Ads…). */
export interface PuntoPlataforma {
  dia: number;
  fecha: string;
  registros: number | null;
  /** Centavos. */
  inversion: number | null;
}

export interface Plataforma {
  nombre: string;
  puntos: PuntoPlataforma[];
}

/**
 * De dónde sale la inversión del lanzamiento:
 * - 'plataformas': tabla "Captación paga" (valores diarios por plataforma).
 * - 'acumulada': registro único de gasto acumulado por día.
 */
export type OrigenInversion = 'plataformas' | 'acumulada' | null;

export type EstadoLanzamiento = 'proximo' | 'captacion' | 'clases' | 'finalizado';

export interface Lanzamiento {
  id: string;
  nombre: string;
  /** Fecha de la Clase 1: el día 0 del eje. */
  fecha: string;
  moneda: string;
  /** Posición cronológica entre todos los lanzamientos: fija su color. */
  color: number;
  estado: EstadoLanzamiento;
  /** Día relativo de hoy para este lanzamiento. */
  diaHoy: number;
  fuentes: FuenteCanonica[];
  registros: PuntoRegistros[];
  inversion: { origen: OrigenInversion; puntos: PuntoInversion[] };
  plataformas: Plataforma[];
}

export interface DatosComparativa {
  /** Hoy en Colombia, 'YYYY-MM-DD'. */
  hoy: string;
  /** Momento de la consulta (ISO). */
  generado: string;
  lanzamientos: Lanzamiento[];
  /** Todas las fuentes canónicas vistas, en orden de presentación. */
  fuentes: FuenteCanonica[];
}
