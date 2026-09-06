'use client';
import { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { registerScheduleTools, getModelContext } from '@/lib/webmcp';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  CalendarDays,
  Download,
  Upload,
  Plus,
  GripVertical,
  MapPin,
  Undo2,
  Trash2,
  Check,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  COLORS,
  DAYS,
  TIMES,
  place,
  updateCourse,
  placementError,
  hitCell,
} from '@/lib/timetable';
import type { Course, Schedule } from '@/lib/timetable';
import { downloadSchedule } from '@/lib/export';
import { importSchedulePng } from '@/lib/png-backup';
const blank = () => ({ id: '', name: '', location: '', color: 0, duration: 1 });
export default function Home() {
  const [state, setState] = useState<Schedule>({ courses: [], placements: [] });
  const [history, setHistory] = useState<
    { schedule: Schedule; title: string }[]
  >([]);
  const [draft, setDraft] = useState<Course>(blank);
  const [selected, setSelected] = useState<string | null>(null);
  const [day, setDay] = useState('0');
  const [start, setStart] = useState('1');
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('2026—2027学年第一学期课程表');
  const titleRef = useRef(title);
  titleRef.current = title;
  const [dragId, setDragId] = useState<string | undefined>(undefined);
  const [target, setTarget] = useState<{ day: number; start: number } | null>(
    null,
  );
  const [ghost, setGhost] = useState<{
    course: Course;
    x: number;
    y: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dragCleanup = useRef<() => void>(() => {});
  const suppressClick = useRef(false);
  useEffect(() => () => dragCleanup.current(), []);
  useEffect(
    () =>
      registerScheduleTools(
        getModelContext(),
        () => stateRef.current,
        (next) => flushSync(() => commit(next)),
      ),
    [],
  );
  function commit(next: Schedule) {
    const previous = stateRef.current;
    const previousTitle = titleRef.current;
    setHistory((h) => [
      ...h.slice(-29),
      { schedule: previous, title: previousTitle },
    ]);
    stateRef.current = next;
    setState(next);
  }
  function selectCourse(course: Course, placementId: string | null = null) {
    setDraft({ ...course });
    setSelected(placementId);
    const p = state.placements.find((p) => p.id === placementId);
    if (p) {
      setDay(String(p.day));
      setStart(String(p.start));
    }
    setMessage('');
  }
  async function importImage(file: File) {
    setImporting(true);
    try {
      const backup = await importSchedulePng(file, setMessage);
      dragCleanup.current();
      commit(backup.schedule);
      setTitle(backup.title);
      reset();
      setMessage(
        backup.legacy
          ? `已从旧版图片识别${backup.schedule.placements.length}个安排，请核对课程文字。连续相同课程已合并；未出现在图上的课程无法恢复。可撤销导入，或导出新版PNG保存识别结果。`
          : `已恢复${backup.schedule.courses.length}门课程和${backup.schedule.placements.length}个安排，可继续编辑；点击撤销可恢复导入前的课表。`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setImporting(false);
    }
  }
  function reset() {
    setDraft(blank());
    setSelected(null);
    setMessage('');
  }
  function save() {
    try {
      const c = {
        ...draft,
        id: draft.id || crypto.randomUUID(),
        name: draft.name.trim(),
        location: draft.location.trim(),
      };
      commit(updateCourse(stateRef.current, c));
      setDraft(c);
      setMessage('课程模块已保存，可以拖到课表中。');
      return c;
    } catch (e) {
      setMessage((e as Error).message);
      return null;
    }
  }
  function arrange(courseId: string, d: number, s: number, moveId?: string) {
    try {
      commit(
        place(stateRef.current, courseId, d, s, crypto.randomUUID(), moveId),
      );
      setMessage(`已安排到${DAYS[d]}第${s}节。`);
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    }
  }
  function beginDrag(
    e: ReactPointerEvent,
    course: Course,
    placementId?: string,
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragId(placementId);
    const x = e.clientX,
      y = e.clientY;
    let moved = false;
    let cell: { day: number; start: number } | null = null;
    function move(ev: PointerEvent) {
      if (!moved && Math.hypot(ev.clientX - x, ev.clientY - y) < 6) return;
      moved = true;
      suppressClick.current = true;
      setGhost({ course, x: ev.clientX, y: ev.clientY });
      const sc = scrollRef.current;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (ev.clientX > r.left && ev.clientX < r.right) {
          if (ev.clientY > r.bottom - 55) sc.scrollTop += 22;
          if (ev.clientY < r.top + 55) sc.scrollTop -= 22;
          if (ev.clientX > r.right - 45) sc.scrollLeft += 18;
          if (ev.clientX < r.left + 45) sc.scrollLeft -= 18;
        }
      }
      const r = gridRef.current?.getBoundingClientRect();
      const viewport = sc?.getBoundingClientRect();
      cell =
        r &&
        viewport &&
        ev.clientX >= viewport.left &&
        ev.clientX < viewport.right &&
        ev.clientY >= viewport.top &&
        ev.clientY < viewport.bottom
          ? hitCell(ev.clientX, ev.clientY, r)
          : null;
      setTarget(cell);
    }
    function cleanup() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      setGhost(null);
      setTarget(null);
      setDragId(undefined);
      setTimeout(() => (suppressClick.current = false), 0);
    }
    function cancel() {
      cleanup();
    }
    function key(ev: KeyboardEvent) {
      if (ev.key === 'Escape') cancel();
    }
    function end() {
      if (moved && cell) arrange(course.id, cell.day, cell.start, placementId);
      else if (!moved) selectCourse(course, placementId || null);
      cleanup();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    dragCleanup.current = cleanup;
  }
  const active = state.courses.find((c) => c.id === draft.id);
  async function exportImage() {
    setExporting(true);
    try {
      await downloadSchedule(state, title);
      setMessage('完整课表图片已导出。');
    } catch {
      setMessage('导出未成功，请重试。');
    } finally {
      setExporting(false);
    }
  }
  return (
    <main className="studio">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <CalendarDays size={23} />
          </div>
          <div>
            <h1>我的课表</h1>
            <p>COURSE STUDIO</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="week-label">一周，由你安排</span>
          <Button
            variant="outline"
            disabled={!history.length || importing}
            onClick={() => {
              const prev = history.at(-1);
              if (prev) {
                stateRef.current = prev.schedule;
                setState(prev.schedule);
                setTitle(prev.title);
                setHistory((h) => h.slice(0, -1));
                reset();
              }
            }}
          >
            <Undo2 />
            撤销
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".png,image/png"
            hidden
            aria-label="选择课表PNG原图"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importImage(file);
            }}
          />
          <Button
            variant="outline"
            disabled={importing || exporting}
            onClick={() => fileRef.current?.click()}
          >
            <Upload />
            {importing ? '正在导入…' : '导入PNG'}
          </Button>
          <Button onClick={exportImage} disabled={exporting || importing}>
            <Download />
            {exporting ? '正在导出…' : '导出图片'}
          </Button>
        </div>
      </header>
      <div className="workspace">
        <aside className="editor-panel" inert={importing}>
          <div className="panel-heading">
            <h2>{draft.id ? '编辑课程' : '添加课程'}</h2>
            {draft.id && (
              <Button variant="ghost" onClick={reset}>
                <Plus />
                新课程
              </Button>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label htmlFor="course-name">
              课程名称 <span>*</span>
            </label>
            <Input
              id="course-name"
              maxLength={60}
              placeholder="例如：高等数学（B）（一）"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
            <label htmlFor="course-location">上课地点</label>
            <Input
              id="course-location"
              maxLength={60}
              placeholder="例如：理教203"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            />
            <div className="field-row">
              <label id="duration-label">连续节数</label>
              <Select
                value={String(draft.duration)}
                onValueChange={(v) =>
                  v && setDraft({ ...draft, duration: Number(v) })
                }
              >
                <SelectTrigger aria-labelledby="duration-label">
                  <SelectValue>{draft.duration} 节</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIMES.map((_, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {i + 1} 节
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label id="colors-label">
              课程颜色 <small>10种可选</small>
            </label>
            <RadioGroup
              aria-labelledby="colors-label"
              className="swatches"
              value={String(draft.color)}
              onValueChange={(v) => setDraft({ ...draft, color: Number(v) })}
            >
              {COLORS.map((c, i) => (
                <RadioGroupItem
                  key={c.name}
                  value={String(i)}
                  aria-label={c.name}
                  title={c.name}
                  style={{
                    background: c.bg,
                    borderColor: draft.color === i ? c.edge : 'transparent',
                  }}
                />
              ))}
            </RadioGroup>
            <div
              className="draft-preview"
              style={{
                background: COLORS[draft.color].bg,
                borderLeftColor: COLORS[draft.color].edge,
              }}
            >
              <GripVertical size={17} />
              <div>
                <strong>{draft.name || '你的新课程'}</strong>
                <p>
                  {draft.location || '上课地点'} · {draft.duration}节
                </p>
              </div>
            </div>
            <Button type="submit" className="full">
              {draft.id ? <Check /> : <Plus />}
              {draft.id ? '保存修改' : '创建课程模块'}
            </Button>
          </form>
          {active && (
            <div className="placement-controls">
              <p>也可以选择时间安排</p>
              <div className="select-pair">
                <Select
                  value={day}
                  onValueChange={(v) => v !== null && setDay(v)}
                >
                  <SelectTrigger aria-label="星期">
                    <SelectValue>{DAYS[Number(day)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={start}
                  onValueChange={(v) => v !== null && setStart(v)}
                >
                  <SelectTrigger aria-label="开始节次">
                    <SelectValue>第{start}节</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TIMES.map((t, i) => (
                      <SelectItem key={t} value={String(i + 1)}>
                        第{i + 1}节 · {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                className="full"
                onClick={() =>
                  arrange(
                    active.id,
                    Number(day),
                    Number(start),
                    selected || undefined,
                  )
                }
              >
                {selected ? '移动到此时间' : '安排到此时间'}
                <ArrowRight />
              </Button>
              {selected && (
                <Button
                  variant="ghost"
                  className="full"
                  onClick={() => {
                    commit({
                      ...state,
                      placements: state.placements.filter(
                        (p) => p.id !== selected,
                      ),
                    });
                    setSelected(null);
                    setMessage('已移回课程库，可重新安排。');
                  }}
                >
                  移出课表
                </Button>
              )}
            </div>
          )}
          <div className="library-heading">
            <h2>
              课程模块 <span>{state.courses.length}</span>
            </h2>
            <span>拖入右侧课表</span>
          </div>
          <div className="course-library">
            {state.courses.length === 0 && (
              <Empty className="border p-4">
                <EmptyHeader>
                  <EmptyTitle>还没有课程</EmptyTitle>
                  <EmptyDescription>
                    在上方创建第一门课程，或导入本站导出的PNG原图。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {state.courses.map((c) => (
              <button
                key={c.id}
                className={`library-card ${draft.id === c.id ? 'active' : ''}`}
                style={{
                  background: COLORS[c.color].bg,
                  borderLeftColor: COLORS[c.color].edge,
                }}
                onPointerDown={(e) => beginDrag(e, c)}
                onClick={() => !suppressClick.current && selectCourse(c)}
                aria-label={`选择或拖动课程 ${c.name}`}
              >
                <GripVertical size={16} />
                <div>
                  <strong>{c.name}</strong>
                  <p>{c.location || '未填写地点'}</p>
                </div>
                <small>{c.duration}节</small>
              </button>
            ))}
          </div>
          {active && (
            <Button
              variant="ghost"
              className="delete-course"
              onClick={() => {
                commit({
                  courses: state.courses.filter((c) => c.id !== active.id),
                  placements: state.placements.filter(
                    (p) => p.courseId !== active.id,
                  ),
                });
                reset();
                setMessage('课程已删除，可点击撤销恢复。');
              }}
            >
              <Trash2 />
              删除所选课程及其安排
            </Button>
          )}
        </aside>
        <section className="schedule-panel">
          <div className="schedule-heading">
            <div>
              <Input
                className="title-input"
                aria-label="课表标题"
                disabled={importing}
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <p>拖动课程到开始节次 · 点击课程可编辑 · 空白时段自由安排</p>
            </div>
            <span className="count-label">
              {state.placements.length} 个安排
            </span>
          </div>
          <div className="table-scroll" ref={scrollRef} inert={importing}>
            <div
              className="schedule-grid"
              ref={gridRef}
              role="grid"
              aria-label="一周12节课程表"
              style={{ gridTemplateRows: '52px repeat(12, 112px)' }}
            >
              <div className="grid-head time-head" role="columnheader">
                节次 / 时间
              </div>
              {DAYS.map((d, i) => (
                <div
                  className={`grid-head ${i > 4 ? 'weekend' : ''}`}
                  role="columnheader"
                  key={d}
                >
                  {d}
                  <small>
                    {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][i]}
                  </small>
                </div>
              ))}
              {TIMES.map((t, r) => (
                <div
                  key={t}
                  className={`time-cell ${[0, 4, 9].includes(r) ? 'period-start' : ''}`}
                  role="rowheader"
                  style={{ gridRow: r + 2, gridColumn: 1 }}
                >
                  <b>第{r + 1}节</b>
                  <span>{t.split('–')[0]}</span>
                  <small>{t.split('–')[1]}</small>
                </div>
              ))}
              {TIMES.flatMap((_, r) =>
                DAYS.map((d, i) => (
                  <button
                    key={`${r}-${i}`}
                    role="gridcell"
                    className={`empty-cell ${i > 4 ? 'weekend' : ''} ${target?.day === i && target?.start === r + 1 ? 'drop-target' : ''}`}
                    aria-label={`${d}第${r + 1}节 ${TIMES[r]}`}
                    style={{ gridRow: r + 2, gridColumn: i + 2 }}
                    onClick={() => {
                      if (active)
                        arrange(active.id, i, r + 1, selected || undefined);
                      else
                        setMessage('先创建或选择左侧课程，再点击时间格安排。');
                    }}
                  >
                    <span>＋</span>
                  </button>
                )),
              )}
              {state.placements.map((p) => {
                const c = state.courses.find((c) => c.id === p.courseId)!;
                return (
                  <button
                    key={p.id}
                    title={`${c.name} · ${c.location}`}
                    className={`placed-course ${selected === p.id ? 'selected' : ''}`}
                    aria-label={`${c.name} ${DAYS[p.day]} 第${p.start}至${p.start + c.duration - 1}节 ${c.location}`}
                    style={{
                      gridColumn: p.day + 2,
                      gridRow: `${p.start + 1} / span ${c.duration}`,
                      background: COLORS[c.color].bg,
                      borderLeftColor: COLORS[c.color].edge,
                    }}
                    onPointerDown={(e) => beginDrag(e, c, p.id)}
                    onClick={() =>
                      !suppressClick.current && selectCourse(c, p.id)
                    }
                  >
                    <span className="course-top">
                      <span>
                        {p.start}–{p.start + c.duration - 1}节
                      </span>
                      <GripVertical size={15} />
                    </span>
                    <strong>{c.name}</strong>
                    {c.location && (
                      <span className="location">
                        <MapPin size={12} />
                        {c.location}
                      </span>
                    )}
                  </button>
                );
              })}
              {target && ghost && (
                <div
                  className={`drop-preview ${placementError(state, ghost.course, target.day, target.start, dragId) ? 'invalid' : ''}`}
                  style={{
                    gridColumn: target.day + 2,
                    gridRow: `${target.start + 1} / span ${Math.min(ghost.course.duration, 13 - target.start)}`,
                  }}
                />
              )}
            </div>
          </div>
          <p className="table-note">
            新版PNG可完整恢复设置；旧版2110×2250原图会自动识别可见课程，请核对文字。导入会替换当前课表，可撤销。请保留原始文件，不要缩放或截图。
          </p>
          <div className="status-line" role="status" aria-live="polite">
            {message || '课程模块可重复拖入、随时移动。关闭页面前请导出图片。'}
          </div>
        </section>
      </div>
      {ghost && (
        <div
          className="drag-ghost"
          style={{
            left: ghost.x + 14,
            top: ghost.y + 14,
            background: COLORS[ghost.course.color].bg,
          }}
        >
          <strong>{ghost.course.name}</strong>
          <span>{ghost.course.duration}节 · 松开放置</span>
        </div>
      )}
    </main>
  );
}
