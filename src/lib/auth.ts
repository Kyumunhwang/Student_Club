import { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getSheetValues } from './google';

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    // 1. 로그인 성공 여부 및 권한 판별 (Google Sheets 연계)
    async signIn({ user }) {
      if (!user.email) return false;

      try {
        // [A] 교사 여부 검증 (Clubs 시트에서 teacher_id 스캔)
        const clubsData = await getSheetValues('Clubs');
        if (clubsData.length > 0) {
          const header = clubsData[0];
          const teacherIdIdx = header.indexOf('teacher_id');
          
          if (teacherIdIdx !== -1) {
            for (let i = 1; i < clubsData.length; i++) {
              if (clubsData[i][teacherIdIdx]?.trim().toLowerCase() === user.email.toLowerCase()) {
                // 교사로 식별됨 -> 로그인 허용
                return true;
              }
            }
          }
        }

        // [B] 학생 여부 검증 (Students 시트에서 email 스캔)
        const studentsData = await getSheetValues('Students');
        if (studentsData.length > 0) {
          const header = studentsData[0];
          const emailIdx = header.indexOf('email');
          
          if (emailIdx !== -1) {
            for (let i = 1; i < studentsData.length; i++) {
              if (studentsData[i][emailIdx]?.trim().toLowerCase() === user.email.toLowerCase()) {
                // 학생으로 식별됨 -> 로그인 허용
                return true;
              }
            }
          }
        }

        // 명단에 없는 사용자 로그인 차단 (학교 외부인 통제)
        console.warn(`[Sign-in Blocked] 이메일 ${user.email}이 학생/교사 명단에 존재하지 않습니다.`);
        return false;
      } catch (error) {
        console.error('로그인 권한 확인 중 에러 발생:', error);
        return false; // 에러 시 안전하게 차단
      }
    },

    // 2. JWT 토큰 발급 시 역할 및 고유 학번 정보 기입
    async jwt({ token, user, account }) {
      if (user && user.email) {
        try {
          // 기본값 설정
          token.role = 'UNKNOWN';
          token.studentId = null;

          // 교사 여부 확인
          const clubsData = await getSheetValues('Clubs');
          if (clubsData.length > 0) {
            const header = clubsData[0];
            const teacherIdIdx = header.indexOf('teacher_id');
            if (teacherIdIdx !== -1) {
              const isTeacher = clubsData.some((row, i) => 
                i > 0 && row[teacherIdIdx]?.trim().toLowerCase() === user.email!.toLowerCase()
              );
              if (isTeacher) {
                token.role = 'TEACHER';
                return token;
              }
            }
          }

          // 학생 여부 확인 및 학번(student_id) 추출
          const studentsData = await getSheetValues('Students');
          if (studentsData.length > 0) {
            const header = studentsData[0];
            const emailIdx = header.indexOf('email');
            const studentIdIdx = header.indexOf('student_id');
            if (emailIdx !== -1 && studentIdIdx !== -1) {
              const studentRow = studentsData.find((row, i) => 
                i > 0 && row[emailIdx]?.trim().toLowerCase() === user.email!.toLowerCase()
              );
              if (studentRow) {
                token.role = 'STUDENT';
                token.studentId = studentRow[studentIdIdx];
              }
            }
          }
        } catch (error) {
          console.error('JWT 콜백 중 에러 발생:', error);
        }
      }
      return token;
    },

    // 3. 클라이언트용 Session 객체에 JWT 토큰 정보 매핑
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as 'TEACHER' | 'STUDENT' | 'UNKNOWN';
        session.user.studentId = token.studentId as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login', // 커스텀 로그인 페이지
    error: '/auth-error', // 로그인 에러 대응 페이지
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// TypeScript Session 타입 확장 설정
declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: 'TEACHER' | 'STUDENT' | 'UNKNOWN';
      studentId: string | null;
    };
  }
}
