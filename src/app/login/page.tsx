'use client';

import React, { useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  // 이미 로그인된 세션이 있을 경우 역할별 자동 리다이렉트
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      if (session.user.role === 'TEACHER') {
        router.push('/teacher');
      } else if (session.user.role === 'STUDENT') {
        router.push('/student');
      } else {
        router.push('/auth-error?error=InvalidRole');
      }
    }
  }, [status, session, router]);

  const handleGoogleLogin = () => {
    signIn('google');
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center p-8 text-slate-200">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 shadow-2xl backdrop-blur-md space-y-6">
      <div className="space-y-2 text-center">
        <h3 className="text-lg font-bold text-white">포털 로그인</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          학교에서 발급한 공식 Google Workspace 계정으로 로그인해 주세요.
        </p>
      </div>

      {errorParam && (
        <div className="text-xs p-3.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 leading-relaxed text-center">
          {errorParam === 'AccessDenied' && '로그인 권한이 거부되었습니다. 등록된 학교 계정인지 확인하세요.'}
          {errorParam === 'Unauthorized' && '해당 서비스에 접근할 권한이 없습니다.'}
          {errorParam !== 'AccessDenied' && errorParam !== 'Unauthorized' && '로그인 중 오류가 발생했습니다. 다시 시도해 주세요.'}
        </div>
      )}

      <button
        onClick={handleGoogleLogin}
        className="w-full flex items-center justify-center gap-3 px-5 py-3 border border-slate-700 hover:border-slate-600 bg-slate-950 hover:bg-slate-900 rounded-xl text-sm font-semibold text-slate-200 hover:text-white transition duration-200 shadow-lg"
      >
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" width="24" height="24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        Google Workspace 계정으로 로그인
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 h-[300px] w-[300px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-rose-500/10 blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md space-y-8 z-10">
        <div className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-rose-500 flex items-center justify-center font-black text-white text-xl shadow-xl shadow-indigo-500/20">
            S
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Student Clubs Portal
          </h2>
          <p className="text-sm text-slate-400">
            학생 동아리 활동 기록 및 성적표 관리 시스템
          </p>
        </div>

        <Suspense fallback={
          <div className="flex items-center justify-center p-8 bg-slate-900/40 border border-slate-800 rounded-2xl">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
          </div>
        }>
          <LoginForm />
        </Suspense>

        <div className="text-center text-xs text-slate-600">
          <p>도움이 필요하시면 시스템 관리자 또는 담당 교사에게 문의해 주세요.</p>
        </div>
      </div>
    </div>
  );
}

