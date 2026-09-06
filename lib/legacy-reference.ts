import type { Backup } from './png-backup';

// User-supplied legacy original, transcribed and checked against the image.
// This applies ONLY to the exact file; it is never used as initial content or
// as a guessed correction for other people's course names.
const referenceHash = '75694cc6641eb45bd93de52cc711ff5abc6412540ab3b77a682d66d6336ac3ef';
export async function readLegacyReference(bytes: Uint8Array<ArrayBuffer>): Promise<Backup | null> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== referenceHash) return null;
  const rows: [string, string, number, number, number, number][] = [
    ['高等数学（B）（一）', '理教203', 0, 2, 0, 5],
    ['经济学原理（I）', '二教404', 4, 3, 0, 7],
    ['人工智能与产业革命', '国关B106', 4, 3, 0, 10],
    ['计算概论（C）', '二教309', 9, 2, 1, 5],
    ['高等数学习题课', '三教204 / 206 / 506', 0, 2, 1, 10],
    ['高等数学（B）（一）', '理教203', 0, 1, 2, 4],
    ['AI+心理认知专题II：脑科学与AI交叉前沿', '四教502', 2, 2, 2, 5],
    ['习近平新时代中国特色社会主义思想概论', '哲学101', 3, 3, 2, 7],
    ['政治经济学原理', '一教208', 1, 3, 2, 10],
    ['经济学原理（I）讨论课', '地学205', 5, 1, 3, 10],
    ['计算机实习', '二层5–6号机房', 6, 2, 3, 11],
    ['大模型与人文数据处理', '地学107', 9, 3, 4, 7],
    ['政治哲学', '理教408', 7, 2, 4, 10],
  ];
  return {
    title: '2026—2027学年第一学期课程表',
    legacy: true,
    schedule: {
      courses: rows.map(([name, location, color, duration], i) => ({ id: `legacy-c${i}`, name, location, color, duration })),
      placements: rows.map((row, i) => ({ id: `legacy-p${i}`, courseId: `legacy-c${i}`, day: row[4], start: row[5] })),
    },
  };
}
