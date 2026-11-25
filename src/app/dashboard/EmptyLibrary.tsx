import { Button, Center, EmptyState, FileButton, Kbd } from '@mantine/core';
import { IconBookmark, IconBrandYoutube, IconUpload } from '@tabler/icons-react';

export function EmptyLibrary({ onImport }: { onImport: (file: File | null) => void }) {
  return (
    <Center h="70vh">
      <EmptyState
        icon={<IconBookmark size={30} />}
        title="Your library is empty"
        description={
          <>
            Open a YouTube video, click the <b>Remember This</b> toolbar button, and choose <b>Save transcript</b>. Or
            press <Kbd size="xs">Alt</Kbd> + <Kbd size="xs">Shift</Kbd> + <Kbd size="xs">S</Kbd> on the video page.
          </>
        }
        maw={460}
      >
        <EmptyState.Actions>
          <Button
            component="a"
            href="https://www.youtube.com/"
            target="_blank"
            rel="noreferrer"
            leftSection={<IconBrandYoutube size={18} />}
          >
            Go to YouTube
          </Button>
          <FileButton onChange={onImport} accept="application/json,.json">
            {(props) => (
              <Button {...props} variant="default" leftSection={<IconUpload size={18} />}>
                Import JSON
              </Button>
            )}
          </FileButton>
        </EmptyState.Actions>
      </EmptyState>
    </Center>
  );
}
