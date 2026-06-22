import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSheetValues } from '@/lib/google';

export async function GET(request: Request) {
  // 1. 인증 및 교사 권한 검증
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'TEACHER') {
    return NextResponse.json(
      { error: '교사 권한이 필요하거나 세션이 만료되었습니다.' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const showAll = searchParams.get('all') === 'true'; // 전체 클럽 조회 여부
  const teacherEmail = session.user.email?.toLowerCase();

  try {
    // 2. 교사가 담당하는 클럽 목록 추출
    const clubs = await getSheetValues('Clubs');
    const myClubIds: string[] = [];
    const clubIdNameMap: { [key: string]: string } = {};

    if (clubs.length > 0) {
      const header = clubs[0];
      const clubIdIdx = header.indexOf('club_id');
      const clubNameIdx = header.indexOf('club_name');
      const teacherIdIdx = header.indexOf('teacher_id');

      for (let i = 1; i < clubs.length; i++) {
        const row = clubs[i];
        const cId = row[clubIdIdx];
        const cName = row[clubNameIdx];
        const tId = row[teacherIdIdx]?.trim().toLowerCase();

        if (cId) {
          clubIdNameMap[cId] = cName || cId;
          if (tId === teacherEmail) {
            myClubIds.push(cId);
          }
        }
      }
    }

    // 3. ActivityLogs 로드 및 필터링
    const logs = await getSheetValues('ActivityLogs');
    if (logs.length === 0) {
      return NextResponse.json({ activities: [], myClubs: myClubIds });
    }

    const header = logs[0];
    const timestampIdx = header.indexOf('Timestamp');
    const emailIdx = header.indexOf('Email Address');
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

    const filteredActivities: any[] = [];

    for (let i = 1; i < logs.length; i++) {
      const row = logs[i];
      const cId = row[clubIdx] || '';
      
      // 담당 클럽만 필터링하거나 전체 조회 토글 처리
      const isMyClub = myClubIds.includes(cId);
      if (showAll || isMyClub) {
        const hours = parseFloat(row[durationIdx]) || 0;
        const status = row[statusIdx]?.trim().toUpperCase() || 'PENDING';
        
        filteredActivities.push({
          rowNumber: i + 1, // 수정 시 Sheets 행 번호 필요 (1-based)
          timestamp: row[timestampIdx] || '',
          submitterEmail: row[emailIdx] || '',
          date: row[dateIdx] || '',
          studentNamesList: row[studentsIdx] || '',
          clubId: cId,
          clubName: clubIdNameMap[cId] || cId,
          location: row[locationIdx] || '',
          type: row[typeIdx] || '',
          hours: hours,
          originalContent: row[contentIdx] || '',
          editedContent: row[editedContentIdx] || '',
          photoUrl: row[photoIdx] || null,
          status: status,
          isMyClub: isMyClub,
        });
      }
    }

    // 최신 날짜순으로 정렬
    filteredActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      activities: filteredActivities,
      myClubIds: myClubIds,
    });

  } catch (error) {
    console.error('교사용 활동 데이터 조회 API 오류 발생:', error);
    return NextResponse.json(
      { error: '서버 에러가 발생하여 활동 기록을 조회할 수 없습니다.' },
      { status: 500 }
    );
  }
}
