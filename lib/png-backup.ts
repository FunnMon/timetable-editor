import { placementError, updateCourse } from './timetable';
import type { Course, Placement, Schedule } from './timetable';

// Private ancillary, safe-to-copy PNG chunk. Pixels remain a normal PNG.
const CHUNK = 'csTb';
const FORMAT = 'course-studio/timetable';
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
export const MAX_PNG_BYTES = 20 * 1024 * 1024;
const MAX_DATA_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export type Backup = { title: string; schedule: Schedule; legacy?: boolean };
class LegacyPngError extends Error {}
const invalid = () => Error('图片中的课表数据无效或已损坏，当前课表未更改。');

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunks(bytes: Uint8Array) {
  if (bytes.length > MAX_PNG_BYTES)
    throw Error('请选择小于20 MB的原始PNG图片。');
  if (!SIGNATURE.every((b, i) => bytes[i] === b))
    throw Error('请选择本站导出的PNG原图。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: {
    type: string;
    start: number;
    end: number;
    data: Uint8Array;
  }[] = [];
  let offset = 8,
    hasImage = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw invalid();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4))
      throw invalid();
    if (result.length === 0 && (type !== 'IHDR' || length !== 13))
      throw invalid();
    if (type === 'IDAT') hasImage = true;
    result.push({
      type,
      start: offset,
      end,
      data: bytes.subarray(offset + 8, end - 4),
    });
    if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length || !hasImage) throw invalid();
      return result;
    }
    offset = end;
  }
  throw invalid();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim())
  )
    throw invalid();
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw invalid();
  return value;
}
function validate(value: unknown): Backup {
  const data = record(value);
  if (data.format !== FORMAT) throw invalid();
  if (data.version !== 1)
    throw Error('此图片使用了不支持的课表版本，请使用对应版本的网站导入。');
  const title = text(data.title, 60);
  const raw = record(data.schedule);
  if (
    !Array.isArray(raw.courses) ||
    raw.courses.length > 1000 ||
    !Array.isArray(raw.placements) ||
    raw.placements.length > 84
  )
    throw invalid();
  let schedule: Schedule = { courses: [], placements: [] };
  const ids = new Set<string>();
  for (const item of raw.courses) {
    const c = record(item);
    const course: Course = {
      id: text(c.id, 128, true),
      name: text(c.name, 60, true),
      location: text(c.location, 60),
      color: integer(c.color, 0, 9),
      duration: integer(c.duration, 1, 12),
    };
    if (ids.has(course.id)) throw invalid();
    ids.add(course.id);
    schedule = updateCourse(schedule, course);
  }
  const placementIds = new Set<string>();
  for (const item of raw.placements) {
    const p = record(item);
    const placement: Placement = {
      id: text(p.id, 128, true),
      courseId: text(p.courseId, 128, true),
      day: integer(p.day, 0, 6),
      start: integer(p.start, 1, 12),
    };
    const course = schedule.courses.find((c) => c.id === placement.courseId);
    if (
      !course ||
      placementIds.has(placement.id) ||
      placementError(schedule, course, placement.day, placement.start)
    )
      throw invalid();
    placementIds.add(placement.id);
    schedule.placements.push(placement);
  }
  return { title, schedule };
}

export function embedBackup(
  png: Uint8Array,
  backup: Backup,
): Uint8Array<ArrayBuffer> {
  const payload = { format: FORMAT, version: 1, ...backup };
  validate(payload);
  const data = encoder.encode(JSON.stringify(payload));
  if (data.length > MAX_DATA_BYTES) throw Error('课表数据过大，暂时无法导出。');
  const parsed = chunks(png);
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(encoder.encode(CHUNK), 4);
  chunk.set(data, 8);
  view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));
  // Re-exporting replaces metadata instead of accumulating ambiguous copies.
  const parts = [png.subarray(0, 8)];
  for (const part of parsed) {
    if (part.type === CHUNK) continue;
    if (part.type === 'IEND') parts.push(chunk);
    parts.push(png.subarray(part.start, part.end));
  }
  const output = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  if (output.length > MAX_PNG_BYTES)
    throw Error('导出图片超过20 MB，请减少课程数据。');
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function readBackup(png: Uint8Array): Backup {
  const metadata = chunks(png).filter((c) => c.type === CHUNK);
  if (metadata.length === 0)
    throw new LegacyPngError('这张图片不含可恢复的课表数据，需要使用旧版图片识别。');
  if (metadata.length !== 1 || metadata[0].data.length > MAX_DATA_BYTES)
    throw invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(metadata[0].data));
  } catch {
    throw invalid();
  }
  return validate(parsed);
}

export async function importSchedulePng(file: File, progress: (message: string) => void = () => {}): Promise<Backup> {
  if (file.size > MAX_PNG_BYTES) throw Error('请选择小于20 MB的原始PNG图片。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  try { return readBackup(bytes); }
  catch (error) {
    if (!(error instanceof LegacyPngError)) throw error;
    const { readLegacyReference } = await import('./legacy-reference');
    const reference = await readLegacyReference(bytes);
    if (reference) return reference;
    const { importLegacyPng } = await import('./legacy-ocr');
    return importLegacyPng(file, progress);
  }
}
