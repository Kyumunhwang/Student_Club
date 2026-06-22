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
  const type = searchParams.get('type'); // 'slo' or 'homeroom'

  if (type !== 'slo' && type !== 'homeroom') {
    return NextResponse.json(
      { error: "올바르지 않은 CSV 타입입니다. 'slo' 또는 'homeroom'을 지정해 주세요." },
      { status: 400 }
    );
  }

  try {
    // 2. Students 시트에서 학생 목록 로드
    const studentsData = await getSheetValues('Students');
    if (studentsData.length === 0) {
      return NextResponse.json({ error: '학생 명단이 존재하지 않습니다.' }, { status: 404 });
    }

    const header = studentsData[0];
    const idIdx = header.indexOf('student_id');
    const nameIdx = header.indexOf('name_ko');
    const gradeIdx = header.indexOf('grade');

    if (idIdx === -1 || nameIdx === -1 || gradeIdx === -1) {
      return NextResponse.json({ error: 'Students 시트의 필수 열 구조가 올바르지 않습니다.' }, { status: 500 });
    }

    // 3. CSV 데이터 빌드
    let csvContent = '';

    // CSV 파일 헤더 정의
    if (type === 'slo') {
      // SLO(CAPA) 성취 등급용 헤더
      csvContent = 'student_id,name_ko,grade,integrity,enthusiasm,selfconfidence,leadership,motivation,cooperation,humility,maturity,responsibility,perseverance\n';
    } else {
      // 담임 교사 의견용 헤더
      csvContent = 'student_id,name_ko,grade,comment\n';
    }

    // 학생 데이터 삽입
    for (let i = 1; i < studentsData.length; i++) {
      const row = studentsData[i];
      const id = row[idIdx] || '';
      const name = row[nameIdx] || '';
      const grade = row[gradeIdx] || '';

      if (id && name) {
        // 쉼표가 이름에 섞여 있을 경우를 고려하여 따옴표 처리
        const safeName = name.includes(',') ? `"${name}"` : name;
        if (type === 'slo') {
          // 등급값은 빈값(템플릿)으로 내보냄
          csvContent += `${id},${safeName},${grade},,,,,,,,,,,\n`;
        } else {
          // 담임 교사 코멘트는 빈값으로 내보냄
          csvContent += `${id},${safeName},${grade},\n`;
        }
      }
    }

    // 4. Excel 한글 깨짐(UTF-8 BOM) 방지 바이트 주입
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csvContent;

    // Response 생성 및 헤더 설정
    const response = new Response(csvWithBOM, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=Student_Template_${type}_${new Date().toISOString().slice(0, 10)}.csv`,
      },
    });

    return response;

  } catch (error) {
    console.error('CSV 템플릿 파일 생성 중 오류 발생:', error);
    return NextResponse.json(
      { error: 'CSV 파일을 다운로드하는 데 실패했습니다.' },
      { status: 500 }
    );
  }
}
