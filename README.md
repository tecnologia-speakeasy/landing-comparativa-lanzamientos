# Comparativa de lanzamientos

Landing interna que compara los lanzamientos de Speak Easy día a día: **registros** e **inversión**, alineados a la **Clase 1** de cada lanzamiento (día 0). Así, el día D-6 de marzo (24 feb) se compara con el D-6 de octubre (29 sep), aunque los lanzamientos empezaran a captar en fechas distintas.

## Qué muestra

- Selección de lanzamientos (el más antiguo es la referencia) y un deslizador para elegir el día de comparación.
- Resumen y KPIs en ese día: registros, inversión acumulada, costo por registro de pauta y registros orgánicos.
- Avance frente al cierre de captación del lanzamiento de referencia.
- Gráficas de registros e inversión (acumulado o por día), costo por registro y registros por fuente.
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

Un lanzamiento nuevo aparece solo en cuanto tenga métricas en inventario. Las fuentes se agrupan por nombre (`RSS`/`PAUTA` → Pauta, `YT`/`YOUTUBE` → YouTube…). Una fuente nueva que no encaje se compara por su propio nombre (ver `FUENTES_CONOCIDAS` en `src/lib/lanzamientos.ts`).

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
