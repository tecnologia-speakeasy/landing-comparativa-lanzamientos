/**
 * Interactividad de la comparativa: selección de lanzamientos, día de
 * comparación y vistas. Todo se recalcula en el navegador a partir del JSON
 * que deja el servidor en #datos-comparativa.
 */
import type { ChartConfiguration, ChartType, TooltipItem } from 'chart.js';
import { sumarDias } from '../lib/fechas';
import {
  fmtCompacto,
  fmtDia,
  fmtDiaLargo,
  fmtFechaCorta,
  fmtFechaLarga,
  fmtMoneda,
  fmtMonedaCompacta,
  fmtNumero,
  fmtPorcentaje,
  fmtVariacion,
} from '../lib/formato';
import {
  costoPorRegistroEn,
  diaCierre,
  diarioRepartido,
  fuenteEn,
  incrementos,
  inversionEn,
  organicoEn,
  pautaEn,
  plataformaHasta,
  rangoDe,
  registrosEn,
  type Incremento,
  type ValorDiario,
  type ValorEnDia,
} from '../lib/series';
import type { DatosComparativa, Lanzamiento } from '../lib/tipos';
import { PALETA, ejeX, ejeY, estiloTooltip, pintar, type OpcionesMarcas } from './graficas';

type Vista = 'acumulado' | 'diario';
/** Qué dirección es buena para una métrica (para el color de la variación). */
type Mejor = 'sube' | 'baja' | null;

interface Estado {
  seleccion: Set<string>;
  dia: number;
  vistaRegistros: Vista;
  vistaInversion: Vista;
  vistaTabla: Vista;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const nodoDatos = document.getElementById('datos-comparativa');
if (nodoDatos?.textContent) iniciar(JSON.parse(nodoDatos.textContent) as DatosComparativa);

function iniciar(datos: DatosComparativa) {
  // Solo se comparan lanzamientos con algún dato.
  const lanzamientos = datos.lanzamientos.filter((l) => rangoDe(l) !== null);

  // ------------------------------------------------------------------------
  // Identidad de cada lanzamiento: nombre corto y color
  // ------------------------------------------------------------------------

  /** "Octubre 2026"; si dos lanzamientos caen en el mismo mes, su nombre. */
  const cortos = new Map<string, string>();
  {
    const mesDe = (l: Lanzamiento) => {
      const [a, m] = l.fecha.split('-').map(Number);
      return `${MESES[m - 1]} ${a}`;
    };
    const repetidos = new Map<string, number>();
    for (const l of lanzamientos) repetidos.set(mesDe(l), (repetidos.get(mesDe(l)) ?? 0) + 1);
    for (const l of lanzamientos) cortos.set(l.id, repetidos.get(mesDe(l))! > 1 ? l.nombre : mesDe(l));
  }
  const corto = (l: Lanzamiento) => cortos.get(l.id)!;
  const colorDe = (l: Lanzamiento) => PALETA[l.color % PALETA.length];
  /** A partir del sexto lanzamiento los colores se repiten: se distinguen con línea discontinua. */
  const guion = (l: Lanzamiento) => (l.color >= PALETA.length ? [6, 4] : []);
  const fechaDe = (l: Lanzamiento, dia: number) => sumarDias(l.fecha, dia);

  // ------------------------------------------------------------------------
  // Estado inicial (desde la URL para poder compartir la vista)
  // ------------------------------------------------------------------------

  const params = new URLSearchParams(location.search);
  const pedidos = (params.get('l') ?? '').split(',').filter((id) => lanzamientos.some((l) => l.id === id));
  const estado: Estado = {
    seleccion: new Set(pedidos.length ? pedidos : lanzamientos.slice(-3).map((l) => l.id)),
    dia: 0,
    vistaRegistros: 'acumulado',
    vistaInversion: 'acumulado',
    vistaTabla: 'acumulado',
  };

  const seleccionados = () => lanzamientos.filter((l) => estado.seleccion.has(l.id));
  /** El más antiguo de la selección es la referencia contra la que se comparan los demás. */
  const referencia = () => seleccionados()[0];
  /** El más reciente: el que normalmente se está siguiendo. */
  const principal = () => seleccionados().at(-1)!;

  function rangoSeleccion() {
    const rangos = seleccionados().map((l) => rangoDe(l)!);
    return {
      desde: Math.min(...rangos.map((r) => r.desde)),
      hasta: Math.max(...rangos.map((r) => r.hasta)),
    };
  }

  /** Último día con registros del lanzamiento más reciente: "cómo vamos hoy". */
  function diaPorDefecto() {
    const p = principal();
    return p.registros.at(-1)?.dia ?? rangoDe(p)!.hasta;
  }

  function ajustarDia(dia: number) {
    const r = rangoSeleccion();
    return Number.isFinite(dia) && dia >= r.desde && dia <= r.hasta ? dia : diaPorDefecto();
  }

  estado.dia = ajustarDia(params.has('d') ? Number(params.get('d')) : NaN);

  // ------------------------------------------------------------------------
  // Utilidades de presentación
  // ------------------------------------------------------------------------

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

  const punto = (l: Lanzamiento, clase = 'size-2.5') =>
    `<span class="${clase} inline-block shrink-0 rounded-full" style="background:${colorDe(l)}" aria-hidden="true"></span>`;

  const aprox = (v: ValorEnDia | null) => (v?.tipo === 'estimado' ? '≈ ' : '');

  /** Día relativo dentro de una frase: "6 días antes de la Clase 1". */
  const diaEnFrase = (d: number) => (d === 0 ? 'el día de la Clase 1' : fmtDiaLargo(d));

  const fmtReg = (v: number) => fmtNumero(Math.round(v));

  /** "▲ +52,3 %" con color según si subir es bueno o malo. */
  function variacion(actual: number, base: number, mejor: Mejor, sufijo = '') {
    const texto = fmtVariacion(actual, base);
    if (!texto) return '';
    const sube = actual > base;
    const igual = actual === base;
    const color =
      igual || mejor === null ? 'text-tinta-2' : (sube === (mejor === 'sube') ? 'text-sube' : 'text-baja');
    const flecha = igual ? '=' : sube ? '▲' : '▼';
    return `<span class="${color} text-xs font-semibold whitespace-nowrap">${flecha} ${texto}${sufijo}</span>`;
  }

  function textoEstado(l: Lanzamiento) {
    switch (l.estado) {
      case 'captacion': {
        const faltan = -l.diaHoy;
        return `En captación · falta${faltan === 1 ? '' : 'n'} ${faltan} día${faltan === 1 ? '' : 's'}`;
      }
      case 'clases':
        return 'En clases';
      case 'finalizado':
        return 'Finalizado';
      default:
        return 'Sin datos aún';
    }
  }

  // ------------------------------------------------------------------------
  // Tarjetas de lanzamientos (selección)
  // ------------------------------------------------------------------------

  function renderTarjetas() {
    const lista = seleccionados();
    const ref = referencia();
    $('#lanzamientos').innerHTML = lanzamientos
      .map((l) => {
        const activo = estado.seleccion.has(l.id);
        const r = rangoDe(l)!;
        const marca = activo
          ? `<svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
          : '';
        return `
          <button type="button" data-lanzamiento="${l.id}" aria-pressed="${activo}"
            class="foco flex flex-col gap-1.5 rounded-xl border p-3 text-left transition ${
              activo ? 'border-morado bg-white shadow-sm' : 'border-linea bg-lila/50 hover:border-lila-borde'
            }">
            <span class="flex w-full items-center gap-2">
              ${punto(l, 'size-3')}
              <span class="min-w-0 flex-1 truncate text-sm font-bold ${activo ? 'text-tinta' : 'text-tinta-2'}">${esc(l.nombre)}</span>
              ${
                activo && l === ref && lista.length > 1
                  ? '<span class="rounded bg-lila px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-morado">Referencia</span>'
                  : ''
              }
              <span class="grid size-5 shrink-0 place-items-center rounded-md border ${
                activo ? 'border-morado bg-morado text-white' : 'border-lila-borde bg-white'
              }">${marca}</span>
            </span>
            <span class="text-xs text-tinta-2">Clase 1: <strong>${fmtFechaLarga(l.fecha)}</strong> · ${textoEstado(l)}</span>
            <span class="text-xs text-tenue">Datos desde ${fmtDia(r.desde)} (${fmtFechaCorta(fechaDe(l, r.desde))}) hasta ${fmtDia(r.hasta)} (${fmtFechaCorta(fechaDe(l, r.hasta))})</span>
          </button>`;
      })
      .join('');
  }

  // ------------------------------------------------------------------------
  // Día de comparación
  // ------------------------------------------------------------------------

  function renderDia() {
    const r = rangoSeleccion();
    const input = $<HTMLInputElement>('#dia');
    input.min = String(r.desde);
    input.max = String(r.hasta);
    input.value = String(estado.dia);
    input.setAttribute('aria-valuetext', `${fmtDia(estado.dia)}: ${fmtDiaLargo(estado.dia)}`);
    $('#dia-etiqueta').textContent = fmtDia(estado.dia);
    $('#dia-detalle').innerHTML =
      `<span class="font-semibold">${fmtDiaLargo(estado.dia)}</span> · ` +
      seleccionados()
        .map(
          (l) =>
            `<span class="inline-flex items-center gap-1.5 whitespace-nowrap">${punto(l, 'size-2')}${esc(corto(l))}: ${fmtFechaLarga(fechaDe(l, estado.dia))}</span>`,
        )
        .join(' · ');
  }

  // ------------------------------------------------------------------------
  // Resumen, KPIs y cierre
  // ------------------------------------------------------------------------

  function renderResumen() {
    const lista = seleccionados();
    const p = principal();
    const ref = referencia();
    const d = estado.dia;
    const reg = registrosEn(p, d);
    const inv = inversionEn(p, d);

    if (!reg) {
      const ultimo = p.registros.at(-1);
      $('#resumen').innerHTML = `
        <p class="text-sm text-tinta-2">${punto(p)} <strong>${esc(corto(p))}</strong> aún no tiene registros en ${fmtDia(d)}.
        ${ultimo ? `Su último dato es de ${fmtDia(ultimo.dia)} (${fmtFechaLarga(ultimo.fecha)}).` : ''}</p>`;
      return;
    }

    let frase = `<strong>${esc(corto(p))}</strong> lleva ${aprox(reg)}${fmtReg(reg.valor)} registros ${diaEnFrase(d)}${
      inv ? `, con ${aprox(inv)}${fmtMoneda(inv.valor, p.moneda)} invertidos` : ''
    }.`;

    if (lista.length > 1 && ref !== p) {
      const regRef = registrosEn(ref, d);
      const invRef = inversionEn(ref, d);
      if (regRef) {
        const dif = reg.valor - regRef.valor;
        frase += ` En el mismo punto, <strong>${esc(corto(ref))}</strong> llevaba ${aprox(regRef)}${fmtReg(regRef.valor)}: son
          <strong>${fmtReg(Math.abs(dif))} registros ${dif >= 0 ? 'más' : 'menos'}</strong> ${variacion(reg.valor, regRef.valor, 'sube')}.`;
      } else {
        frase += ` ${esc(corto(ref))} no tiene datos en ese día.`;
      }
      if (inv && invRef && invRef.valor > 0) {
        frase += ` La inversión va en ${fmtMoneda(inv.valor, p.moneda)} frente a ${fmtMoneda(invRef.valor, ref.moneda)}
          ${variacion(inv.valor, invRef.valor, null)}.`;
      }
    }

    $('#resumen').innerHTML = `
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
        <div class="shrink-0">
          <p class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-tenue">${punto(p)}${esc(corto(p))} · ${fmtDia(d)}</p>
          <p class="mt-1 text-5xl font-bold leading-none text-morado">${aprox(reg)}${fmtReg(reg.valor)}</p>
          <p class="mt-1 text-sm text-tinta-2">registros al ${fmtFechaLarga(fechaDe(p, d))}</p>
        </div>
        <p class="text-sm leading-relaxed text-tinta-2 md:border-l md:border-linea md:pl-8">${frase}</p>
      </div>`;
  }

  interface Metrica {
    titulo: string;
    valor: (l: Lanzamiento, dia: number) => ValorEnDia | null;
    formato: (v: number, l: Lanzamiento) => string;
    mejor: Mejor;
    detalle?: (l: Lanzamiento, dia: number) => string;
  }

  const METRICAS: Metrica[] = [
    { titulo: 'Registros totales', valor: registrosEn, formato: fmtReg, mejor: 'sube' },
    {
      titulo: 'Inversión acumulada',
      valor: inversionEn,
      formato: (v, l) => fmtMoneda(v, l.moneda),
      mejor: null,
    },
    {
      titulo: 'Costo por registro de pauta',
      valor: costoPorRegistroEn,
      formato: (v, l) => fmtMoneda(v, l.moneda, 3),
      mejor: 'baja',
    },
    {
      titulo: 'Registros orgánicos',
      valor: organicoEn,
      formato: fmtReg,
      mejor: 'sube',
      detalle: (l, dia) => {
        const org = organicoEn(l, dia);
        const tot = registrosEn(l, dia);
        return org && tot && tot.valor > 0 ? `${fmtPorcentaje(org.valor / tot.valor)} del total` : '';
      },
    },
  ];

  function renderKpis() {
    const lista = seleccionados();
    const ref = referencia();
    const d = estado.dia;
    $('#kpis').innerHTML = METRICAS.map((m) => {
      const base = m.valor(ref, d);
      const filas = lista
        .map((l) => {
          const v = m.valor(l, d);
          const comparar = l !== ref && v && base && base.valor > 0;
          const detalle = v && m.detalle ? m.detalle(l, d) : '';
          return `
            <li class="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2">
              ${punto(l)}
              <span class="truncate text-xs text-tinta-2">${esc(corto(l))}</span>
              <span class="text-right text-lg font-bold ${v ? 'text-tinta' : 'text-sm font-medium text-tenue'}">
                ${v ? `${aprox(v)}${m.formato(v.valor, l)}` : 'Sin datos'}
              </span>
              ${
                comparar || detalle
                  ? `<span></span><span class="col-span-2 flex flex-wrap justify-end gap-x-2 text-right">
                      ${detalle ? `<span class="text-xs text-tenue">${detalle}</span>` : ''}
                      ${comparar ? variacion(v.valor, base.valor, m.mejor, ` vs ${esc(corto(ref))}`) : ''}
                    </span>`
                  : ''
              }
            </li>`;
        })
        .join('');
      return `
        <div class="panel !p-4">
          <p class="text-[11px] font-bold uppercase tracking-wide text-tenue">${m.titulo}</p>
          <ul class="mt-2 space-y-2">${filas}</ul>
        </div>`;
    }).join('');
  }

  /** Cuánto lleva cada lanzamiento frente al cierre total de la referencia. */
  function renderCierre() {
    const lista = seleccionados();
    const ref = referencia();
    const d = estado.dia;
    const cierre = diaCierre(ref);
    if (lista.length < 2 || ref.estado !== 'finalizado' || cierre == null) {
      $('#cierre').innerHTML = '';
      return;
    }
    const regFinal = registrosEn(ref, cierre)!.valor;
    const invPuntos = ref.inversion.puntos.filter((p) => p.dia <= 0);
    const invFinal = (invPuntos.at(-1) ?? ref.inversion.puntos.at(-1))?.acumulado ?? 0;

    const medidor = (etiqueta: string, actual: number, total: number, texto: (v: number) => string, l: Lanzamiento) => {
      const pct = total > 0 ? actual / total : 0;
      // Por debajo del 100 % se trunca: 99,95 % no debe leerse como "100 %".
      const pctTexto = fmtPorcentaje(pct < 1 ? Math.floor(pct * 1000) / 1000 : pct);
      return `
        <div>
          <div class="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
            <span class="font-semibold text-tinta-2">${etiqueta}</span>
            <span class="text-tinta-2"><strong class="text-tinta">${texto(actual)}</strong> de ${texto(total)} ·
              <strong class="text-tinta">${pctTexto}</strong>${pct >= 1 ? ' · <span class="font-semibold text-sube">superado</span>' : ''}</span>
          </div>
          <div class="mt-1 h-2.5 overflow-hidden rounded-full bg-lila" role="meter" aria-valuemin="0" aria-valuemax="100"
               aria-valuenow="${Math.round(pct * 100)}" aria-label="${etiqueta}: ${pctTexto} del cierre">
            <div class="h-full rounded-full" style="width:${Math.min(100, pct * 100)}%;background:${colorDe(l)}"></div>
          </div>
        </div>`;
    };

    const bloques = lista
      .filter((l) => l !== ref)
      .map((l) => {
        const reg = registrosEn(l, d);
        const inv = inversionEn(l, d);
        return `
          <div class="space-y-3">
            <p class="flex items-center gap-2 text-sm font-bold">${punto(l)}${esc(corto(l))} <span class="font-medium text-tenue">en ${fmtDia(d)}</span></p>
            ${reg ? medidor('Registros', reg.valor, regFinal, fmtReg, l) : '<p class="text-xs text-tenue">Sin registros en ese día.</p>'}
            ${inv && invFinal > 0 ? medidor('Inversión', inv.valor, invFinal, (v) => fmtMoneda(v, ref.moneda, 0), l) : ''}
          </div>`;
      })
      .join('');

    $('#cierre').innerHTML = `
      <div class="panel">
        <h2 class="text-sm font-bold">Frente al cierre de ${esc(corto(ref))}</h2>
        <p class="text-xs text-tenue">Cierre de captación: ${fmtDia(cierre)} (${fmtFechaLarga(fechaDe(ref, cierre))}),
          ${fmtReg(regFinal)} registros y ${fmtMoneda(invFinal, ref.moneda)} de inversión.</p>
        <div class="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">${bloques}</div>
      </div>`;
  }

  // ------------------------------------------------------------------------
  // Gráficas
  // ------------------------------------------------------------------------

  function renderLeyendas() {
    const html = seleccionados()
      .map(
        (l) =>
          `<span class="inline-flex items-center gap-1.5 text-xs font-medium text-tinta-2">${punto(l)}${esc(corto(l))}</span>`,
      )
      .join('');
    document.querySelectorAll('[data-leyenda]').forEach((n) => (n.innerHTML = html));
  }

  /** Eje de días común a las gráficas temporales: siempre llega hasta la Clase 1. */
  function ejeDias() {
    const r = rangoSeleccion();
    const hasta = Math.max(r.hasta, 0);
    const dias: number[] = [];
    for (let d = r.desde; d <= hasta; d++) dias.push(d);
    const indice = (d: number) => d - r.desde;
    const enCurso = seleccionados().filter(
      (l) => (l.estado === 'captacion' || l.estado === 'clases') && l.diaHoy >= r.desde && l.diaHoy <= hasta,
    );
    const hoyes = [...new Set(enCurso.map((l) => l.diaHoy))];
    const marcas: OpcionesMarcas = {
      clase1: indice(0),
      comparado: indice(estado.dia),
      hoy: hoyes.map((d) => ({ indice: indice(d), texto: 'Hoy' })),
    };
    return { dias, marcas };
  }

  const tituloDia = (items: TooltipItem<ChartType>[]) => {
    const d = Number(String(items[0]?.label ?? '').replace('D', '').replace('+', '')) || 0;
    return `${fmtDia(d)} · ${fmtDiaLargo(d)}`;
  };

  /** Línea de un lanzamiento: solo los días con registro; los huecos se unen. */
  function serieLinea(l: Lanzamiento, dias: number[], valores: Map<number, number>) {
    const data = dias.map((d) => valores.get(d) ?? null);
    const ultimo = data.findLastIndex((v) => v != null);
    return {
      label: corto(l),
      data,
      borderColor: colorDe(l),
      backgroundColor: colorDe(l),
      borderWidth: 2,
      borderDash: guion(l),
      borderCapStyle: 'round' as const,
      borderJoinStyle: 'round' as const,
      pointRadius: data.map((_, i) => (i === ultimo ? 4 : 0)),
      pointHoverRadius: 5,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointHoverBorderWidth: 2,
      spanGaps: true,
      tension: 0,
    };
  }

  function serieBarras(l: Lanzamiento, dias: number[], valores: Map<number, ValorDiario>) {
    return {
      label: corto(l),
      data: dias.map((d) => valores.get(d)?.valor ?? null),
      backgroundColor: colorDe(l),
      borderRadius: 4,
      borderSkipped: 'start' as const,
      maxBarThickness: 24,
      barPercentage: 0.9,
      categoryPercentage: 0.85,
    };
  }

  /**
   * Gráfica temporal (registros o inversión) en vista acumulada (líneas) o
   * diaria (barras, con los huecos repartidos).
   */
  function configTemporal<P extends { dia: number }>(opciones: {
    vista: Vista;
    puntos: (l: Lanzamiento) => P[];
    valor: (p: P) => number;
    formato: (v: number, l: Lanzamiento) => string;
    formatoEje: (v: number) => string;
  }): ChartConfiguration {
    const lista = seleccionados();
    const { dias, marcas } = ejeDias();
    const labels = dias.map(fmtDia);
    const diarios = lista.map((l) => diarioRepartido(opciones.puntos(l), opciones.valor));

    const tooltip = {
      ...estiloTooltip,
      mode: 'index' as const,
      intersect: false,
      callbacks: {
        title: tituloDia,
        label: (ctx: TooltipItem<ChartType>) => {
          const l = lista[ctx.datasetIndex];
          const d = dias[ctx.dataIndex];
          return ` ${corto(l)}: ${opciones.formato(ctx.parsed.y ?? 0, l)} (${fmtFechaCorta(fechaDe(l, d))})`;
        },
        afterLabel: (ctx: TooltipItem<ChartType>) => {
          if (opciones.vista !== 'diario') return '';
          const v = diarios[ctx.datasetIndex].get(dias[ctx.dataIndex]);
          if (!v || v.cubre <= 1) return '';
          const l = lista[ctx.datasetIndex];
          const desde = fmtFechaCorta(fechaDe(l, v.diaRegistro - v.cubre + 1));
          const hasta = fmtFechaCorta(fechaDe(l, v.diaRegistro));
          return `   promedio: ${v.cubre} días cargados juntos (${desde}–${hasta})`;
        },
      },
    };

    if (opciones.vista === 'acumulado') {
      return {
        type: 'line',
        data: {
          labels,
          datasets: lista.map((l) =>
            serieLinea(l, dias, new Map(opciones.puntos(l).map((p) => [p.dia, opciones.valor(p)]))),
          ),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          layout: { padding: { top: 18, right: 8 } },
          scales: { x: ejeX, y: ejeY(opciones.formatoEje) },
          plugins: {
            legend: { display: false },
            tooltip,
            marcas,
            etiquetasFinales: { formato: (v) => opciones.formato(v, principal()) },
          },
        },
      };
    }

    return {
      type: 'bar',
      data: { labels, datasets: lista.map((l, i) => serieBarras(l, dias, diarios[i])) },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 18 } },
        scales: { x: ejeX, y: ejeY(opciones.formatoEje) },
        plugins: { legend: { display: false }, tooltip, marcas, etiquetasFinales: false },
      },
    };
  }

  function renderGraficas(animar: boolean) {
    const lista = seleccionados();
    const p = principal();
    const moneda = p.moneda;
    const monedas = new Set(lista.filter((l) => l.inversion.origen).map((l) => l.moneda));

    // Registros
    $('[data-sub="registros"]').textContent =
      estado.vistaRegistros === 'acumulado'
        ? 'Total acumulado de todas las fuentes.'
        : 'Registros nuevos de cada día.';
    pintar(
      $<HTMLCanvasElement>('#g-registros'),
      configTemporal({
        vista: estado.vistaRegistros,
        puntos: (l) => l.registros,
        valor: (pt) => pt.total,
        formato: (v) => fmtReg(v),
        formatoEje: fmtCompacto,
      }),
      animar,
    );

    // Inversión
    $('[data-sub="inversion"]').textContent =
      (estado.vistaInversion === 'acumulado' ? 'Inversión acumulada en pauta.' : 'Inversión de cada día.') +
      (monedas.size > 1 ? ' Atención: los lanzamientos usan monedas distintas.' : '');
    pintar(
      $<HTMLCanvasElement>('#g-inversion'),
      configTemporal({
        vista: estado.vistaInversion,
        puntos: (l) => l.inversion.puntos,
        valor: (pt) => pt.acumulado,
        formato: (v, l) => fmtMoneda(v, l.moneda),
        formatoEje: (v) => fmtMonedaCompacta(v, moneda),
      }),
      animar,
    );

    // Costo por registro de pauta (en los días con registro).
    {
      const { dias, marcas } = ejeDias();
      pintar(
        $<HTMLCanvasElement>('#g-costo'),
        {
          type: 'line',
          data: {
            labels: dias.map(fmtDia),
            datasets: lista.map((l) => {
              const valores = new Map<number, number>();
              for (const pt of l.registros) {
                const c = costoPorRegistroEn(l, pt.dia);
                if (c) valores.set(pt.dia, c.valor);
              }
              return serieLinea(l, dias, valores);
            }),
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 18, right: 8 } },
            scales: { x: ejeX, y: ejeY((v) => fmtMoneda(v, moneda)) },
            plugins: {
              legend: { display: false },
              tooltip: {
                ...estiloTooltip,
                mode: 'index',
                intersect: false,
                callbacks: {
                  title: tituloDia,
                  label: (ctx) => {
                    const l = lista[ctx.datasetIndex];
                    return ` ${corto(l)}: ${fmtMoneda(ctx.parsed.y ?? 0, l.moneda, 3)} (${fmtFechaCorta(fechaDe(l, dias[ctx.dataIndex]))})`;
                  },
                },
              },
              marcas,
              etiquetasFinales: { formato: (v) => fmtMoneda(v, moneda, 3) },
            },
          },
        },
        animar,
      );
    }

    // Fuentes en el día comparado.
    {
      const d = estado.dia;
      const fuentes = datos.fuentes.filter((f) => lista.some((l) => l.fuentes.some((x) => x.clave === f.clave)));
      $('[data-sub="fuentes"]').textContent = `Acumulado a ${fmtDia(d)} (${diaEnFrase(d)}).`;
      pintar(
        $<HTMLCanvasElement>('#g-fuentes'),
        {
          type: 'bar',
          data: {
            labels: fuentes.map((f) => f.etiqueta),
            datasets: lista.map((l) => ({
              label: corto(l),
              data: fuentes.map((f) =>
                l.fuentes.some((x) => x.clave === f.clave) ? (fuenteEn(l, f.clave, d)?.valor ?? null) : null,
              ),
              backgroundColor: colorDe(l),
              borderRadius: 4,
              borderSkipped: 'start' as const,
              maxBarThickness: 14,
              barPercentage: 0.9,
              categoryPercentage: 0.8,
            })),
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false, axis: 'y' },
            layout: { padding: { right: 56 } },
            scales: {
              x: { ...ejeY(fmtCompacto), grid: { color: '#ece9f2' } },
              y: { grid: { display: false }, border: { color: '#d5d1de' }, ticks: { color: '#4b4760' } },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                ...estiloTooltip,
                mode: 'index',
                intersect: false,
                axis: 'y',
                callbacks: {
                  label: (ctx) => {
                    const l = lista[ctx.datasetIndex];
                    const total = registrosEn(l, d)?.valor ?? 0;
                    const v = ctx.parsed.x ?? 0;
                    return ` ${corto(l)}: ${fmtReg(v)}${total > 0 ? ` (${fmtPorcentaje(v / total)} del total)` : ''}`;
                  },
                },
              },
              etiquetasBarras: lista.length <= 3 ? { formato: (v) => fmtCompacto(Math.round(v)) } : false,
            },
          },
        },
        animar,
      );
    }
  }

  // ------------------------------------------------------------------------
  // Tabla día a día
  // ------------------------------------------------------------------------

  interface Celda {
    valor: number | null;
    cubre?: number;
  }

  function renderTablaDias() {
    const lista = seleccionados();
    const ref = referencia();
    const vista = estado.vistaTabla;
    const diaSel = estado.dia;

    const dias = [
      ...new Set(lista.flatMap((l) => [...l.registros.map((p) => p.dia), ...l.inversion.puntos.map((p) => p.dia)])),
    ].sort((a, b) => a - b);

    const info = new Map(
      lista.map((l) => [
        l.id,
        {
          reg: new Map(l.registros.map((p) => [p.dia, p])),
          inv: new Map(l.inversion.puntos.map((p) => [p.dia, p.acumulado])),
          regInc: incrementos(l.registros, (p) => p.total),
          pautaInc: incrementos(l.registros, (p) => p.pauta),
          invInc: incrementos(l.inversion.puntos, (p) => p.acumulado),
        },
      ]),
    );

    const desdeInc = (i: Incremento | undefined): Celda => (i ? { valor: i.valor, cubre: i.cubre } : { valor: null });

    const metricas: {
      titulo: string;
      celda: (l: Lanzamiento, d: number) => Celda;
      formato: (v: number, l: Lanzamiento) => string;
      mejor: Mejor;
    }[] = [
      {
        titulo: vista === 'acumulado' ? 'Registros acumulados' : 'Registros nuevos',
        celda: (l, d) => {
          const x = info.get(l.id)!;
          return vista === 'acumulado' ? { valor: x.reg.get(d)?.total ?? null } : desdeInc(x.regInc.get(d));
        },
        formato: (v) => fmtReg(v),
        mejor: 'sube',
      },
      {
        titulo: vista === 'acumulado' ? 'Inversión acumulada' : 'Inversión del día',
        celda: (l, d) => {
          const x = info.get(l.id)!;
          return vista === 'acumulado' ? { valor: x.inv.get(d) ?? null } : desdeInc(x.invInc.get(d));
        },
        formato: (v, l) => fmtMoneda(v, l.moneda),
        mejor: null,
      },
      {
        titulo: vista === 'acumulado' ? 'Costo por registro de pauta' : 'Costo por registro de pauta del día',
        celda: (l, d) => {
          const x = info.get(l.id)!;
          if (vista === 'acumulado') {
            return { valor: x.reg.has(d) ? (costoPorRegistroEn(l, d)?.valor ?? null) : null };
          }
          const inv = x.invInc.get(d);
          const pauta = x.pautaInc.get(d);
          if (!inv || !pauta || pauta.valor <= 0 || inv.valor <= 0) return { valor: null };
          return { valor: inv.valor / pauta.valor, cubre: Math.max(inv.cubre, pauta.cubre) };
        },
        formato: (v, l) => fmtMoneda(v, l.moneda, 3),
        mejor: 'baja',
      },
    ];

    const claseCol = (d: number) => (d === diaSel ? 'bg-morado/[0.06]' : '');
    const th = (contenido: string, clase = '') =>
      `<th scope="row" class="sticky left-0 z-10 whitespace-nowrap border-t border-linea px-3 py-2 text-left text-xs font-semibold ${clase}">${contenido}</th>`;
    const seccion = (titulo: string) =>
      `<tr><th scope="rowgroup" class="sticky left-0 z-10 bg-lila px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-morado">${titulo}</th><td colspan="${dias.length}" class="bg-lila"></td></tr>`;
    const td = (d: number, contenido: string, clase = '') =>
      `<td class="whitespace-nowrap border-t border-l border-linea px-3 py-2 text-center tabular-nums ${claseCol(d)} ${clase}">${contenido}</td>`;

    const filas: string[] = [];
    // Con un solo lanzamiento contra la referencia basta con "Diferencia".
    const otrosDif = lista.length - 1;

    filas.push(seccion('Fecha'));
    for (const l of lista) {
      const x = info.get(l.id)!;
      filas.push(
        `<tr>${th(`<span class="inline-flex items-center gap-2">${punto(l)}${esc(corto(l))}</span>`, 'bg-white text-tinta')}${dias
          .map((d) => td(d, fmtFechaCorta(fechaDe(l, d)), x.reg.has(d) || x.inv.has(d) ? 'text-xs text-tinta-2' : 'text-xs text-tenue/60'))
          .join('')}</tr>`,
      );
    }

    for (const m of metricas) {
      filas.push(seccion(m.titulo));
      for (const l of lista) {
        filas.push(
          `<tr>${th(`<span class="inline-flex items-center gap-2">${punto(l)}${esc(corto(l))}</span>`, 'bg-white text-tinta')}${dias
            .map((d) => {
              const c = m.celda(l, d);
              if (c.valor == null) return td(d, '—', 'text-tenue');
              const nota =
                c.cubre && c.cubre > 1
                  ? `<span class="block text-[10px] font-medium text-tenue" title="Registro que acumula ${c.cubre} días sin cargar">${c.cubre} días</span>`
                  : '';
              return td(d, `${m.formato(c.valor, l)}${nota}`, 'text-tinta');
            })
            .join('')}</tr>`,
        );
      }
      for (const l of lista.filter((x) => x !== ref)) {
        filas.push(
          `<tr>${th(otrosDif > 1 ? `Dif. ${esc(corto(l))}` : 'Diferencia', 'bg-[#fff5f9] text-rosa-texto')}${dias
            .map((d) => {
              const a = m.celda(l, d).valor;
              const b = m.celda(ref, d).valor;
              if (a == null || b == null) return td(d, '', 'bg-[#fff5f9]/60');
              const dif = a - b;
              const signo = dif > 0 ? '+' : dif < 0 ? '−' : '';
              const color =
                dif === 0 || m.mejor === null ? 'text-tinta-2' : dif > 0 === (m.mejor === 'sube') ? 'text-sube' : 'text-baja';
              return td(d, `${signo}${m.formato(Math.abs(dif), l)}`, `bg-[#fff5f9]/60 text-xs font-semibold ${color}`);
            })
            .join('')}</tr>`,
        );
      }
    }

    $('#tabla-dias').innerHTML = `
      <table class="w-max min-w-full border-separate border-spacing-0 text-sm">
        <caption class="sr-only">Registros, inversión y costo por registro de cada lanzamiento, por día relativo a la Clase 1</caption>
        <thead>
          <tr>
            <th scope="col" class="sticky left-0 z-20 bg-morado px-3 py-2 text-left text-xs font-bold uppercase text-white">Día</th>
            ${dias
              .map(
                (d) => `
              <th scope="col" class="p-0 ${d === diaSel ? 'bg-morado-oscuro' : 'bg-morado'}">
                <button type="button" data-dia="${d}" aria-pressed="${d === diaSel}" title="Comparar en ${fmtDia(d)}"
                  class="foco w-full min-w-[84px] whitespace-nowrap px-3 py-2 text-xs font-bold text-white hover:bg-white/10">${fmtDia(d)}</button>
              </th>`,
              )
              .join('')}
          </tr>
        </thead>
        <tbody>${filas.join('')}</tbody>
      </table>`;

    // Deja visible la columna del día comparado.
    const cont = $('#tabla-dias');
    const activa = cont.querySelector<HTMLElement>(`button[data-dia="${diaSel}"]`);
    if (activa) {
      // Centrada en la parte visible, descontando la primera columna fija.
      const fija = cont.querySelector('thead th')!.getBoundingClientRect().width;
      const caja = cont.getBoundingClientRect();
      const celda = activa.getBoundingClientRect();
      const visible = caja.width - fija;
      cont.scrollLeft += celda.left - caja.left - fija - (visible - celda.width) / 2;
    }
  }

  // ------------------------------------------------------------------------
  // Tabla de fuentes y captación paga
  // ------------------------------------------------------------------------

  function renderTablaFuentes() {
    const lista = seleccionados();
    const ref = referencia();
    const d = estado.dia;
    const fuentes = datos.fuentes.filter((f) => lista.some((l) => l.fuentes.some((x) => x.clave === f.clave)));
    const otros = lista.filter((l) => l !== ref);
    $('[data-sub="tabla-fuentes"]').textContent = `Registros acumulados a ${fmtDia(d)} y su peso sobre el total.`;

    const totales = new Map(lista.map((l) => [l.id, registrosEn(l, d)]));

    const fila = (
      etiqueta: string,
      valorDe: (l: Lanzamiento) => ValorEnDia | null,
      fondo = 'bg-white',
      extra = '',
    ) => {
      const celdas = lista.map((l) => {
        const v = valorDe(l);
        const total = totales.get(l.id)?.valor ?? 0;
        if (!v) return `<td class="border-t border-linea px-3 py-2 text-right text-tenue">—</td>`;
        return `<td class="whitespace-nowrap border-t border-linea px-3 py-2 text-right tabular-nums">
            <span class="font-semibold">${aprox(v)}${fmtReg(v.valor)}</span>
            ${total > 0 ? `<span class="block text-[11px] text-tenue">${fmtPorcentaje(v.valor / total)}</span>` : ''}
          </td>`;
      });
      const difs = otros.map((l) => {
        const a = valorDe(l);
        const b = valorDe(ref);
        if (!a || !b) return `<td class="border-t border-linea px-3 py-2 text-right text-tenue">—</td>`;
        const dif = a.valor - b.valor;
        return `<td class="whitespace-nowrap border-t border-linea px-3 py-2 text-right tabular-nums">
            <span class="text-xs font-semibold text-tinta-2">${dif > 0 ? '+' : dif < 0 ? '−' : ''}${fmtReg(Math.abs(dif))}</span>
            <span class="block">${b.valor > 0 ? variacion(a.valor, b.valor, 'sube') : ''}</span>
          </td>`;
      });
      return `<tr class="${fondo} ${extra}"><th scope="row" class="sticky left-0 z-10 whitespace-nowrap border-t border-linea px-3 py-2 text-left text-xs font-semibold ${fondo}">${etiqueta}</th>${celdas.join('')}${difs.join('')}</tr>`;
    };

    const tieneFuente = (l: Lanzamiento, clave: string) => l.fuentes.some((x) => x.clave === clave);

    $('#tabla-fuentes').innerHTML = `
      <table class="w-full border-separate border-spacing-0 text-sm">
        <caption class="sr-only">Registros por fuente en ${fmtDia(d)}</caption>
        <thead>
          <tr class="bg-morado text-white">
            <th scope="col" class="sticky left-0 z-20 bg-morado px-3 py-2 text-left text-xs font-bold uppercase">Fuente</th>
            ${lista
              .map(
                (l) =>
                  `<th scope="col" class="whitespace-nowrap px-3 py-2 text-right text-xs font-bold"><span class="inline-flex items-center gap-1.5">${punto(l)}${esc(corto(l))}</span></th>`,
              )
              .join('')}
            ${otros
              .map((l) => `<th scope="col" class="whitespace-nowrap px-3 py-2 text-right text-xs font-bold">Dif. ${esc(corto(l))}</th>`)
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${fuentes.map((f) => fila(f.etiqueta, (l) => (tieneFuente(l, f.clave) ? fuenteEn(l, f.clave, d) : null))).join('')}
          ${fila('Orgánico (sin pauta)', (l) => organicoEn(l, d), 'bg-[#f8f5fc]')}
          ${fila('Total', (l) => registrosEn(l, d), 'bg-lila', 'font-bold')}
        </tbody>
      </table>`;
  }

  function renderPlataformas() {
    const lista = seleccionados();
    const d = estado.dia;
    $('[data-sub="plataformas"]').textContent = `Registros e inversión de pauta sumados hasta ${fmtDia(d)}.`;

    $('#plataformas').innerHTML = lista
      .map((l) => {
        const titulo = `<p class="flex items-center gap-2 text-sm font-bold">${punto(l)}${esc(corto(l))}</p>`;
        if (l.plataformas.length === 0) {
          return `<div>${titulo}<p class="mt-1 text-xs text-tenue">Sin desglose por plataforma${
            l.inversion.origen === 'acumulada' ? ': la inversión se registró como un total acumulado por día' : ''
          }.</p></div>`;
        }
        const ultimoDia = Math.max(...l.plataformas.flatMap((p) => p.puntos.map((x) => x.dia)));
        const filas = l.plataformas.map((p) => ({ nombre: p.nombre, ...plataformaHasta(p, d) }));
        const totalReg = filas.reduce((s, f) => s + f.registros, 0);
        const totalInv = filas.reduce((s, f) => s + f.inversion, 0);
        const cpl = (inv: number, reg: number) => (reg > 0 ? fmtMoneda(inv / reg, l.moneda, 3) : '—');
        // Lo que reporta cada plataforma no siempre cuadra con la fuente de
        // pauta de la tabla general (que es la que usan KPIs y gráficas).
        const pauta = pautaEn(l, Math.min(d, ultimoDia));
        const descuadre =
          pauta && pauta.valor > 0 && Math.abs(totalReg - pauta.valor) / pauta.valor > 0.005
            ? `<p class="mt-2 text-xs text-tinta-2">La suma por plataforma (${fmtReg(totalReg)}) no coincide con la fuente
                Pauta de la tabla general (${aprox(pauta)}${fmtReg(pauta.valor)}). Los KPIs y el costo por registro de
                arriba usan la tabla general.</p>`
            : '';
        const tr = (nombre: string, reg: number, inv: number, fondo = 'bg-white', extra = '') => `
          <tr class="${fondo} ${extra}">
            <th scope="row" class="sticky left-0 z-10 whitespace-nowrap border-t border-linea px-3 py-2 text-left text-xs font-semibold ${fondo}">${nombre}</th>
            <td class="border-t border-linea px-3 py-2 text-right tabular-nums">${fmtReg(reg)}</td>
            <td class="whitespace-nowrap border-t border-linea px-3 py-2 text-right tabular-nums">${fmtMoneda(inv, l.moneda)}</td>
            <td class="whitespace-nowrap border-t border-linea px-3 py-2 text-right tabular-nums">${cpl(inv, reg)}</td>
            <td class="border-t border-linea px-3 py-2 text-right tabular-nums">${totalInv > 0 ? fmtPorcentaje(inv / totalInv) : '—'}</td>
          </tr>`;
        return `
          <div>
            ${titulo}
            ${d > ultimoDia ? `<p class="mt-1 text-xs text-tenue">Último dato: ${fmtDia(ultimoDia)} (${fmtFechaCorta(fechaDe(l, ultimoDia))}).</p>` : ''}
            <div class="scroll-verde mt-2 overflow-x-auto rounded-xl border border-lila-borde">
              <table class="w-full border-separate border-spacing-0 text-sm">
                <caption class="sr-only">Captación paga de ${esc(corto(l))} hasta ${fmtDia(d)}</caption>
                <thead>
                  <tr class="bg-morado text-white">
                    <th scope="col" class="sticky left-0 z-20 bg-morado px-3 py-2 text-left text-xs font-bold uppercase">Plataforma</th>
                    <th scope="col" class="px-3 py-2 text-right text-xs font-bold">Registros</th>
                    <th scope="col" class="px-3 py-2 text-right text-xs font-bold">Inversión</th>
                    <th scope="col" class="whitespace-nowrap px-3 py-2 text-right text-xs font-bold">Costo / registro</th>
                    <th scope="col" class="whitespace-nowrap px-3 py-2 text-right text-xs font-bold">% inversión</th>
                  </tr>
                </thead>
                <tbody>
                  ${filas.map((f) => tr(esc(f.nombre), f.registros, f.inversion)).join('')}
                  ${tr('Total', totalReg, totalInv, 'bg-lila', 'font-bold')}
                </tbody>
              </table>
            </div>
            ${descuadre}
          </div>`;
      })
      .join('');
  }

  // ------------------------------------------------------------------------
  // Render y eventos
  // ------------------------------------------------------------------------

  function renderControles() {
    document.querySelectorAll<HTMLElement>('[data-control]').forEach((grupo) => {
      const clave = grupo.dataset.control as 'vistaRegistros' | 'vistaInversion' | 'vistaTabla';
      grupo.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.valor === estado[clave]));
      });
    });
  }

  function actualizarUrl() {
    const p = new URLSearchParams(location.search);
    p.set('l', seleccionados().map((l) => l.id).join(','));
    p.set('d', String(estado.dia));
    const nueva = `${location.pathname}?${p}`;
    if (nueva !== `${location.pathname}${location.search}`) history.replaceState(null, '', nueva);
  }

  function renderTodo(animar = true) {
    renderTarjetas();
    renderDia();
    renderResumen();
    renderKpis();
    renderCierre();
    renderLeyendas();
    renderControles();
    renderGraficas(animar);
    renderTablaDias();
    renderTablaFuentes();
    renderPlataformas();
    actualizarUrl();
  }

  $('#lanzamientos').addEventListener('click', (e) => {
    const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-lanzamiento]');
    if (!boton) return;
    const id = boton.dataset.lanzamiento!;
    if (estado.seleccion.has(id)) {
      if (estado.seleccion.size === 1) return; // siempre queda al menos uno
      estado.seleccion.delete(id);
    } else {
      estado.seleccion.add(id);
    }
    estado.dia = ajustarDia(estado.dia);
    renderTodo();
    document.querySelector<HTMLButtonElement>(`[data-lanzamiento="${id}"]`)?.focus();
  });

  // El deslizador redibuja en cada paso; se agrupa por cuadro y sin animación.
  let pendiente = 0;
  $<HTMLInputElement>('#dia').addEventListener('input', (e) => {
    estado.dia = Number((e.target as HTMLInputElement).value);
    cancelAnimationFrame(pendiente);
    pendiente = requestAnimationFrame(() => renderTodo(false));
  });

  $('#dia-ultimo').addEventListener('click', () => {
    estado.dia = diaPorDefecto();
    renderTodo(false);
  });

  $('#tabla-dias').addEventListener('click', (e) => {
    const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-dia]');
    if (!boton) return;
    estado.dia = Number(boton.dataset.dia);
    renderTodo(false);
    $('#tabla-dias').querySelector<HTMLButtonElement>(`[data-dia="${estado.dia}"]`)?.focus();
  });

  document.querySelectorAll<HTMLElement>('[data-control]').forEach((grupo) => {
    grupo.addEventListener('click', (e) => {
      const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-valor]');
      if (!boton) return;
      const clave = grupo.dataset.control as 'vistaRegistros' | 'vistaInversion' | 'vistaTabla';
      estado[clave] = boton.dataset.valor as Vista;
      renderTodo();
    });
  });

  renderTodo();
}
