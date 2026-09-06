import { analyzeLegacy, assembleLegacy, normalizeRecognized } from './legacy-layout';
import type { Rect } from './legacy-layout';
import type { Backup } from './png-backup';

type Reader = { recognize(image: string): Promise<{ data: { text: string; confidence: number } }> };
type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

export async function recoverLegacyCanvas(source: HTMLCanvasElement, worker: Reader, canvas: CanvasFactory, progress: (message: string) => void): Promise<Backup> {
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('浏览器无法读取图片。');
  const pixels = ctx.getImageData(0, 0, source.width, source.height);
  const layout = analyzeLegacy(pixels);
  const unique = [...new Map(layout.cells.map(c => [c.key, c])).values()];
  const texts = new Map<string, { name: string; location: string }>();
  async function read(rect: Rect | null): Promise<string> {
    if (!rect) return '';
    const padding = 16, scale = 3;
    const crop = canvas((rect.width + padding * 2) * scale, (rect.height + padding * 2) * scale);
    const context = crop.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, crop.width, crop.height);
    const mono = canvas(rect.width, rect.height);
    const mctx = mono.getContext('2d')!;
    const image = mctx.createImageData(rect.width, rect.height);
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      const sourceIndex = ((rect.y + y) * pixels.width + rect.x + x) * 4;
      const targetIndex = (y * rect.width + x) * 4;
      const value = Math.min(255, Math.max(0, (pixels.data[sourceIndex] - 32) * 255 / 168));
      image.data[targetIndex] = image.data[targetIndex+1] = image.data[targetIndex+2] = value; image.data[targetIndex+3] = 255;
    }
    mctx.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(mono, padding*scale, padding*scale, rect.width*scale, rect.height*scale);
    return normalizeRecognized((await worker.recognize(crop.toDataURL('image/png'))).data.text);
  }
  progress('正在识别旧版课表标题…');
  const title = await read(layout.title);
  if (!title || title.length > 60) throw Error('旧版图片标题未能识别，请使用原始PNG。');
  for (let i = 0; i < unique.length; i++) {
    progress(`正在识别旧版课程 ${i + 1}/${unique.length}，请稍候…`);
    const cell = unique[i];
    const name = await read(cell.name);
    const location = await read(cell.location);
    if (!name || (cell.location && !location)) throw Error('部分课程文字未识别成功，当前课表未更改。请检查原图是否清晰。');
    texts.set(cell.key, { name, location });
  }
  return { title, schedule: assembleLegacy(layout, texts), legacy: true };
}

export async function importLegacyPng(file: File, progress: (message: string) => void): Promise<Backup> {
  progress('正在检查旧版PNG原图…');
  const url = URL.createObjectURL(file);
  const makeCanvas: CanvasFactory = (width, height) => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; };
  let source: HTMLCanvasElement;
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(Error('PNG图片无法读取。')); image.src = url; });
    if (image.naturalWidth !== 2110 || image.naturalHeight !== 2250) throw Error('旧版导入仅支持本站导出的2110×2250 PNG原图，请勿缩放或截图。');
    source = makeCanvas(image.naturalWidth, image.naturalHeight);
    source.getContext('2d')!.drawImage(image, 0, 0);
    analyzeLegacy(source.getContext('2d')!.getImageData(0, 0, source.width, source.height));
  } finally { URL.revokeObjectURL(url); }
  progress('正在加载中文识别组件，首次使用需要下载模型…');
  const { createWorker, PSM } = await import('tesseract.js');
  const base = new URL('./ocr/', document.baseURI).href;
  const worker = await createWorker(['chi_sim', 'eng'], 1, {
    workerPath: `${base}runtime/worker.min.js`, corePath: `${base}runtime/`, langPath: `${base}langs`, gzip: false,
    errorHandler: () => {}, // Job promises reject; let the import UI handle the error.
    logger: event => { if (event.status === 'loading language traineddata') progress(`正在加载识别模型 ${Math.round(event.progress * 100)}%…`); },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, user_defined_dpi: '300' });
    return await recoverLegacyCanvas(source, worker, makeCanvas, progress);
  } finally { await worker.terminate(); }
}
