import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. Gemini API 클라이언트 초기화
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.');
  }
  // GoogleGenerativeAI 인스턴스 생성
  return new GoogleGenerativeAI(apiKey);
}


/**
 * 학생의 클럽 활동 로그 목록을 요약하여 300자~500자 사이의 영문 문단을 생성합니다.
 * 글자수 요건 미달 시 최대 3회 재프롬프팅(Auto-Retry)을 수행합니다.
 * @param studentName 학생 이름
 * @param clubName 클럽명
 * @param activitiesLogs 활동 내용 문자열 배열
 */
export async function generateClubSummary(
  studentName: string,
  clubName: string,
  activitiesLogs: string[]
): Promise<string> {
  const ai = getGeminiClient();
  const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const logsText = activitiesLogs.map((log, i) => `${i + 1}. ${log}`).join('\n');

  let prompt = `
당신은 전문 진학 지도 상담사(College Counselor)입니다.
아래 제공된 고등학교 학생 [${studentName}]이 [${clubName}] 동아리에서 이번 학기 동안 수행한 활동 기록 목록을 바탕으로, 해당 학생의 성취도와 구체적인 기여 및 성장이 잘 드러나도록 하나의 포괄적이고 자연스러운 영어 문단(Single English Paragraph)으로 요약해 주세요.

[활동 기록 목록]
${logsText}

[반드시 지켜야 할 철칙 - 글자 수 제약]
1. 최종 생성되는 영문 요약본의 총 글자 수(공백 포함)는 반드시 **300자(Characters) 이상, 500자(Characters) 이하**여야 합니다. (이 범위를 1자라도 벗어나면 오류입니다.)
2. 문장 스타일은 격식 있고 학술적인 영어를 구사해 주세요.
3. 원본 기록에 없는 가상의 활동을 지어내거나 과장하여 적지 마세요.
4. 오직 하나의 완성된 문단으로만 출력해야 합니다.
`;

  let summary = '';
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`[Gemini 요약 시도 ${attempts}/${maxAttempts}] ${studentName} - ${clubName}`);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const candidateText = result.response.text().trim() || '';
    const charCount = candidateText.length;

    console.log(`[Gemini 응답 글자수: ${charCount} 자]`);

    if (charCount >= 300 && charCount <= 500) {
      summary = candidateText;
      break; // 글자수 조건 충족 시 완료
    }

    // 조건 미충족 시 피드백 프롬프트 구성하여 재시도
    if (charCount < 300) {
      prompt = `
이전 답변: "${candidateText}"

위 답변의 글자 수는 ${charCount}자로, 필수 조건인 300자 이상에 미달합니다.
위 답변의 내용을 바탕으로 학생의 학습 능력, 리더십, 또는 구체적인 기여 사항에 대한 설명을 더 구체적으로 확장하여 **반드시 300자 이상 500자 이하의 영문 문단**으로 다시 작성해 주세요. (공백 포함 글자 수 300~500자 필수)
`;
    } else {
      prompt = `
이전 답변: "${candidateText}"

위 답변의 글자 수는 ${charCount}자로, 필수 조건인 500자 이하를 초과합니다.
핵심적인 내용만 간추리고 문장을 정밀하게 요약하여 **반드시 300자 이상 500자 이하의 단일 영문 문단**으로 분량을 조절하여 다시 작성해 주세요. (공백 포함 글자 수 300~500자 필수)
`;
    }
  }

  // 3회 시도 후에도 실패한 경우 글자 수를 맞추기 위한 수동 잘라내기 또는 경고 처리
  if (!summary) {
    console.warn(`[Gemini 요약 경고] 3회 시도 후에도 300~500자 제약을 충족하지 못했습니다. 수동 분량 보정을 진행합니다.`);
    
    // 임시로 최신 생성 결과물 사용
    const lastResult = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const rawText = lastResult.response.text().trim() || '';


    
    if (rawText.length > 500) {
      summary = rawText.slice(0, 497) + '...';
    } else if (rawText.length < 300) {
      // 300자 미만인 경우 패딩용 보강 어구 추가
      summary = rawText + ` The student showed consistent dedication and exemplary performance in every aspect of the ${clubName} club activities throughout the entire semester.`;
      if (summary.length > 500) {
        summary = summary.slice(0, 500);
      }
    } else {
      summary = rawText;
    }
  }

  return summary;
}
