/**
 * 학기 말 정산 데이터를 기반으로 성적표(Report Card) 구글 문서를 자동으로 생성하고 PDF로 변환합니다.
 * 
 * [설정 방법]
 * 1. 구글 시트 상단 메뉴 [확장 프로그램] ➔ [Apps Script] 클릭
 * 2. 이 코드를 복사하여 붙여넣고 저장 (SyncFormOptions.gs와 함께 배치)
 * 3. 코드 내부의 TEMPLATE_DOC_ID와 OUTPUT_FOLDER_ID를 학교 환경에 맞게 수정합니다.
 * 4. 이 스크립트는 웹 UI의 정산 엔진이나 구글 시트 상단 커스텀 메뉴를 클릭하여 수동 실행할 수 있습니다.
 */

// 성적표 마스터 템플릿 Google Docs ID
var TEMPLATE_DOC_ID = '1_rim6ldnqs2cdYTraoTecskIaBInm6i8BtG03_AGuBA';
// 최종 PDF 파일들이 저장될 구글 드라이브 공유 폴더 ID
var OUTPUT_FOLDER_ID = 'YOUR_OUTPUT_FOLDER_ID_HERE'; 

// 구글 시트 상단에 [성적표 관리] 메뉴 추가 트리거
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('성적표 관리')
    .addItem('학기 말 성적표 PDF 일괄 발행', 'generateAllReportCards')
    .addToUi();
}

/**
 * 전교생의 성적표 데이터를 매핑하여 PDF로 일괄 발행합니다.
 */
function generateAllReportCards() {
  if (OUTPUT_FOLDER_ID === 'YOUR_OUTPUT_FOLDER_ID_HERE') {
    SpreadsheetApp.getUi().alert('에러: OUTPUT_FOLDER_ID가 설정되지 않았습니다. Apps Script 편집기에서 ID 설정을 완료해 주세요.');
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('학기 말 성적표 발행', '발행할 학기를 입력해 주세요 (예: 2026-1):', ui.ButtonSet.OK_CANCEL);
  
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var semester = response.getResponseText().trim();
  
  if (!semester) {
    ui.alert('학기 명이 비어 있습니다.');
    return;
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 각 시트 로드
  var studentsSheet = sheet.getSheetByName('Students');
  var membershipsSheet = sheet.getSheetByName('Memberships');
  var sloSheet = sheet.getSheetByName('SLO_CAPA');
  var commentsSheet = sheet.getSheetByName('HomeroomComments');
  
  if (!studentsSheet || !membershipsSheet || !sloSheet || !commentsSheet) {
    ui.alert('에러: 필수 시트(Students, Memberships, SLO_CAPA, HomeroomComments) 중 누락된 탭이 있습니다.');
    return;
  }

  // 2. 구글 드라이브 출력 폴더 준비
  var outputFolder = DriveApp.getFolderById(OUTPUT_FOLDER_ID);
  var templateFile = DriveApp.getFileById(TEMPLATE_DOC_ID);

  // 3. 학생 데이터 파싱
  var students = getSheetDataAsMap(studentsSheet, 'student_id');
  var sloData = getSheetDataAsMap(sloSheet, 'student_id', semester);
  var commentsData = getSheetDataAsMap(commentsSheet, 'student_id', semester);
  
  // 4. Memberships 데이터 그룹화 (student_id -> 가입된 클럽들 데이터 배열)
  var memberships = membershipsSheet.getDataRange().getValues();
  var mHeader = memberships[0];
  const mStudentIdx = mHeader.indexOf('student_id');
  const mClubIdx = mHeader.indexOf('club_id');
  const mSemesterIdx = mHeader.indexOf('semester');
  const mHoursIdx = mHeader.indexOf('total_hours');
  const mSummaryIdx = mHeader.indexOf('summary_content');
  
  var studentClubsMap = {};
  for (var i = 1; i < memberships.length; i++) {
    var row = memberships[i];
    if (row[mSemesterIdx] === semester) {
      var sId = row[mStudentIdx];
      if (!studentClubsMap[sId]) {
        studentClubsMap[sId] = [];
      }
      studentClubsMap[sId].push({
        clubId: row[mClubIdx],
        hours: row[mHoursIdx] || '0',
        summary: row[mSummaryIdx] || ''
      });
    }
  }

  // 5. 전교 학생 루프를 돌면서 성적표 PDF 생성
  var studentsList = studentsSheet.getDataRange().getValues();
  var sHeader = studentsList[0];
  const sIdIdx = sHeader.indexOf('student_id');
  const sKoIdx = sHeader.indexOf('name_ko');
  const sEnIdx = sHeader.indexOf('name_en');
  const sGradeIdx = sHeader.indexOf('grade');
  
  var successCount = 0;

  for (var k = 1; k < studentsList.length; k++) {
    var sRow = studentsList[k];
    var studentId = sRow[sIdIdx];
    var nameKo = sRow[sKoIdx];
    var nameEn = sRow[sEnIdx];
    var grade = sRow[sGradeIdx];
    
    if (!studentId) continue;
    
    var clubs = studentClubsMap[studentId] || [];
    var slo = sloData[studentId] || {};
    var commentRow = commentsData[studentId] || {};
    
    try {
      // [A] 마스터 템플릿 파일 복사
      var docName = nameEn + "_" + studentId + "_ReportCard_" + semester;
      var copyFile = templateFile.makeCopy(docName, outputFolder);
      var doc = DocumentApp.openById(copyFile.getId());
      var body = doc.getBody();

      // [B] 텍스트 플레이스홀더 치환 (맑은고딕 폰트 자동 유지)
      body.replaceText('{{StudentName}}', nameEn + ' (' + nameKo + ')');
      body.replaceText('{{Grade}}', 'Grade ' + grade);
      body.replaceText('{{Semester}}', semester);
      
      // 담임 교사 코멘트 치환
      var hComment = commentRow['comment'] || '현서는 성실하게 학업에 전념하여 올바른 성장을 보여주었습니다.';
      body.replaceText('{{HomeroomComment}}', hComment);

      // [C] SLO (Student Learning Outcomes) 치환
      var sloKeys = [
        'integrity', 'enthusiasm', 'selfconfidence', 'leadership', 
        'motivation', 'cooperation', 'humility', 'maturity', 
        'responsibility', 'perseverance'
      ];
      sloKeys.forEach(function(key) {
        var placeholder = '{{SLO_' + key.toUpperCase() + '}}';
        var gradeValue = slo[key] || 'VG'; // 기본값 Very Good
        body.replaceText(placeholder, gradeValue);
      });

      // [D] 동아리 총 시간 합산 구해서 Curricular Activities 표에 삽입
      var totalClubHours = 0;
      var clubNames = [];
      clubs.forEach(function(c) {
        totalClubHours += parseFloat(c.hours) || 0;
        clubNames.push(c.clubId);
      });
      
      body.replaceText('{{CurricularHours}}', totalClubHours.toFixed(1));
      body.replaceText('{{CurricularClubs}}', clubNames.join(' / '));

      // [E] Student Activities 상세 목록 테이블 동적 추가
      // 문서 내 테이블 검색
      var tables = body.getTables();
      var activityTable = null;
      
      for (var t = 0; t < tables.length; t++) {
        // 테이블 헤더 열 이름을 기준으로 'Student Activities'용 테이블인지 매칭
        var cellText = tables[t].getRow(0).getCell(0).getText().trim();
        if (cellText === 'Club Name') {
          activityTable = tables[t];
          break;
        }
      }

      if (activityTable && clubs.length > 0) {
        // 템플릿에 지정되어 있는 빈 행들 삭제 (헤더 row인 0번째 줄 제외)
        while (activityTable.getNumRows() > 1) {
          activityTable.removeRow(1);
        }

        // 학생이 참여한 개별 동아리 수만큼 행을 동적으로 늘려가며 채움
        clubs.forEach(function(club) {
          var newRow = activityTable.appendTableRow();
          
          // 폰트 스타일 상속을 위해 기존 셀 서식 복제
          var cell0 = newRow.appendCell().setText(club.clubId);
          var cell1 = newRow.appendCell().setText(parseFloat(club.hours).toFixed(1));
          var cell2 = newRow.appendCell().setText(club.summary);
          
          // 맑은 고딕 서식 유지
          cell0.setFontFamily('Malgun Gothic').setFontSize(9).setBold(true);
          cell1.setFontFamily('Malgun Gothic').setFontSize(9).setBold(true);
          cell2.setFontFamily('Malgun Gothic').setFontSize(9).setBold(false);
        });
      }

      // [F] 문서 저장 및 PDF 파일 변환
      doc.saveAndClose();
      
      var pdfBlob = copyFile.getAs('application/pdf');
      var pdfFile = outputFolder.createFile(pdfBlob);
      
      // [G] 용량 낭비를 막기 위해 임시 복제한 Google Docs 파일 즉시 삭제
      copyFile.setTrashed(true);
      
      successCount++;
    } catch (err) {
      Logger.log('에러 발생 - 학생 학번 ' + studentId + ': ' + err.toString());
    }
  }

  ui.alert('발행 완료: 총 ' + successCount + '명의 성적표 PDF가 공유 폴더에 저장되었습니다.');
}

/**
 * 구글 시트 데이터를 JSON 맵 객체로 로드합니다.
 */
function getSheetDataAsMap(sheet, keyColumn, filterSemester) {
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var keyIdx = header.indexOf(keyColumn);
  var semIdx = header.indexOf('semester');
  
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var key = row[keyIdx];
    
    // 학기 필터링 옵션 작동
    if (filterSemester && semIdx !== -1 && row[semIdx] !== filterSemester) {
      continue;
    }
    
    if (key) {
      var rowObj = {};
      for (var col = 0; col < header.length; col++) {
        rowObj[header[col]] = row[col];
      }
      map[key] = rowObj;
    }
  }
  return map;
}
