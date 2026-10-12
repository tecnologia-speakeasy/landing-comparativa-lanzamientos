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

/** Ventas y cobrado ACUMULADOS hasta un día. */
export interface PuntoVentas {
  dia: number;
  fecha: string;
  /** Compras cuyo primer pago cae hasta este día. */
  ventas: number;
  /** Lo cobrado hasta este día (cuotas incluidas), en centavos de USD. */
  cobrado: number;
}

/** Una venta dentro de la ventana: el día y la hora de su primer pago. */
export interface Compra {
  dia: number;
  /** 'HH:MM' en hora de Colombia; `null` si el pago no tiene hora registrada. */
  hora: string | null;
}

/**
 * Ventas de un tipo (las del lanzamiento o las del downsell), de los
 * productos de Cartera asociados en productos-lanzamiento.ts.
 */
export interface SerieVentas {
  /** Nombres de los productos. */
  productos: string[];
  /** Último día de la ventana de ventas ('YYYY-MM-DD'), si se definió. */
  cierre: string | null;
  /** La ventana ya terminó: después del último punto vale el total final. */
  cerrada: boolean;
  /** Continua desde la primera venta: un día sin ventas repite el acumulado. */
  puntos: PuntoVentas[];
  /** Cada venta de `puntos`, para filtrar por día y hora. */
  compras: Compra[];
  /** Compras con primer pago después del cierre: no entran en `puntos`. */
  fueraDeVentana: number;
}

/**
 * De dónde sale la inversión del lanzamiento:
 * - 'plataformas': tabla "Captación paga" (valores diarios por plataforma).
 * - 'acumulada': registro único de gasto acumulado por día.
 */
export type OrigenInversion = 'plataformas' | 'acumulada' | null;

/** Lectura de asistencia en vivo durante una clase. */
export interface MuestraAsistencia {
  /** 'HH:MM', hora de Colombia. */
  hora: string;
  youtube: number | null;
  zoom: number | null;
}

/** Copy de la parrilla enviado el día de una clase (solo el inicio del texto). */
export interface MensajeClase {
  /** 'HH:MM'; `null` si no tiene hora. */
  hora: string | null;
  inicio: string;
  enviado: boolean;
}

export interface ClaseLanzamiento {
  numero: number;
  /** 'YYYY-MM-DD'; `null` si la clase no está en clases_lanzamiento. */
  fecha: string | null;
  muestras: MuestraAsistencia[];
  mensajes: MensajeClase[];
}

export type EstadoLanzamiento ='proximo' | 'captacion' | 'clases' | 'finalizado';

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
  ventas: SerieVentas;
  downsell: SerieVentas;
  /** Asistencia y mensajería de cada clase, por número de clase. */
  clases: ClaseLanzamiento[];
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
