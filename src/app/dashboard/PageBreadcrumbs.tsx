import { Anchor, Breadcrumbs, Text } from '@mantine/core';

export interface Crumb {
  label: string;
  /** Leave out for the current page. */
  onClick?: () => void;
}

/** Where the main area is: Catalogs › catalog › item. */
export function PageBreadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <Breadcrumbs separatorMargin={6} className="rt-breadcrumbs" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) =>
        crumb.onClick ? (
          <Anchor key={i} component="button" type="button" size="sm" onClick={crumb.onClick}>
            {crumb.label}
          </Anchor>
        ) : (
          <Text key={i} size="sm" c="dimmed" truncate maw={360} aria-current="page">
            {crumb.label}
          </Text>
        ),
      )}
    </Breadcrumbs>
  );
}
