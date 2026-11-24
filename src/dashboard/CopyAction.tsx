import { ActionIcon, CopyButton, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';

/** Icon button in a section header that copies `value` to the clipboard. */
export function CopyAction({ value, label }: { value: string; label: string }) {
  return (
    <CopyButton value={value} timeout={2000}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'Copied' : label} withArrow>
          <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} aria-label={label} onClick={copy}>
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}
