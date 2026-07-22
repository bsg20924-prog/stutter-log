// 자가 진단 테스트용 단어 데이터셋.
// 각 단어는 화면 표시용 그룹(groupId), 초성(첫소리) 기준 물리적 막힘
// 메커니즘(mechanism), 그리고 발음 기관 히트맵용 조음 위치(zone)를 가진다.
// - mechanism: 추천 전략 계산용 (공기/후두/조음)
// - zone: ArticulationMap 표시용 (입술/혀끝/입천장/연구개/성대)
// 한국어 파열음은 조음 방법(평음/된소리/거센소리)으로 묶이지만, 실제 막힘은
// 첫소리의 조음 위치에서 일어나므로 ㄱ/ㅋ(연구개음)은 그룹과 무관하게 후두
// 긴장·연구개로 매핑한다.

import { ArticulationZone } from '../utils/phonetics';

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
  groupId: string;        // 내부 태그 (id 생성용). 영어 단어는 en-* 로 유지.
  displayGroupId: string; // 화면 표시용 카테고리 — 항상 한국어 그룹. 영어 단어는 한국어 버킷으로 매핑.
  mechanism: Exclude<MechanismId, 'core-breathing'>;
  zone: ArticulationZone;
}

// 표시용 카테고리는 한국어 7종만 존재한다. 영어 단어는 displayGroupId 로 이 중 하나에 편입된다.
export const DIAGNOSTIC_GROUPS: DiagnosticGroup[] = [
  { id: 'ko-monophthong',       language: 'ko', label: '단모음',                  sublabel: '모음 · 공기 흐름 시작' },
  { id: 'ko-diphthong',         language: 'ko', label: '이중모음',                sublabel: '활음 · 성대 진입' },
  { id: 'ko-plain-plosive',     language: 'ko', label: '평음 (ㅂ/ㄷ/ㄱ)',         sublabel: '예사소리 파열음' },
  { id: 'ko-tense-plosive',     language: 'ko', label: '된소리 (ㅃ/ㄸ/ㄲ)',        sublabel: '경음 파열음' },
  { id: 'ko-aspirated-plosive', language: 'ko', label: '거센소리 (ㅍ/ㅌ/ㅋ)',      sublabel: '격음 파열음' },
  { id: 'ko-nasal-liquid',      language: 'ko', label: '비음·유음 (ㄴ/ㄹ/ㅁ)',     sublabel: '울림소리' },
  { id: 'ko-fricative-affricate', language: 'ko', label: '마찰·파찰음 (ㅅ/ㅆ/ㅈ/ㅉ/ㅊ)', sublabel: '마찰·파찰음' },
];

// 한국어 단어: [단어, 메커니즘, 조음위치] — displayGroupId 는 groupId 와 동일
type KoSeed = [word: string, mechanism: DiagnosticWord['mechanism'], zone: ArticulationZone];
// 영어 단어: [단어, 메커니즘, 조음위치, 한국어 표시 카테고리]
type EnSeed = [word: string, mechanism: DiagnosticWord['mechanism'], zone: ArticulationZone, displayGroupId: string];

const KO_SEED: Record<string, KoSeed[]> = {
  'ko-monophthong': [
    ['아침', 'airflow-glottal', '성대'], ['어머니', 'airflow-glottal', '성대'], ['오리', 'airflow-glottal', '성대'],
    ['우유', 'airflow-glottal', '성대'], ['으뜸', 'airflow-glottal', '성대'],
  ],
  'ko-diphthong': [
    ['야구', 'airflow-glottal', '성대'], ['여우', 'airflow-glottal', '성대'], ['요리', 'airflow-glottal', '성대'],
    ['유리', 'airflow-glottal', '성대'], ['와인', 'airflow-glottal', '성대'], ['웨이터', 'airflow-glottal', '성대'],
    ['위성', 'airflow-glottal', '성대'], ['의사', 'airflow-glottal', '성대'],
  ],
  'ko-plain-plosive': [
    ['바다', 'articulatory-forcing', '입술'], ['다리', 'articulatory-forcing', '혀끝'], ['가방', 'laryngeal-tension', '연구개'],
  ],
  'ko-tense-plosive': [
    ['뿌리', 'articulatory-forcing', '입술'], ['토끼', 'articulatory-forcing', '혀끝'], ['코끼리', 'laryngeal-tension', '연구개'],
  ],
  'ko-aspirated-plosive': [
    ['파도', 'articulatory-forcing', '입술'], ['태양', 'articulatory-forcing', '혀끝'], ['기차', 'laryngeal-tension', '연구개'],
  ],
  'ko-nasal-liquid': [
    ['나무', 'articulatory-forcing', '혀끝'], ['라디오', 'articulatory-forcing', '혀끝'], ['모자', 'articulatory-forcing', '입술'],
  ],
  'ko-fricative-affricate': [
    ['사과', 'airflow-glottal', '혀끝'], ['쓰레기', 'airflow-glottal', '혀끝'], ['자동차', 'airflow-glottal', '입천장'],
    ['짜장면', 'airflow-glottal', '입천장'], ['치마', 'airflow-glottal', '입천장'],
  ],
};

// 영어 단어는 초성(자음군은 주 초성)의 음향적 성질에 따라 한국어 카테고리로 편입:
//  모음: 단모음 vs 이중모음 / 유성 파열음 B·D·G → 평음 / 무성 유기 파열음 P·T·K → 거센소리
//  마찰·파찰음 S·F·V·TH·Z → 마찰·파찰음 / 비음·유음 M·N·L → 비음·유음 / 자음군 → 주 초성 기준
const EN_SEED: Record<string, EnSeed[]> = {
  'en-vowel': [
    ['Apple', 'airflow-glottal', '성대', 'ko-monophthong'],
    ['Elephant', 'airflow-glottal', '성대', 'ko-monophthong'],
    ['Umbrella', 'airflow-glottal', '성대', 'ko-monophthong'],
    ['Ocean', 'airflow-glottal', '성대', 'ko-diphthong'],
    ['Ice', 'airflow-glottal', '성대', 'ko-diphthong'],
  ],
  'en-bilabial': [
    ['Paper', 'articulatory-forcing', '입술', 'ko-aspirated-plosive'],  // P
    ['Banana', 'articulatory-forcing', '입술', 'ko-plain-plosive'],      // B
    ['Morning', 'articulatory-forcing', '입술', 'ko-nasal-liquid'],      // M
  ],
  'en-alveolar': [
    ['Table', 'articulatory-forcing', '혀끝', 'ko-aspirated-plosive'],   // T
    ['Door', 'articulatory-forcing', '혀끝', 'ko-plain-plosive'],        // D
    ['Night', 'articulatory-forcing', '혀끝', 'ko-nasal-liquid'],        // N
    ['Lemon', 'articulatory-forcing', '혀끝', 'ko-nasal-liquid'],        // L
  ],
  'en-velar': [
    ['Coffee', 'laryngeal-tension', '연구개', 'ko-aspirated-plosive'],   // K
    ['Garden', 'laryngeal-tension', '연구개', 'ko-plain-plosive'],       // G
    ['King', 'laryngeal-tension', '연구개', 'ko-aspirated-plosive'],     // K
  ],
  'en-fricative': [
    ['Sun', 'airflow-glottal', '혀끝', 'ko-fricative-affricate'],
    ['Fish', 'airflow-glottal', '입술', 'ko-fricative-affricate'],
    ['Voice', 'airflow-glottal', '입술', 'ko-fricative-affricate'],
    ['Think', 'airflow-glottal', '혀끝', 'ko-fricative-affricate'],
    ['Zebra', 'airflow-glottal', '혀끝', 'ko-fricative-affricate'],
  ],
  'en-cluster': [
    ['Street', 'articulatory-forcing', '혀끝', 'ko-fricative-affricate'], // /s/
    ['Train', 'articulatory-forcing', '혀끝', 'ko-aspirated-plosive'],    // /t/
    ['Stop', 'articulatory-forcing', '혀끝', 'ko-fricative-affricate'],   // /s/
    ['Play', 'articulatory-forcing', '입술', 'ko-aspirated-plosive'],     // /p/
    ['Clock', 'laryngeal-tension', '연구개', 'ko-aspirated-plosive'],     // /k/
  ],
};

function buildKoWords(seed: Record<string, KoSeed[]>): DiagnosticWord[] {
  const words: DiagnosticWord[] = [];
  for (const [groupId, entries] of Object.entries(seed)) {
    entries.forEach(([word, mechanism, zone], i) => {
      words.push({ id: `${groupId}-${i + 1}`, word, groupId, displayGroupId: groupId, mechanism, zone });
    });
  }
  return words;
}

function buildEnWords(seed: Record<string, EnSeed[]>): DiagnosticWord[] {
  const words: DiagnosticWord[] = [];
  for (const [groupId, entries] of Object.entries(seed)) {
    entries.forEach(([word, mechanism, zone, displayGroupId], i) => {
      words.push({ id: `${groupId}-${i + 1}`, word, groupId, displayGroupId, mechanism, zone });
    });
  }
  return words;
}

export const koreanDiagnosticWords: DiagnosticWord[] = buildKoWords(KO_SEED);
export const englishDiagnosticWords: DiagnosticWord[] = buildEnWords(EN_SEED);

const ALL_WORDS: DiagnosticWord[] = [...koreanDiagnosticWords, ...englishDiagnosticWords];

// 언어 선택 없이 진행하는 통합 진단 세트 (한국어 16 + 영어 12 = 28문항).
// 단모음·이중모음·평음/된소리/거센소리·비음/유음·마찰/파찰음·자음군을 두 언어에서 대표로 포함.
const UNIFIED_WORDS: string[] = [
  '아침', '오리', '야구', '의사',
  '바다', '다리', '가방', '뿌리', '코끼리',
  '파도', '태양', '기차', '나무', '모자', '사과', '치마',
  'Apple', 'Ice', 'Paper', 'Table', 'Door',
  'Coffee', 'King', 'Sun', 'Fish', 'Street', 'Play', 'Clock',
];

export const unifiedDiagnosticWords: DiagnosticWord[] = UNIFIED_WORDS
  .map(w => ALL_WORDS.find(x => x.word === w))
  .filter((w): w is DiagnosticWord => Boolean(w));

export function getDiagnosticWords(language: DiagnosticLanguage): DiagnosticWord[] {
  return language === 'ko' ? koreanDiagnosticWords : englishDiagnosticWords;
}

export function getDiagnosticGroup(groupId: string): DiagnosticGroup | undefined {
  return DIAGNOSTIC_GROUPS.find(g => g.id === groupId);
}
