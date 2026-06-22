import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSheetValues } from '@/lib/google';

export async function GET() {
  // 1. 인증 및 세션 검증
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'STUDENT' || !session.user.studentId) {
    return NextResponse.json(
      { error: '학생 권한이 필요하거나 세션이 만료되었습니다.' },
      { status: 403 }
    );
  }

  const myStudentId = session.user.studentId;

  try {
    // 2. Google Sheets의 ActivityLogs 데이터 로드
    const logs = await getSheetValues('ActivityLogs');
    if (logs.length === 0) {
      return NextResponse.json({ activities: [], totalHours: 0 });
    }

    const header = logs[0];
    const timestampIdx = header.indexOf('Timestamp');
    const dateIdx = header.indexOf('활동 일자');
    const studentsIdx = header.indexOf('참여 학생 선택');
    const clubIdx = header.indexOf('참여 클럽');
    const locationIdx = header.indexOf('활동 장소');
    const typeIdx = header.indexOf('활동 유형');
    const durationIdx = header.indexOf('활동 시간');
    const contentIdx = header.indexOf('활동 내용');
    const photoIdx = header.indexOf('인증 사진');
    const statusIdx = header.indexOf('status');
    const editedContentIdx = header.indexOf('edited_content');

    const myActivities: any[] = [];
    let totalHours = 0;

    // 3. 학생의 학번 매핑 검사 및 정산
    for (let i = 1; i < logs.length; i++) {
      const row = logs[i];
      const studentCell = row[studentsIdx] || '';

      // 참여 학생 목록 문자열 내에 본인의 학번이 있는지 검사 (예: "김현서 (G11 - 25010)"에 "25010" 존재 여부)
      if (studentCell.includes(myStudentId)) {
        const hours = parseFloat(row[durationIdx]) || 0;
        const status = row[statusIdx]?.trim().toUpperCase() || 'PENDING';
        
        // 교사가 최종 수정한 문장이 있으면 최우선으로 보여줌
        const finalContent = row[editedContentIdx] ? row[editedContentIdx] : row[contentIdx];

        myActivities.push({
          id: i + 1, // Sheets 행 번호 (1-based, index + 1)
          timestamp: row[timestampIdx],
          date: row[dateIdx],
          club: row[clubIdx],
          location: row[locationIdx],
          type: row[typeIdx],
          hours: hours,
          content: finalContent,
          photoUrl: row[photoIdx] || null,
          status: status,
        });

        // 승인된 시간만 총 시간에 합산
        if (status === 'APPROVED') {
          totalHours += hours;
        }
      }
    }

    // 최신 활동 순으로 정렬 (날짜 내림차순)
    myActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      studentId: myStudentId,
      studentName: session.user.name || '',
      activities: myActivities,
      totalHours: Number(totalHours.toFixed(1)), // 소수점 첫째자리 포맷
    });

  } catch (error) {
    console.error('학생 활동 데이터 조회 중 API 오류 발생:', error);
    return NextResponse.json(
      { error: '서버 에러가 발생하여 활동 기록을 조회할 수 없습니다.' },
      { status: 500 }
    );
  }
}
