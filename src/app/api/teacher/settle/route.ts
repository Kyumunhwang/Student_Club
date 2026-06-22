import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSheetValues, updateSheetAllValues } from '@/lib/google';
import { generateClubSummary } from '@/lib/gemini';

export async function POST(request: Request) {
  // 1. 인증 및 교사 권한 검증
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'TEACHER') {
    return NextResponse.json(
      { error: '교사 권한이 필요하거나 세션이 만료되었습니다.' },
      { status: 403 }
    );
  }

  try {
    // 2. 파라미터 파싱
    const body = await request.json();
    const { semester } = body;

    if (!semester) {
      return NextResponse.json(
        { error: '정산 대상 학기(semester)가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 3. 구글 시트 원본 데이터 일괄 로드
    const [studentsData, membershipsData, logsData] = await Promise.all([
      getSheetValues('Students'),
      getSheetValues('Memberships'),
      getSheetValues('ActivityLogs'),
    ]);

    if (studentsData.length === 0 || membershipsData.length === 0) {
      return NextResponse.json(
        { error: '학생(Students) 또는 멤버십(Memberships) 데이터가 존재하지 않습니다.' },
        { status: 400 }
      );
    }

    // 4. Students 데이터 맵 구축 (student_id -> { name_ko, name_en })
    const studentHeader = studentsData[0];
    const sIdIdx = studentHeader.indexOf('student_id');
    const sKoIdx = studentHeader.indexOf('name_ko');
    const sEnIdx = studentHeader.indexOf('name_en');

    const studentsMap = new Map<string, { nameKo: string; nameEn: string }>();
    for (let i = 1; i < studentsData.length; i++) {
      const row = studentsData[i];
      const id = row[sIdIdx];
      if (id) {
        studentsMap.set(id, {
          nameKo: row[sKoIdx] || '',
          nameEn: row[sEnIdx] || '',
        });
      }
    }

    // 5. Memberships 헤더 인덱스 스캔
    const membershipHeader = membershipsData[0];
    const mStudentIdx = membershipHeader.indexOf('student_id');
    const mClubIdx = membershipHeader.indexOf('club_id');
    const mSemesterIdx = membershipHeader.indexOf('semester');
    const mHoursIdx = membershipHeader.indexOf('total_hours');
    const mSummaryIdx = membershipHeader.indexOf('summary_content');

    if (mStudentIdx === -1 || mClubIdx === -1 || mSemesterIdx === -1 || mHoursIdx === -1 || mSummaryIdx === -1) {
      return NextResponse.json(
        { error: 'Memberships 시트의 필수 열(student_id, club_id, semester, total_hours, summary_content)이 유실되었습니다.' },
        { status: 500 }
      );
    }

    // 6. ActivityLogs 헤더 인덱스 스캔
    const logsHeader = logsData[0] || [];
    const lClubIdx = logsHeader.indexOf('참여 클럽');
    const lStudentsIdx = logsHeader.indexOf('참여 학생 선택');
    const lDurationIdx = logsHeader.indexOf('활동 시간');
    const lContentIdx = logsHeader.indexOf('활동 내용');
    const lStatusIdx = logsHeader.indexOf('status');
    const lEditedContentIdx = logsHeader.indexOf('edited_content');

    const updatedMemberships = [...membershipsData];
    let processedCount = 0;

    // 7. 각 멤버십에 대해 시간 정산 및 AI 요약 루프 돌기
    for (let i = 1; i < updatedMemberships.length; i++) {
      const row = updatedMemberships[i];
      
      // 학기가 일치하는 멤버십 행만 정산 수행
      if (row[mSemesterIdx] === semester) {
        const studentId = row[mStudentIdx];
        const clubId = row[mClubIdx];

        if (!studentId || !clubId) continue;

        const studentInfo = studentsMap.get(studentId) || { nameKo: '학생', nameEn: 'Student' };

        // [A] 해당 학생의 클럽 활동 중 교사 승인이 끝난 로그 수집
        const approvedLogs: string[] = [];
        let totalHours = 0;

        for (let j = 1; j < logsData.length; j++) {
          const logRow = logsData[j];
          const logClub = logRow[lClubIdx] || '';
          const logStudents = logRow[lStudentsIdx] || '';
          const logStatus = logRow[lStatusIdx]?.trim().toUpperCase() || 'PENDING';

          // 해당 클럽이고, 참여 학생 목록에 학번이 있고, 승인 완료인 상태
          if (logClub === clubId && logStudents.includes(studentId) && logStatus === 'APPROVED') {
            const hours = parseFloat(logRow[lDurationIdx]) || 0;
            totalHours += hours;

            // 교사 수정본을 1순위로, 없을 시 학생 원본을 요약 대상으로 사용
            const logContent = logRow[lEditedContentIdx] ? logRow[lEditedContentIdx] : logRow[lContentIdx];
            if (logContent) {
              approvedLogs.push(logContent);
            }
          }
        }

        // [B] 데이터 정산값 및 Gemini 요약문 생성
        let summaryContent = '';
        if (approvedLogs.length > 0) {
          // Gemini API 호출을 통한 300~500자 요약문 생성
          try {
            summaryContent = await generateClubSummary(studentInfo.nameEn, clubId, approvedLogs);
          } catch (aiErr) {
            console.error(`[AI Summary Error] ${studentId} 요약 중 오류:`, aiErr);
            summaryContent = `Dedicated participant in the ${clubId} activities, completing a total of ${totalHours} hours with consistency.`;
          }
        } else {
          // 승인된 활동이 없는 경우 기본값 채우기
          summaryContent = 'No approved club activity logs registered for this semester.';
        }

        // [C] Memberships 행 배열 업데이트
        // 바운드 체크 및 확장
        const maxIdx = Math.max(mHoursIdx, mSummaryIdx);
        while (row.length <= maxIdx) {
          row.push('');
        }

        row[mHoursIdx] = String(Number(totalHours.toFixed(1)));
        row[mSummaryIdx] = summaryContent;
        processedCount++;
      }
    }

    // 8. Memberships 전체 데이터를 구글 시트에 일괄 덮어쓰기 (동시성 뮤텍스 큐 적용)
    await updateSheetAllValues('Memberships', updatedMemberships);

    return NextResponse.json({
      success: true,
      count: processedCount,
      message: `성공적으로 ${processedCount}건의 학기 말 클럽 요약 및 정산 데이터를 반영하였습니다.`,
    });

  } catch (error) {
    console.error('학기 말 정산 배치 작업 실행 중 오류 발생:', error);
    return NextResponse.json(
      { error: '정산 처리 중 서버 에러가 발생했습니다.' },
      { status: 500 }
    );
  }
}
