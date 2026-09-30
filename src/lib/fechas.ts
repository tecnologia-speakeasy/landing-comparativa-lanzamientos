/** Utilidades de fechas 'YYYY-MM-DD' sin zona horaria (se tratan como UTC). */

const MS_DIA = 86_400_000;

function aUtc(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

/** Días de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA);
}

export function sumarDias(iso: string, dias: number): string {
  return new Date(aUtc(iso) + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Hoy en Colombia (donde se registran las métricas). */
export function hoyColombia(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora);
}
