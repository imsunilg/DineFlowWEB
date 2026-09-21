export interface ApiError { code: string; message: string; field?: string | null }
export interface ApiResponse<T> { success: boolean; message: string; data: T; errors: ApiError[]; traceId?: string | null }
export interface Paged<T> { items: T[]; page: number; pageSize: number; totalCount: number; totalPages: number }
export interface PageParams { page?: number; pageSize?: number; search?: string; sortBy?: string; desc?: boolean }

export interface UserProfile {
  id: string; email: string; fullName: string; tenantId: string | null; tenantCode: string | null;
  roles: string[]; permissions: string[];
}
export interface AuthResponse { accessToken: string; accessTokenExpiresAt: string; refreshToken: string; user: UserProfile }

export interface Branding {
  tenantCode: string; applicationName: string; displayName: string; logoUrl: string | null; faviconUrl: string | null;
  primaryColor: string; secondaryColor: string; accentColor: string; currency: string; currencySymbol: string;
  timeZone: string; dateFormat: string; timeFormat: string; receiptHeader: string | null; receiptFooter: string | null;
  features: Record<string, boolean>; platformName: string;
}

export interface Branch { id: string; code: string; name: string; address: string | null; phone: string | null; isActive: boolean }
export interface Floor { id: string; branchId: string; name: string; sortOrder: number; isActive: boolean }
export interface TableType { id: string; name: string; isActive: boolean }
export type TableStatus = 'Available' | 'Reserved' | 'Occupied' | 'Cleaning' | 'Blocked';
export const TABLE_STATUSES: TableStatus[] = ['Available', 'Reserved', 'Occupied', 'Cleaning', 'Blocked'];
export interface DiningTable {
  id: string; floorId: string; tableTypeId: string | null; code: string; capacity: number; status: TableStatus;
  posX: number; posY: number; isActive: boolean;
}
export interface FloorLayout { id: string; branchId: string; name: string; sortOrder: number; tables: DiningTable[] }
export interface TableSummary { total: number; available: number; reserved: number; occupied: number; cleaning: number; blocked: number }

export interface Menu { id: string; name: string; description: string | null; sortOrder: number; isActive: boolean }
export interface MenuCategory { id: string; menuId: string; name: string; serviceArea: string; sortOrder: number; isActive: boolean }
export interface Variant { id?: string; name: string; price: number; isActive: boolean }
export interface Addon { id?: string; name: string; price: number; isActive: boolean }
export interface MenuItem {
  id: string; categoryId: string; categoryName: string; serviceArea: string; code: string; name: string; description: string | null;
  basePrice: number; station: string; isVeg: boolean; isAvailable: boolean; imageUrl: string | null; isActive: boolean;
  variants: Variant[]; addons: Addon[];
}
export interface MenuItemRequest {
  categoryId: string; code: string; name: string; description: string | null; basePrice: number; station: string;
  isVeg: boolean; isAvailable: boolean; imageUrl: string | null; isActive: boolean; variants: Variant[]; addons: Addon[];
}

export interface Customer {
  id: string; fullName: string; phone: string | null; email: string | null; birthday: string | null;
  anniversary: string | null; notes: string | null; isActive: boolean;
}

export const STATIONS = ['Kitchen', 'Bar', 'Dessert', 'Tandoor', 'Chinese', 'Continental'];
export const SERVICE_AREAS = ['Restaurant', 'Bar'];

// ---- Sales ----
export type OrderType = 'DineIn' | 'Takeaway' | 'Delivery';
export const ORDER_TYPES: { value: OrderType; label: string; icon: string }[] = [
  { value: 'DineIn', label: 'Dine-in', icon: 'table_restaurant' },
  { value: 'Takeaway', label: 'Takeaway', icon: 'takeout_dining' },
  { value: 'Delivery', label: 'Delivery', icon: 'delivery_dining' },
];
export interface OrderLine {
  id: string; menuItemId: string; itemName: string; variantName: string | null; unitPrice: number; addonsTotal: number; quantity: number;
  lineSubtotal: number; taxRatePercent: number; taxAmount: number; station: string; serviceArea: string; notes: string | null; status: string;
  sentAt: string | null; addons: { name: string; price: number }[];
}
export interface Order {
  id: string; orderNo: string; orderType: OrderType; tableId: string | null; tableCode: string | null; customerId: string | null; customerName: string | null;
  status: string; notes: string | null; subtotal: number; discountType: string | null; discountValue: number; discountAmount: number; discountReason: string | null;
  taxAmount: number; serviceChargeAmount: number; roundOff: number; grandTotal: number; billId: string | null; createdAt: string; lines: OrderLine[];
}
export interface OrderSummary { id: string; orderNo: string; orderType: string; tableCode: string | null; customerName: string | null; status: string; grandTotal: number; itemCount: number; createdAt: string }

export interface KitchenItem { id: string; name: string; variantName: string | null; quantity: number; notes: string | null; status: string; station: string; addons: string[] }
export interface KitchenTicket { orderId: string; orderNo: string; orderType: string; tableCode: string | null; sentAt: string | null; items: KitchenItem[] }

export interface TaxLine { code: string; name: string; ratePercent: number; amount: number }
export interface Payment { id: string; paymentMethodId: string; methodName: string; amount: number; reference: string | null; createdAt: string }
export interface Bill {
  id: string; billNo: string; orderId: string; orderNo: string; orderType: string; tableCode: string | null; status: string; subtotal: number; discountAmount: number;
  taxAmount: number; serviceChargeAmount: number; roundOff: number; grandTotal: number; paidAmount: number; dueAmount: number;
  taxBreakdown: TaxLine[]; lines: OrderLine[]; payments: Payment[]; createdAt: string; paidAt: string | null;
}
export interface PaymentMethod { id: string; code: string; name: string }
export interface Receipt {
  businessName: string; displayName: string; legalName: string | null; address: string | null; phone: string | null; taxNumber: string | null;
  header: string | null; footer: string | null; currencySymbol: string; timeZone: string; bill: Bill;
}

export interface MenuTreeCategory { id: string; name: string; serviceArea: string; items: MenuItem[] }
export interface MenuTree { id: string; name: string; categories: MenuTreeCategory[] }

// ---- Bar ----
export interface BarCounter { id: string; code: string; name: string; isDefault: boolean; isActive: boolean }
export interface LiquorCategory { id: string; name: string; sortOrder: number; isActive: boolean }
export interface LiquorBrand { id: string; categoryId: string; categoryName: string; name: string; isActive: boolean }
export interface BottleSize { id: string; label: string; volumeMl: number; isActive: boolean }
export interface BarProduct {
  id: string; brandId: string; brandName: string; categoryName: string; bottleSizeId: string; sizeLabel: string; volumeMl: number;
  sku: string | null; reorderLevelBottles: number; isActive: boolean; displayName: string;
}
export interface StockRow {
  counterId: string; counterName: string; productId: string; productName: string; categoryName: string; volumeMl: number;
  quantityMl: number; bottles: number; wholeBottles: number; looseMl: number; reorderLevelBottles: number; isLow: boolean;
}
export interface StockTxn {
  id: string; counterName: string; productId: string; productName: string; type: string; quantityMl: number; quantityBottles: number;
  balanceAfterMl: number; referenceType: string | null; referenceId: string | null; notes: string | null; createdAt: string;
}
export interface StockReportRow {
  productId: string; productName: string; categoryName: string; volumeMl: number; opening: number; purchased: number; sold: number;
  transfersNet: number; breakage: number; wastage: number; other: number; closing: number;
}
export interface Pour { variantId: string | null; variantName: string | null; productId: string; productName: string; mlPerUnit: number }
export interface Drink {
  id: string; code: string; name: string; categoryName: string; basePrice: number; isAvailable: boolean;
  variants: { id: string; name: string }[]; pours: Pour[];
}

// ---- Inventory & purchase ----
export interface Warehouse { id: string; code: string; name: string; isDefault: boolean; isActive: boolean }
export interface InvStockRow {
  warehouseId: string; warehouseName: string; itemId: string; code: string; name: string; categoryName: string | null; unitCode: string;
  quantity: number; minStock: number; maxStock: number; reorderLevel: number; costPrice: number; stockValue: number; level: 'OK' | 'Low' | 'Out' | 'Over';
}
export interface InvTxn {
  id: string; warehouseName: string; itemId: string; itemName: string; unitCode: string; type: string; quantity: number; balanceAfter: number;
  unitCost: number | null; referenceType: string | null; notes: string | null; createdAt: string;
}
export interface StockAlert { source: 'Inventory' | 'Bar'; id: string; name: string; quantity: number; threshold: number; unit: string }
export interface InvItem { id: string; code: string; name: string; unitCode: string; costPrice: number; isActive: boolean }
export interface RecipeLine { variantId: string | null; variantName: string | null; itemId: string; itemName: string; unitCode: string; quantity: number }
export interface Recipe { menuItemId: string; code: string; name: string; categoryName: string; variants: { id: string; name: string }[]; lines: RecipeLine[] }

export interface Supplier { id: string; code: string; name: string; paymentTermsDays: number; isActive: boolean }
export interface PoLine {
  id: string; inventoryItemId: string | null; barProductId: string | null; description: string; quantity: number; unitPrice: number; taxPercent: number;
  lineTotal: number; receivedQuantity: number; returnedQuantity: number; remainingQuantity: number;
}
export interface PurchaseOrder {
  id: string; poNo: string; supplierId: string; supplierName: string; status: string; orderDate: string; expectedDate: string | null; notes: string | null;
  subtotal: number; taxAmount: number; total: number; lines: PoLine[];
  receipts: { id: string; grnNo: string; receivedDate: string; notes: string | null }[];
  invoices: { id: string; invoiceNo: string; invoiceDate: string; dueDate: string | null; total: number; paidAmount: number; status: string }[];
}
export interface PurchaseOrderSummary { id: string; poNo: string; supplierName: string; status: string; orderDate: string; total: number; lineCount: number }
export interface PurchaseInvoice {
  id: string; invoiceNo: string; supplierId: string; supplierName: string; purchaseOrderId: string; poNo: string; invoiceDate: string; dueDate: string | null;
  subtotal: number; taxAmount: number; total: number; paidAmount: number; dueAmount: number; status: string;
  payments: { id: string; methodName: string; amount: number; paidAt: string; reference: string | null }[];
}

export interface AppNotification { id: string; type: string; title: string; message: string; entity: string | null; entityId: string | null; isRead: boolean; createdAt: string }
