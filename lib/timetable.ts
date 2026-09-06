export const TIMES = [
  '08:00–08:50',
  '09:00–09:50',
  '10:10–11:00',
  '11:10–12:00',
  '13:00–13:50',
  '14:00–14:50',
  '15:10–16:00',
  '16:10–17:00',
  '17:10–18:00',
  '18:40–19:30',
  '19:40–20:30',
  '20:40–21:30',
];
export const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const COLORS = [
  { name: '薄荷绿', bg: '#d8f5e6', edge: '#269667' },
  { name: '天空蓝', bg: '#dcedff', edge: '#387fce' },
  { name: '蜜桃橙', bg: '#ffe4cc', edge: '#c97431' },
  { name: '樱花粉', bg: '#ffe0e9', edge: '#c76085' },
  { name: '湖水青', bg: '#cdf4f2', edge: '#218d89' },
  { name: '柠檬黄', bg: '#fff3c4', edge: '#9b811c' },
  { name: '青草绿', bg: '#e3f3cc', edge: '#72963a' },
  { name: '珊瑚红', bg: '#ffdad5', edge: '#be6557' },
  { name: '鸢尾紫', bg: '#e9e0ff', edge: '#8862be' },
  { name: '云雾灰', bg: '#e7ebef', edge: '#75818c' },
];
export type Course = {
  id: string;
  name: string;
  location: string;
  color: number;
  duration: number;
};
export type Placement = {
  id: string;
  courseId: string;
  day: number;
  start: number;
};
export type Schedule = { courses: Course[]; placements: Placement[] };
export function sample(): Schedule {
  const courses: Course[] = [
    ['math', '高等数学（B）（一）', '理教203', 0, 2],
    ['econ', '经济学原理（I）', '二教404', 4, 3],
    ['ai', '人工智能与产业革命', '国关B106', 4, 3],
    ['cs', '计算概论（C）', '二教309', 9, 2],
    ['exercise', '高等数学习题课', '三教204 / 206 / 506', 0, 2],
    ['math4', '高等数学（B）（一）', '理教203', 0, 1],
    ['brain', 'AI+心理认知专题II：脑科学与AI交叉前沿', '四教502', 2, 2],
    ['thought', '习近平新时代中国特色社会主义思想概论', '哲学101', 3, 3],
    ['politicalecon', '政治经济学原理', '一教208', 1, 3],
    ['discussion', '经济学原理（I）讨论课', '地学205', 5, 1],
    ['lab', '计算机实习', '二层5–6号机房', 6, 2],
    ['philosophy', '政治哲学', '理教408', 7, 2],
  ].map(
    ([id, name, location, color, duration]) =>
      ({ id, name, location, color, duration }) as Course,
  );
  const places: [string, number, number][] = [
    ['math', 0, 5],
    ['econ', 0, 7],
    ['ai', 0, 10],
    ['cs', 1, 5],
    ['exercise', 1, 10],
    ['math4', 2, 4],
    ['brain', 2, 5],
    ['thought', 2, 7],
    ['politicalecon', 2, 10],
    ['discussion', 3, 10],
    ['lab', 3, 11],
    ['philosophy', 4, 10],
  ];
  return {
    courses,
    placements: places.map(([courseId, day, start], i) => ({
      id: `p${i}`,
      courseId,
      day,
      start,
    })),
  };
}
export function placementError(
  state: Schedule,
  course: Course,
  day: number,
  start: number,
  ignoreId?: string,
): string | null {
  if (
    !Number.isInteger(day) ||
    day < 0 ||
    day > 6 ||
    !Number.isInteger(start) ||
    start < 1 ||
    start + course.duration - 1 > 12
  )
    return '课程超出当天的12节，请选择更早的开始节次。';
  for (const p of state.placements) {
    if (p.id === ignoreId || p.day !== day) continue;
    const c = state.courses.find((c) => c.id === p.courseId);
    if (c && start < p.start + c.duration && p.start < start + course.duration)
      return `与「${c.name}」时间冲突，请选择空闲时间。`;
  }
  return null;
}
export function place(
  state: Schedule,
  courseId: string,
  day: number,
  start: number,
  id: string,
  moveId?: string,
): Schedule {
  const course = state.courses.find((c) => c.id === courseId);
  if (!course) throw Error('课程不存在');
  const error = placementError(state, course, day, start, moveId);
  if (error) throw Error(error);
  return {
    ...state,
    placements: [
      ...state.placements.filter((p) => p.id !== moveId),
      { id: moveId || id, courseId, day, start },
    ],
  };
}
export function updateCourse(state: Schedule, course: Course): Schedule {
  if (
    !course.name.trim() ||
    course.name.length > 60 ||
    course.location.length > 60 ||
    !Number.isInteger(course.duration) ||
    course.duration < 1 ||
    course.duration > 12 ||
    !Number.isInteger(course.color) ||
    course.color < 0 ||
    course.color >= 10
  )
    throw Error('请填写课程名称，名称和地点各不超过60字，连续节数为1–12节。');
  const next = {
    ...state,
    courses: state.courses.some((c) => c.id === course.id)
      ? state.courses.map((c) => (c.id === course.id ? course : c))
      : [...state.courses, course],
  };
  for (const p of next.placements.filter((p) => p.courseId === course.id)) {
    const error = placementError(next, course, p.day, p.start, p.id);
    if (error) throw Error(error);
  }
  return next;
}
export function hitCell(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
): { day: number; start: number } | null {
  const rx = x - rect.left,
    ry = y - rect.top;
  if (rx < 108 || rx >= rect.width || ry < 52 || ry >= rect.height) return null;
  return {
    day: Math.floor((rx - 108) / ((rect.width - 108) / 7)),
    start: Math.floor((ry - 52) / ((rect.height - 52) / 12)) + 1,
  };
}
