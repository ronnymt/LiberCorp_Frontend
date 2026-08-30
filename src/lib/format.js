/** Formatea un monto de dinero con separador de miles "," y punto decimal (ej. 10000.5 -> "10,000.50"). Solo para montos, nunca para percentiles/Mbps ni valores de <input>. */
export function fmtMonto(valor, decimales = 2) {
  return Number(valor).toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}
