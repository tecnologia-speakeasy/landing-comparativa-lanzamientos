/**
 * Comparativa simple: el lanzamiento actual (fucsia) frente al pasado
 * (morado) en registros, inversión, fuentes, ventas y asistencia. Todo se
 * calcula en el navegador a partir del JSON que deja el servidor en
 * #datos-comparativa, y se refresca cada 10 s desde /api/comparativa.json.
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
  diaCierre,
  fuenteEn,
  rangoCaptacionDe,
  rangoDe,
  rangoVentasDe,
  registrosEn,
  ventasEn,
  type Rango,
} from '../lib/series';
import type { ClaseLanzamiento, DatosComparativa, Lanzamiento, MuestraAsistencia } from '../lib/tipos';
import { COLORES, ejeX, ejeY, estiloTooltip, pintar } from './graficas';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
type Plataforma = 'youtube' | 'zoom';
const SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Lo que la persona eligió en la página. Vive fuera de `iniciar` porque los
 * datos se vuelven a pedir cada pocos segundos y la página se redibuja con
 * ellos sin perder filtros, clase ni vista.
 */
const ui = {
  /** Solo la primera vez se animan las gráficas; las actualizaciones son inmediatas. */
  animar: true,
  /** Filtro de ventas; `null` = sin filtro (todos los días y horas, aunque aparezcan días nuevos). */
  filtroVentas: null as { diaDesde: string; diaHasta: string; horaDesde: string; horaHasta: string } | null,
  clase: null as number | null,
  vistaAsistencia: 'total' as Plataforma | 'total',
  /** Ids de los lanzamientos ocultos en asistencia. */
  ocultos: new Set<string>(),
};

/** Reemplaza el contenido solo si cambió: así una actualización no reinicia scroll, foco ni selectores abiertos. */
const ultimoHtml = new WeakMap<HTMLElement, string>();
function html(el: HTMLElement, contenido: string) {
  if (ultimoHtml.get(el) === contenido) return;
  ultimoHtml.set(el, contenido);
  el.innerHTML = contenido;
}

const nodoDatos = document.getElementById('datos-comparativa');
if (nodoDatos?.textContent) {
  iniciar(JSON.parse(nodoDatos.textContent) as DatosComparativa);
  ui.animar = false;
  actualizarCada(10_000);
}

/**
 * Vuelve a pedir los datos y redibuja. Se pausa con la pestaña oculta y, si
 * una petición falla, se conserva lo último que se mostró.
 */
function actualizarCada(ms: number) {
  const estado = document.getElementById('estado-vivo');
  let ultima = Date.now();
  let error = false;
  const pintarEstado = () => {
    if (!estado) return;
    const hace = Math.round((Date.now() - ultima) / 1000);
    estado.textContent = error ? `Sin conexión · reintentando` : `En vivo · actualizado hace ${hace} s`;
    estado.dataset.error = String(error);
  };

  let enCurso = false;
  async function actualizar() {
    if (document.hidden || enCurso) return;
    enCurso = true;
    try {
      const res = await fetch('/api/comparativa.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      iniciar((await res.json()) as DatosComparativa);
      ultima = Date.now();
      error = false;
    } catch (e) {
      console.warn('[comparativa] no se pudo actualizar:', e);
      error = true;
    } finally {
      enCurso = false;
      pintarEstado();
    }
  }

  setInterval(actualizar, ms);
  setInterval(pintarEstado, 1000);
  // Al volver a la pestaña se actualiza enseguida, sin esperar el siguiente ciclo.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) actualizar();
  });
  pintarEstado();
}

function iniciar(datos: DatosComparativa) {
  // Los lanzamientos llegan en orden cronológico: el último con datos es el
  // actual y el anterior a él, el pasado.
  const conDatos = datos.lanzamientos.filter((l) => rangoDe(l) !== null);
  const ultimo = conDatos.at(-1);
  if (!ultimo) return;
  const actual: Lanzamiento = ultimo;
  const pasado = conDatos.at(-2);
  /** Pasado primero para que el actual se dibuje encima. */
  const lista = pasado ? [pasado, actual] : [actual];

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

  /** "Octubre 2026"; si los dos caen en el mismo mes, su nombre. */
  const mesDe = (l: Lanzamiento) => {
    const [a, m] = l.fecha.split('-').map(Number);
    return `${MESES[m - 1]} ${a}`;
  };
  const mismoMes = pasado && mesDe(pasado) === mesDe(actual);
  const corto = (l: Lanzamiento) => (mismoMes ? l.nombre : mesDe(l));
  const colorDe = (l: Lanzamiento) => (l === actual ? COLORES.actual : COLORES.pasado);
  const fechaDe = (l: Lanzamiento, dia: number) => sumarDias(l.fecha, dia);
  /** Día de la semana del lanzamiento actual en ese día relativo: "Lunes". */
  const diaSemana = (dia: number) => {
    const [a, m, d] = fechaDe(actual, dia).split('-').map(Number);
    return SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  };
  const fmtReg = (v: number) => fmtNumero(Math.round(v));
  const punto = (l: Lanzamiento, clase = 'size-3') =>
    `<span class="${clase} inline-block shrink-0 rounded-full" style="background:${colorDe(l)}" aria-hidden="true"></span>`;

  // ------------------------------------------------------------------------
  // Leyenda: qué color es cada lanzamiento
  // ------------------------------------------------------------------------

  html($('#leyenda'), [...lista]
    .reverse()
    .map(
      (l) => `
        <div class="flex items-center gap-3">
          ${punto(l, 'size-4')}
          <div>
            <p class="text-sm font-bold text-tinta">${esc(corto(l))}
              <span class="ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" style="background:${colorDe(l)}">
                ${l === actual ? 'Actual' : 'Pasado'}
              </span>
            </p>
            <p class="text-xs text-tenue">Clase 1: ${fmtFechaLarga(l.fecha)}</p>
          </div>
        </div>`,
    )
    .join(''));

  // ------------------------------------------------------------------------
  // Registros e inversión: líneas acumuladas alineadas a la Clase 1
  // ------------------------------------------------------------------------

  /** Días que cubren los rangos de ambos lanzamientos, siempre incluyendo la Clase 1. */
  function diasDe(rangoDeL: (l: Lanzamiento) => Rango | null): number[] {
    const rangos = lista.map(rangoDeL).filter((r): r is Rango => r !== null);
    const desde = Math.min(0, ...rangos.map((r) => r.desde));
    const hasta = Math.max(0, ...rangos.map((r) => r.hasta));
    const dias: number[] = [];
    for (let d = desde; d <= hasta; d++) dias.push(d);
    return dias;
  }

  /** Tooltip de un eje de días: el día relativo y, por lanzamiento, su valor y su fecha. */
  function tooltipDias(dias: number[], formato: (v: number, l: Lanzamiento) => string, conSemana = false) {
    return {
      ...estiloTooltip,
      mode: 'index' as const,
      intersect: false,
      callbacks: {
        title: (items: TooltipItem<ChartType>[]) => {
          const d = dias[items[0]?.dataIndex ?? 0];
          return `${conSemana ? `${diaSemana(d)} · ` : ''}${fmtDia(d)} · ${fmtDiaLargo(d)}`;
        },
        label: (ctx: TooltipItem<ChartType>) => {
          const l = lista[ctx.datasetIndex];
          const d = dias[ctx.dataIndex];
          return ` ${corto(l)}: ${formato(ctx.parsed.y ?? 0, l)} (${fmtFechaCorta(fechaDe(l, d))})`;
        },
      },
    };
  }

  /** Eje de registros e inversión: los días de captación. */
  const dias = diasDe(rangoCaptacionDe);

  function lineas(opciones: {
    canvas: string;
    /** Valor acumulado de cada día registrado. */
    valores: (l: Lanzamiento) => Map<number, number>;
    formato: (v: number, l: Lanzamiento) => string;
    formatoEje: (v: number) => string;
  }): void {
    const datasets = lista.map((l) => {
      const valores = opciones.valores(l);
      const data = dias.map((d) => valores.get(d) ?? null);
      const ultimo = data.findLastIndex((v) => v != null);
      return {
        label: corto(l),
        data,
        borderColor: colorDe(l),
        backgroundColor: colorDe(l),
        borderWidth: l === actual ? 3 : 2,
        borderCapStyle: 'round' as const,
        borderJoinStyle: 'round' as const,
        pointRadius: data.map((_, i) => (i === ultimo ? 4 : 0)),
        pointHoverRadius: 5,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        spanGaps: true,
        tension: 0,
      };
    });

    const config: ChartConfiguration = {
      type: 'line',
      data: { labels: dias.map(fmtDia), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 18, right: 8 } },
        scales: { x: ejeX, y: ejeY(opciones.formatoEje) },
        plugins: {
          legend: { display: false },
          tooltip: tooltipDias(dias, opciones.formato),
          marcas: { clase1: dias.indexOf(0) },
          etiquetasFinales: { formato: (v) => opciones.formato(v, actual) },
        },
      },
    };
    pintar($<HTMLCanvasElement>(opciones.canvas), config, ui.animar);
  }

  lineas({
    canvas: '#g-registros',
    valores: (l) => new Map(l.registros.map((p) => [p.dia, p.total])),
    formato: (v) => fmtReg(v),
    formatoEje: fmtCompacto,
  });

  const monedas = new Set(lista.map((l) => l.moneda));
  $('[data-sub="inversion"]').textContent =
    'Inversión acumulada en pauta, día a día.' +
    (monedas.size > 1 ? ' Atención: los lanzamientos usan monedas distintas.' : '');
  lineas({
    canvas: '#g-inversion',
    valores: (l) => new Map(l.inversion.puntos.map((p) => [p.dia, p.acumulado])),
    formato: (v, l) => fmtMoneda(v, l.moneda),
    formatoEje: (v) => fmtMonedaCompacta(v, actual.moneda),
  });

  // ------------------------------------------------------------------------
  // Registros por fuente: ambos en el mismo día (el último del actual)
  // ------------------------------------------------------------------------

  const dia = diaCierre(actual) ?? 0;
  /** El pasado pudo dejar de cargar uno o dos días antes: se usa su último dato hasta `dia`. */
  const diaDe = (l: Lanzamiento) => Math.min(dia, diaCierre(l) ?? dia);
  const fuentes = datos.fuentes.filter((f) => lista.some((l) => l.fuentes.some((x) => x.clave === f.clave)));
  $('[data-sub="fuentes"]').textContent =
    actual.estado === 'captacion'
      ? `Registros acumulados de cada fuente hasta ${fmtDia(dia)} (${fmtDiaLargo(dia)}), en ambos lanzamientos.`
      : 'Registros acumulados de cada fuente al cierre de la captación.';

  pintar($<HTMLCanvasElement>('#g-fuentes'), {
    type: 'bar',
    data: {
      labels: fuentes.map((f) => f.etiqueta),
      datasets: lista.map((l) => ({
        label: corto(l),
        data: fuentes.map((f) =>
          l.fuentes.some((x) => x.clave === f.clave) ? (fuenteEn(l, f.clave, diaDe(l))?.valor ?? null) : null,
        ),
        backgroundColor: colorDe(l),
        borderRadius: 4,
        borderSkipped: 'start' as const,
        maxBarThickness: 16,
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
              const d = diaDe(l);
              const total = registrosEn(l, d)?.valor ?? 0;
              const v = ctx.parsed.x ?? 0;
              return ` ${corto(l)}: ${fmtReg(v)}${total > 0 ? ` (${fmtPorcentaje(v / total)} del total)` : ''} · ${fmtDia(d)}`;
            },
          },
        },
        etiquetasBarras: { formato: (v) => fmtReg(v) },
      },
    },
  }, ui.animar);

  iniciarAsistencia();

  // ------------------------------------------------------------------------
  // Ventas: barras con las ventas nuevas de cada día, filtrables por días y horas
  // ------------------------------------------------------------------------

  const panelVentas = $('#panel-ventas');
  const diasVentas = diasDe(rangoVentasDe);
  panelVentas.hidden = !lista.some((l) => l.ventas.compras.length > 0);
  if (panelVentas.hidden) return;

  const form = $<HTMLFormElement>('#filtro-ventas');
  const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLSelectElement;
  const dosCifras = (h: number) => String(h).padStart(2, '0');
  const HORAS = Array.from({ length: 24 }, (_, h) => h);

  // El mismo día relativo cae en fechas distintas: se muestran las de ambos (actual primero).
  const opcionDia = (d: number) =>
    `<option value="${d}">${diaSemana(d)} · ${[...lista]
      .reverse()
      .map((l) => fmtFechaCorta(fechaDe(l, d)))
      .join(' / ')}</option>`;
  html(campo('diaDesde'), diasVentas.map(opcionDia).join(''));
  html(campo('diaHasta'), diasVentas.map(opcionDia).join(''));
  html(campo('horaDesde'), HORAS.map((h) => `<option value="${h}">${dosCifras(h)}:00</option>`).join(''));
  html(campo('horaHasta'), HORAS.map((h) => `<option value="${h}">${dosCifras(h)}:59</option>`).join(''));

  /** Sin filtro elegido: todos los días (incluido uno nuevo que acabe de aparecer) y todas las horas. */
  const valoresIniciales = () => {
    campo('diaDesde').value = String(diasVentas[0]);
    campo('diaHasta').value = String(diasVentas.at(-1));
    campo('horaDesde').value = '0';
    campo('horaHasta').value = '23';
  };
  /** Vuelve a poner el filtro elegido; si un día ya no está entre las opciones, usa el extremo. */
  const aplicarFiltro = () => {
    valoresIniciales();
    const f = ui.filtroVentas;
    if (!f) return;
    for (const [nombre, valor] of Object.entries(f)) {
      const select = campo(nombre);
      if ([...select.options].some((o) => o.value === valor)) select.value = valor;
    }
  };

  function pintarVentas(animar: boolean) {
    let desde = Number(campo('diaDesde').value);
    let hasta = Number(campo('diaHasta').value);
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    const h1 = Number(campo('horaDesde').value);
    const h2 = Number(campo('horaHasta').value);
    const todoElDia = h1 === 0 && h2 === 23;
    const todosLosDias = desde === diasVentas[0] && hasta === diasVentas.at(-1);

    /** Si "desde" es mayor que "hasta" (p. ej. 22 a 02), el rango cruza la medianoche. */
    const enHoras = (hora: string) => {
      const h = Number(hora.slice(0, 2));
      return h1 <= h2 ? h >= h1 && h <= h2 : h >= h1 || h <= h2;
    };

    const dias = diasVentas.filter((d) => d >= desde && d <= hasta);
    const conteos = lista.map((l) => {
      const porDia = new Map<number, number>();
      let sinHora = 0;
      for (const c of l.ventas.compras) {
        if (c.dia < desde || c.dia > hasta) continue;
        if (!todoElDia) {
          if (c.hora == null) {
            sinHora++;
            continue;
          }
          if (!enHoras(c.hora)) continue;
        }
        porDia.set(c.dia, (porDia.get(c.dia) ?? 0) + 1);
      }
      const total = [...porDia.values()].reduce((s, n) => s + n, 0);
      return { l, porDia, total, sinHora };
    });
    const de = (l: Lanzamiento) => conteos.find((c) => c.l === l)!;

    // Frase de resumen.
    let texto = '';
    if (todosLosDias && todoElDia) {
      const ultimo = actual.ventas.puntos.at(-1);
      if (ultimo) {
        texto = `${corto(actual)} lleva ${fmtReg(ultimo.ventas)} ventas a ${fmtDia(ultimo.dia)}.`;
        const ref = pasado && ventasEn(pasado, ultimo.dia);
        const finalPasado = pasado?.ventas.puntos.at(-1)?.ventas;
        if (pasado && ref) {
          texto += ` ${corto(pasado)} llevaba ${fmtReg(ref.valor)} ese mismo día`;
          texto += finalPasado != null && finalPasado !== ref.valor ? ` y cerró con ${fmtReg(finalPasado)}.` : '.';
        }
      }
    } else {
      const periodo = desde === hasta ? `El ${fmtDia(desde)}` : `Del ${fmtDia(desde)} al ${fmtDia(hasta)}`;
      const horas = todoElDia ? '' : `, de ${dosCifras(h1)}:00 a ${dosCifras(h2)}:59`;
      const a = de(actual).total;
      texto = `${periodo}${horas}: ${corto(actual)} ${fmtReg(a)} ventas`;
      if (pasado) {
        const b = de(pasado).total;
        const variacion = fmtVariacion(a, b);
        texto += ` · ${corto(pasado)} ${fmtReg(b)} ventas${variacion ? ` (${corto(actual)} ${variacion})` : ''}`;
      }
      texto += '.';
    }
    $('[data-sub="ventas-total"]').textContent = texto;

    // Avisos: ventas sin hora que el filtro deja fuera, y días que el actual aún no vive.
    const notas: string[] = [];
    const sinHora = conteos.filter((c) => c.sinHora > 0);
    if (sinHora.length) {
      notas.push(
        `No entran ${sinHora.map((c) => `${fmtReg(c.sinHora)} de ${corto(c.l)}`).join(' y ')} sin hora registrada.`,
      );
    }
    const ultimoActual = actual.ventas.puntos.at(-1)?.dia;
    if (pasado && ultimoActual != null && hasta > ultimoActual) {
      notas.push(`${corto(actual)} tiene datos solo hasta ${fmtDia(ultimoActual)}.`);
    }
    $('[data-sub="ventas-nota"]').textContent = notas.join(' ');

    pintar(
      $<HTMLCanvasElement>('#g-ventas'),
      {
        type: 'bar',
        data: {
          labels: dias.map(diaSemana),
          datasets: conteos.map(({ l, porDia }) => ({
            label: corto(l),
            data: dias.map((d) => porDia.get(d) ?? null),
            backgroundColor: colorDe(l),
            borderRadius: 4,
            borderSkipped: 'start' as const,
            maxBarThickness: 32,
            barPercentage: 0.9,
            categoryPercentage: 0.8,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          layout: { padding: { top: 18 } },
          scales: { x: ejeX, y: ejeY(fmtCompacto) },
          plugins: {
            legend: { display: false },
            tooltip: tooltipDias(dias, (v) => `${fmtReg(v)} ventas`, true),
            marcas: { clase1: dias.includes(0) ? dias.indexOf(0) : undefined },
            etiquetasBarras: { formato: (v) => fmtReg(v) },
          },
        },
      },
      animar,
    );
  }

  // Manejadores como propiedad (no addEventListener): cada actualización los
  // reemplaza en vez de acumularlos.
  form.onchange = () => {
    ui.filtroVentas = {
      diaDesde: campo('diaDesde').value,
      diaHasta: campo('diaHasta').value,
      horaDesde: campo('horaDesde').value,
      horaHasta: campo('horaHasta').value,
    };
    pintarVentas(true);
  };
  form.onsubmit = (e) => e.preventDefault();
  form.onreset = (e) => {
    e.preventDefault();
    ui.filtroVentas = null;
    valoresIniciales();
    pintarVentas(true);
  };

  aplicarFiltro();
  pintarVentas(ui.animar);

  // ------------------------------------------------------------------------
  // Asistencia y mensajería: cada clase, con sus lecturas y los copys del día
  // ------------------------------------------------------------------------

  function iniciarAsistencia() {
    const panel = $('#panel-asistencia');
    const numeros = [...new Set(lista.flatMap((l) => l.clases.map((c) => c.numero)))].sort((a, b) => a - b);
    panel.hidden = numeros.length === 0;
    if (panel.hidden) return;

    const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
    const claseDe = (l: Lanzamiento, numero: number) => l.clases.find((c) => c.numero === numero);
    /** Lectura más reciente a esa hora: cuántos había cuando salió un copy. */
    const lecturaA = (c: ClaseLanzamiento | undefined, hora: string) =>
      c?.muestras.findLast((m) => m.hora <= hora) ?? null;
    /** Qué se mira: la suma de las dos plataformas o una sola. */
    type VistaAsistencia = Plataforma | 'total';
    const NOMBRE: Record<VistaAsistencia, string> = { total: 'Total', youtube: 'YouTube', zoom: 'Zoom' };
    let vista: VistaAsistencia = ui.vistaAsistencia;
    /** Conectados en una lectura según la vista; el total suma lo que haya de cada plataforma. */
    const valor = (m: MuestraAsistencia, v = vista): number | null => {
      if (v !== 'total') return m[v];
      if (m.youtube == null && m.zoom == null) return null;
      return (m.youtube ?? 0) + (m.zoom ?? 0);
    };
    const pico = (c: ClaseLanzamiento | undefined) =>
      (c?.muestras ?? []).reduce<MuestraAsistencia | null>(
        (max, m) => ((valor(m) ?? -1) > (max ? (valor(max) ?? -1) : -1) ? m : max),
        null,
      );
    const fechaCorta = (iso: string | null) => {
      if (!iso) return '';
      const [a, m, d] = iso.split('-').map(Number);
      return `${SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()].slice(0, 3)} ${fmtFechaCorta(iso)}`;
    };

    let seleccionada = ui.clase != null && numeros.includes(ui.clase) ? ui.clase : numeros[0];
    /** Lanzamientos que se ven en esta sección; siempre queda al menos uno. */
    const visibles = new Set(lista.filter((l) => !ui.ocultos.has(l.id)));
    if (visibles.size === 0) lista.forEach((l) => visibles.add(l));
    const todos = lista;

    function renderVisibles() {
      html($('#ver-lanzamientos'), [...todos]
        .reverse()
        .map((l) => {
          const activo = visibles.has(l);
          return `
            <button type="button" data-ver="${l.id}" aria-pressed="${activo}"
              title="${activo ? 'Ocultar' : 'Mostrar'} ${esc(corto(l))}"
              class="foco inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                activo ? 'border-lila-borde bg-white text-tinta' : 'border-transparent bg-lila text-tenue line-through'
              }">
              <span class="size-2.5 rounded-full" style="background:${activo ? colorDe(l) : '#c9c4d4'}" aria-hidden="true"></span>
              ${esc(corto(l))}
            </button>`;
        })
        .join(''));
    }

    function renderBotones() {
      const lista = todos.filter((l) => visibles.has(l));
      html($('#clases'), numeros
        .map((n) => {
          const activa = n === seleccionada;
          const picos = [...lista]
            .reverse()
            .map((l) => {
              const p = pico(claseDe(l, n));
              const v = p ? valor(p) : null;
              return `<span class="inline-flex items-center gap-1">${punto(l, 'size-2')}${v != null ? fmtCompacto(v) : '—'}</span>`;
            })
            .join('');
          return `
            <button type="button" data-clase="${n}" aria-pressed="${activa}"
              class="foco flex flex-col gap-1 rounded-xl border p-2.5 text-left transition ${
                activa ? 'border-morado bg-white shadow-sm' : 'border-linea bg-lila/50 hover:border-lila-borde'
              }">
              <span class="text-sm font-bold ${activa ? 'text-morado' : 'text-tinta-2'}">Clase ${n}</span>
              <span class="text-[11px] text-tenue">${fechaCorta(claseDe(actual, n)?.fecha ?? null)}</span>
              <span class="flex flex-wrap gap-x-2 text-[11px] font-semibold text-tinta-2" title="Pico de asistencia (${NOMBRE[vista]})">${picos}</span>
            </button>`;
        })
        .join(''));
    }

    function renderClase(animar: boolean) {
      const lista = todos.filter((l) => visibles.has(l));
      const clases = lista.map((l) => claseDe(l, seleccionada));
      const horas = [...new Set(clases.flatMap((c) => c?.muestras.map((m) => m.hora) ?? []))].sort();
      const primera = horas[0];
      const ultima = horas.at(-1);

      // Picos de la clase.
      html($('#picos'), [...lista]
        .reverse()
        .map((l) => {
          const c = claseDe(l, seleccionada);
          if (!c || c.muestras.length === 0) {
            return `<p class="flex items-center gap-2 text-xs text-tenue">${punto(l)}${esc(corto(l))}: sin lecturas de asistencia.</p>`;
          }
          const p = pico(c);
          const v = p ? valor(p) : null;
          const enviados = c.mensajes.filter((m) => m.enviado).length;
          return `
            <p class="flex flex-wrap items-center gap-x-2 text-xs text-tinta-2">${punto(l)}<strong class="text-tinta">${esc(corto(l))}</strong>
              <span>Pico <strong class="text-tinta">${v != null ? fmtReg(v) : '—'}</strong>${p ? ` a las ${p.hora}` : ''}</span> ·
              <span>${enviados} copy${enviados === 1 ? '' : 's'}</span>
            </p>`;
        })
        .join(''));

      // Posición de un copy en el eje de horas (con decimales entre dos lecturas).
      const posicion = (hora: string) => {
        const t = minutos(hora);
        const i = horas.findLastIndex((h) => minutos(h) <= t);
        if (i === -1 || i === horas.length - 1) return Math.max(i, 0);
        const a = minutos(horas[i]);
        const b = minutos(horas[i + 1]);
        return i + (t - a) / (b - a);
      };
      const dentroDelEje = (hora: string | null): hora is string =>
        hora != null && primera != null && ultima != null && hora >= primera && hora <= ultima;
      /** Lecturas en punto de cada 10 minutos (18:30, 18:40…): ahí se rotula el valor. */
      const cadaDiez = horas.flatMap((h, i) => (Number(h.slice(3, 5)) % 10 === 0 ? [i] : []));
      const marcas = clases.flatMap((c, k) =>
        (c?.mensajes ?? [])
          .filter((m) => m.enviado && dentroDelEje(m.hora))
          .map((m) => ({ posicion: posicion(m.hora!), color: colorDe(lista[k]) })),
      );

      pintar(
          $<HTMLCanvasElement>('#g-asistencia'),
          {
            type: 'line',
            data: {
              labels: horas,
              datasets: lista.map((l, k) => {
                const porHora = new Map((clases[k]?.muestras ?? []).map((m) => [m.hora, valor(m)]));
                return {
                  label: corto(l),
                  data: horas.map((h) => porHora.get(h) ?? null),
                  borderColor: colorDe(l),
                  backgroundColor: colorDe(l),
                  borderWidth: l === actual ? 3 : 2,
                  borderCapStyle: 'round' as const,
                  borderJoinStyle: 'round' as const,
                  pointRadius: horas.map((_, i) => (cadaDiez.includes(i) ? 3 : 0)),
                  pointHoverRadius: 5,
                  pointBorderColor: '#ffffff',
                  pointBorderWidth: 1.5,
                  spanGaps: true,
                  tension: 0.2,
                };
              }),
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              layout: { padding: { top: 8, right: 8 } },
              scales: { x: ejeX, y: ejeY(fmtCompacto) },
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...estiloTooltip,
                  mode: 'index',
                  intersect: false,
                  callbacks: {
                    title: (items) => horas[items[0]?.dataIndex ?? 0],
                    label: (ctx) => {
                      const m = clases[ctx.datasetIndex]?.muestras.find((x) => x.hora === horas[ctx.dataIndex]);
                      // En el total se ve también cómo se reparte entre plataformas.
                      const detalle =
                        vista === 'total' && m ? ` (YouTube ${fmtReg(m.youtube ?? 0)} · Zoom ${fmtReg(m.zoom ?? 0)})` : '';
                      return ` ${corto(lista[ctx.datasetIndex])}: ${fmtReg(ctx.parsed.y ?? 0)} conectados${detalle}`;
                    },
                    // Los copys enviados desde esta lectura hasta la siguiente.
                    footer: (items) => {
                      const i = items[0]?.dataIndex ?? 0;
                      const desde = horas[i];
                      const hasta = horas[i + 1] ?? '24:00';
                      return clases.flatMap((c, k) =>
                        (c?.mensajes ?? [])
                          .filter((m) => m.enviado && m.hora != null && m.hora >= desde && m.hora < hasta)
                          .map((m) => `💬 ${corto(lista[k])} ${m.hora}: ${m.inicio.slice(0, 60)}${m.inicio.length > 60 ? '…' : ''}`),
                      );
                    },
                  },
                },
                mensajes: { marcas },
                valoresLinea: { indices: cadaDiez, formato: (v) => fmtReg(v) },
              },
            },
          },
          animar,
        );

      // Línea de tiempo: lecturas y copys intercalados por hora, un lanzamiento por columna.
      $('#linea-tiempo').classList.toggle('lg:grid-cols-2', lista.length > 1);
      html($('#linea-tiempo'), [...lista]
        .reverse()
        .map((l) => {
          const c = claseDe(l, seleccionada);
          type Evento = { hora: string | null; copy: boolean; html: string };
          const eventos: Evento[] = [
            ...(c?.muestras ?? []).map((m) => ({
              hora: m.hora,
              copy: false,
              html: `
                <li class="flex items-baseline gap-3 px-2 py-1 text-xs text-tinta-2">
                  <span class="w-11 shrink-0 font-semibold tabular-nums text-tenue">${m.hora}</span>
                  <strong class="text-tinta tabular-nums">${valor(m) != null ? fmtReg(valor(m)!) : '—'}</strong>
                  ${
                    vista === 'total'
                      ? `<span class="text-[11px] text-tenue">YouTube ${fmtReg(m.youtube ?? 0)} · Zoom ${fmtReg(m.zoom ?? 0)}</span>`
                      : ''
                  }
                </li>`,
            })),
            ...(c?.mensajes ?? []).map((m) => {
              const lectura = m.hora ? lecturaA(c, m.hora) : null;
              return {
                hora: m.hora,
                copy: true,
                html: `
                  <li class="my-1 flex items-baseline gap-3 rounded-lg border-l-4 bg-lila px-2 py-1.5 text-xs ${m.enviado ? '' : 'opacity-60'}"
                      style="border-color:${colorDe(l)}">
                    <span class="w-11 shrink-0 font-bold tabular-nums text-tinta">${m.hora ?? 's/h'}</span>
                    <span class="min-w-0">
                      <span class="block text-tinta">💬 ${esc(m.inicio) || '<em>Sin texto</em>'}</span>
                      <span class="block text-[11px] text-tenue">${m.enviado ? '' : 'No marcado como enviado · '}${
                        lectura && valor(lectura) != null
                          ? `${fmtReg(valor(lectura)!)} conectados${vista === 'total' ? '' : ` en ${NOMBRE[vista]}`} en ese momento`
                          : ''
                      }</span>
                    </span>
                  </li>`,
              };
            }),
          ];
          // Los copys van antes que la lectura de la misma hora; los que no tienen hora, al final.
          eventos.sort(
            (a, b) => (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99') || Number(b.copy) - Number(a.copy),
          );
          return `
            <div class="min-w-0">
              <p class="flex items-center gap-2 text-sm font-bold">${punto(l)}${esc(corto(l))}
                <span class="text-xs font-medium text-tenue">${fechaCorta(c?.fecha ?? null)}</span></p>
              ${
                eventos.length
                  ? `<ol class="mt-2 max-h-[28rem] overflow-y-auto rounded-xl border border-lila-borde p-1">${eventos.map((e) => e.html).join('')}</ol>`
                  : '<p class="mt-2 text-xs text-tenue">Sin lecturas ni copys para esta clase.</p>'
              }
            </div>`;
        })
        .join(''));
    }

    // Manejadores como propiedad: cada actualización los reemplaza en vez de acumularlos.
    $('#clases').onclick = (e) => {
      const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-clase]');
      if (!boton) return;
      seleccionada = ui.clase = Number(boton.dataset.clase);
      renderBotones();
      renderClase(true);
      $<HTMLButtonElement>(`[data-clase="${seleccionada}"]`).focus();
    };

    const controlPlataforma = $('#plataforma');
    const renderPlataforma = () =>
      controlPlataforma.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.valor === vista));
      });
    controlPlataforma.onclick = (e) => {
      const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-valor]');
      if (!boton) return;
      vista = ui.vistaAsistencia = boton.dataset.valor as VistaAsistencia;
      renderPlataforma();
      renderBotones();
      renderClase(true);
    };

    $('#ver-lanzamientos').onclick = (e) => {
      const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ver]');
      const l = todos.find((x) => x.id === boton?.dataset.ver);
      if (!l) return;
      if (visibles.has(l)) {
        if (visibles.size === 1) return; // siempre queda al menos uno
        visibles.delete(l);
        ui.ocultos.add(l.id);
      } else {
        visibles.add(l);
        ui.ocultos.delete(l.id);
      }
      renderVisibles();
      renderBotones();
      renderClase(true);
      $<HTMLButtonElement>(`[data-ver="${l.id}"]`).focus();
    };

    // Con un solo lanzamiento no hay nada que activar o desactivar.
    $('#ver-lanzamientos').hidden = todos.length < 2;
    renderVisibles();
    renderPlataforma();
    renderBotones();
    renderClase(ui.animar);
  }
}
