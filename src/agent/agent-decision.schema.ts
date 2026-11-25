import {z} from 'zod';

const ref = () =>
  z.string().regex(/^e\d+$/, 'Use a ref from the list, e.g. "e3"');
const text = (max: number) => z.string().min(1).max(max);

/**
 * The only actions the AI may choose. There is deliberately no command line,
 * file access or free URL: navigation takes a path on the app under test.
 */
export const agentActionSchema = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('click'), ref: ref()}),
  z.strictObject({
    type: z.literal('fill'),
    ref: ref(),
    value: z.string().max(500),
  }),
  z.strictObject({type: z.literal('select'), ref: ref(), value: text(200)}),
  z.strictObject({type: z.literal('navigate'), path: text(500)}),
  z.strictObject({
    type: z.literal('report_bug'),
    title: text(200),
    severity: z.enum(['high', 'medium', 'low']),
    expected: text(1000),
    actual: text(1000),
    /** Exact text copied from the page; checked by code before reporting. */
    evidence: text(500),
  }),
  z.strictObject({
    type: z.literal('finish'),
    passed: z.boolean(),
    summary: text(1000),
  }),
]);

export const agentDecisionSchema = z.strictObject({
  thought: z.string().max(1000),
  action: agentActionSchema,
});
