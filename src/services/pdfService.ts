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
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  })
  
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
  
  // Prepare table data
  const tableData: any[] = []
  let totalBalanceStart = 0
  let totalBuys = 0
  let totalSells = 0
  let totalBalanceEnd = 0
  
  report.coins.forEach(coin => {
    // Add totals
    totalBalanceStart += coin.balanceStartOfYear.valueChf
    totalBuys += coin.buys.reduce((sum, buy) => sum + buy.totalChf, 0)
    totalSells += coin.sells.reduce((sum, sell) => sum + sell.totalChf, 0)
    totalBalanceEnd += coin.balanceEndOfYear.valueChf
    
    // Find the maximum number of transactions (buys or sells) to determine row span
    const maxTransactions = Math.max(coin.buys.length, coin.sells.length, 1)
    
    // Create rows for this coin (one row per transaction, or one row if no transactions)
    for (let i = 0; i < maxTransactions; i++) {
      const row: any[] = []
      
      // Coin name (only in first row, will span vertically)
      if (i === 0) {
        row.push({ content: coin.coin, rowSpan: maxTransactions })
      }
      
      // Bestand 1.1 (only in first row, will span vertically)
      if (i === 0) {
        row.push(
          { content: formatNumberSwiss(coin.balanceStartOfYear.amount, 2), rowSpan: maxTransactions },
          { content: formatNumberSwiss(coin.balanceStartOfYear.priceChf), rowSpan: maxTransactions },
          { content: formatNumberSwiss(coin.balanceStartOfYear.valueChf), rowSpan: maxTransactions }
        )
      }
      
      // Kauf (4 subcolumns: Datum, Stk, Kurs CHF, Steuerwert CHF)
      if (i < coin.buys.length) {
        const buy = coin.buys[i]
        row.push(
          formatDateForPDF(buy.date),
          formatNumberSwiss(buy.amount, 2),
          formatNumberSwiss(buy.priceChf),
          formatNumberSwiss(buy.totalChf)
        )
      } else {
        row.push('', '', '', '') // Empty if no more buys
      }
      
      // Verkauf (4 subcolumns: Datum, Stk, Kurs CHF, Steuerwert CHF)
      if (i < coin.sells.length) {
        const sell = coin.sells[i]
        row.push(
          formatDateForPDF(sell.date),
          formatNumberSwiss(sell.amount, 2),
          formatNumberSwiss(sell.priceChf),
          formatNumberSwiss(sell.totalChf)
        )
      } else {
        row.push('', '', '', '') // Empty if no more sells
      }
      
      // Bestand 31.12 (only in first row, will span vertically)
      if (i === 0) {
        row.push(
          { content: formatNumberSwiss(coin.balanceEndOfYear.amount, 2), rowSpan: maxTransactions },
          { content: formatNumberSwiss(coin.balanceEndOfYear.priceChf), rowSpan: maxTransactions },
          { content: formatNumberSwiss(coin.balanceEndOfYear.valueChf), rowSpan: maxTransactions }
        )
      }
      
      tableData.push(row)
    }
  })
  
  // Add total row
  tableData.push([
    { content: 'Total', styles: { fontStyle: 'bold' } },
    '', // Empty for Stk
    '', // Empty for Kurs CHF
    { content: formatNumberSwiss(totalBalanceStart), styles: { fontStyle: 'bold' } },
    '', // Empty for Datum
    '', // Empty for Stk
    '', // Empty for Kurs CHF
    { content: formatNumberSwiss(totalBuys), styles: { fontStyle: 'bold' } },
    '', // Empty for Datum
    '', // Empty for Stk
    '', // Empty for Kurs CHF
    { content: formatNumberSwiss(totalSells), styles: { fontStyle: 'bold' } },
    '', // Empty for Stk
    '', // Empty for Kurs CHF
    { content: formatNumberSwiss(totalBalanceEnd), styles: { fontStyle: 'bold' } },
  ])
  
  // Create table with nested headers
  autoTable(doc, {
    head: [
      [
        { content: 'Coin', rowSpan: 2 },
        { content: 'Bestand 1.1', colSpan: 3 },
        { content: 'Kauf', colSpan: 4 },
        { content: 'Verkauf', colSpan: 4 },
        { content: 'Bestand 31.12', colSpan: 3 },
      ],
      [
        'Stk',
        'Kurs CHF',
        'Steuerwert CHF',
        'Datum',
        'Stk',
        'Kurs CHF',
        'Steuerwert CHF',
        'Datum',
        'Stk',
        'Kurs CHF',
        'Steuerwert CHF',
        'Stk',
        'Kurs CHF',
        'Steuerwert CHF',
      ],
    ],
    body: tableData,
    startY: 40,
    styles: {
      fontSize: 6,
      cellPadding: 1.5,
    },
    headStyles: {
      fillColor: [218, 165, 32], // Gold color
      textColor: [5, 10, 26], // Dark blue
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 14.44 }, // Coin (18.05 * 0.8)
      1: { cellWidth: 16.38 }, // Bestand 1.1 - Stk (14.89 * 1.1)
      2: { cellWidth: 18.05 }, // Bestand 1.1 - Kurs CHF (19 * 0.95)
      3: { cellWidth: 20.30 }, // Bestand 1.1 - Steuerwert CHF (22.56 * 0.9)
      4: { cellWidth: 18.05 }, // Kauf - Datum (19 * 0.95)
      5: { cellWidth: 16.38 }, // Kauf - Stk (14.89 * 1.1)
      6: { cellWidth: 18.05 }, // Kauf - Kurs CHF (19 * 0.95)
      7: { cellWidth: 20.30 }, // Kauf - Steuerwert CHF (22.56 * 0.9)
      8: { cellWidth: 18.05 }, // Verkauf - Datum (19 * 0.95)
      9: { cellWidth: 16.38 }, // Verkauf - Stk (14.89 * 1.1)
      10: { cellWidth: 18.05 }, // Verkauf - Kurs CHF (19 * 0.95)
      11: { cellWidth: 20.30 }, // Verkauf - Steuerwert CHF (22.56 * 0.9)
      12: { cellWidth: 16.38 }, // Bestand 31.12 - Stk (14.89 * 1.1)
      13: { cellWidth: 18.05 }, // Bestand 31.12 - Kurs CHF (19 * 0.95)
      14: { cellWidth: 20.30 }, // Bestand 31.12 - Steuerwert CHF (22.56 * 0.9)
    },
  })
  
  // Save PDF
  const filename = `crypto-tax-report-CH-${report.year}.pdf`
  doc.save(filename)
}

