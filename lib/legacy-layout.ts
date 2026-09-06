import { COLORS } from './timetable';
import type { Schedule } from './timetable';

export type Pixels = { width: number; height: number; data: Uint8ClampedArray };
export type Rect = { x: number; y: number; width: number; height: number };
export type LegacyCell = { key: string; color: number; name: Rect; location: Rect | null; day: number; start: number };
export type LegacyLayout = { cells: LegacyCell[]; title: Rect };
const palette = COLORS.map(c => [1, 3, 5].map(i => parseInt(c.bg.slice(i, i + 2), 16)));
function near(a: number[], b: number[], tolerance = 3) { return a.every((v, i) => Math.abs(v - b[i]) <= tolerance); }
function rgb(image: Pixels, x: number, y: number) { const i = (y * image.width + x) * 4; return Array.from(image.data.subarray(i, i + 3)); }
function inkBounds(image: Pixels, rect: Rect, nameOnly = false): Rect | null {
  let left = rect.x + rect.width, top = rect.y + rect.height, right = -1, bottom = -1;
  for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) {
    const i = (y * image.width + x) * 4;
    const ink = nameOnly ? image.data[i] < 46 && image.data[i+1] < 66 && image.data[i+2] < 88 : image.data[i] < 170 && image.data[i+1] < 175 && image.data[i+2] < 185;
    if (ink) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function analyzeLegacy(image: Pixels): LegacyLayout {
  const fail = () => Error('这张图片不是可识别的旧版课表原图。请选择本站导出的2110×2250 PNG，勿使用截图或缩放后的图片。');
  if (image.width !== 2110 || image.height !== 2250) throw fail();
  if (!near(rgb(image, 60, 170), [237,242,251]) || !near(rgb(image, 60, 240), [248,250,253]) || !near(rgb(image, 20, 200), [255,255,255])) throw fail();
  const cells: LegacyCell[] = [];
  for (let day = 0; day < 7; day++) for (let row = 0; row < 12; row++) {
    const x = 240 + day * 260, y = 230 + row * 160;
    const bg = rgb(image, x + 5, y + 5);
    if (![[x+254,y+5],[x+5,y+154],[x+254,y+154]].every(([a,b]) => near(rgb(image,a,b), bg))) throw fail();
    const area = { x: x+6, y: y+6, width: 248, height: 148 };
    if (near(bg, [255,255,255])) { if (inkBounds(image, area)) throw fail(); continue; }
    const color = palette.findIndex(c => near(bg, c));
    if (color < 0) throw fail();
    // In the old renderer names are darker than locations. This separates
    // wrapped names from wrapped addresses without guessing a last text line.
    const dark = inkBounds(image, area, true);
    if (!dark) throw fail();
    const nameArea = { ...area, height: dark.y + dark.height + 1 - area.y };
    const name = inkBounds(image, nameArea);
    if (!name) throw fail();
    const locationTop = name.y + name.height + 2;
    const location = inkBounds(image, { ...area, y: locationTop, height: area.y + area.height - locationTop });
    let hash = 2166136261;
    for (let cy = area.y; cy < area.y + area.height; cy++) for (let cx = area.x; cx < area.x + area.width; cx++) {
      const i = (cy * image.width + cx) * 4;
      hash = Math.imul(hash ^ (image.data[i] < 170 ? 1 : 0), 16777619);
    }
    cells.push({ key: `${color}:${hash >>> 0}`, color, name, location, day, start: row + 1 });
  }
  const title = inkBounds(image, { x: 50, y: 15, width: 2010, height: 130 });
  if (!title) throw fail();
  return { cells, title };
}

export function normalizeRecognized(text: string): string {
  return text.trim().replace(/\n+/g, '').replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1').replace(/\s+/g, ' ').trim();
}

export function assembleLegacy(layout: LegacyLayout, texts: Map<string, { name: string; location: string }>): Schedule {
  const schedule: Schedule = { courses: [], placements: [] };
  for (let i = 0; i < layout.cells.length; i++) {
    const cell = layout.cells[i];
    const content = texts.get(cell.key);
    if (!content || !content.name || content.name.length > 60 || content.location.length > 60) throw Error('部分课程文字未能完整识别，当前课表未更改。请使用清晰的原始PNG。');
    let duration = 1;
    while (i + 1 < layout.cells.length) {
      const next = layout.cells[i + 1];
      if (next.day !== cell.day || next.start !== cell.start + duration || next.key !== cell.key) break;
      duration++; i++;
    }
    let course = schedule.courses.find(c => c.name === content.name && c.location === content.location && c.color === cell.color && c.duration === duration);
    if (!course) { course = { id: `legacy-c${schedule.courses.length}`, ...content, color: cell.color, duration }; schedule.courses.push(course); }
    schedule.placements.push({ id: `legacy-p${schedule.placements.length}`, courseId: course.id, day: cell.day, start: cell.start });
  }
  return schedule;
}
