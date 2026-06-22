'use client';

import React, { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getDirectDriveImageUrl } from '@/lib/utils';

interface Activity {
  id: number;
  timestamp: string;
  date: string;
  club: string;
  location: string;
  type: string;
  hours: number;
  content: string;
  photoUrl: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export default function StudentDashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  
  const [activities, setActivities] = useState<Activity[]>([]);
  const [totalHours, setTotalHours] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 1. 인증 정보 검사 및 리다이렉트
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    } else if (sessionStatus === 'authenticated' && session?.user?.role !== 'STUDENT') {
      router.push('/login?error=Unauthorized');
    }
  }, [sessionStatus, session, router]);

  // 2. 학생 활동 데이터 Fetch
  useEffect(() => {
    if (sessionStatus === 'authenticated' && session?.user?.role === 'STUDENT') {
      setLoading(true);
      fetch('/api/student/activities')
        .then((res) => {
          if (!res.ok) throw new Error('데이터를 로드하는 데 실패했습니다.');
          return res.json();
        })
        .then((data) => {
          setActivities(data.activities);
          setTotalHours(data.totalHours);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, [sessionStatus, session]);

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          <p className="text-sm font-medium text-slate-400">데이터를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 text-center max-w-md">
          <p className="text-red-400 font-semibold mb-2">오류 발생</p>
          <p className="text-sm text-slate-300">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm font-medium transition"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const googleFormUrl = process.env.NEXT_PUBLIC_GOOGLE_FORM_URL || '#';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 글로벌 상단 헤더 */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              S
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Student Club Dashboard
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-200">{session?.user?.name || '학생'}</p>
              <p className="text-xs text-slate-400">학번: {session?.user?.studentId || '-'}</p>
            </div>
            <button
              onClick={() => signOut()}
              className="px-3 py-1.5 border border-slate-700 hover:border-slate-600 hover:bg-slate-800 text-slate-300 hover:text-white rounded-md text-xs font-medium transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 바디 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
        
        {/* 상단 알림 및 입력 연결 배너 */}
        <div className="relative rounded-2xl overflow-hidden border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xl shadow-indigo-950/10">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent pointer-events-none"></div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">클럽 활동을 마쳤나요?</h2>
            <p className="text-sm text-slate-300 max-w-xl">
              활동 당일 보고서와 사진을 바로 구글 설문지에 제출해 주세요. 제출된 내역은 선생님의 승인을 거쳐 생활기록부 및 성적표에 자동 반영됩니다.
            </p>
          </div>
          <a
            href={googleFormUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition duration-200 text-center flex items-center justify-center gap-2 group shrink-0"
          >
            새 활동 기록 입력 (Google Forms)
            <svg 
              className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>

        {/* 통계 요약 카드 영역 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 flex items-center justify-between relative overflow-hidden group">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">학기 말 누적 승인 시간</span>
              <p className="text-4xl sm:text-5xl font-black text-white bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                {totalHours} <span className="text-lg font-bold text-slate-400">hours</span>
              </p>
            </div>
            <div className="h-12 w-12 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition duration-300">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 flex items-center justify-between relative overflow-hidden group">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">활동 기록 제출 수</span>
              <p className="text-4xl sm:text-5xl font-black text-white bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                {activities.length} <span className="text-lg font-bold text-slate-400">개</span>
              </p>
            </div>
            <div className="h-12 w-12 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition duration-300">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </section>

        {/* 활동 리스트 테이블 섹션 */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/20 overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-base font-bold text-white tracking-wide">내 활동 기록 내역</h3>
            <span className="text-xs text-slate-400 font-medium">최근 등록 순</span>
          </div>

          {activities.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <svg className="w-10 h-10 mx-auto text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="font-semibold text-slate-400">등록된 활동 기록이 없습니다.</p>
              <p className="text-xs text-slate-500">Google Form을 통해 최초 활동 내역을 등록해 주세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-4 px-6">일자</th>
                    <th className="py-4 px-6">클럽명</th>
                    <th className="py-4 px-6">장소/유형</th>
                    <th className="py-4 px-6 text-center">시간</th>
                    <th className="py-4 px-6">활동 내용</th>
                    <th className="py-4 px-6 text-center">인증 사진</th>
                    <th className="py-4 px-6 text-center">승인 상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm text-slate-300">
                  {activities.map((act) => (
                    <tr key={act.id} className="hover:bg-slate-900/20 transition duration-150">
                      {/* 일자 */}
                      <td className="py-4.5 px-6 whitespace-nowrap font-medium text-slate-400">
                        {act.date}
                      </td>
                      {/* 클럽명 */}
                      <td className="py-4.5 px-6 whitespace-nowrap text-white font-semibold">
                        {act.club}
                      </td>
                      {/* 장소 / 유형 */}
                      <td className="py-4.5 px-6 whitespace-nowrap text-xs space-y-1">
                        <p className="text-slate-200 font-medium">{act.location}</p>
                        <p className="text-slate-400">{act.type}</p>
                      </td>
                      {/* 시간 */}
                      <td className="py-4.5 px-6 text-center whitespace-nowrap font-bold text-white">
                        {act.hours} h
                      </td>
                      {/* 활동 내용 */}
                      <td className="py-4.5 px-6 max-w-md">
                        <p className="line-clamp-2 text-xs leading-relaxed text-slate-300">
                          {act.content}
                        </p>
                      </td>
                      {/* 인증 사진 */}
                      <td className="py-4.5 px-6 text-center">
                        {act.photoUrl ? (
                          <a 
                            href={act.photoUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-block group/img relative"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={getDirectDriveImageUrl(act.photoUrl)}
                              alt="인증 사진"
                              className="h-10 w-16 object-cover rounded border border-slate-700 hover:border-indigo-500 transition duration-200"
                              onError={(e) => {
                                // 이미지 로드 실패 시 구글 드라이브 기본 아이콘 대체
                                (e.target as HTMLImageElement).src = 'https://ssl.gstatic.com/docs/doclist/images/icon_10_pdf_list.png';
                              }}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center rounded text-[10px] text-white transition duration-200">
                              보기
                            </div>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                      {/* 승인 상태 뱃지 */}
                      <td className="py-4.5 px-6 text-center whitespace-nowrap">
                        {act.status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                            승인됨
                          </span>
                        )}
                        {act.status === 'PENDING' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                            대기 중
                          </span>
                        )}
                        {act.status === 'REJECTED' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400"></span>
                            반려됨
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} School Student Clubs Management System. All rights reserved.</p>
      </footer>
    </div>
  );
}
