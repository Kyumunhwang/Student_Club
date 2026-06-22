import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // 1. 학생용 경로 보호
    if (path.startsWith('/student') && token?.role !== 'STUDENT') {
      return NextResponse.redirect(new URL('/login?error=Unauthorized', req.url));
    }

    // 2. 교사용 경로 보호
    if (path.startsWith('/teacher') && token?.role !== 'TEACHER') {
      return NextResponse.redirect(new URL('/login?error=Unauthorized', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // 토큰이 존재할 때만 미들웨어 내부 콜백 실행
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  }
);

// 보호할 라우트 경로 매처
export const config = {
  matcher: ['/student/:path*', '/teacher/:path*'],
};
