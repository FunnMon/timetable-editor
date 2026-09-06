import { COLORS, DAYS, TIMES } from './timetable';
import type { Schedule } from './timetable';
import { embedBackup } from './png-backup';
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
) {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > width && line) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}
export function drawSchedule(
  ctx: CanvasRenderingContext2D,
  state: Schedule,
  title: string,
) {
  const margin = 50,
    timeWidth = 190,
    dayWidth = 260,
    rowHeight = 160,
    headerHeight = 70,
    top = 160;
  const width = margin * 2 + timeWidth + 7 * dayWidth,
    height = top + headerHeight + 12 * rowHeight + 100;
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#17233b';
  ctx.font = 'bold 38px "PingFang SC", "Microsoft YaHei", sans-serif';
  const titleLines = wrapText(ctx, title.trim() || '我的课表', width - 120);
  titleLines.forEach((l, i) => ctx.fillText(l, width / 2, 60 + i * 46));
  const box = (x: number, y: number, w: number, h: number, bg: string) => {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#d4dce7';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  };
  box(margin, top, timeWidth, headerHeight, '#edf2fb');
  ctx.fillStyle = '#17233b';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('节次 / 时间', margin + timeWidth / 2, top + 35);
  DAYS.forEach((d, i) => {
    box(
      margin + timeWidth + i * dayWidth,
      top,
      dayWidth,
      headerHeight,
      '#edf2fb',
    );
    ctx.fillStyle = '#17233b';
    ctx.fillText(d, margin + timeWidth + (i + 0.5) * dayWidth, top + 35);
  });
  TIMES.forEach((time, r) => {
    const y = top + headerHeight + r * rowHeight;
    box(margin, y, timeWidth, rowHeight, '#f8fafd');
    ctx.fillStyle = '#17233b';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`第${r + 1}节`, margin + timeWidth / 2, y + 62);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#526072';
    ctx.fillText(time, margin + timeWidth / 2, y + 100);
    DAYS.forEach((_, d) => {
      const x = margin + timeWidth + d * dayWidth;
      const p = state.placements.find((p) => {
        const c = state.courses.find((c) => c.id === p.courseId);
        return (
          p.day === d && c && r + 1 >= p.start && r + 1 < p.start + c.duration
        );
      });
      const c = p && state.courses.find((c) => c.id === p.courseId);
      box(x, y, dayWidth, rowHeight, c ? COLORS[c.color].bg : '#fff');
      if (!c) return;
      let size = 24,
        nameLines: string[] = [],
        locLines: string[] = [];
      for (; size >= 14; size--) {
        ctx.font = `bold ${size}px sans-serif`;
        nameLines = wrapText(ctx, c.name, dayWidth - 30);
        ctx.font = `${size - 2}px sans-serif`;
        locLines = wrapText(ctx, c.location, dayWidth - 30);
        if (
          nameLines.length * (size + 5) + locLines.length * (size + 2) + 10 <=
          rowHeight - 16
        )
          break;
      }
      const total =
        nameLines.length * (size + 5) + locLines.length * (size + 2) + 8;
      let cy = y + (rowHeight - total) / 2 + (size + 5) / 2;
      ctx.fillStyle = '#20334a';
      ctx.font = `bold ${size}px sans-serif`;
      nameLines.forEach((l) => {
        ctx.fillText(l, x + dayWidth / 2, cy);
        cy += size + 5;
      });
      cy += 7;
      ctx.font = `${size - 2}px sans-serif`;
      ctx.fillStyle = '#42566b';
      locLines.forEach((l) => {
        ctx.fillText(l, x + dayWidth / 2, cy);
        cy += size + 2;
      });
    });
  });
  ctx.fillStyle = '#66778d';
  ctx.font = '20px sans-serif';
  ctx.fillText(
    '上课时间依据北京大学2026—2027学年校历 · 每周课表',
    width / 2,
    height - 44,
  );
  return { width, height };
}
export async function downloadSchedule(state: Schedule, title: string) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Canvas unavailable');
  drawSchedule(ctx, state, title);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error('Export failed'))),
      'image/png',
    ),
  );
  const bytes = embedBackup(new Uint8Array(await blob.arrayBuffer()), {
    title,
    schedule: state,
  });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  const a = document.createElement('a');
  a.href = url;
  a.download =
    (title.trim() || '我的课表').replace(/[\\/:*?"<>|]/g, '-') + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
