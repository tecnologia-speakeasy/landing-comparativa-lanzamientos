/**
 * Qué productos de Cartera son las ventas de cada lanzamiento.
 *
 * `cartera_compras` relaciona la venta con su producto (`producto_id`), no con
 * el lanzamiento, y los ids de Cartera y del módulo Lanzamientos son
 * distintos. Mientras la base no los relacione, la correspondencia se
 * mantiene aquí a mano:
 *
 *   id del lanzamiento (tabla lanzamientos) → ids de cartera_productos
 *
 * Las ventas del lanzamiento y las del downsell se comparan por separado.
 * Un lanzamiento sin entrada no muestra ventas. Un producto no debe quedar en
 * dos lanzamientos: sus ventas se contarían dos veces.
 */

export interface TipoVenta {
  productos: string[];
  /**
   * Último día de la ventana de ventas ('YYYY-MM-DD'): el carrito más las
   * rezagadas de los días siguientes. Las compras posteriores (links
   * manuales, pagos especiales) se cuentan aparte, "fuera de ventana".
   * Sin cierre, todo cuenta.
   */
  cierre?: string;
}

export interface VentasDeLanzamiento {
  ventas: TipoVenta;
  downsell: TipoVenta;
}

export const VENTAS_POR_LANZAMIENTO: Record<string, VentasDeLanzamiento> = {
  // APRENDE INGLÉS CON FELIPE · Clase 1: 2 mar 2026
  // Carrito del 4 al 9 de marzo, rezagadas hasta el 12. Downsell: 23 y 24 de marzo.
  '7f99801f-b629-4ae6-919e-e9be9c421c9d': {
    ventas: {
      productos: ['641f45a9-837f-4faa-a0a9-0ab81999a117'], // APRENDE INGLÉS CON SPEAK EASY G1
      cierre: '2026-03-12',
    },
    downsell: {
      productos: ['14e706d4-e8fc-4f45-b02b-081fdb1db1fe'], // APRENDE INGLÉS CON SPEAK EASY DOWNSELL
      cierre: '2026-03-24',
    },
  },
  // Lanzamiento Octubre 2026 · Clase 1: 5 oct 2026
  // Carrito del 7 al 12 de octubre, rezagadas hasta el 15. El downsell aún no tiene producto.
  'e4973b81-0161-4e7d-a92d-816f1282c3ee': {
    ventas: {
      productos: ['79e47346-0188-4aa8-b706-818b68442866'], // APRENDE INGLÉS CON SPEAK EASY G2
      cierre: '2026-10-15',
    },
    downsell: { productos: [] },
  },
};
