import { Group, Text } from '@mantine/core';
import { AppIcon } from './AppIcon';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Group gap={8} wrap="nowrap">
      <AppIcon size={size === 'sm' ? 26 : 32} />
      <Text fw={700} size={size === 'sm' ? 'md' : 'lg'} style={{ letterSpacing: '-0.01em' }}>
        Remember This
      </Text>
    </Group>
  );
}
