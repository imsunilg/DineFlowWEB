import { ThemeMode } from '../theme.service';

export interface LoginThemeAssets {
  light: string;
  dark: string;
}

const DEFAULT_ASSETS: LoginThemeAssets = {
  light: '/Login/LightModeBG.png',
  dark: '/Login/DarkModeBG.png',
};

/** Per-tenant login background overrides, keyed by tenant code. Add an entry here to white-label a new tenant. */
const LOGIN_BACKGROUNDS: Record<string, LoginThemeAssets> = {};

export function loginBackground(mode: ThemeMode, tenantCode?: string | null): string {
  const assets = (tenantCode && LOGIN_BACKGROUNDS[tenantCode.toUpperCase()]) || DEFAULT_ASSETS;
  return assets[mode];
}
