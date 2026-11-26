import { createTheme, type MantineColorsTuple } from '@mantine/core';

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
const silver: MantineColorsTuple = [
  '#f5f7fa',
  '#eaedf2',
  '#d8dde5',
  '#c3cad5',
  '#aeb7c4',
  '#98a2b1',
  '#818c9d',
  '#6a7587',
  '#535d6e',
  '#3d4554',
];

export const theme = createTheme({
  colors: { navy, silver },
  primaryColor: 'navy',
  primaryShade: { light: 7, dark: 4 },
  defaultRadius: 'md',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  headings: { fontWeight: '650' },
  cursorType: 'pointer',
});
