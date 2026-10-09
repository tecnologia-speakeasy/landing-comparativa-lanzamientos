# Comparativa de lanzamientos

Landing interna que compara los lanzamientos de Speak Easy día a día: **registros**, **inversión** y **ventas**, alineados a la **Clase 1** de cada lanzamiento (día 0). Así, el día D-6 de marzo (24 feb) se compara con el D-6 de octubre (29 sep), aunque los lanzamientos empezaran a captar en fechas distintas.

## Qué muestra

- Selección de lanzamientos (el más antiguo es la referencia) y un deslizador para elegir el día de comparación.
- Resumen y KPIs en ese día: registros, inversión acumulada, costo por registro de pauta y registros orgánicos; ventas del lanzamiento, cobrado, conversión registro → venta y costo por venta; y downsell, con los totales de ambos.
- Avance frente al cierre de captación del lanzamiento de referencia.
- Gráficas de registros, inversión, ventas del lanzamiento y downsell (acumulado o por día), costo por registro y registros por fuente.
- Tabla día a día alineada, tabla de fuentes y captación paga por plataforma.

La selección y el día quedan en la URL (`?l=…&d=-6`), así que una vista se puede compartir.

## Datos

Se leen en cada petición de la base del sistema (la misma de inventario-speakeasy). **Solo lectura**: la conexión se abre con `default_transaction_read_only=on`.

| Tabla | Uso |
| --- | --- |
| `lanzamientos` | Fecha de la Clase 1 (día 0) y moneda |
| `clases_lanzamiento` | Última clase, para saber si el lanzamiento terminó |
| `fuentes_lanzamiento` + `registros_metrica` | Registros acumulados por fuente y día |
| `fuentes_metrica2` + `registros_metrica2` | Captación paga: registros e inversión diarios por plataforma |
| `registros_inversion` | Inversión acumulada, para lanzamientos sin Captación paga |
| `cartera_productos` | Nombre de los productos de venta |
| `cartera_compras` + `cartera_compras_pagos` | Ventas (día del primer pago) y lo cobrado en USD |

Un lanzamiento nuevo aparece solo en cuanto tenga métricas en inventario.

### Ventas: relación lanzamiento → productos

`cartera_compras` guarda el producto (`producto_id`), no el lanzamiento, y los ids de los dos módulos son distintos. Por ahora la relación se mantiene a mano en `src/lib/productos-lanzamiento.ts`, separando las ventas del lanzamiento y las del downsell:

```ts
export const VENTAS_POR_LANZAMIENTO: Record<string, VentasDeLanzamiento> = {
  'id-del-lanzamiento': {
    ventas: { productos: ['id-producto'], cierre: '2026-10-15' },
    downsell: { productos: ['id-producto-downsell'], cierre: '2026-10-27' },
  },
};
```

Para un lanzamiento nuevo, agrega su id (tabla `lanzamientos`) con los ids de sus productos (tabla `cartera_productos`). `cierre` es el último día de la ventana de ventas (el carrito más las rezagadas de los días siguientes): lo que entra después se muestra aparte como "fuera de ventana". Sin entrada, el lanzamiento no muestra ventas.

Cada venta cuenta el día de su primer pago (`created_at` no sirve: las compras de marzo se cargaron juntas en junio). Las fuentes se agrupan por nombre (`RSS`/`PAUTA` → Pauta, `YT`/`YOUTUBE` → YouTube…). Una fuente nueva que no encaje se compara por su propio nombre (ver `FUENTES_CONOCIDAS` en `src/lib/lanzamientos.ts`).

## Desarrollo

```sh
npm install
cp .env.example .env   # y completa DATABASE_URL
astro dev --background
```

| Comando | Acción |
| --- | --- |
| `astro dev --background` | Servidor de desarrollo en segundo plano (`astro dev stop` / `status` / `logs`) |
| `npm run build` | Build para Vercel |
| `npx astro check` | Verificación de tipos |

## Despliegue

Astro en modo servidor con el adapter de Vercel, igual que las otras landings. En Vercel hay que definir `DATABASE_URL` (y `PGSSL=require` si el servidor lo exige). La respuesta se guarda 2 minutos en el CDN.
