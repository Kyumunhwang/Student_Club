'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function AuthErrorPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-red-500/5 p-8 shadow-2xl backdrop-blur-md text-center space-y-6">
        {/* 경고 아이콘 */}
        <div className="mx-auto h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">접근이 거부되었습니다.</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            로그인하신 Google 계정이 전교생 명단(`Students`) 또는 담당 교사 명단(`Clubs`)에 존재하지 않습니다.
          </p>
        </div>

        <div className="text-xs text-slate-500 leading-relaxed border-t border-slate-800/80 pt-4 text-left space-y-1.5">
          <p className="font-semibold text-slate-400">해결 방법:</p>
          <p>1. 학교에서 정식으로 제공받은 구글 워크스페이스 계정으로 로그인했는지 확인해 주세요.</p>
          <p>2. 신입생 또는 새로 부임한 교사라면 담당 선생님께 연락하여 관리자 구글 시트 명단에 자신의 이름과 이메일 등록을 요청해 주세요.</p>
        </div>

        <button
          onClick={() => router.push('/login')}
          className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-sm font-semibold transition duration-200"
        >
          로그인 화면으로 돌아가기
        </button>
      </div>
    </div>
  );
}
