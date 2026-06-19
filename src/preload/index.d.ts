import type { PhosphorApi } from './index'

declare global {
  interface Window {
    phosphor: PhosphorApi
  }
}

export {}
