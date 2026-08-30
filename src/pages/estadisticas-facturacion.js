import { requireAuth, tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { showToast } from '../v4/toast.js';
import { fmtMonto } from '../lib/format.js';

requireAuth();

const puedeVer = tienePermiso('reportes.ver');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const anioSelect = document.getElementById('ef-anio');
const monedaSelect = document.getElementById('ef-moneda');
const chartEl = document.getElementById('ef-chart');

let chartInstance = null;

function llenarAnios() {
  const actual = new Date().getFullYear();
  const anios = [];
  for (let a = actual + 1; a >= actual - 4; a--) anios.push(a);
  anioSelect.innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join('');
  anioSelect.value = String(actual);
}

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  return {
    blue: cs.getPropertyValue('--blue').trim(),
    green: cs.getPropertyValue('--green').trim(),
    text: cs.getPropertyValue('--text').trim(),
    textMuted: cs.getPropertyValue('--text-muted').trim(),
    borderLight: cs.getPropertyValue('--border-color-light').trim(),
    bgSurface: cs.getPropertyValue('--bg-surface').trim()
  };
}

async function montarChart(porMesMoneda) {
  const [echarts, { BarChart }, { GridComponent, TooltipComponent, LegendComponent }, { CanvasRenderer }] = await Promise.all([
    import('echarts/core'),
    import('echarts/charts'),
    import('echarts/components'),
    import('echarts/renderers')
  ]);
  echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

  const t = tokens();
  if (chartInstance) chartInstance.dispose();
  chartInstance = echarts.init(chartEl);
  chartInstance.setOption({
    textStyle: { fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: t.textMuted },
    grid: { left: 60, right: 16, top: 40, bottom: 32, containLabel: false },
    legend: { top: 0, textStyle: { color: t.textMuted, fontSize: 11 } },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: t.bgSurface,
      borderColor: t.borderLight,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.text, fontSize: 12 },
      extraCssText: 'box-shadow: 0 2px 8px rgba(30,38,51,0.08); border-radius: 6px;',
      valueFormatter: (v) => fmtMonto(v)
    },
    xAxis: {
      type: 'category',
      data: MESES,
      axisLine: { lineStyle: { color: t.borderLight } },
      axisTick: { show: false },
      axisLabel: { color: t.textMuted, fontSize: 10, rotate: 45 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: t.borderLight, type: [4, 3] } },
      axisLabel: { color: t.textMuted, fontSize: 10, formatter: (v) => fmtMonto(v, 0) }
    },
    series: [
      { name: 'Facturado', type: 'bar', data: porMesMoneda.map((m) => m.facturado), itemStyle: { color: t.blue, borderRadius: [3, 3, 0, 0] }, barGap: '10%' },
      { name: 'Cobrado', type: 'bar', data: porMesMoneda.map((m) => m.cobrado), itemStyle: { color: t.green, borderRadius: [3, 3, 0, 0] } }
    ]
  });
}

function renderKpis(kpis, moneda) {
  document.getElementById('kpi-facturado').textContent = `${moneda} ${fmtMonto(kpis.facturado[moneda] ?? 0)}`;
  document.getElementById('kpi-cobrado').textContent = `${moneda} ${fmtMonto(kpis.cobrado[moneda] ?? 0)}`;
  document.getElementById('kpi-tasa').textContent = `${(kpis.tasaCobranza[moneda] ?? 0).toFixed(1)}%`;
  document.getElementById('kpi-vencidas').textContent = kpis.boletasVencidas ?? 0;
}

function renderTabla(porMesMoneda) {
  const tbody = document.getElementById('ef-tabla-rows');
  tbody.innerHTML = porMesMoneda
    .map((m, i) => {
      const pendiente = Math.max(m.facturado - m.cobrado, 0);
      const pct = m.facturado > 0 ? ((m.cobrado / m.facturado) * 100).toFixed(1) : '0.0';
      return `
        <tr>
          <td class="cell-strong">${MESES[i]}</td>
          <td class="cell-mono">${m.cantidadBoletas}</td>
          <td class="cell-mono">${fmtMonto(m.facturado)}</td>
          <td class="cell-mono">${fmtMonto(m.cobrado)}</td>
          <td class="cell-mono">${fmtMonto(pendiente)}</td>
          <td class="cell-mono">${pct}%</td>
        </tr>`;
    })
    .join('');
}

async function cargar() {
  if (!puedeVer) {
    document.querySelector('.page-wrapper').innerHTML = '<p>No tienes permiso para ver esta seccion.</p>';
    return;
  }
  const anio = Number(anioSelect.value);
  const moneda = monedaSelect.value;
  try {
    const data = await api.get(`/reportes/estadisticas?anio=${anio}`);
    const porMesMoneda = data.porMes.filter((m) => m.moneda === moneda).sort((a, b) => a.mes - b.mes);
    renderKpis(data.kpis, moneda);
    renderTabla(porMesMoneda);
    await montarChart(porMesMoneda);
  } catch (err) {
    showToast(err.message || 'No se pudieron cargar las estadisticas', { variant: 'error' });
  }
}

anioSelect.addEventListener('change', cargar);
monedaSelect.addEventListener('change', cargar);
window.addEventListener('resize', () => chartInstance?.resize());
document.documentElement.addEventListener('themechange', cargar);
new MutationObserver((records) => {
  if (records.some((r) => r.attributeName === 'data-theme')) cargar();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

llenarAnios();
cargar();
