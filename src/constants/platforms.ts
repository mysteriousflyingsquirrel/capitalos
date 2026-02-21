import type { Platform } from '../services/storageService'

export const DEFAULT_PLATFORMS: Platform[] = [
  { id: 'physical', name: 'Physical', order: 0 },
  { id: 'raiffeisen', name: 'Raiffeisen', order: 0 },
  { id: 'revolut', name: 'Revolut', order: 0 },
  { id: 'yuh', name: 'yuh!', order: 0 },
  { id: 'saxo', name: 'SAXO', order: 0 },
  { id: 'mexc', name: 'MEXC', order: 0 },
  { id: 'bingx', name: 'BingX', order: 0 },
  { id: 'exodus', name: 'Exodus', order: 0 },
  { id: 'trezor', name: 'Trezor', order: 0 },
  { id: 'ledger', name: 'Ledger', order: 0 },
  { id: 'ibkr', name: 'IBKR', order: 0 },
  { id: 'ubs', name: 'UBS', order: 0 },
  { id: 'property', name: 'Property', order: 0 },
  { id: 'wallet', name: 'Wallet', order: 0 },
  { id: 'other', name: 'Other', order: 0 },
]
