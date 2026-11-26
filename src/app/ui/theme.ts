import { createTheme, type MantineColorsTuple } from '@mantine/core';

/** Topic chips (`--c-navy` in the Graphite spec). */
const navy: MantineColorsTuple = [
  '#eef2fa',
  '#d9e2f3',
  '#b5c6e6',
  '#8da6d3',
  '#6a87c0',
  '#4a6aa8',
  '#2f4f8f',
  '#1e3a75',
  '#152c5c',
  '#0e1f44',
];
/** The one accent. Shade 6 is the light-theme accent (#4f5bd5), shade 4 the dark-theme one (#8b95ff). */
const accent: MantineColorsTuple = [
  '#eceefe',
  '#dde0fc',
  '#c5caf9',
  '#a9b1ff',
  '#8b95ff',
  '#6c78e8',
  '#4f5bd5',
  '#3a45b8',
  '#2d3694',
  '#212970',
];
/** Graphite: the dark surfaces, from text (0) down to the page (8). */
const dark: MantineColorsTuple = [
  '#e8e9ec',
  '#b9bcc4',
  '#868b95',
  '#5c616b',
  '#2b2f36',
  '#1f2227',
  '#16181c',
  '#101114',
  '#0a0b0d',
  '#050607',
];

export const theme = createTheme({
  colors: { navy, accent, dark },
  primaryColor: 'accent',
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  luminanceThreshold: 0.5,
  // Four radii: chip 4, control 6, card 8, surface 12 (see tokens.css).
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '12px' },
  defaultRadius: 'sm',
  // 4 px base unit.
  spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
  fontSizes: { xs: '11px', sm: '12px', md: '13px', lg: '14px', xl: '16px' },
  lineHeights: { xs: '16px', sm: '16px', md: '20px', lg: '24px', xl: '24px' },
  fontFamily: 'var(--sans)',
  fontFamilyMonospace: 'var(--mono)',
  headings: {
    fontFamily: 'var(--sans)',
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '22px', lineHeight: '28px' },
      h2: { fontSize: '22px', lineHeight: '28px' },
      h3: { fontSize: '16px', lineHeight: '24px' },
      h4: { fontSize: '14px', lineHeight: '24px' },
      h5: { fontSize: '13px', lineHeight: '20px' },
      h6: { fontSize: '12px', lineHeight: '16px' },
    },
  },
  cursorType: 'pointer',
  shadows: { xs: 'none', sm: 'var(--shadow)', md: 'var(--shadow)', lg: 'var(--shadow)', xl: 'var(--shadow)' },
});
