import { expect, it } from 'vitest';
import { validateDiagram } from '../../src/lib/client/markdown/mermaid.ts';

it('accepts ordinary flowchart and sequence arrows without weakening the asset policy', () => {
  for (const source of [
    'flowchart LR\n A[Write] --> B[Read]',
    'sequenceDiagram\nAlice->>Bob: Hello\nBob-->>Alice: Answer',
    'flowchart LR\n A ==> B\n B -.-> C',
  ])
    expect(() => validateDiagram(source)).not.toThrow();
});
it('rejects directives, obfuscated assets, CSS and complexity before importing Mermaid', () => {
  for (const source of [
    '%%{init: {}}%%\nflowchart LR',
    '---\nconfig: {}\n---',
    'flowchart LR\nA@{img: "/asset"}',
    'flowchart LR\nA["#60;img#62;"]',
    'flowchart LR\nstyle A fill:red',
    'flowchart LR\nclick A callback',
  ])
    expect(() => validateDiagram(source)).toThrow('disabled');
  for (const source of [
    'x'.repeat(12001),
    'A\n'.repeat(161),
    'A-->B;'.repeat(301),
    'A[x] '.repeat(161),
  ])
    expect(() => validateDiagram(source)).toThrow('too large');
});
