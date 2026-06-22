'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getDirectDriveImageUrl } from '@/lib/utils';

interface Activity {
  rowNumber: number;
  timestamp: string;
  submitterEmail: string;
  date: string;
  studentNamesList: string;
  clubId: string;
  clubName: string;
  location: string;
  type: string;
  hours: number;
  originalContent: string;
  editedContent: string;
  photoUrl: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isMyClub: boolean;
}

export default function TeacherDashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  // 상태 관리
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // 필터 및 모드 상태
  const [showAllClubs, setShowAllClubs] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [searchName, setSearchName] = useState<string>('');

  // 모더레이션 수정 모달 상태
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [editHours, setEditHours] = useState<number>(0);
  const [editContent, setEditContent] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // CSV 관련 상태
  const [csvType, setCsvType] = useState<'slo' | 'homeroom'>('slo');
  const [semester, setSemester] = useState<string>('2026-1');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState<boolean>(false);
  const [csvMessage, setCsvMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 학기 말 정산 (AI 요약) 상태
  const [settling, setSettling] = useState<boolean>(false);
  const [settleMessage, setSettleMessage] = useState<string | null>(null);

  // 1. 인증 및 권한 가드
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    } else if (sessionStatus === 'authenticated' && session?.user?.role !== 'TEACHER') {
      router.push('/login?error=Unauthorized');
    }
  }, [sessionStatus, session, router]);

  // 2. 활동 로그 로드
  const fetchActivities = () => {
    if (sessionStatus === 'authenticated' && session?.user?.role === 'TEACHER') {
      setLoading(true);
      fetch(`/api/teacher/activities?all=${showAllClubs}`)
        .then((res) => {
          if (!res.ok) throw new Error('활동 기록을 가져오는데 실패했습니다.');
          return res.json();
        })
        .then((data) => {
          setActivities(data.activities);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [sessionStatus, session, showAllClubs]);

  // 3. 승인/반려 모더레이션 다이렉트 처리
  const handleModerate = async (activity: Activity, nextStatus: 'APPROVED' | 'REJECTED') => {
    if (!confirm(`이 기록을 ${nextStatus === 'APPROVED' ? '승인' : '반려'} 처리하시겠습니까?`)) return;
    
    try {
      const response = await fetch('/api/teacher/activities/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowNumber: activity.rowNumber,
          status: nextStatus,
          hours: activity.hours,
          editedContent: activity.editedContent || activity.originalContent,
        }),
      });

      if (!response.ok) throw new Error('승인 처리 중 오류가 발생했습니다.');
      
      alert('완료되었습니다.');
      fetchActivities(); // 리스트 새로고침
    } catch (err: any) {
      alert(err.message);
    }
  };

  // 4. 모달 열기 및 수정본 제출
  const openEditModal = (activity: Activity) => {
    setSelectedActivity(activity);
    setEditHours(activity.hours);
    setEditContent(activity.editedContent || activity.originalContent);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/teacher/activities/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowNumber: selectedActivity.rowNumber,
          status: 'APPROVED', // 모달 수정 완료 시 자동으로 승인 처리
          hours: editHours,
          editedContent: editContent,
        }),
      });

      if (!response.ok) throw new Error('수정본 제출에 실패했습니다.');

      alert('성공적으로 수정 및 승인 처리되었습니다.');
      setSelectedActivity(null);
      fetchActivities();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 5. CSV 다운로드 실행
  const handleCsvDownload = () => {
    window.open(`/api/teacher/csv/export?type=${csvType}`, '_blank');
  };

  // 6. CSV 업로드 실행
  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setCsvMessage({ text: '업로드할 CSV 파일을 선택해 주세요.', isError: true });
      return;
    }

    setCsvUploading(true);
    setCsvMessage(null);

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('type', csvType);
    formData.append('semester', semester);

    try {
      const response = await fetch('/api/teacher/csv/import', {
        method: 'POST',
        body: formData,
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'CSV 업로드 처리 중 오류 발생');

      setCsvMessage({ text: resData.message, isError: false });
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setCsvMessage({ text: err.message, isError: true });
    } finally {
      setCsvUploading(false);
    }
  };

  // 7. 학기 말 AI 정산 실행
  const handleSettle = async () => {
    if (!confirm('승인 완료된 활동 로그들을 집계하여 클럽별 시간을 합산하고 Gemini AI 요약을 실행하시겠습니까? 약 10~30초 소요됩니다.')) return;
    
    setSettling(true);
    setSettleMessage('합산 및 Gemini AI 요약 작업을 실행 중입니다. 창을 닫지 마세요...');
    
    try {
      const response = await fetch('/api/teacher/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semester }),
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || '정산 실행 오류 발생');

      setSettleMessage(`정산 완료! ${resData.count}건의 학생별 클럽 최종 요약본이 구글 시트에 업데이트되었습니다.`);
      alert('학기 말 정산이 정상 완료되었습니다.');
    } catch (err: any) {
      setSettleMessage(`정산 실패: ${err.message}`);
    } finally {
      setSettling(false);
    }
  };

  // 8. 필터 필터링 수행
  const filteredActivities = activities.filter((act) => {
    // 승인 상태 필터
    if (statusFilter !== 'ALL' && act.status !== statusFilter) return false;
    // 학생 이름 검색 필터
    if (searchName.trim() && !act.studentNamesList.toLowerCase().includes(searchName.toLowerCase())) return false;
    return true;
  });

  if (sessionStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          <p className="text-sm font-medium text-slate-400">관리자 인증 확인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 글로벌 상단 헤더 */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-rose-500 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-rose-500/20">
              M
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Teacher Control Console
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-rose-400 font-semibold border border-rose-500/20 bg-rose-500/5 px-2.5 py-1 rounded-full">
              교사 권한
            </span>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-200">{session?.user?.name || '교사'}</p>
              <p className="text-xs text-slate-400">{session?.user?.email}</p>
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
        
        {/* 학기 말 정산 & CSV 업로드 분할 패널 */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* CSV 다운로드/업로드 패널 */}
          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/30 p-6 flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white mb-1.5">SLO(CAPA) & Homeroom Comment CSV 일괄 관리</h3>
              <p className="text-xs text-slate-400 mb-4">
                전교 학생 정보가 담긴 입력용 CSV 템플릿을 내려받고, 등급 및 코멘트를 입력하여 다시 일괄 업로드(Import)할 수 있습니다.
              </p>
            </div>
            
            <form onSubmit={handleCsvUpload} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 타입 구분 */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase">업무 타입</label>
                  <select 
                    value={csvType} 
                    onChange={(e) => setCsvType(e.target.value as 'slo' | 'homeroom')}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 transition"
                  >
                    <option value="slo">SLO 등급 (CAPA)</option>
                    <option value="homeroom">담임 교사 의견 (Comment)</option>
                  </select>
                </div>
                
                {/* 해당 학기 */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase">적용 학기</label>
                  <input 
                    type="text" 
                    value={semester} 
                    onChange={(e) => setSemester(e.target.value)} 
                    placeholder="예: 2026-1"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 transition"
                    required
                  />
                </div>

                {/* 다운로드 버튼 */}
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleCsvDownload}
                    className="w-full px-4 py-2 border border-indigo-500/30 hover:bg-indigo-500/10 text-indigo-400 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    템플릿 CSV 다운로드
                  </button>
                </div>
              </div>

              {/* 파일 업로드 인풋 */}
              <div className="flex flex-col sm:flex-row items-center gap-4 border-t border-slate-800/80 pt-4">
                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                />
                <button
                  type="submit"
                  disabled={csvUploading}
                  className="w-full sm:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-sm font-bold transition duration-200 shrink-0"
                >
                  {csvUploading ? '업로드 중...' : 'CSV 파일 업로드 (반영)'}
                </button>
              </div>

              {csvMessage && (
                <div className={`text-xs p-3 rounded-lg border ${
                  csvMessage.isError ? 'border-red-500/20 bg-red-500/5 text-red-400' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                }`}>
                  {csvMessage.text}
                </div>
              )}
            </form>
          </div>

          {/* 학기 말 AI 정산 제어 패널 */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white mb-1.5">학기 말 정산 & AI 요약 엔진</h3>
              <p className="text-xs text-slate-400">
                승인된 동아리별 시간을 자동 합산하고, Gemini AI를 구동해 생활기록부용 영문(300~500자) 클럽활동 요약을 자동 수행합니다.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-[10px] font-bold text-slate-500 uppercase">정산 대상 학기</span>
                <span className="text-sm font-extrabold text-slate-300">{semester} 학기</span>
              </div>

              <button
                type="button"
                onClick={handleSettle}
                disabled={settling}
                className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white rounded-xl font-bold shadow-lg shadow-rose-500/10 transition duration-200 text-center text-sm"
              >
                {settling ? '정산 엔진 구동 중...' : '학기 말 정산 & AI 요약 실행'}
              </button>

              {settleMessage && (
                <p className="text-[11px] leading-relaxed text-rose-400 font-medium bg-rose-500/5 border border-rose-500/10 p-2.5 rounded">
                  {settleMessage}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* 메인 활동 리스트 관리자 콘솔 */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/20 overflow-hidden flex flex-col">
          {/* 테이블 컨트롤러 헤더 */}
          <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">학생 활동 승인 모더레이션</h3>
              <p className="text-xs text-slate-400 mt-1">학생들이 구글 설문지에 기재한 실시간 활동 리스트입니다.</p>
            </div>

            {/* 필터 세트 */}
            <div className="flex flex-wrap items-center gap-3">
              {/* 클럽 보기 모드 */}
              <button
                onClick={() => setShowAllClubs(!showAllClubs)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  showAllClubs 
                    ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400' 
                    : 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400'
                }`}
              >
                {showAllClubs ? '전교 클럽 조회 중' : '내 담당 클럽만 조회 중'}
              </button>

              {/* 상태 필터 */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none"
              >
                <option value="PENDING">승인 대기 중 (PENDING)</option>
                <option value="APPROVED">승인 완료 (APPROVED)</option>
                <option value="REJECTED">반려됨 (REJECTED)</option>
                <option value="ALL">전체 보기 (ALL)</option>
              </select>

              {/* 이름 검색 */}
              <input
                type="text"
                placeholder="학생 이름 검색..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-200 outline-none placeholder-slate-600 focus:border-indigo-500 w-36 sm:w-44"
              />
            </div>
          </div>

          {/* 활동 테이블 */}
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mx-auto mb-2"></div>
              <p className="text-xs font-semibold text-slate-400">데이터를 로드하는 중...</p>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-1">
              <p className="font-semibold text-slate-400">해당 조건의 활동 내역이 없습니다.</p>
              <p className="text-xs text-slate-500">필터 옵션을 변경해 보세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-4 px-6">일자</th>
                    <th className="py-4 px-6">학생(팀원) 목록</th>
                    <th className="py-4 px-6">클럽명</th>
                    <th className="py-4 px-6">장소/유형</th>
                    <th className="py-4 px-6 text-center">시간</th>
                    <th className="py-4 px-6">활동 내용 (교사수정본)</th>
                    <th className="py-4 px-6 text-center">인증 사진</th>
                    <th className="py-4 px-6 text-center">승인 상태</th>
                    <th className="py-4 px-6 text-right">제어</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm text-slate-300">
                  {filteredActivities.map((act) => (
                    <tr 
                      key={act.rowNumber} 
                      className={`transition duration-150 ${
                        act.isMyClub ? 'hover:bg-indigo-950/5' : 'hover:bg-slate-900/10 opacity-70'
                      }`}
                    >
                      {/* 일자 */}
                      <td className="py-4 px-6 whitespace-nowrap font-medium text-slate-400">
                        {act.date}
                      </td>
                      {/* 참여 학생 */}
                      <td className="py-4 px-6 max-w-[180px]">
                        <p className="truncate text-xs font-semibold text-slate-200" title={act.studentNamesList}>
                          {act.studentNamesList}
                        </p>
                      </td>
                      {/* 클럽명 */}
                      <td className="py-4 px-6 whitespace-nowrap text-white font-semibold">
                        {act.clubName}
                      </td>
                      {/* 장소/유형 */}
                      <td className="py-4 px-6 whitespace-nowrap text-xs space-y-0.5">
                        <p className="text-slate-200 font-medium">{act.location}</p>
                        <p className="text-slate-500">{act.type}</p>
                      </td>
                      {/* 시간 */}
                      <td className="py-4 px-6 text-center whitespace-nowrap font-bold text-white">
                        {act.hours} h
                      </td>
                      {/* 내용 */}
                      <td className="py-4 px-6 max-w-sm">
                        <p className="text-xs text-slate-400 line-clamp-1">
                          원본: {act.originalContent}
                        </p>
                        {act.editedContent && (
                          <p className="text-xs text-indigo-400 font-semibold mt-1 line-clamp-1">
                            수정본: {act.editedContent}
                          </p>
                        )}
                      </td>
                      {/* 사진 */}
                      <td className="py-4 px-6 text-center">
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
                              className="h-8 w-14 object-cover rounded border border-slate-700 hover:border-indigo-500 transition duration-200"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://ssl.gstatic.com/docs/doclist/images/icon_10_pdf_list.png';
                              }}
                            />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                      {/* 상태 */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        {act.status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            승인됨
                          </span>
                        )}
                        {act.status === 'PENDING' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            대기 중
                          </span>
                        )}
                        {act.status === 'REJECTED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            반려됨
                          </span>
                        )}
                      </td>
                      {/* 제어 */}
                      <td className="py-4 px-6 text-right whitespace-nowrap text-xs space-x-2">
                        {act.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleModerate(act, 'APPROVED')}
                              className="px-2 py-1 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded transition"
                            >
                              승인
                            </button>
                            <button
                              onClick={() => handleModerate(act, 'REJECTED')}
                              className="px-2 py-1 bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white rounded transition"
                            >
                              반려
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => openEditModal(act)}
                          className="px-2 py-1 bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white rounded transition"
                        >
                          수정/승인
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* 모더레이션 수정 모달 */}
      {selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-white mb-2">활동 기록 보완 및 승인</h3>
            <p className="text-xs text-slate-400 mb-4">행 번호: {selectedActivity.rowNumber} | 제출자: {selectedActivity.submitterEmail}</p>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* 활동 시간 수정 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300">활동 인정 시간 (Hours)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={editHours}
                  onChange={(e) => setEditHours(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 transition"
                  required
                />
              </div>

              {/* 활동 요약글 수정 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300">활동 요약 내용 (Edited Content)</label>
                <textarea
                  rows={6}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 transition resize-none leading-relaxed"
                  placeholder="생활기록부에 요약되어 올라갈 문맥에 맞추어 매끄럽게 교사 텍스트를 다듬어 주세요."
                  required
                />
                <span className="text-[10px] text-slate-500">학생 원본: {selectedActivity.originalContent}</span>
              </div>

              {/* 제어 버튼 */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedActivity(null)}
                  className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition"
                >
                  {submitting ? '제출 중...' : '보완 완료 및 승인'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500 mt-12">
        <p>&copy; {new Date().getFullYear()} School Student Clubs Management System. All rights reserved.</p>
      </footer>
    </div>
  );
}
