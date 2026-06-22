/**
 * Google Sheets의 'Students' 명단을 실시간으로 감시하여,
 * Google Forms(설문지)의 '참여 학생 선택' 체크박스 옵션을 자동으로 갱신(동기화)합니다.
 * 
 * [설정 방법]
 * 1. 구글 시트 상단 메뉴 [확장 프로그램] ➔ [Apps Script] 클릭
 * 2. 이 코드를 복사하여 붙여넣고 저장
 * 3. 코드 내부의 'FORM_ID' 변수에 사용 중인 구글 설문지의 고유 ID를 기재합니다.
 * 4. Apps Script 편집기 좌측 [트리거 (시계 아이콘)] ➔ [+ 트리거 추가] 클릭
 *    - 실행할 함수: updateStudentListInForm
 *    - 이벤트 소스: 스프레드시트에서
 *    - 이벤트 유형: 수정 시 (On edit)
 */

// 연결할 구글 설문지 고유 ID (설문지 편집 URL의 /d/ 와 /edit 사이의 문자열)
var FORM_ID = 'YOUR_GOOGLE_FORM_ID_HERE'; 

function updateStudentListInForm() {
  if (FORM_ID === 'YOUR_GOOGLE_FORM_ID_HERE') {
    Logger.log('경고: FORM_ID가 설정되지 않았습니다. Apps Script 설정을 완료해 주세요.');
    return;
  }

  try {
    // 1. 구글 설문지 열기
    var form = FormApp.openById(FORM_ID);
    
    // 2. 구글 시트의 'Students' 탭 로드
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Students');
    
    if (!sheet) {
      Logger.log("에러: 'Students' 이름의 시트 탭을 찾을 수 없습니다.");
      return;
    }
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      Logger.log("알림: 'Students' 시트에 데이터가 비어 있습니다.");
      return;
    }
    
    // 3. 헤더 인덱스 찾기
    var header = data[0];
    var idIdx = header.indexOf('student_id');
    var nameIdx = header.indexOf('name_ko');
    var gradeIdx = header.indexOf('grade');
    
    if (idIdx === -1 || nameIdx === -1 || gradeIdx === -1) {
      Logger.log("에러: Students 시트의 필수 열(student_id, name_ko, grade)이 누락되었습니다.");
      return;
    }
    
    // 4. "이름 (학년 - 학번)" 형식의 문자열 배열 목록 빌드
    var studentOptions = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var id = row[idIdx];
      var name = row[nameIdx];
      var grade = row[gradeIdx];
      
      if (id && name) {
        studentOptions.push(name + " (" + grade + " - " + id + ")");
      }
    }
    
    // 5. 설문지에서 '참여 학생 선택' 질문을 찾아 옵션 목록 갱신
    var items = form.getItems();
    var found = false;
    
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      // 질문 제목이 "참여 학생 선택"인 체크박스 문항 검색
      if (item.getTitle() === "참여 학생 선택" && item.getType() === FormApp.ItemType.CHECKBOX) {
        var checkboxItem = item.asCheckboxItem();
        checkboxItem.setChoiceValues(studentOptions); // 옵션 일괄 덮어쓰기
        found = true;
        Logger.log('성공: 참여 학생 선택 옵션이 총 ' + studentOptions.length + '명으로 동기화되었습니다.');
        break;
      }
    }
    
    if (!found) {
      Logger.log("경고: 설문지에서 제목이 '참여 학생 선택'인 체크박스 질문을 찾을 수 없습니다. 질문 명칭을 확인해 주세요.");
    }
    
  } catch (error) {
    Logger.log('에러 발생: ' + error.toString());
  }
}
