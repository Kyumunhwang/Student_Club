const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { loadEnvConfig } = require('@next/env');

// Load environment variables from .env.local
loadEnvConfig(process.cwd());

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

if (!email || !privateKey || !spreadsheetId || email.includes('your_service_account_email') || privateKey.includes('your_private_key_here') || spreadsheetId.includes('your_google_spreadsheet_id')) {
  console.error("\n[오류] .env.local 파일에 서비스 계정 정보(EMAIL, PRIVATE_KEY)와 SPREADSHEET_ID를 올바르게 입력했는지 확인해 주세요.");
  console.error("현재 설정값:");
  console.error("- GOOGLE_SERVICE_ACCOUNT_EMAIL:", email);
  console.error("- GOOGLE_SPREADSHEET_ID:", spreadsheetId);
  process.exit(1);
}

// Get user email from command line argument
const userEmail = process.argv[2];
if (!userEmail || !userEmail.includes('@')) {
  console.error("\n[오류] 테스트할 구글 계정 이메일을 아규먼트로 전달해 주세요.");
  console.error("사용법: node seed-sheets.js [본인의_구글_이메일]");
  console.error("예시: node seed-sheets.js test-teacher@gmail.com");
  process.exit(1);
}

const formattedKey = privateKey.replace(/\\n/g, '\n');

const auth = new google.auth.JWT({
  email,
  key: formattedKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function seed() {
  try {
    console.log("구글 스프레드시트에 샘플 데이터 및 헤더 구조 생성을 시작합니다...");

    const sheetsToInitialize = [
      {
        name: 'Students',
        range: 'Students!A1:E2',
        values: [
          ['student_id', 'name_ko', 'name_en', 'grade', 'email'],
          ['S202601', '홍길동', 'Gildong Hong', '10', userEmail]
        ]
      },
      {
        name: 'Clubs',
        range: 'Clubs!A1:C2',
        values: [
          ['club_id', 'club_name', 'teacher_id'],
          ['C_CODING', 'Coding Club', userEmail]
        ]
      },
      {
        name: 'Memberships',
        range: 'Memberships!A1:E1',
        values: [
          ['student_id', 'club_id', 'semester', 'total_hours', 'summary_content']
        ]
      },
      {
        name: 'ActivityLogs',
        range: 'ActivityLogs!A1:J1',
        values: [
          ['Timestamp', 'Email Address', 'activity_date', 'club_id', 'location', 'activity_type', 'content', 'duration_hours', 'photo_url', 'status']
        ]
      },
      {
        name: 'SLO_CAPA',
        range: 'SLO_CAPA!A1:F1',
        values: [
          ['student_id', 'semester', 'slo_1_integrity', 'slo_1_enthusiasm', 'slo_2_selfconfidence', 'slo_3_cooperation']
        ]
      },
      {
        name: 'HomeroomComments',
        range: 'HomeroomComments!A1:C1',
        values: [
          ['student_id', 'semester', 'comment']
        ]
      }
    ];

    for (const sheet of sheetsToInitialize) {
      console.log(`[${sheet.name}] 시트 작업 중...`);
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: sheet.range,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: sheet.values
          }
        });
        console.log(`[${sheet.name}] 초기화 성공!`);
      } catch (err) {
        console.warn(`[${sheet.name}] 업데이트 중 오류 발생 (해당 이름의 시트 탭이 생성되었는지 확인해 주세요):`, err.message);
      }
    }

    console.log("\n모든 시트에 초기 헤더와 샘플 데이터가 성공적으로 적재되었습니다!");
  } catch (error) {
    console.error("시트 세팅 중 에러가 발생했습니다:", error);
  }
}

seed();
