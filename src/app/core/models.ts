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
