import { Group, Text, ThemeIcon } from '@mantine/core';
import { IconBookmark } from '@tabler/icons-react';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Group gap={8} wrap="nowrap">
      <ThemeIcon
        size={size === 'sm' ? 26 : 32}
        radius="md"
        variant="gradient"
        gradient={{ from: 'indigo.6', to: 'violet.5', deg: 135 }}
      >
        <IconBookmark size={size === 'sm' ? 16 : 19} stroke={2.2} />
      </ThemeIcon>
      <Text fw={700} size={size === 'sm' ? 'md' : 'lg'} style={{ letterSpacing: '-0.01em' }}>
        Remember This
      </Text>
    </Group>
  );
}
