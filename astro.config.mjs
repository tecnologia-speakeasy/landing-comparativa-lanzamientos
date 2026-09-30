// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // SSR: las métricas se registran a diario en inventario-speakeasy, así que la
  // página consulta la base en cada petición. Estática se quedaría congelada
  // con los datos del día del despliegue.
  output: 'server',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});
