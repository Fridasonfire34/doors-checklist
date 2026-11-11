import { colors } from './theme';

// Cada etapa con su color e ícono, para distinguirlas de un vistazo.
export const STAGE_THEME: Record<string, { color: string; soft: string; icon: string }> = {
  BUILD: { color: '#c9922e', soft: '#fbf3e4', icon: 'hammer' },
  TRIM: { color: '#0f9d8a', soft: '#e3f6f3', icon: 'cut' },
  MOLDING: { color: '#7c4dcc', soft: '#f1eafd', icon: 'flask' },
  HANGER: { color: '#d9488b', soft: '#fce8f1', icon: 'exit' },
};
export const DEFAULT_STAGE_THEME = { color: colors.navy, soft: colors.navySoft, icon: 'list' };
export const stageTheme = (key: string | null | undefined) => (key && STAGE_THEME[key]) || DEFAULT_STAGE_THEME;

// Dorado del logo de TAFCO.
export const GOLD = '#e0a33a';
