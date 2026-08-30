# LiberCorp — Frontend

Panel de administración de LiberCorp: monitoreo de puertos y facturación para
ISP sobre datos de LibreNMS. Construido con Vite 8 y JavaScript vanilla (sin
framework, sin Bootstrap, sin jQuery), sobre la base del template Gentelella v4.

Ver [INSTALACION.md](../INSTALACION.md) en la raíz del proyecto para levantar
el sistema completo (backend + frontend), o [DEPLOY.md](../DEPLOY.md) para
pasar a producción.

## Comandos

```bash
npm install
npm run dev                # Vite dev server en :9173
npm run build               # Build de producción -> dist/
npm run preview             # Sirve el build en :9174

npm run lint                # ESLint sobre src/
npm run format               # Prettier
npm run new -- <slug>        # Scaffold de una pagina nueva bajo production/
npm run smoke                 # Levanta el dev server y verifica que cada pagina responda 200
```

## Estructura

Ver [CLAUDE.md](CLAUDE.md) para el detalle de arquitectura (entry point,
inyección del shell, sistema de theming, convenciones de módulos por página).

## Créditos

Construido sobre [Gentelella v4](https://github.com/ColorlibHQ/gentelella) de
Colorlib (MIT License, ver [LICENSE.txt](LICENSE.txt)).
