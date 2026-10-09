import { consultar } from './db';
import { diasEntre, hoyColombia, sumarDias } from './fechas';
import { VENTAS_POR_LANZAMIENTO, type TipoVenta } from './productos-lanzamiento';
import type {
  DatosComparativa,
  EstadoLanzamiento,
  FuenteCanonica,
  Lanzamiento,
  Plataforma,
  PuntoInversion,
  PuntoRegistros,
  SerieVentas,
} from './tipos';

/*
 * Lectura de las tablas del módulo Lanzamientos de inventario-speakeasy
 * (esquema public). Solo SELECT: ver `db.ts`.
 *
 *   lanzamientos            fecha = Clase 1, moneda de la inversión
 *   clases_lanzamiento      fechas de las clases (para saber si ya terminó)
 *   fuentes_lanzamiento  ─┐ registros ACUMULADOS por fuente y día
 *   registros_metrica    ─┘ (la tabla "FUENTE" de Métricas)
 *   fuentes_metrica2     ─┐ registros e inversión DIARIOS por plataforma paga
 *   registros_metrica2   ─┘ (la tabla "Captación paga")
 *   registros_inversion     gasto ACUMULADO por día (tabla anterior a "Captación paga")
 *
 * Y del módulo Cartera, para las ventas:
 *
 *   cartera_productos       nombre del producto
 *   cartera_compras       ─┐ cada compra y sus pagos; la relación con el
 *   cartera_compras_pagos ─┘ lanzamiento está en `productos-lanzamiento.ts`
 */

// ---------------------------------------------------------------------------
// Fuentes canónicas
// ---------------------------------------------------------------------------

/**
 * Cada lanzamiento nombra sus fuentes a su manera ("RSS" en marzo, "PAUTA" en
 * octubre; "YT" y "YOUTUBE"…). Para compararlas se agrupan en claves comunes.
 * El orden de esta lista es el orden de presentación. Una fuente que no
 * encaje en ninguna se compara por su propio nombre.
 */
const FUENTES_CONOCIDAS: { clave: string; etiqueta: string; esPauta: boolean; patron: RegExp }[] = [
  { clave: 'pauta', etiqueta: 'Pauta (pago)', esPauta: true, patron: /pauta|\bads\b|pago|^rr?ss\b/i },
  { clave: 'tiktok', etiqueta: 'TikTok orgánico', esPauta: false, patron: /tik\s*tok/i },
  { clave: 'ig', etiqueta: 'Instagram orgánico', esPauta: false, patron: /^ig\b|insta/i },
  { clave: 'fb', etiqueta: 'Facebook orgánico', esPauta: false, patron: /^fb\b|face/i },
  { clave: 'yt', etiqueta: 'YouTube', esPauta: false, patron: /^yt\b|you\s*tube/i },
  { clave: 'correo', etiqueta: 'Correo', esPauta: false, patron: /correo|e-?mail/i },
  { clave: 'wa', etiqueta: 'WhatsApp', esPauta: false, patron: /^wa\b|whats/i },
];

function canonizar(nombre: string): Omit<FuenteCanonica, 'orden'> {
  const limpio = nombre.trim();
  const conocida = FUENTES_CONOCIDAS.find((f) => f.patron.test(limpio));
  if (conocida) return { clave: conocida.clave, etiqueta: conocida.etiqueta, esPauta: conocida.esPauta };
  return { clave: `otra:${limpio.toLowerCase()}`, etiqueta: limpio, esPauta: false };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

interface FilaLanzamiento {
  id: string;
  nombre: string;
  fecha: string;
  moneda: string;
  ultima_clase: string | null;
}
interface FilaFuente {
  id: string;
  lanzamiento_id: string;
  nombre: string;
}
interface FilaRegistro {
  fuente_id: string;
  fecha: string;
  valor: number;
}
interface FilaInversion {
  lanzamiento_id: string;
  fecha: string;
  valor: number;
}
interface FilaRegistro2 {
  fuente_id: string;
  fecha: string;
  valor: number | null;
  inversion: number | null;
}
interface FilaProducto {
  id: string;
  nombre: string;
}
interface FilaVentas {
  producto_id: string;
  fecha: string;
  ventas: number;
}
interface FilaCobro {
  producto_id: string;
  fecha: string;
  centavos: number | null;
}

/** Ventas y cobros de los productos de Cartera asociados a algún lanzamiento. */
function consultarCartera() {
  const ids = [
    ...new Set(Object.values(VENTAS_POR_LANZAMIENTO).flatMap((v) => [...v.ventas.productos, ...v.downsell.productos])),
  ];
  return Promise.all([
    consultar<FilaProducto>(`select id, nombre from cartera_productos where id = any($1::uuid[])`, [ids]),
    // La venta cuenta el día de su primer pago: `created_at` no sirve porque las
    // compras de marzo se cargaron todas juntas en junio, al crear Cartera.
    consultar<FilaVentas>(
      `
      select producto_id, fecha::text as fecha, count(*)::int as ventas
        from (select c.producto_id, min(p.fecha_pago) as fecha
                from cartera_compras c
                join cartera_compras_pagos p on p.compra_id = c.id
               where c.producto_id = any($1::uuid[])
               group by c.id, c.producto_id) primeras
       where fecha is not null
       group by producto_id, fecha
       order by fecha`,
      [ids],
    ),
    consultar<FilaCobro>(
      `
      select c.producto_id, p.fecha_pago::text as fecha, sum(p.ingresado_usd * 100)::float8 as centavos
        from cartera_compras_pagos p
        join cartera_compras c on c.id = p.compra_id
       where c.producto_id = any($1::uuid[]) and p.fecha_pago is not null
       group by c.producto_id, p.fecha_pago
       order by fecha`,
      [ids],
    ),
  ]);
}

export async function cargarComparativa(): Promise<DatosComparativa> {
  // Las fechas salen como texto: el tipo DATE de pg se convierte a Date en la
  // zona del servidor y puede correrse un día.
  const [lanzamientos, fuentes, registros, inversiones, plataformas, registros2, cartera] = await Promise.all([
    consultar<FilaLanzamiento>(`
      select l.id, l.nombre, l.fecha::text as fecha, l.moneda_inversion as moneda,
             (select max(c.fecha)::text from clases_lanzamiento c where c.lanzamiento_id = l.id) as ultima_clase
        from lanzamientos l
       order by l.fecha, l.created_at`),
    consultar<FilaFuente>(`
      select id, lanzamiento_id, nombre from fuentes_lanzamiento order by orden, created_at`),
    consultar<FilaRegistro>(`
      select fuente_id, fecha::text as fecha, valor from registros_metrica order by fecha`),
    consultar<FilaInversion>(`
      select lanzamiento_id, fecha::text as fecha, valor from registros_inversion order by fecha`),
    consultar<FilaFuente>(`
      select id, lanzamiento_id, nombre from fuentes_metrica2 order by orden, created_at`),
    consultar<FilaRegistro2>(`
      select fuente_id, fecha::text as fecha, valor, inversion from registros_metrica2 order by fecha`),
    consultarCartera(),
  ]);
  const [productos, ventas, cobros] = cartera;
  const nombreProducto = new Map(productos.map((p) => [p.id, p.nombre]));

  const hoy = hoyColombia();
  const fuentesVistas = new Map<string, Omit<FuenteCanonica, 'orden'>>();

  const resultado: Lanzamiento[] = lanzamientos.map((l, indice) => {
    const misFuentes = fuentes.filter((f) => f.lanzamiento_id === l.id);
    const canonDe = new Map(misFuentes.map((f) => [f.id, canonizar(f.nombre)]));
    for (const c of canonDe.values()) if (!fuentesVistas.has(c.clave)) fuentesVistas.set(c.clave, c);

    const puntosRegistros = armarRegistros(l.fecha, registros.filter((r) => canonDe.has(r.fuente_id)), canonDe);

    const misPlataformas = plataformas.filter((p) => p.lanzamiento_id === l.id);
    const listaPlataformas: Plataforma[] = misPlataformas.map((p) => ({
      nombre: p.nombre,
      puntos: registros2
        .filter((r) => r.fuente_id === p.id)
        .map((r) => ({ dia: diasEntre(l.fecha, r.fecha), fecha: r.fecha, registros: r.valor, inversion: r.inversion })),
    }));

    const inversion = armarInversion(
      l.fecha,
      listaPlataformas,
      inversiones.filter((i) => i.lanzamiento_id === l.id),
    );

    const clavesPresentes = new Set([...canonDe.values()].map((c) => c.clave));
    const estado = estadoDe(l, hoy, puntosRegistros.length > 0);

    const config = VENTAS_POR_LANZAMIENTO[l.id];
    const serie = (tipo: TipoVenta | undefined) =>
      armarVentas(l.fecha, tipo ?? { productos: [] }, { ventas, cobros, nombreProducto, hoy, estado });

    return {
      id: l.id,
      nombre: l.nombre,
      fecha: l.fecha,
      moneda: l.moneda || 'USD',
      color: indice,
      estado,
      diaHoy: diasEntre(l.fecha, hoy),
      fuentes: ordenarFuentes([...clavesPresentes].map((c) => fuentesVistas.get(c)!)),
      registros: puntosRegistros,
      inversion,
      plataformas: listaPlataformas,
      ventas: serie(config?.ventas),
      downsell: serie(config?.downsell),
    };
  });

  return {
    hoy,
    generado: new Date().toISOString(),
    lanzamientos: resultado,
    fuentes: ordenarFuentes([...fuentesVistas.values()]),
  };
}

// ---------------------------------------------------------------------------
// Armado de series
// ---------------------------------------------------------------------------

/**
 * Registros acumulados por día. Igual que en inventario, la fuente que no
 * tiene valor un día cuenta 0 para el TOTAL de ese día; así los totales
 * coinciden con los que ve el equipo en la tabla de Métricas.
 */
function armarRegistros(
  fechaLanzamiento: string,
  filas: FilaRegistro[],
  canonDe: Map<string, Omit<FuenteCanonica, 'orden'>>,
): PuntoRegistros[] {
  const porFecha = new Map<string, PuntoRegistros>();
  for (const r of filas) {
    const canon = canonDe.get(r.fuente_id)!;
    let punto = porFecha.get(r.fecha);
    if (!punto) {
      punto = { dia: diasEntre(fechaLanzamiento, r.fecha), fecha: r.fecha, total: 0, pauta: 0, porFuente: {} };
      porFecha.set(r.fecha, punto);
    }
    punto.total += r.valor;
    if (canon.esPauta) punto.pauta += r.valor;
    punto.porFuente[canon.clave] = (punto.porFuente[canon.clave] ?? 0) + r.valor;
  }
  return [...porFecha.values()].sort((a, b) => a.dia - b.dia);
}

/**
 * Inversión acumulada por día.
 *
 * Si el lanzamiento usa la tabla "Captación paga" (inversión diaria por
 * plataforma), se toma de ahí: es la más detallada y la que se mantiene al
 * día. Si no, se usa el gasto acumulado de `registros_inversion`. No se
 * mezclan: en octubre las dos tablas se solapan con cifras distintas.
 */
function armarInversion(
  fechaLanzamiento: string,
  plataformas: Plataforma[],
  acumulada: FilaInversion[],
): Lanzamiento['inversion'] {
  const diarioPorFecha = new Map<string, number>();
  for (const p of plataformas) {
    for (const punto of p.puntos) {
      if (punto.inversion == null) continue;
      diarioPorFecha.set(punto.fecha, (diarioPorFecha.get(punto.fecha) ?? 0) + punto.inversion);
    }
  }

  if (diarioPorFecha.size > 0) {
    let suma = 0;
    const puntos: PuntoInversion[] = [...diarioPorFecha.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, diario]) => {
        suma += diario;
        return { dia: diasEntre(fechaLanzamiento, fecha), fecha, acumulado: suma };
      });
    return { origen: 'plataformas', puntos };
  }

  if (acumulada.length > 0) {
    return {
      origen: 'acumulada',
      puntos: acumulada.map((i) => ({ dia: diasEntre(fechaLanzamiento, i.fecha), fecha: i.fecha, acumulado: i.valor })),
    };
  }

  return { origen: null, puntos: [] };
}

/**
 * Ventas y cobrado acumulados de un tipo de venta, un punto por día desde la
 * primera venta. Al ser continua, ningún día se interpola: un día sin ventas
 * vale lo mismo que el anterior.
 *
 * Llega hasta el cierre de la ventana (sin pasar de hoy). Sin cierre, hasta
 * hoy mientras el lanzamiento sigue en curso, o hasta la última venta.
 */
function armarVentas(
  fechaLanzamiento: string,
  tipo: TipoVenta,
  contexto: {
    ventas: FilaVentas[];
    cobros: FilaCobro[];
    nombreProducto: Map<string, string>;
    hoy: string;
    estado: EstadoLanzamiento;
  },
): SerieVentas {
  const { hoy } = contexto;
  const cierre = tipo.cierre ?? null;
  const ventas = contexto.ventas.filter((v) => tipo.productos.includes(v.producto_id));
  const dentro = cierre ? ventas.filter((v) => v.fecha <= cierre) : ventas;
  const serie: SerieVentas = {
    // Un id que no está en Cartera se muestra tal cual, para notar el error.
    productos: tipo.productos.map((id) => contexto.nombreProducto.get(id) ?? id),
    cierre,
    cerrada: cierre ? hoy > cierre : contexto.estado === 'finalizado',
    puntos: [],
    fueraDeVentana: ventas.reduce((s, v) => s + v.ventas, 0) - dentro.reduce((s, v) => s + v.ventas, 0),
  };
  if (dentro.length === 0) return serie;

  const ventasDia = new Map<string, number>();
  for (const v of dentro) ventasDia.set(v.fecha, (ventasDia.get(v.fecha) ?? 0) + v.ventas);
  // Los cobros de las compras fuera de ventana caen después del cierre, donde la serie ya terminó.
  const cobradoDia = new Map<string, number>();
  for (const c of contexto.cobros) {
    if (tipo.productos.includes(c.producto_id)) {
      cobradoDia.set(c.fecha, (cobradoDia.get(c.fecha) ?? 0) + (c.centavos ?? 0));
    }
  }

  const fechas = [...ventasDia.keys()].sort();
  const ultima = fechas[fechas.length - 1];
  const fin = cierre ?? (serie.cerrada ? ultima : hoy);
  const tope = fin < hoy ? fin : hoy;
  const hasta = tope > ultima ? tope : ultima;

  let totalVentas = 0;
  let totalCobrado = 0;
  for (let fecha = fechas[0]; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    totalVentas += ventasDia.get(fecha) ?? 0;
    totalCobrado += cobradoDia.get(fecha) ?? 0;
    serie.puntos.push({
      dia: diasEntre(fechaLanzamiento, fecha),
      fecha,
      ventas: totalVentas,
      cobrado: Math.round(totalCobrado),
    });
  }
  return serie;
}

function estadoDe(l: FilaLanzamiento, hoy: string, tieneDatos: boolean): EstadoLanzamiento {
  if (hoy < l.fecha) return tieneDatos ? 'captacion' : 'proximo';
  if (hoy <= (l.ultima_clase ?? l.fecha)) return 'clases';
  return 'finalizado';
}

function ordenarFuentes(lista: Omit<FuenteCanonica, 'orden'>[]): FuenteCanonica[] {
  const ordenConocido = (clave: string) => {
    const i = FUENTES_CONOCIDAS.findIndex((f) => f.clave === clave);
    return i === -1 ? FUENTES_CONOCIDAS.length : i;
  };
  return lista
    .map((f) => ({ ...f, orden: ordenConocido(f.clave) }))
    .sort((a, b) => a.orden - b.orden || a.etiqueta.localeCompare(b.etiqueta));
}
