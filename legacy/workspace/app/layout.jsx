import './globals.css';
import './features.css';
import './academic.css';
import './calendar.css';
import './curriculum.css';
import './staff.css';
import './example.css';
import './planning.css';
import './timetable.css';
import './polish.css';
import './v12-calendar.css';

export const metadata = {
  title: 'EduPlan Workspace | 디지털 교무실',
  description: '학교의 일정과 업무, 공동 문서가 한 곳에서 연결되는 디지털 교무실',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }) {
  return <html lang="ko"><body>{children}</body></html>;
}
