import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '../ui/tokens.css';
import './dashboard.css';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { theme } from '../ui/theme';
import { App } from './App';

const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <ModalsProvider>
          <Notifications position="bottom-right" />
          <App />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>
  </StrictMode>,
);
