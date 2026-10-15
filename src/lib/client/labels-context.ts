import type { LabelSummary } from '#lib/shared/labels.ts';

/** Reactive id -> label lookup for card/detail chips, provided by the root layout. */
export const LABELS = Symbol('labels');
export type LabelsMap = Map<string, LabelSummary>;
