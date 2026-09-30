import pg from 'pg';

const { Pool } = pg;

/**
 * Pool de PostgreSQL como singleton.
 *
 * Se guarda en `globalThis` para que el hot reload de `astro dev` no abra un
 * pool nuevo en cada recarga, y para reutilizar conexiones entre invocaciones
 * que caigan en la misma instancia de Vercel.
 */
const CLAVE_GLOBAL = Symbol.for('speakeasy.comparativa.pg.pool');

type GlobalConPool = typeof globalThis & { [CLAVE_GLOBAL]?: pg.Pool };
const global = globalThis as GlobalConPool;

/**
 * La URL viene en formato Prisma (`?schema=public`). `pg` no entiende ese
 * parámetro, así que se quita antes de conectar.
 */
function urlConexion(): string {
  const cruda = import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cruda) throw new Error('Falta la variable de entorno DATABASE_URL');
  const url = new URL(cruda);
  url.searchParams.delete('schema');
  return url.toString();
}

export function obtenerPool(): pg.Pool {
  const existente = global[CLAVE_GLOBAL];
  if (existente) return existente;

  const ssl = (import.meta.env.PGSSL ?? process.env.PGSSL) === 'require';

  const pool = new Pool({
    connectionString: urlConexion(),
    // Esta landing solo consulta: toda transacción de la sesión es de solo
    // lectura, así que ni por error puede escribir en la base del sistema.
    options: '-c default_transaction_read_only=on',
    ssl: ssl ? { rejectUnauthorized: false } : false,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // Sin este listener, un error de red en una conexión inactiva tumba el proceso.
  pool.on('error', (error) => {
    console.error('[db] error en una conexión inactiva del pool:', error);
  });

  global[CLAVE_GLOBAL] = pool;
  return pool;
}

/** Atajo tipado para consultas sueltas. */
export async function consultar<T extends pg.QueryResultRow = pg.QueryResultRow>(
  texto: string,
  valores: readonly unknown[] = [],
): Promise<T[]> {
  const res = await obtenerPool().query<T>(texto, valores as unknown[]);
  return res.rows;
}
