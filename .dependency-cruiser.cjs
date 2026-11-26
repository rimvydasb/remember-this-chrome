// Default dependency-cruiser rules. Run with `npm run depcruise`; the Stop/SubagentStop hook runs it after every agent
// task. Each rule's `comment` is printed with a violation, so it says how to fix it, not only what is wrong.
// Known violations are recorded in .dependency-cruiser-known-violations.json (`npm run depcruise:baseline`) and do not
// fail the run; new ones do. Fix recorded ones and re-run the baseline so the file only shrinks.
// Add project-specific rules (layers, public APIs) below the "Project rules" marker.

const fs = require('node:fs');

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Circular dependencies make code hard to test and reason about. Move the shared code to a third module.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'This module is not imported by anything. Delete it, or import it from where it is used.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$', // dot files
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(babel|webpack|vite|vitest|tsdown|playwright|postcss)\\.config\\.(js|cjs|mjs|ts|json)$',
        ],
      },
      to: {},
    },
    {
      name: 'no-deprecated-core',
      comment: 'This module uses a deprecated Node core module. Use its replacement.',
      severity: 'warn',
      from: {},
      to: { dependencyTypes: ['core'], path: '^(punycode|domain|constants|sys|_linklist|_stream_wrap)$' },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'This import cannot be resolved. Fix the path, or install the missing package.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-non-package-json',
      comment: 'This module imports a package that is not in package.json. Add it to dependencies.',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'not-to-dev-dep',
      comment: 'Production code imports a devDependency. Move the package to dependencies, or stop importing it.',
      severity: 'error',
      from: { path: '^src', pathNot: '\\.(spec|test)\\.(js|mjs|cjs|ts|tsx)$|(^|/)(__tests__|testing|test)/' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-duplicate-dep-types',
      comment: 'The package is listed in more than one dependency section of package.json. Keep one.',
      severity: 'warn',
      from: {},
      to: { moreThanOneDependencyType: true, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'not-to-test',
      comment: 'Production code imports test code. Move the shared code out of the test folder.',
      severity: 'error',
      from: { path: '^src', pathNot: '\\.(spec|test)\\.(js|mjs|cjs|ts|tsx)$|(^|/)(__tests__|testing|test)/' },
      to: { path: '\\.(spec|test)\\.(js|mjs|cjs|ts|tsx)$|(^|/)(__tests__|test)/' },
    },

    // --- Project rules -------------------------------------------------------------------------------------------
    {
      name: 'supporting-code-not-to-app',
      comment:
        'Supporting code (shared, llm, followups, background, content) must not import the GUI in src/app. Move what both need out of src/app.',
      severity: 'error',
      from: { path: '^src/(shared|llm|followups|background|content)/', pathNot: '(^|/)(__tests__|test)/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'supporting-code-not-to-react',
      comment: 'Supporting code is framework-free. React and Mantine belong in src/app.',
      severity: 'error',
      from: { path: '^src/(shared|llm|followups|background|content)/', pathNot: '(^|/)(__tests__|test)/' },
      to: { path: '^node_modules/(react|react-dom|@mantine|@tanstack/react-query|@tabler)(/|$)' },
    },
    {
      name: 'llm-is-a-leaf-module',
      comment: 'src/llm is the transport to the LLM server. It must not know about follow-ups or the app.',
      severity: 'error',
      from: { path: '^src/llm/', pathNot: '(^|/)__tests__/' },
      to: { path: '^src/(followups|app)/' },
    },
    {
      name: 'followup-modules-are-independent',
      comment:
        'A follow-up module (summary, questions, tagging, related) must not import another one. Share code through src/followups/*.ts or src/shared.',
      severity: 'error',
      from: { path: '^src/followups/(summary|questions|tagging|related)/', pathNot: '(^|/)__tests__/' },
      to: { path: '^src/followups/(summary|questions|tagging|related)/', pathNot: '^src/followups/$1/' },
    },
    {
      name: 'panels-are-independent',
      comment: 'A reader panel must not import another panel. Share code through src/app/dashboard/panels/common.',
      severity: 'error',
      from: { path: '^src/app/dashboard/panels/([^/]+)/', pathNot: '(^|/)__tests__/' },
      to: {
        path: '^src/app/dashboard/panels/(summary|questions|videoDetails|related)/',
        pathNot: '^src/app/dashboard/panels/$1/',
      },
    },
  ],
  options: {
    exclude: {
      // Anchored to the repo root: packages ship from node_modules/*/dist/, which must stay in the graph.
      path: '^(dist|build|storybook-static|coverage|test-results|playwright-report|\\.git|\\.idea)/',
    },
    // Not `exclude`: excluding node_modules would drop every npm import from the graph, so the package
    // rules could never fire. doNotFollow keeps the edges but does not descend into the packages.
    doNotFollow: { path: 'node_modules' },
    // swc parses .ts/.tsx without requiring the tsc version to match; it also keeps `import type` edges.
    parser: 'swc',
    ...(fs.existsSync('tsconfig.json') ? { tsConfig: { fileName: 'tsconfig.json' } } : {}),
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
