import type { APIRoute } from 'astro';
import { cargarComparativa } from '../../lib/lanzamientos';

/**
 * Los mismos datos que la página, para que se actualice sola cada pocos
 * segundos sin recargar. 5 s de caché en el CDN: aunque haya varias personas
 * mirando, la base se consulta como mucho una vez cada 5 s.
 */
export const GET: APIRoute = async () => {
  try {
    const datos = await cargarComparativa();
    return new Response(JSON.stringify(datos), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=5',
      },
    });
  } catch (error) {
    console.error('[api/comparativa] no se pudieron leer los lanzamientos:', error);
    return new Response(JSON.stringify({ error: 'No se pudo leer la base de datos' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
};
