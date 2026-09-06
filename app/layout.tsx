import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '我的课表 · 课程编辑器',
  description: '填写课程、拖动排课，导出完整课表图片。',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
