// Tipo normalizado de movimiento financiero — común a todos los proveedores.
// Cada wallet (MP, Ualá, Gmail, etc.) convierte sus datos crudos a este formato.

export type WalletProvider =
  | 'mercadopago'
  | 'uala'
  | 'naranja_x'
  | 'brubank'
  | 'personal_pay'
  | 'prex'
  | 'gmail'
  | 'manual';

export type MovementType = 'expense' | 'income' | 'transfer' | 'refund';

export type Classification = 'necessary' | 'disposable' | 'investable';

export interface WalletMovement {
  raw_id:         string;          // ID único del proveedor (para deduplicación)
  provider:       WalletProvider;
  type:           MovementType;
  date:           string;          // YYYY-MM-DD
  amount:         number;          // siempre positivo; el tipo indica dirección
  currency:       string;          // 'ARS', 'USD', etc.
  merchant:       string;          // nombre del comercio o descripción
  category:       string;          // categoría normalizada
  classification: Classification;
  metadata?:      Record<string, unknown>;
}

// Interfaz que cada proveedor debe implementar (preparado para escalar)
export interface WalletProviderAdapter {
  provider:  WalletProvider;
  isEnabled: () => Promise<boolean>;
  sync:      (since: Date) => Promise<WalletMovement[]>;
}
