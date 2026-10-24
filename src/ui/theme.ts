export interface AppColors {
  readonly isDark: boolean;
  readonly background: string;
  readonly grouped: string;
  readonly card: string;
  readonly panel: string;
  readonly label: string;
  readonly secondaryLabel: string;
  readonly tertiaryLabel: string;
  readonly separator: string;
  readonly blue: string;
  readonly green: string;
  readonly red: string;
  readonly orange: string;
  readonly purple: string;
  readonly cyan: string;
  readonly yellow: string;
  readonly gray: string;
  readonly fill: string;
  readonly boardBackground: string;
  readonly dim: string;
  readonly selectedTint: string;
}

export const LIGHT_COLORS: AppColors = {
  isDark: false,
  background: '#FFFFFF',
  grouped: '#F2F2F7',
  card: '#FFFFFF',
  panel: '#F7F7FA',
  label: '#000000',
  secondaryLabel: 'rgba(60,60,67,0.6)',
  tertiaryLabel: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.22)',
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  purple: '#AF52DE',
  cyan: '#32ADE6',
  yellow: '#FFCC00',
  gray: '#8E8E93',
  fill: 'rgba(120,120,128,0.16)',
  boardBackground: 'rgba(0,0,0,0.03)',
  dim: 'rgba(0,0,0,0.35)',
  selectedTint: 'rgba(0,122,255,0.12)',
};

export const DARK_COLORS: AppColors = {
  isDark: true,
  background: '#000000',
  grouped: '#000000',
  card: '#1C1C1E',
  panel: '#1C1C1E',
  label: '#FFFFFF',
  secondaryLabel: 'rgba(235,235,245,0.6)',
  tertiaryLabel: 'rgba(235,235,245,0.3)',
  separator: '#38383A',
  blue: '#0A84FF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  purple: '#BF5AF2',
  cyan: '#64D2FF',
  yellow: '#FFD60A',
  gray: '#8E8E93',
  fill: 'rgba(120,120,128,0.32)',
  boardBackground: 'rgba(255,255,255,0.05)',
  dim: 'rgba(0,0,0,0.55)',
  selectedTint: 'rgba(10,132,255,0.22)',
};

export type ThemeName = 'Classic' | 'Flower';

export interface Skin {
  readonly name: ThemeName;
  readonly mainIcon: string;
  readonly mineIcon: string;
  readonly explosionIcon: string;
  readonly coveredLight: string;
  readonly coveredDark: string;
  readonly explodedColor: string;
}

export const SKINS: Readonly<Record<ThemeName, Skin>> = {
  Classic: {
    name: 'Classic',
    mainIcon: '💣',
    mineIcon: '💣',
    explosionIcon: '💥',
    coveredLight: '#007AFF',
    coveredDark: '#0A84FF',
    explodedColor: '#FFFFFF',
  },
  Flower: {
    name: 'Flower',
    mainIcon: '🌼',
    mineIcon: '🌼',
    explosionIcon: '🌼',
    coveredLight: '#34C759',
    coveredDark: '#30D158',
    explodedColor: '#FFFFFF',
  },
};

export function coveredColor(skin: Skin, colors: AppColors): string {
  return colors.isDark ? skin.coveredDark : skin.coveredLight;
}

export function numberColor(count: number, colors: AppColors): string {
  switch ((count - 1) % 8) {
    case 0:
      return colors.blue;
    case 1:
      return colors.green;
    case 2:
      return colors.red;
    case 3:
      return colors.purple;
    case 4:
      return colors.orange;
    case 5:
      return colors.cyan;
    case 6:
      return colors.label;
    default:
      return colors.secondaryLabel;
  }
}