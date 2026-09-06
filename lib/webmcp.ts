import type { Schedule } from './timetable';
import { updateCourse, place } from './timetable';
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Registry = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerScheduleTools(
  context: Registry | undefined,
  get: () => Schedule,
  commit: (s: Schedule) => void,
) {
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const register = (tool: Tool) => {
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
  };
  register({
    name: 'read_timetable',
    description: '读取当前课程模块和排课。day为0至6，start为1至12。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => structuredClone(get()),
  });
  register({
    name: 'create_and_place_course',
    description:
      '创建课程模块并安排到指定时间，冲突时不修改课表。day为0至6，start为1至12，color为0至9。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 60 },
        location: { type: 'string', maxLength: 60 },
        color: { type: 'integer', minimum: 0, maximum: 9 },
        duration: { type: 'integer', minimum: 1, maximum: 12 },
        day: { type: 'integer', minimum: 0, maximum: 6 },
        start: { type: 'integer', minimum: 1, maximum: 12 },
      },
      required: ['name', 'location', 'color', 'duration', 'day', 'start'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => {
      if (!input || typeof input !== 'object') throw Error('课程参数无效');
      const v = input as Record<string, unknown>;
      if (
        typeof v.name !== 'string' ||
        typeof v.location !== 'string' ||
        typeof v.color !== 'number' ||
        typeof v.duration !== 'number' ||
        typeof v.day !== 'number' ||
        typeof v.start !== 'number'
      )
        throw Error('课程参数无效');
      const id = crypto.randomUUID();
      const next = place(
        updateCourse(get(), {
          id,
          name: v.name.trim(),
          location: v.location.trim(),
          color: v.color,
          duration: v.duration,
        }),
        id,
        v.day,
        v.start,
        crypto.randomUUID(),
      );
      commit(next);
      return { courseId: id, day: v.day, start: v.start };
    },
  });
  return () => lifecycle.abort();
}
export function getModelContext() {
  return (document as unknown as { modelContext?: Registry }).modelContext;
}
