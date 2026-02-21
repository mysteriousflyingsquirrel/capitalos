import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CryptoTaxReport, CoinReport } from './cryptoTaxReportService'

function fmt(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('de-CH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

function fmtDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      const parts = dateString.split('-')
      if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`
      return dateString
    }
    const d = date.getDate().toString().padStart(2, '0')
    const m = (date.getMonth() + 1).toString().padStart(2, '0')
    return `${d}.${m}.${date.getFullYear()}`
  } catch {
    return dateString
  }
}

function parseDateForSort(formatted: string): number {
  const parts = formatted.split('.')
  if (parts.length === 3) {
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime() || 0
  }
  return 0
}

const TYPE_ORDER: Record<string, number> = { Kauf: 0, Verkauf: 1, Anpassung: 2 }

const GOLD: [number, number, number] = [218, 165, 32]
const DARK: [number, number, number] = [5, 10, 26]
const HEAD_STYLES = { fillColor: GOLD, textColor: DARK, fontStyle: 'bold' as const }
const STYLES = { fontSize: 7, cellPadding: 2 }

function getY(doc: jsPDF): number {
  return (doc as any).lastAutoTable?.finalY ?? 40
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > doc.internal.pageSize.getHeight() - 15) {
    doc.addPage()
    return 15
  }
  return y
}

export function generateCryptoTaxReportPDF(report: CryptoTaxReport): void {
  const detailed = report.coins.some(c => c.adjustments && c.adjustments.length > 0)
  const endDate = report.endDate

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()

  // --- Title ---
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(detailed ? 'Swiss Crypto Tax Report (Detailed)' : 'Swiss Crypto Tax Report', pw / 2, 20, { align: 'center' })

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(report.isCurrentYear ? `Steuerjahr ${report.year} (YTD)` : `Steuerjahr ${report.year}`, pw / 2, 28, { align: 'center' })

  let y = 36

  // --- Bestand 1.1 ---
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Bestand 1.1', 14, y)
  y += 3

  let totalStartValue = 0
  const startBody: any[][] = report.coins.map(c => {
    totalStartValue += c.balanceStartOfYear.valueChf
    return [c.coin, fmt(c.balanceStartOfYear.amount, 4), fmt(c.balanceStartOfYear.priceChf), fmt(c.balanceStartOfYear.valueChf)]
  })
  startBody.push([
    { content: 'Total', styles: { fontStyle: 'bold' } },
    '', '',
    { content: fmt(totalStartValue), styles: { fontStyle: 'bold' } },
  ])

  autoTable(doc, {
    head: [['Asset', 'Stk', `Kurs CHF per 1.1`, 'Steuerwert CHF']],
    body: startBody,
    startY: y,
    tableWidth: 180,
    styles: STYLES,
    headStyles: HEAD_STYLES,
    columnStyles: {
      0: { cellWidth: 30 },
      3: { halign: 'right' },
    },
  })
  y = getY(doc) + 8

  // --- Bestand end ---
  y = ensureSpace(doc, y, 20 + report.coins.length * 8)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`Bestand ${endDate}`, 14, y)
  y += 3

  let totalEndValue = 0
  const endBody: any[][] = report.coins.map(c => {
    totalEndValue += c.balanceEndOfYear.valueChf
    return [c.coin, fmt(c.balanceEndOfYear.amount, 4), fmt(c.balanceEndOfYear.priceChf), fmt(c.balanceEndOfYear.valueChf)]
  })
  endBody.push([
    { content: 'Total', styles: { fontStyle: 'bold' } },
    '', '',
    { content: fmt(totalEndValue), styles: { fontStyle: 'bold' } },
  ])

  autoTable(doc, {
    head: [['Asset', 'Stk', `Kurs CHF per ${endDate}`, 'Steuerwert CHF']],
    body: endBody,
    startY: y,
    tableWidth: 180,
    styles: STYLES,
    headStyles: HEAD_STYLES,
    columnStyles: {
      0: { cellWidth: 30 },
      3: { halign: 'right' },
    },
  })
  y = getY(doc) + 8

  // --- Transaktionen ---
  interface TxRow {
    asset: string
    type: string
    date: string
    stk: string
    kurs: string
    value: string
    comment: string
  }

  const allRows: TxRow[] = []

  for (const coin of report.coins) {
    for (const tx of coin.buys) {
      allRows.push({ asset: coin.coin, type: 'Kauf', date: fmtDate(tx.date), stk: fmt(tx.amount, 4), kurs: fmt(tx.priceChf), value: fmt(tx.totalChf), comment: '' })
    }
    for (const tx of coin.sells) {
      allRows.push({ asset: coin.coin, type: 'Verkauf', date: fmtDate(tx.date), stk: fmt(tx.amount, 4), kurs: fmt(tx.priceChf), value: fmt(tx.totalChf), comment: '' })
    }
    if (detailed && coin.adjustments) {
      for (const a of coin.adjustments) {
        allRows.push({ asset: coin.coin, type: 'Anpassung', date: fmtDate(a.date), stk: fmt(a.amount, 4), kurs: '', value: '', comment: a.reason || '' })
      }
    }
  }

  allRows.sort((a, b) => {
    const assetCmp = a.asset.localeCompare(b.asset)
    if (assetCmp !== 0) return assetCmp
    const typeCmp = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)
    if (typeCmp !== 0) return typeCmp
    return parseDateForSort(a.date) - parseDateForSort(b.date)
  })

  // Build body with asset grouping (asset name only on first row of group)
  const txBody: any[][] = []
  let lastAsset = ''

  for (const row of allRows) {
    const showAsset = row.asset !== lastAsset
    lastAsset = row.asset
    txBody.push([showAsset ? row.asset : '', row.type, row.date, row.stk, row.kurs, row.value, row.comment])
  }

  if (txBody.length === 0) {
    txBody.push([{ content: 'Keine Transaktionen', colSpan: 7, styles: { halign: 'center', fontStyle: 'italic', textColor: [120, 120, 120] } }])
  }

  y = ensureSpace(doc, y, 30)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Transaktionen', 14, y)
  y += 3

  autoTable(doc, {
    head: [['Asset', 'Typ', 'Datum', 'Stk', 'Kurs CHF', 'Steuerwert CHF', 'Kommentar']],
    body: txBody,
    startY: y,
    tableWidth: 180,
    styles: STYLES,
    headStyles: HEAD_STYLES,
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      2: { cellWidth: 22 },
      3: { cellWidth: 24 },
      4: { cellWidth: 24 },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 38 },
    },
    didParseCell: (data: any) => {
      if (data.section !== 'body') return
      if (data.column.index !== 0) return
      if (data.cell.raw && typeof data.cell.raw === 'string' && data.cell.raw.length > 0) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  const suffix = detailed ? '-detailed' : ''
  doc.save(`crypto-tax-report-CH-${report.year}${suffix}.pdf`)
}
