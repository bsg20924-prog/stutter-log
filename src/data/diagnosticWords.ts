// 자가 진단 테스트용 단어 데이터셋.
// 각 단어는 화면 표시용 그룹(groupId)과, 초성(첫소리) 기준으로 판단한
// 물리적 막힘 메커니즘(mechanism)을 함께 가진다. 한국어 파열음은 조음 방법
// (평음/된소리/거센소리)으로 묶이지만, 실제 막힘은 첫소리의 조음 위치에서
// 일어나므로 ㄱ/ㅋ(연구개음)은 그룹과 무관하게 후두 긴장으로 매핑한다.

export type DiagnosticLanguage = 'ko' | 'en';

export type MechanismId =
  | 'airflow-glottal'      // 공기 흐름 / 성문 잠김
  | 'laryngeal-tension'    // 후두 긴장
  | 'articulatory-forcing' // 조음 기관 힘주기
  | 'core-breathing';      // 호흡 / 코어 긴장 (전반적 패턴 — 단어 태그로는 쓰이지 않음)

export interface DiagnosticGroup {
  id: string;
  language: DiagnosticLanguage;
  label: string;    // 표시명
  sublabel: string; // 음성학 분류 설명
}

export interface DiagnosticWord {
  id: string;       // 두 언어 통틀어 고유
  word: string;
  groupId: string;
  mechanism: Exclude<MechanismId, 'core-breathing'>;
}

export const DIAGNOSTIC_GROUPS: DiagnosticGroup[] = [
  // ── 한국어 ──
  { id: 'ko-monophthong',       language: 'ko', label: '단모음',                  sublabel: '모음 · 공기 흐름 시작' },
  { id: 'ko-diphthong',         language: 'ko', label: '이중모음',                sublabel: '활음 · 성대 진입' },
  { id: 'ko-plain-plosive',     language: 'ko', label: '평음 (ㅂ/ㄷ/ㄱ)',         sublabel: '예사소리 파열음' },
  { id: 'ko-tense-plosive',     language: 'ko', label: '된소리 (ㅃ/ㄸ/ㄲ)',        sublabel: '경음 파열음' },
  { id: 'ko-aspirated-plosive', language: 'ko', label: '거센소리 (ㅍ/ㅌ/ㅋ)',      sublabel: '격음 파열음' },
  { id: 'ko-nasal-liquid',      language: 'ko', label: '비음·유음 (ㄴ/ㄹ/ㅁ)',     sublabel: '울림소리' },
  { id: 'ko-fricative-affricate', language: 'ko', label: '마찰·파찰음 (ㅅ/ㅆ/ㅈ/ㅉ/ㅊ)', sublabel: '마찰·파찰음' },

  // ── English ──
  { id: 'en-vowel',     language: 'en', label: 'Vowels',            sublabel: 'Short & Long Vowels' },
  { id: 'en-bilabial',  language: 'en', label: 'Bilabials (P/B/M)', sublabel: 'Lips' },
  { id: 'en-alveolar',  language: 'en', label: 'Alveolar (T/D/N/L)', sublabel: 'Tongue tip' },
  { id: 'en-velar',     language: 'en', label: 'Velar (K/G)',       sublabel: 'Throat / back of tongue' },
  { id: 'en-fricative', language: 'en', label: 'Fricatives (S/F/V/TH/Z)', sublabel: 'Airflow constriction' },
  { id: 'en-cluster',   language: 'en', label: 'Clusters',          sublabel: 'Consonant clusters' },
];

type Seed = [word: string, mechanism: DiagnosticWord['mechanism']];

const KO_SEED: Record<string, Seed[]> = {
  'ko-monophthong': [
    ['아침', 'airflow-glottal'], ['어머니', 'airflow-glottal'], ['오리', 'airflow-glottal'],
    ['우유', 'airflow-glottal'], ['으뜸', 'airflow-glottal'],
  ],
  'ko-diphthong': [
    ['야구', 'airflow-glottal'], ['여우', 'airflow-glottal'], ['요리', 'airflow-glottal'],
    ['유리', 'airflow-glottal'], ['와인', 'airflow-glottal'], ['웨이터', 'airflow-glottal'],
    ['위성', 'airflow-glottal'], ['의사', 'airflow-glottal'],
  ],
  'ko-plain-plosive': [
    ['바다', 'articulatory-forcing'], ['다리', 'articulatory-forcing'], ['가방', 'laryngeal-tension'],
  ],
  'ko-tense-plosive': [
    ['뿌리', 'articulatory-forcing'], ['토끼', 'articulatory-forcing'], ['코끼리', 'laryngeal-tension'],
  ],
  'ko-aspirated-plosive': [
    ['파도', 'articulatory-forcing'], ['태양', 'articulatory-forcing'], ['기차', 'laryngeal-tension'],
  ],
  'ko-nasal-liquid': [
    ['나무', 'articulatory-forcing'], ['라디오', 'articulatory-forcing'], ['모자', 'articulatory-forcing'],
  ],
  'ko-fricative-affricate': [
    ['사과', 'airflow-glottal'], ['쓰레기', 'airflow-glottal'], ['자동차', 'airflow-glottal'],
    ['짜장면', 'airflow-glottal'], ['치마', 'airflow-glottal'],
  ],
};

const EN_SEED: Record<string, Seed[]> = {
  'en-vowel': [
    ['Apple', 'airflow-glottal'], ['Elephant', 'airflow-glottal'], ['Umbrella', 'airflow-glottal'],
    ['Ocean', 'airflow-glottal'], ['Ice', 'airflow-glottal'],
  ],
  'en-bilabial': [
    ['Paper', 'articulatory-forcing'], ['Banana', 'articulatory-forcing'], ['Morning', 'articulatory-forcing'],
  ],
  'en-alveolar': [
    ['Table', 'articulatory-forcing'], ['Door', 'articulatory-forcing'], ['Night', 'articulatory-forcing'],
    ['Lemon', 'articulatory-forcing'],
  ],
  'en-velar': [
    ['Coffee', 'laryngeal-tension'], ['Garden', 'laryngeal-tension'], ['King', 'laryngeal-tension'],
  ],
  'en-fricative': [
    ['Sun', 'airflow-glottal'], ['Fish', 'airflow-glottal'], ['Voice', 'airflow-glottal'],
    ['Think', 'airflow-glottal'], ['Zebra', 'airflow-glottal'],
  ],
  'en-cluster': [
    ['Street', 'articulatory-forcing'], ['Train', 'articulatory-forcing'], ['Stop', 'articulatory-forcing'],
    ['Play', 'articulatory-forcing'], ['Clock', 'articulatory-forcing'],
  ],
};

function buildWords(seed: Record<string, Seed[]>): DiagnosticWord[] {
  const words: DiagnosticWord[] = [];
  for (const [groupId, entries] of Object.entries(seed)) {
    entries.forEach(([word, mechanism], i) => {
      words.push({ id: `${groupId}-${i + 1}`, word, groupId, mechanism });
    });
  }
  return words;
}

export const koreanDiagnosticWords: DiagnosticWord[] = buildWords(KO_SEED);
export const englishDiagnosticWords: DiagnosticWord[] = buildWords(EN_SEED);

export function getDiagnosticWords(language: DiagnosticLanguage): DiagnosticWord[] {
  return language === 'ko' ? koreanDiagnosticWords : englishDiagnosticWords;
}

export function getDiagnosticGroup(groupId: string): DiagnosticGroup | undefined {
  return DIAGNOSTIC_GROUPS.find(g => g.id === groupId);
}
