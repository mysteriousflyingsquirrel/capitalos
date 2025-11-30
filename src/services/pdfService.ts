import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CryptoTaxReport, CoinReport } from './cryptoTaxReportService'
import { formatMoney } from '../lib/currency'

/**
 * Format number with Swiss formatting (thousands separator: ')
 */
function formatNumberSwiss(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('de-CH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Format date for display (DD.MM.YYYY)
 */
function formatDateForPDF(dateString: string): string {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      // Try parsing as YYYY-MM-DD
      const parts = dateString.split('-')
      if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`
      }
      return dateString
    }
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  } catch {
    return dateString
  }
}

/**
 * Generate PDF for crypto tax report
 */
export function generateCryptoTaxReportPDF(
  report: CryptoTaxReport,
  userName?: string
): void {
  const doc = new jsPDF()
  
  // Title section
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Swiss Crypto Tax Report', 14, 20)
  
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.text(`Steuerjahr ${report.year}`, 14, 30)
  
  if (userName) {
    doc.setFontSize(10)
    doc.text(`Benutzer: ${userName}`, 14, 36)
  }
  
  // Intro line
  doc.setFontSize(9)
  doc.text(
    'Übersicht über Krypto-Bestände und Transaktionen für das gewählte Steuerjahr. Nur Käufe/Verkäufe, keine Staking- oder sonstigen Erträge.',
    14,
    44
  )
  
  // Prepare table data
  const tableData: any[] = []
  
  report.coins.forEach(coin => {
    // Format balance start of year
    const balanceStart = [
      `Menge: ${formatNumberSwiss(coin.balanceStartOfYear.amount, 8)}`,
      `Preis: CHF ${formatNumberSwiss(coin.balanceStartOfYear.priceChf)}`,
      `Wert: CHF ${formatNumberSwiss(coin.balanceStartOfYear.valueChf)}`,
    ].join('\n')
    
    // Format buys
    const buysText = coin.buys.length > 0
      ? coin.buys
          .map(
            buy =>
              `${formatDateForPDF(buy.date)} – Menge: ${formatNumberSwiss(buy.amount, 8)}, Preis: CHF ${formatNumberSwiss(buy.priceChf)}, Total: CHF ${formatNumberSwiss(buy.totalChf)}`
          )
          .join('\n')
      : '—'
    
    // Format sells
    const sellsText = coin.sells.length > 0
      ? coin.sells
          .map(
            sell =>
              `${formatDateForPDF(sell.date)} – Menge: ${formatNumberSwiss(sell.amount, 8)}, Preis: CHF ${formatNumberSwiss(sell.priceChf)}, Total: CHF ${formatNumberSwiss(sell.totalChf)}`
          )
          .join('\n')
      : '—'
    
    // Format balance end of year
    const balanceEnd = [
      `Menge: ${formatNumberSwiss(coin.balanceEndOfYear.amount, 8)}`,
      `Preis: CHF ${formatNumberSwiss(coin.balanceEndOfYear.priceChf)}`,
      `Wert: CHF ${formatNumberSwiss(coin.balanceEndOfYear.valueChf)}`,
    ].join('\n')
    
    tableData.push([
      coin.coin,
      balanceStart,
      buysText,
      sellsText,
      balanceEnd,
    ])
  })
  
  // Create table
  autoTable(doc, {
    head: [['Coin', 'Bestand 1. Januar', 'Kauf', 'Verkauf', 'Bestand 31. Dezember']],
    body: tableData,
    startY: 50,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [218, 165, 32], // Gold color
      textColor: [5, 10, 26], // Dark blue
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 30 }, // Coin
      1: { cellWidth: 50 }, // Bestand 1. Januar
      2: { cellWidth: 50 }, // Kauf
      3: { cellWidth: 50 }, // Verkauf
      4: { cellWidth: 50 }, // Bestand 31. Dezember
    },
    didParseCell: (data: any) => {
      // Enable text wrapping for cells with multiple lines
      if (data.cell.text && Array.isArray(data.cell.text)) {
        data.cell.text = data.cell.text.map((line: string) => line.split('\n')).flat()
      }
    },
  })
  
  // Save PDF
  const filename = `crypto-tax-report-CH-${report.year}.pdf`
  doc.save(filename)
}

