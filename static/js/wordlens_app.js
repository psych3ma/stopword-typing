// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
var csvRows = [], headers = [], colInfo = {};
var stopwords = new Set();
var selectedCols = new Set();
var wordFreq = {};
var lastPlacedWords = [];
var activePalette = 0;
var useJosaStrip = true;
var analysisMode = 'all';
var groupCol = '';
var localStopwords = new Map();

// ★ v3.2: 팔레트 스마트 토글 상태
// paletteSeparate: false = 전체·그룹 동일, true = 모드별 독립 선택
// paletteGroup: 개별 모드 시 그룹 전용 팔레트 인덱스
var paletteSeparate = false;
var paletteGroup    = 1;  // 기본값: Vivid (전체와 구분)

// ★ 내보내기 상태 — mode별 독립 관리
var exportState = {
  all:   { content: new Set(['wc']), bg: 'white' },
  group: { content: new Set(['wc']), bg: 'white', scope: 'overview', selectedGroup: '' }
};

// QA 저장 모드: 브라우저 다운로드(기본) + 선택 디렉토리 구조 저장
var qaSaveConfig = {
  useFolder: false,
  rootHandle: null,
  runId: '',
  seqByScenario: {}
};

function dispatchAppAction(type, payload) {
  var p = payload || {};
  if (type === 'SET_MODE') {
    analysisMode = p.mode;
    return;
  }
  if (type === 'SET_USE_JOSA') {
    useJosaStrip = !!p.value;
    return;
  }
  if (type === 'SELECT_COL') {
    selectedCols.add(p.col);
    return;
  }
  if (type === 'DESELECT_COL') {
    selectedCols.delete(p.col);
    return;
  }
  if (type === 'CLEAR_SELECTED_COLS') {
    selectedCols.clear();
    return;
  }
  if (type === 'SET_GROUP_COL') {
    groupCol = p.groupCol || '';
    return;
  }
  if (type === 'RESET_LOCAL_STOPWORDS') {
    localStopwords = new Map();
  }
}

// ★ v3.1: 빈도표 설정 상태
// cols: 표출할 컬럼 Set (rank/word/count/ratio/cumul)
// topN: 표출 행 수 (0 = 전체, 상한 MAX_FREQ_DISPLAY)
//        v3.4: select → number input 으로 변경, 0은 전체 의미 유지
var freqTableConfig = {
  cols: new Set(['rank', 'word', 'count', 'ratio']),
  topN: 30   // 기본값 — freqTopNInput 초기값과 일치
};

// ★ v3.4: 전체 단어 수 캐시 — TopN 직접 입력 최댓값 산출용
// buildFreq 호출 후 갱신
var freqTotalWordCount = 0;

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
var WC_W   = 900, WC_H   = 500;
var FREQ_W = 420, FREQ_H = 500;
var GROUP_W = 600, GROUP_H = 280;
var FREQ_TOP_N = 30;   // 빈도표 Top N (DOM 탭 표시 기본값)
var MAX_FREQ_DISPLAY = 200; // 표출 '전체' 선택 시 상한 — 성능 보호

// ═══════════════════════════════════════════
// ★ v3.3: 병합 레이아웃 상수 & 설정
// ─────────────────────────────────────────
// 비율 조정 규칙:
//   MERGED_TOTAL_W       → 전체 폭 (고정)
//   mergedLayoutConfig.wcRatio  → WC 영역 비율 (0.30~0.80)
//   FREQ_W = TOTAL × (1-ratio) - MERGED_DIVIDER_W
//   RATIO_TEXT_W         → 비율% 텍스트 전용 폭 (잘림 방지)
// 변경 시 이 블록만 수정하면 전체 반영
// ═══════════════════════════════════════════
var MERGED_TOTAL_W    = 1400; // 병합 PNG 전체 폭 (px)
var MERGED_DIVIDER_W  = 2;    // WC-FREQ 구분선 폭 (px)
// 구분선 색상 — 이슈2 수정: 흰배경에서 가독성 저해하는 선 대신 제거(투명)
// 빈도표 자체 배경(FREQ_E_BG)으로 영역 구분
var MERGED_DIVIDER_COLOR_DARK  = 'rgba(0,0,0,0)';   // 완전 투명 — 선 없음
var MERGED_DIVIDER_COLOR_LIGHT = 'rgba(0,0,0,0)';   // 완전 투명 — 선 없음
// 빈도표 영역 배경색 — WC 영역과 자연스럽게 구분
var FREQ_E_BG_DARK  = 'rgba(21,23,26,0.96)';   // dark 배경
var FREQ_E_BG_LIGHT = 'rgba(248,248,246,0.98)'; // light/white 배경
var RATIO_TEXT_W      = 40;   // 비율% 텍스트 전용 확보 폭 (잘림 방지)
var FREQ_COL_GAP      = 6;    // 빈도표 컬럼 간 간격
var MERGED_RATIO_MIN  = 0.30; // WC 비율 최솟값

// ═══════════════════════════════════════════
// ★ v3.4: 버전E 빈도표 캔버스 레이아웃 상수
// 도트 바 스타일 — 여기만 수정하면 전체 반영
// ═══════════════════════════════════════════
var FREQ_E_DOT_COUNT   = 12;   // 도트 총 개수
var FREQ_E_DOT_SIZE    = 6;    // 도트 지름 (px)
var FREQ_E_DOT_GAP     = 3;    // 도트 간격 (px)
var FREQ_E_DOT_SECTION = FREQ_E_DOT_COUNT * (FREQ_E_DOT_SIZE + FREQ_E_DOT_GAP); // 도트 영역 전체 폭
// 폰트 크기 위계: [1위, 2~4위, 5위 이하]
var FREQ_E_FONT_SIZES  = [16, 13, 11];
var FREQ_E_FONT_WEIGHTS= [500, 500, 400];
// 컬럼명 헤더: 타이틀행 + 컬럼명행 2줄로 분리
var FREQ_E_TITLE_H   = 20;  // 타이틀 행
var FREQ_E_COLHDR_H  = 18;  // 컬럼명 행
var FREQ_E_HEADER_H  = FREQ_E_TITLE_H + FREQ_E_COLHDR_H; // 38px
// ctx.font 전용 폰트 스택 상수
var FREQ_CANVAS_FONT   = "DM Mono, monospace";

// ═══════════════════════════════════════════
// ★ v3.5: 빈도표 컬럼 비율 & 최솟값
// freqW(가변)에 대한 비율로 정의 → 자료 무관 일반화된 너비
// 비율 합계 = rank + word + count + cumul ≈ 0.65
// 나머지(≈0.35) = ratio 컬럼(도트 영역)이 흡수
// ═══════════════════════════════════════════
var FREQ_COL_RATIO = {
  rank:  0.08,   // 순위 — 2자리 숫자 + 여백
  word:  0.26,   // 단어 — 한국어 7~8자 기준
  count: 0.14,   // 빈도 — 최대 5자리 숫자
  cumul: 0.17    // 누적 — "100.0%" 최대값 기준
  // ratio: 나머지 전체 흡수 (계산으로 결정)
};
// 각 컬럼 최솟값(px) — 비율 계산값이 이 값보다 작으면 이 값 사용
var FREQ_COL_MIN_W = {
  rank:  24,
  word:  80,
  count: 44,
  cumul: 50
};

// ★ v3.5: 컬럼명 레이블 상수
// 한 곳에서 관리 — DOM 테이블 · PNG 캔버스 모두 이 값 참조
var FREQ_COL_LABELS = {
  rank:  '순위',
  word:  '단어',
  count: '빈도',
  ratio: '비율',
  cumul: '누적'
};

// ★ v3.5: 버전B 1위 행 강조 설정
// 배경색 + 폰트 크기 업스케일 비율
var FREQ_RANK1_BG_DARK  = 'rgba(79,163,224,0.14)';  // dark 배경 시
var FREQ_RANK1_BG_LIGHT = 'rgba(79,163,224,0.10)';  // light/white 배경 시
var FREQ_RANK1_FONT_SCALE = 1.15;  // 1위 폰트 크기 배율 (vs 2~4위)

// ═══════════════════════════════════════════
// ★ v3.6: 그룹 패널 그룹명 텍스트 스타일
// 합성 순서 수정(P0): WC 위에 그룹명을 마지막으로 그려 가시성 보장
// ═══════════════════════════════════════════
// 투명 배경에서 텍스트 가시성 보장 — 배경 무관 shadow 처리
var GROUP_LABEL_SHADOW_COLOR   = 'rgba(0,0,0,0.55)';   // 라이트 배경용 shadow
var GROUP_LABEL_SHADOW_COLOR_D = 'rgba(255,255,255,0.4)'; // dark 배경용 shadow
var GROUP_LABEL_SHADOW_BLUR    = 4;  // shadow blur 반경(px)
var GROUP_LABEL_TEXT_COLOR     = '#f0f0ee'; // 헤더 영역 그룹명 기본 색상
var MERGED_RATIO_MAX  = 0.80; // WC 비율 최댓값
var MERGED_RATIO_DEFAULT = 0.60; // 기본 WC 비율
// 프리셋 목록 — 이 배열 수정 시 UI 자동 반영
var MERGED_RATIO_PRESETS = [
  { label: '3:7', value: 0.30 },
  { label: '4:6', value: 0.40 },
  { label: '5:5', value: 0.50 },
  { label: '6:4', value: 0.60 },
  { label: '7:3', value: 0.70 },
];
var MERGED_LAYOUT_STORAGE_KEY = 'wordlens_mergedLayout'; // localStorage 키

/**
 * mergedLayoutConfig — 병합 레이아웃 영속 설정
 * localStorage 연동: 변경 즉시 저장, 페이지 로드 시 복원
 */
var mergedLayoutConfig = (function() {
  var defaults = { wcRatio: MERGED_RATIO_DEFAULT };
  try {
    var saved = localStorage.getItem(MERGED_LAYOUT_STORAGE_KEY);
    if (saved) {
      var parsed = JSON.parse(saved);
      // 범위 검증 — 저장값이 유효 범위 벗어나면 기본값
      if (typeof parsed.wcRatio === 'number'
          && parsed.wcRatio >= MERGED_RATIO_MIN
          && parsed.wcRatio <= MERGED_RATIO_MAX) {
        return parsed;
      }
    }
  } catch(e) { /* localStorage 접근 불가 시 기본값 사용 */ }
  return defaults;
})();

/** mergedLayoutConfig 저장 헬퍼 */
function _saveMergedLayout() {
  try {
    localStorage.setItem(MERGED_LAYOUT_STORAGE_KEY,
      JSON.stringify(mergedLayoutConfig));
  } catch(e) { /* 저장 실패 시 무시 */ }
}

// ═══════════════════════════════════════════
// ★ v3.3: 병합 비율 UI 핸들러
// ═══════════════════════════════════════════

/**
 * buildMergedRatioUI()
 * 프리셋 칩을 MERGED_RATIO_PRESETS 배열로부터 동적 생성
 * 페이지 로드 시 1회 + 슬라이더/프리셋 변경 시 상태 동기화
 */
function buildMergedRatioUI() {
  ['All', 'Group'].forEach(function(suffix) {
    var presetsEl = document.getElementById('mergedRatioPresets' + suffix);
    if (!presetsEl) return;
    presetsEl.innerHTML = MERGED_RATIO_PRESETS.map(function(preset) {
      return '<button class="merged-ratio-preset-btn" '
        + 'data-value="' + preset.value + '" '
        + 'onclick="onMergedRatioPreset(this)">'
        + preset.label + '</button>';
    }).join('');
  });
  _syncMergedRatioUI();
}

/**
 * _syncMergedRatioUI()
 * mergedLayoutConfig.wcRatio → 슬라이더/프리셋/라벨 동기화
 */
function _syncMergedRatioUI() {
  var ratio  = mergedLayoutConfig.wcRatio;
  var pct    = Math.round(ratio * 100);
  var freqPct = 100 - pct;

  ['All', 'Group'].forEach(function(suffix) {
    var slider = document.getElementById('mergedRatioSlider' + suffix);
    var label  = document.getElementById('mergedRatioLabel'  + suffix);
    if (slider) slider.value = String(pct);
    if (label)  label.textContent = pct + '% : ' + freqPct + '%';

    // 프리셋 칩 활성 상태
    var presetsEl = document.getElementById('mergedRatioPresets' + suffix);
    if (!presetsEl) return;
    presetsEl.querySelectorAll('.merged-ratio-preset-btn').forEach(function(btn) {
      var presetPct = Math.round(parseFloat(btn.dataset.value) * 100);
      btn.classList.toggle('active', presetPct === pct);
    });
  });
}

/**
 * onMergedRatioPreset(el)
 * 프리셋 칩 클릭 핸들러
 */
function onMergedRatioPreset(el) {
  var value = parseFloat(el.dataset.value);
  if (isNaN(value)) return;
  mergedLayoutConfig.wcRatio = value;
  _saveMergedLayout();
  _syncMergedRatioUI();
  // export 힌트 갱신
  updateExportUI('all');
  updateExportUI('group');
}

/**
 * onMergedRatioSlider(el)
 * 슬라이더 변경 핸들러 (debounce로 localStorage 과호출 방지)
 */
var _mergedRatioSaveTimer = null;
function onMergedRatioSlider(el) {
  var pct   = parseInt(el.value, 10);
  var ratio = pct / 100;
  // 범위 클램프
  ratio = Math.min(MERGED_RATIO_MAX, Math.max(MERGED_RATIO_MIN, ratio));
  mergedLayoutConfig.wcRatio = ratio;

  // 라벨·프리셋 즉시 갱신 (저장은 debounce)
  _syncMergedRatioUI();
  updateExportUI('all');
  updateExportUI('group');

  // debounce 300ms — 드래그 중 과호출 방지
  clearTimeout(_mergedRatioSaveTimer);
  _mergedRatioSaveTimer = setTimeout(_saveMergedLayout, 300);
}

/**
 * _syncMergedRatioVisibility(mode)
 * 빈도표 체크 여부에 따라 비율 UI 노출/숨김
 * — 그룹 모드 오버뷰 선택 시 추가 힌트 표시
 */
function _syncMergedRatioVisibility(mode) {
  var suffix  = mode === 'all' ? 'All' : 'Group';
  var wrap    = document.getElementById('mergedRatioWrap' + suffix);
  if (!wrap) return;
  var state   = exportState[mode];
  var hasFreq = state.content.has('freq');
  var hasWC   = state.content.has('wc');
  var isMerged = hasFreq && hasWC;
  // 오버뷰 스코프는 비율 미적용 안내 (그룹 모드에서 overview 선택 시)
  var isOverview = (mode === 'group') && (state.scope === 'overview');
  wrap.classList.toggle('hidden', !isMerged || isOverview);
}

/**
 * getMergedDimensions()
 * 현재 wcRatio 기준으로 WC/FREQ 실제 픽셀 폭 계산
 * 반환: { wcW, freqW, totalW }
 */
function getMergedDimensions() {
  var ratio  = mergedLayoutConfig.wcRatio;
  var wcW    = Math.round(MERGED_TOTAL_W * ratio);
  var freqW  = MERGED_TOTAL_W - wcW - MERGED_DIVIDER_W;
  return { wcW: wcW, freqW: freqW, totalW: MERGED_TOTAL_W };
}

// ═══════════════════════════════════════════
// PALETTES — 8종
// 설계 원칙:
//   흰배경 가시성: WCAG 대비비 4.5:1 이상 색상 우선
//   dark배경 가시성: 밝은 채도 색상
//   확장 시 이 배열과 PALETTE_META만 추가하면 UI 자동 반영
// ═══════════════════════════════════════════
var PALETTES = [
  // 0. Neon — 형광 계열 (dark 배경 최적)
  ['#c8f060','#4fa3e0','#3ecfa0','#f0b840','#b090f0','#f06070','#60d0f0','#f09060'],
  // 1. Vivid — 고채도 원색 (dark·light 모두 양호)
  ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8','#20c997','#f783ac'],
  // 2. Bold — 진한 원색, 흰배경 최적 (WCAG AA 충족)
  ['#d62828','#f77f00','#006400','#0077b6','#6a0dad','#c9184a','#0096c7','#2d6a4f'],
  // 3. Earth — 테라코타·올리브·갈색 (흰배경 우수)
  ['#9b2226','#ae2012','#ca6702','#94d2bd','#0a9396','#005f73','#e9d8a6','#ee9b00'],
  // 4. Ocean — 딥블루·청록·인디고 (흰배경 우수)
  ['#03045e','#0077b6','#00b4d8','#023e8a','#48cae4','#0096c7','#ade8f4','#caf0f8'],
  // 5. Contrast — 명도 최대화 (흰·검 배경 모두 최적)
  ['#1a1a2e','#16213e','#0f3460','#533483','#e94560','#f5a623','#4caf50','#00bcd4'],
  // 6. Mono — 무채색 (dark 배경 전용)
  ['#e8e8e8','#c0c0c0','#a0a0a0','#808080','#606060','#d0d0d0','#f0f0f0','#b0b0b0'],
  // 7. Pastel — 연파스텔 (dark 배경 전용, 인쇄 부적합)
  ['#f4845f','#f7c59f','#efefd0','#90f1ef','#ffd6e0','#a8dadc','#457b9d','#e63946'],
];

// 팔레트 메타데이터 — UI 표시 및 가시성 경고에 활용
// sunIcon: true = 흰배경에서도 가시성 우수
var PALETTE_META = [
  { name: 'Neon',     sunIcon: false },
  { name: 'Vivid',    sunIcon: true  },
  { name: 'Bold',     sunIcon: true  },
  { name: 'Earth',    sunIcon: true  },
  { name: 'Ocean',    sunIcon: true  },
  { name: 'Contrast', sunIcon: true  },
  { name: 'Mono',     sunIcon: false },
  { name: 'Pastel',   sunIcon: false },
];
var GROUP_PANEL_COLORS = [
  '#4fa3e0','#3ecfa0','#f0b840','#b090f0','#f06070','#c8f060','#60d0f0','#f09060',
  '#ff6b6b','#6bcb77','#cc5de8','#f783ac','#457b9d','#e63946','#20c997','#ffd93d',
];

var SW_KO = ['이','그','저','것','수','등','및','를','을','이','가','은','는','의','에','도','로','으로','와','과','한','하다','있다','되다','않다','없다','그리고','하지만','그러나','또한','즉','때문에','때','더','매우','좀','잘','못','아','네','예','아니요','입니다','합니다','했습니다','있습니다','없습니다','습니다','이다','했다','하면','해서','해야','하여','위해','대한','관한','통해','위한','따라','같은','같이','많은','모든','각','각각','여러','다른','새로운','전체','경우','때문','문제','사용','가장','위','아래','중','안','밖','에서','까지','부터','에게','으로서','이며','이고','이나','이라','이라고','이란','이를','들이','들을','들의','들에','으며','어서','어도','어야','이어서','이어야','연구','연구자','논문','본','대해','대하여','에서의','에서는','에서도','이에','그에','이를','그를','그가','그의'];
var SW_EN = ['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','that','this','these','those','it','its','he','she','they','we','you','i','me','him','her','them','us','my','your','his','our','their','what','which','who','when','where','how','why','all','each','every','both','few','more','most','other','some','such','no','not','only','same','so','than','too','very','just','about','into','through','during','before','after','between','out','up','down','if','then','also','as','its','been','their','there','here','than','while'];

// ═══════════════════════════════════════════
// ★ P0: applyBg — 공통 배경 헬퍼
// 모든 저장 경로의 기반. 하드코딩 제거.
// ═══════════════════════════════════════════
var BG_COLORS = { dark: '#0e0f11', light: '#f8f8f6', white: '#ffffff' };

function applyBg(ctx, w, h, bg) {
  ctx.clearRect(0, 0, w, h);
  if (bg === 'transparent') return; // no fill — alpha=0 유지
  ctx.fillStyle = BG_COLORS[bg] || BG_COLORS.white;
  ctx.fillRect(0, 0, w, h);
}

// ═══════════════════════════════════════════
// JOSA STRIP
// ═══════════════════════════════════════════
var JOSA_SUFFIXES = [
  '에서는','에서도','에서의','에서가','에서를','에서와','에서만',
  '으로부터','로부터','에게서','에게도','에게는','에게를','에게와','에게만',
  '에서','에게','에는','에도','에만','에의',
  '으로서','로서','으로써','로써','으로는','로는','으로도','로도',
  '이라는','라는','이라고','라고','이라면','라면','이라도','라도',
  '이어서','여서','이어야','여야',
  '이었다','였다','이었고','였고','이었는데','였는데',
  '이지만','지만','이어도','여도',
  '으로','로','에서','에게','에도','에는','에의','에만','에',
  '이라','이며','이고','이나',
  '이가','이를','이은','이는',
  '까지','부터','만큼','처럼','같이','마다','조차','이나마','나마',
  '보다','대로','뿐만','뿐','만','도','만도',
  '의','를','을','이','가','은','는','과','와','에','도','로','서','게','고',
  '했습니다','합니다','됩니다','입니다','습니다','겠습니다',
  '한다','한다고','한다면','하는데','하지만','하여','하며','하고','해서',
  '됐','했','하였','한','하는','하던','했던',
  '이다','이며','이고','이나',
  '았다','었다','았고','었고','았는데','었는데',
  '다는','다고','다면','다가','다만',
  '음으로','음에','음을','음이',
  '는데','는지','는다','는','은데',
];
var MIN_STEM_LEN = (typeof NLP_CONFIG !== 'undefined' && NLP_CONFIG.josaMinStemLength) || 2;

function stripJosa(word) {
  var enKo = word.match(/^([a-z0-9]+)([\uAC00-\uD7A3]+)$/);
  if (enKo) return enKo[1];
  if (!/[\uAC00-\uD7A3]/.test(word)) return word;
  for (var i = 0; i < JOSA_SUFFIXES.length; i++) {
    var s = JOSA_SUFFIXES[i];
    if (word.endsWith(s) && word.length - s.length >= MIN_STEM_LEN)
      return word.slice(0, word.length - s.length);
  }
  return word;
}

// ═══════════════════════════════════════════
// CSV PARSER
// ═══════════════════════════════════════════
function parseCSV(text) {
  text = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  var rows=[], row=[], cell='', inQ=false, i=0;
  while(i<text.length){
    var ch=text[i];
    if(ch==='"'){if(inQ&&text[i+1]==='"'){cell+='"';i+=2;continue;}inQ=!inQ;i++;continue;}
    if(!inQ&&ch===','){row.push(cell);cell='';i++;continue;}
    if(!inQ&&ch==='\n'){row.push(cell);cell='';if(row.some(c=>c.trim()))rows.push(row);row=[];i++;continue;}
    cell+=ch;i++;
  }
  if(cell||row.length){row.push(cell);if(row.some(c=>c.trim()))rows.push(row);}
  if(!rows.length)return{headers:[],data:[]};
  var hdrs=rows[0].map(h=>h.trim());
  var data=rows.slice(1).map(r=>{var obj={};hdrs.forEach((h,i)=>obj[h]=(r[i]||'').trim());return obj;});
  return{headers:hdrs,data};
}

// ═══════════════════════════════════════════
// COLUMN ANALYSIS
// ═══════════════════════════════════════════
function analyzeCol(values) {
  var nonEmpty=values.filter(v=>v!==''&&v!==null&&v!==undefined);
  var missing=values.length-nonEmpty.length;
  var unique=new Set(nonEmpty).size;
  var numRatio=nonEmpty.filter(v=>!isNaN(v.replace(/,/g,'').replace(/%/g,''))).length/(nonEmpty.length||1);
  var avgLen=nonEmpty.reduce((s,v)=>s+v.length,0)/(nonEmpty.length||1);
  var type='text';
  if(!nonEmpty.length)type='empty';
  else if(numRatio>0.85)type='numeric';
  else if(avgLen>30)type='long_text';
  var recommended=(type==='text'||type==='long_text')&&unique>3;
  return{type,unique,missing,total:values.length,recommended,avgLen:Math.round(avgLen)};
}

function renderAnalysis(){
  var totalMissing=Object.values(colInfo).reduce((s,v)=>s+v.missing,0);
  var textCols=Object.values(colInfo).filter(v=>v.type==='text'||v.type==='long_text').length;
  var numCols=Object.values(colInfo).filter(v=>v.type==='numeric').length;
  var warn=document.getElementById('warnBanner');
  var suspicious=Object.entries(colInfo).filter(([h,v])=>v.type!=='numeric'&&v.unique>csvRows.length*0.8&&v.avgLen>40);
  if(suspicious.length){
    warn.classList.remove('hidden');
    document.getElementById('warnText').innerHTML=`<strong>${suspicious.map(([h])=>'"'+h+'"').join(', ')} 컬럼</strong>에 셀 내 줄바꿈이 감지되었습니다. 총 <strong>${csvRows.length}개 행</strong>으로 정상 파싱되었습니다.`;
  } else warn.classList.add('hidden');
  document.getElementById('metricsGrid').innerHTML=[
    ['전체 행 수',csvRows.length.toLocaleString(),'accent'],
    ['컬럼 수',headers.length,''],
    ['텍스트 컬럼',textCols,'blue'],
    ['숫자 컬럼',numCols,''],
    ['전체 결측값',totalMissing.toLocaleString(),totalMissing>0?'rose':''],
  ].map(([l,v,c])=>`<div class="metric-card"><div class="metric-label">${l}</div><div class="metric-value ${c}">${v}</div></div>`).join('');
  document.getElementById('colBody').innerHTML=headers.map((h,i)=>{
    var inf=colInfo[h];
    var pct=Math.round(inf.missing/inf.total*100);
    var bc=pct===0?'low':pct<20?'mid':'';
    var tb=inf.type==='long_text'?`<span class="badge badge-longtext">장문 텍스트</span>`:inf.type==='text'?`<span class="badge badge-text">텍스트</span>`:inf.type==='numeric'?`<span class="badge badge-num">숫자</span>`:`<span class="badge badge-other">기타</span>`;
    var rb=inf.recommended?`<span class="badge badge-rec">⭐ 추천</span>`:`<span style="color:var(--text3);font-size:12px;">—</span>`;
    return`<tr><td style="color:var(--text3);font-family:'DM Mono',monospace;font-size:12px;">${i+1}</td><td><span class="col-name">${h}</span></td><td>${tb}</td><td style="font-family:'DM Mono',monospace;font-size:13px;">${inf.unique.toLocaleString()}</td><td style="font-family:'DM Mono',monospace;font-size:13px;">${inf.missing.toLocaleString()}</td><td><span style="font-size:12px;color:var(--text2);font-family:'DM Mono',monospace;">${pct}%</span><span class="missing-bar-bg"><span class="missing-bar ${bc}" style="width:${pct}%"></span></span></td><td>${rb}</td></tr>`;
  }).join('');
  show('s2Wrap'); show('s3Wrap');
  document.getElementById('sn1').classList.add('done');
  document.getElementById('sn1').textContent='✓';
  renderColChips();
}

// ═══════════════════════════════════════════
// COLUMN CHIP SELECTOR
// ═══════════════════════════════════════════
function renderColChips(){
  dispatchAppAction('CLEAR_SELECTED_COLS');
  var grid=document.getElementById('colChipsGrid');
  var sorted=[...headers].sort((a,b)=>{
    var aT=colInfo[a].type==='text'||colInfo[a].type==='long_text';
    var bT=colInfo[b].type==='text'||colInfo[b].type==='long_text';
    return aT&&!bT?-1:!aT&&bT?1:0;
  });
  grid.innerHTML=sorted.map(h=>{
    var inf=colInfo[h];
    var isText=inf.type==='text'||inf.type==='long_text';
    var tl=inf.type==='long_text'?'장문텍스트':inf.type==='text'?'텍스트':inf.type==='numeric'?'숫자':'기타';
    return`<div class="col-chip-card ${isText?'recommended':''}" id="chip_${CSS.escape(h)}" onclick="toggleColChip('${h.replace(/'/g,"\\'")}')"><div class="col-chip-check" id="chk_${CSS.escape(h)}"></div><div class="col-chip-info"><div class="col-chip-name" title="${h}">${h}</div><div class="col-chip-meta"><span class="col-chip-type">${tl}</span><span style="color:var(--text3);margin-left:4px;">· ${inf.unique.toLocaleString()}개 고유값</span>${inf.recommended?'<span class="col-chip-rec">⭐</span>':''}</div></div></div>`;
  }).join('');
  sorted.filter(h=>colInfo[h].recommended).forEach(h=>_selectChip(h));
  updateColSelState();
  renderGroupChips();
}
function toggleColChip(h){selectedCols.has(h)?(_deselectChip(h)):(_selectChip(h));updateColSelState();}
function _selectChip(h){dispatchAppAction('SELECT_COL',{col:h});var c=document.getElementById('chip_'+CSS.escape(h));var k=document.getElementById('chk_'+CSS.escape(h));if(c)c.classList.add('selected');if(k)k.textContent='✓';}
function _deselectChip(h){dispatchAppAction('DESELECT_COL',{col:h});var c=document.getElementById('chip_'+CSS.escape(h));var k=document.getElementById('chk_'+CSS.escape(h));if(c)c.classList.remove('selected');if(k)k.textContent='';}
function selectAllTextCols(){headers.filter(h=>colInfo[h].type==='text'||colInfo[h].type==='long_text').forEach(h=>_selectChip(h));updateColSelState();}
function selectAllCols(){headers.forEach(h=>_selectChip(h));updateColSelState();}
function clearColSel(){[...selectedCols].forEach(h=>_deselectChip(h));updateColSelState();}
function updateColSelState(){
  var n=selectedCols.size;
  document.getElementById('selSummary').innerHTML=`<strong>${n}</strong>개 컬럼 선택됨`;
  updateStartBtn();
  var preview=document.getElementById('colMergedPreview');
  if(!n){preview.style.display='none';return;}
  preview.style.display='block';
  var colList=[...selectedCols];
  document.getElementById('colMergedLabel').textContent=n===1?`미리보기 · "${colList[0]}"`:  `미리보기 · ${n}개 컬럼 합산`;
  var sample=csvRows.slice(0,2).map(r=>colList.map(c=>r[c]||'').filter(v=>v).join(' | ')).filter(v=>v).join('  ···  ');
  document.getElementById('colMergedText').textContent=sample||'(값 없음)';
}
function onJosaToggle(){dispatchAppAction('SET_USE_JOSA',{value:document.getElementById('josaToggle').checked});}

// ═══════════════════════════════════════════
// MODE + GROUP
// ═══════════════════════════════════════════
function setMode(mode){
  dispatchAppAction('SET_MODE',{mode:mode});
  document.getElementById('modeTabAll').classList.toggle('active',mode==='all');
  document.getElementById('modeTabGroup').classList.toggle('active',mode==='group');
  document.getElementById('groupColWrap').classList.toggle('visible',mode==='group');
  // ★ v3.2: 그룹 모드 전환 시 팔레트 토글 노출 상태 갱신
  _syncPaletteSeparateUI();
  updateStartBtn();
}
function renderGroupChips(){
  dispatchAppAction('SET_GROUP_COL',{groupCol:''});
  var row=document.getElementById('groupChipsRow');
  var candidates=headers.filter(h=>{var inf=colInfo[h];return inf.unique>=2&&inf.unique<=30&&inf.type!=='numeric';});
  var rest=headers.filter(h=>!candidates.includes(h));
  row.innerHTML=[...candidates,...rest].map(h=>{
    var inf=colInfo[h];
    var isSugg=candidates.includes(h);
    return`<span class="group-chip ${isSugg?'suggested':''}" id="gchip_${CSS.escape(h)}" onclick="selectGroupCol('${h.replace(/'/g,"\\'")}')"> ${h} <span style="color:var(--text3);font-size:10px;">·${inf.unique}</span>${isSugg?'<span style="color:var(--purple);font-size:9px;">⭐</span>':''}</span>`;
  }).join('');
  document.getElementById('groupPreviewLine').innerHTML='';
}
function selectGroupCol(h){
  if(groupCol){var prev=document.getElementById('gchip_'+CSS.escape(groupCol));if(prev)prev.classList.remove('selected');}
  dispatchAppAction('SET_GROUP_COL',{groupCol:h});
  var el=document.getElementById('gchip_'+CSS.escape(h));if(el)el.classList.add('selected');
  var inf=colInfo[h];
  var uniqueVals=[...new Set(csvRows.map(r=>r[h]||'').filter(v=>v))].sort();
  var preview=uniqueVals.slice(0,6).map(v=>`<span>${v}</span>`).join(', ');
  document.getElementById('groupPreviewLine').innerHTML=`그룹 ${inf.unique}개: ${preview}${uniqueVals.length>6?' …':''}`;
  updateStartBtn();
}
function updateStartBtn(){
  var hasText=selectedCols.size>0;
  var hasGroup=analysisMode==='all'||(analysisMode==='group'&&groupCol!=='');
  document.getElementById('startBtn').disabled=!(hasText&&hasGroup);
}

// ═══════════════════════════════════════════
// ★ v3.1: 빈도표 컬럼 토글 핸들러
// ═══════════════════════════════════════════

/**
 * _syncFreqConfigDOM
 * freqTableConfig 상태 → DOM 칩/select 동기화
 * startAnalysis 시 호출하여 UI와 상태 일치 보장
 */
function _syncFreqConfigDOM() {
  // 컬럼 칩 동기화
  document.querySelectorAll('#freqColChips .freq-col-chip').forEach(function(chip) {
    var col = chip.dataset.col;
    var isOn = freqTableConfig.cols.has(col);
    chip.classList.toggle('on', isOn);
    chip.querySelector('.fck').textContent = isOn ? '✓' : '';
  });
  // ★ v3.4: select → number input 동기화
  var inp = document.getElementById('freqTopNInput');
  if (inp) inp.value = String(freqTableConfig.topN);
}

/**
 * 빈도표 컬럼 칩 토글
 * — rank/word는 항상 표시 (최소 2개 컬럼 보장)
 */
function toggleFreqCol(el) {
  var col = el.dataset.col;
  // rank, word는 항상 ON 유지 — UX 안정성
  var REQUIRED_COLS = ['rank', 'word'];
  if (REQUIRED_COLS.includes(col) && el.classList.contains('on')) return;

  el.classList.toggle('on');
  var fck = el.querySelector('.fck');
  fck.textContent = el.classList.contains('on') ? '✓' : '';
  el.classList.contains('on')
    ? freqTableConfig.cols.add(col)
    : freqTableConfig.cols.delete(col);
  renderFreqTable();
  // ★ 내보내기 패널 힌트 즉시 반영 — DOM 테이블과 PNG 설정 동기화
  updateExportUI('all');
  updateExportUI('group');
}

/**
 * onFreqTopNInput(el) — v3.4
 * 숫자 입력 중 실시간 검증 + 즉시 반영
 * max는 freqTotalWordCount(전체 단어 수)로 동적 제한
 */
function onFreqTopNInput(el) {
  var raw = parseInt(el.value, 10);
  var maxN = freqTotalWordCount > 0 ? freqTotalWordCount : MAX_FREQ_DISPLAY;

  // 빈값이면 기다림 (blur에서 처리)
  if (el.value === '' || isNaN(raw)) {
    el.classList.add('invalid');
    return;
  }
  // 범위 클램프: 1 ~ 전체 단어 수
  var clamped = Math.min(Math.max(1, raw), maxN);
  el.classList.toggle('invalid', raw !== clamped);

  freqTableConfig.topN = clamped;
  renderFreqTable();
  updateExportUI('all');
  updateExportUI('group');
}

/**
 * onFreqTopNBlur(el) — v3.4
 * 포커스 아웃 시 빈값·범위 초과를 유효 기본값으로 교정
 */
function onFreqTopNBlur(el) {
  var raw = parseInt(el.value, 10);
  var maxN = freqTotalWordCount > 0 ? freqTotalWordCount : MAX_FREQ_DISPLAY;
  var valid = (!isNaN(raw) && raw >= 1 && raw <= maxN)
    ? raw
    : Math.min(freqTableConfig.topN || 30, maxN);

  el.value = String(valid);
  el.classList.remove('invalid');
  freqTableConfig.topN = valid;
  renderFreqTable();
  updateExportUI('all');
  updateExportUI('group');
}

/**
 * _updateFreqTopNMax()
 * 분석 실행 후 전체 단어 수를 input max 속성에 반영
 */
function _updateFreqTopNMax() {
  var allFreq = buildFreq(selectedCols);
  freqTotalWordCount = Object.keys(allFreq).length;
  var inp = document.getElementById('freqTopNInput');
  if (!inp) return;
  inp.max = String(freqTotalWordCount);
  // 전체 단어 수 안내 라벨 갱신
  var totalEl = document.getElementById('freqTopNTotal');
  if (totalEl) totalEl.textContent = '/ ' + freqTotalWordCount.toLocaleString();
  // topN이 전체 단어 수 초과 시 클램프
  if (freqTableConfig.topN > freqTotalWordCount) {
    freqTableConfig.topN = freqTotalWordCount;
    inp.value = String(freqTotalWordCount);
  }
}

/**
 * renderFreqTable — v3.5
 * 변경사항:
 *   1) 표 형식: border-collapse 그리드 (freq-table-e)
 *   2) 컬럼 너비: FREQ_COL_RATIO 비율 기반 (table-layout:fixed)
 *   3) 컬럼명: FREQ_COL_LABELS 상수 참조 ('#' → '순위')
 *   4) 1위 행 강조: 버전B (배경색 + freq-rank1 클래스)
 *   5) 비율 컬럼: 도트 바 제거 → 값만 표시 (요청사항 1)
 */
function renderFreqTable() {
  var allFreq = buildFreq(selectedCols);
  var allSorted = Object.entries(allFreq).sort(function(a,b){ return b[1]-a[1]; });
  var totalCount = allSorted.reduce(function(s,e){ return s+e[1]; }, 0);

  var displayN = freqTableConfig.topN === 0
    ? Math.min(allSorted.length, MAX_FREQ_DISPLAY)
    : Math.min(freqTableConfig.topN, allSorted.length);
  var displayRows = allSorted.slice(0, displayN);

  var cols = freqTableConfig.cols;
  var maxCount = allSorted[0] ? allSorted[0][1] : 1;
  var palette = PALETTES[getActivePalette('all')];

  // ── 컬럼 너비 계산 (비율 기반, table-layout:fixed) ──────────────
  // 활성 컬럼만 골라 너비 배분
  // ratio 컬럼은 나머지 공간 자동 흡수 (width 미지정)
  var colWidths = {};
  ['rank','word','count','cumul'].forEach(function(c) {
    if (!cols.has(c)) return;
    // CSS % 값으로 설정 → 테이블 자체 폭에 비례 (freqW 가변 대응)
    var pct = Math.round(FREQ_COL_RATIO[c] * 100);
    colWidths[c] = pct + '%';
  });
  // ratio 컬럼은 너비 미지정 → 나머지 공간 전체 흡수

  // ── 헤더 행 ──────────────────────────────────────────
  // ★ v3.7: 컬럼 그룹 + 헤더 — 단어 컬럼만 좌정렬, 나머지 중앙 정렬
  var thHTML = '<colgroup>';
  if (cols.has('rank'))  thHTML += '<col style="width:' + colWidths.rank  + ';">';
  if (cols.has('word'))  thHTML += '<col style="width:' + colWidths.word  + ';">';
  if (cols.has('count')) thHTML += '<col style="width:' + colWidths.count + ';">';
  if (cols.has('ratio')) thHTML += '<col>';
  if (cols.has('cumul')) thHTML += '<col style="width:' + colWidths.cumul + ';">';
  thHTML += '</colgroup><thead><tr>';
  if (cols.has('rank'))  thHTML += '<th>' + FREQ_COL_LABELS.rank  + '</th>';
  if (cols.has('word'))  thHTML += '<th class="freq-th-word">' + FREQ_COL_LABELS.word  + '</th>';
  if (cols.has('count')) thHTML += '<th>' + FREQ_COL_LABELS.count + '</th>';
  if (cols.has('ratio')) thHTML += '<th>' + FREQ_COL_LABELS.ratio + '</th>';
  if (cols.has('cumul')) thHTML += '<th>' + FREQ_COL_LABELS.cumul + '</th>';
  thHTML += '</tr></thead>';

  // ── 데이터 행 ──────────────────────────────────────────
  var cumulSum = 0;
  var tbHTML = '<tbody>' + displayRows.map(function(entry, i) {
    var word = entry[0], count = entry[1];
    cumulSum += count;
    var ratioPct = totalCount > 0 ? (count / totalCount * 100) : 0;
    var cumulPct = totalCount > 0 ? (cumulSum / totalCount * 100) : 0;
    var wordColor = palette[i % palette.length];
    var isFirst   = (i === 0);

    // 폰트 위계 (3단계)
    var sz = i === 0 ? FREQ_E_FONT_SIZES[0]
           : i < 4  ? FREQ_E_FONT_SIZES[1]
                    : FREQ_E_FONT_SIZES[2];
    var fw = i === 0 ? FREQ_E_FONT_WEIGHTS[0]
           : i < 4  ? FREQ_E_FONT_WEIGHTS[1]
                    : FREQ_E_FONT_WEIGHTS[2];

    // ★ 버전B: 1위 행 클래스 부여 → CSS에서 배경색 처리
    var trClass = isFirst ? ' class="freq-rank1"' : '';

    // ★ v3.7: 모든 td 기본 중앙 정렬 (CSS .freq-table-e td text-align:center)
    // 단어 컬럼만 freq-td-word 클래스로 좌정렬
    var tr = '<tr' + trClass + '>';

    // 순위 컬럼
    if (cols.has('rank')) {
      var rankColor = isFirst ? 'var(--blue)' : 'var(--text3)';
      var rankFw    = isFirst ? '500' : '400';
      tr += '<td style="font-size:10px;font-weight:' + rankFw + ';color:' + rankColor
          + ';font-family:var(--ff-mono);">' + (i+1) + '</td>';
    }

    // 단어 컬럼 — 좌정렬 (freq-td-word 클래스)
    if (cols.has('word')) {
      var wStyle = 'font-size:' + sz + 'px;font-weight:' + fw
                 + ';color:' + wordColor
                 + ';font-family:var(--ff-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      tr += '<td class="freq-td-word" style="' + wStyle + '">' + word + '</td>';
    }

    // 빈도 컬럼 — 값만 표시
    if (cols.has('count')) {
      var cStyle = 'font-size:' + (sz-1) + 'px;font-weight:' + fw
                 + ';font-family:var(--ff-mono);'
                 + (isFirst ? 'color:var(--text);' : 'color:var(--text2);');
      tr += '<td style="' + cStyle + '">' + count.toLocaleString() + '</td>';
    }

    // 비율 컬럼 — 값만 표시
    if (cols.has('ratio')) {
      var rStyle = 'font-size:11px;font-family:var(--ff-mono);'
                 + (isFirst ? 'color:var(--blue);font-weight:500;' : 'color:var(--text3);font-weight:400;');
      tr += '<td style="' + rStyle + '">' + ratioPct.toFixed(1) + '%</td>';
    }

    // 누적 컬럼
    if (cols.has('cumul')) {
      tr += '<td style="font-size:10px;color:var(--text3);font-family:var(--ff-mono);">' + cumulPct.toFixed(1) + '%</td>';
    }

    tr += '</tr>';
    return tr;
  }).join('') + '</tbody>';

  var tableEl = document.getElementById('freqTableEl');
  tableEl.className = 'freq-table-e';
  tableEl.innerHTML = thHTML + tbHTML;

  // 메타 정보 업데이트
  var totalUniqueWords = allSorted.length;
  var metaRight = '표출 ' + displayRows.length + '개 / 전체 ' + totalUniqueWords.toLocaleString() + '개 단어';
  var metaLeft = cols.has('cumul')
    ? '빈도 분석: 전체 단어 기준 · 누적% = 전체 등장 횟수 대비'
    : '빈도 분석: 전체 단어 기준 · 표출만 필터링';
  document.getElementById('freqTableMeta').children[0].textContent = metaLeft;
  document.getElementById('freqTableMetaRight').textContent = metaRight;
}

// ═══════════════════════════════════════════
// WC CANVAS RENDERER
// ═══════════════════════════════════════════
function getSizeRange(sizeRange){
  return {subtle:[12,48],normal:[14,60],bold:[16,80]}[sizeRange||'normal'];
}
function getWordSize(freq,maxF,minF,sizeRange){
  var r=getSizeRange(sizeRange), mn=r[0], mx=r[1];
  if(maxF===minF)return(mn+mx)/2;
  return Math.round(mn+((freq-minF)/(maxF-minF))*(mx-mn));
}

function drawWCOnCanvas(canvas, wordList, opts){
  opts=opts||{};
  var bgMode=opts.bgMode||'dark', sizeRange=opts.sizeRange||'normal';
  var W=opts.W||WC_W, H=opts.H||WC_H;
  var palette=opts.palette!==undefined?opts.palette:activePalette;
  var recordPlacements=opts.recordPlacements||false;
  var ctx=canvas.getContext('2d');
  canvas.width=W; canvas.height=H;
  applyBg(ctx, W, H, bgMode==='dark'?'dark':bgMode==='light'?'light':'transparent');
  if(!wordList.length){
    ctx.font='13px sans-serif';
    ctx.fillStyle=bgMode==='light'?'#999':'#555';
    ctx.textAlign='center';
    ctx.fillText('표시할 단어가 없습니다',W/2,H/2);
    return 0;
  }
  var maxF=wordList[0][1], minF=wordList[wordList.length-1][1];
  var colors=PALETTES[palette];
  var placed=[];
  if(recordPlacements)lastPlacedWords=[];
  function overlaps(x,y,w,h,pad){pad=pad||4;for(var p of placed)if(x<p.x+p.w+pad&&x+w+pad>p.x&&y<p.y+p.h+pad&&y+h+pad>p.y)return true;return false;}
  function tryPlace(word,size,color){
    ctx.font=`${size}px 'Noto Sans KR',sans-serif`;
    var tw=ctx.measureText(word).width, th=size;
    var cx=W/2, cy=H/2, r=0, angle=Math.random()*Math.PI*2;
    var maxR=Math.min(W,H)*0.47;
    while(r<maxR){
      var x=cx+r*Math.cos(angle)-tw/2, y=cy+r*Math.sin(angle)+th/3;
      if(x>=4&&x+tw<=W-4&&y-th>=4&&y<=H-4&&!overlaps(x,y-th,tw,th)){
        ctx.fillStyle=color; ctx.fillText(word,x,y);
        placed.push({x,y:y-th,w:tw,h:th});
        if(recordPlacements)lastPlacedWords.push({word,x,y,size,color});
        return true;
      }
      angle+=0.35; r+=3*(0.35/(2*Math.PI));
    }
    return false;
  }
  var count=0;
  wordList.forEach(([word,freq],i)=>{
    var size=getWordSize(freq,maxF,minF,sizeRange);
    var color=colors[i%colors.length];
    if(tryPlace(word,size,color))count++;
  });
  return count;
}

// ═══════════════════════════════════════════
// ★ P1 (v3.6): renderFreqCanvas
// freq: {word:count}, bgMode, topN, visibleCols, canvasW(optional), paletteMode(optional)
// paletteMode: 'all'|'group' — 미전달 시 'all' 폴백 (하위 호환)
//   → 그룹 단독/일괄 저장 시 'group' 전달 → WC 팔레트와 색상 일치
// ═══════════════════════════════════════════
function renderFreqCanvas(freq, bgMode, topN, visibleCols, canvasW, paletteMode) {
  topN = (topN === undefined || topN === null) ? freqTableConfig.topN : topN;
  visibleCols = visibleCols || freqTableConfig.cols;

  var allSorted = Object.entries(freq).sort(function(a,b){ return b[1]-a[1]; });
  var totalCount = allSorted.reduce(function(s,e){ return s+e[1]; }, 0);
  var displayN = topN === 0
    ? Math.min(allSorted.length, MAX_FREQ_DISPLAY)
    : Math.min(topN, allSorted.length);
  var sorted = allSorted.slice(0, displayN);

  // 동적 폭 — canvasW 미전달 시 FREQ_W 폴백
  var W = (canvasW && canvasW > 100) ? canvasW : FREQ_W;
  var H = FREQ_H;
  var off = document.createElement('canvas');
  off.width = W; off.height = H;
  var ctx = off.getContext('2d');
  applyBg(ctx, W, H, bgMode);

  var isDark = bgMode === 'dark';
  var textColor  = isDark ? '#f0f0ee' : '#1a1a1a';
  var mutedColor = isDark ? '#9a9b9e' : '#666';
  var trackColor = isDark ? '#242629' : '#e0e0e0';

  // ★ v3.6: paletteMode 파라미터로 팔레트 결정 — WC와 색상 일치 보장
  // 'group' 전달 시 그룹 전용 팔레트, 미전달/'all' 시 전체 팔레트
  var palette = PALETTES[getActivePalette(paletteMode || 'all')];

  var showRank  = visibleCols.has('rank');
  var showWord  = visibleCols.has('word');
  var showCount = visibleCols.has('count');
  var showRatio = visibleCols.has('ratio');
  var showCumul = visibleCols.has('cumul');

  // ── 헤더 영역 (2행 구조) ──────────────────────
  // 행1: 타이틀 "WORD FREQUENCY — TOP N"
  // 행2: 컬럼명 (#  단어  빈도  비율  누적) — 데이터 x좌표와 정렬
  var PAD = 16;
  var TITLE_Y  = PAD + 12;                           // 타이틀 y
  var COLHDR_Y = TITLE_Y + FREQ_E_COLHDR_H;         // 컬럼명 y

  // ★ v3.5: 컬럼 너비 — FREQ_COL_RATIO 비율 기반 (DOM 테이블과 일치)
  // usableW = canvas 폭 - 좌우 PAD - 컬럼간 gap 총합
  var activeColCount = [showRank,showWord,showCount,showRatio,showCumul].filter(Boolean).length;
  var totalGap = Math.max(0, activeColCount - 1) * FREQ_COL_GAP;
  var usableW  = W - PAD * 2 - totalGap;

  // 비율로 각 컬럼 px 계산 (최솟값 보장)
  var RANK_W  = showRank  ? Math.max(FREQ_COL_MIN_W.rank,  Math.floor(usableW * FREQ_COL_RATIO.rank))  : 0;
  var WORD_W  = showWord  ? Math.max(FREQ_COL_MIN_W.word,  Math.floor(usableW * FREQ_COL_RATIO.word))  : 0;
  var COUNT_W = showCount ? Math.max(FREQ_COL_MIN_W.count, Math.floor(usableW * FREQ_COL_RATIO.count)) : 0;
  var CUMUL_W = showCumul ? Math.max(FREQ_COL_MIN_W.cumul, Math.floor(usableW * FREQ_COL_RATIO.cumul)) : 0;
  // 비율 컬럼: 나머지 공간 전체 흡수
  var fixedSum = RANK_W + WORD_W + COUNT_W + CUMUL_W;
  var RATIO_COL_W = showRatio ? Math.max(40, usableW - fixedSum) : 0;

  // x 좌표 계산 (갭 포함)
  var xRank  = PAD;
  var xWord  = xRank  + RANK_W  + (RANK_W  ? FREQ_COL_GAP : 0);
  var xCount = xWord  + WORD_W  + (WORD_W  ? FREQ_COL_GAP : 0);
  var xRatio = xCount + COUNT_W + (COUNT_W ? FREQ_COL_GAP : 0);
  var xCumul = xRatio + RATIO_COL_W + (RATIO_COL_W ? FREQ_COL_GAP : 0);

  // 헤더 배경 — ★ v3.7: 더 진한 배경으로 엑셀 스타일 구현
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  ctx.fillRect(0, 0, W, FREQ_E_HEADER_H + PAD);

  // ── 행1: 타이틀 ──
  ctx.font = "500 10px " + FREQ_CANVAS_FONT;
  ctx.fillStyle = mutedColor;
  ctx.textAlign = 'left';
  ctx.fillText('WORD FREQUENCY — TOP ' + sorted.length, PAD, TITLE_Y);

  // 타이틀행 하단 구분선
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(PAD, TITLE_Y + 5);
  ctx.lineTo(W - PAD, TITLE_Y + 5);
  ctx.stroke();

  // ── 행2: 컬럼명 — FREQ_COL_LABELS 상수 참조 + 데이터 x좌표 1:1 정렬 ──
  ctx.font = "500 9px " + FREQ_CANVAS_FONT;
  ctx.fillStyle = mutedColor;
  if (showRank) {
    ctx.textAlign = 'right';
    ctx.fillText(FREQ_COL_LABELS.rank, xRank + RANK_W, COLHDR_Y);
  }
  if (showWord) {
    ctx.textAlign = 'left';
    ctx.fillText(FREQ_COL_LABELS.word, xWord, COLHDR_Y);
  }
  if (showCount) {
    ctx.textAlign = 'right';
    ctx.fillText(FREQ_COL_LABELS.count, xCount + COUNT_W, COLHDR_Y);
  }
  if (showRatio) {
    ctx.textAlign = 'left';
    ctx.fillText(FREQ_COL_LABELS.ratio, xRatio, COLHDR_Y);
  }
  if (showCumul) {
    ctx.textAlign = 'right';
    ctx.fillText(FREQ_COL_LABELS.cumul, xCumul + CUMUL_W, COLHDR_Y);
  }

  // 컬럼명행 하단 구분선 (데이터 시작 경계)
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, FREQ_E_HEADER_H + PAD);
  ctx.lineTo(W - PAD, FREQ_E_HEADER_H + PAD);
  ctx.stroke();

  // ── 데이터 행 ───────────────────────────────
  // dataTop: 헤더 2행 + 구분선 이후 시작
  var dataTop = FREQ_E_HEADER_H + PAD + 4;  // ★ v3.7: 4→간격 축소 (컴팩트)
  var dataH = H - dataTop - PAD;
  var maxCount = allSorted[0] ? allSorted[0][1] : 1;
  var ROW_H = Math.max(14, dataH / Math.max(sorted.length, 1));

  var cumulSum = 0;
  sorted.forEach(function(entry, i) {
    var word = entry[0], count = entry[1];
    cumulSum += count;
    var ratioPct = totalCount > 0 ? (count / totalCount * 100) : 0;
    var cumulPct = totalCount > 0 ? (cumulSum / totalCount * 100) : 0;
    var wordColor = palette[i % palette.length];
    var isFirst   = (i === 0);

    // 폰트 크기 위계 (3단계)
    var sz = i === 0 ? FREQ_E_FONT_SIZES[0]
           : i < 4  ? FREQ_E_FONT_SIZES[1]
                     : FREQ_E_FONT_SIZES[2];
    var fw = i === 0 ? FREQ_E_FONT_WEIGHTS[0]
           : i < 4  ? FREQ_E_FONT_WEIGHTS[1]
                     : FREQ_E_FONT_WEIGHTS[2];

    var y = dataTop + i * ROW_H + ROW_H * 0.65;

    // ★ v3.5 버전B: 1위 행 배경 강조
    if (isFirst) {
      ctx.fillStyle = isDark ? FREQ_RANK1_BG_DARK : FREQ_RANK1_BG_LIGHT;
      ctx.fillRect(0, dataTop + i * ROW_H, W, ROW_H);
    }

    // 순위 — 1위는 파란색, 나머지 muted
    if (showRank) {
      ctx.font = '10px ' + FREQ_CANVAS_FONT;
      ctx.fillStyle = isFirst ? (isDark ? '#4fa3e0' : '#1a6aaa') : mutedColor;
      ctx.textAlign = 'right';
      ctx.fillText(String(i + 1), xRank + RANK_W, y);
    }

    // 단어 — 픽셀 기반 말줄임 (WORD_W 초과 시 …)
    if (showWord) {
      ctx.font = fw + ' ' + sz + 'px ' + FREQ_CANVAS_FONT;
      ctx.fillStyle = wordColor;
      ctx.textAlign = 'left';
      var dw = word;
      while (dw.length > 1 && ctx.measureText(dw + '…').width > WORD_W - 2) {
        dw = dw.slice(0, -1);
      }
      if (dw !== word) dw = dw + '…';
      ctx.fillText(dw, xWord, y);
    }

    // 빈도 — 값만 표시
    if (showCount) {
      ctx.font = (fw > 400 ? (fw - 100) : fw) + ' ' + (sz - 1) + 'px ' + FREQ_CANVAS_FONT;
      ctx.fillStyle = isFirst ? textColor : (isDark ? 'rgba(240,240,238,0.55)' : 'rgba(0,0,0,0.45)');
      ctx.textAlign = 'right';
      ctx.fillText(count.toLocaleString(), xCount + COUNT_W, y);
    }

    // ★ v3.5: 비율 — 값만 표시 (도트 바 제거)
    if (showRatio && RATIO_COL_W > 0) {
      ctx.font = '10px ' + FREQ_CANVAS_FONT;
      ctx.fillStyle = isFirst ? (isDark ? '#4fa3e0' : '#1a6aaa') : mutedColor;
      ctx.textAlign = 'left';
      ctx.fillText(ratioPct.toFixed(1) + '%', xRatio, y);
    }

    // 누적%
    if (showCumul) {
      ctx.font = '9px ' + FREQ_CANVAS_FONT;
      ctx.fillStyle = mutedColor;
      ctx.textAlign = 'right';
      ctx.fillText(cumulPct.toFixed(1) + '%', xCumul + CUMUL_W, y);
    }

    // 행 구분선 (그리드)
    if (i < sorted.length - 1) {
      ctx.strokeStyle = isFirst
        ? (isDark ? 'rgba(79,163,224,0.22)' : 'rgba(79,163,224,0.25)')
        : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)');
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD, dataTop + (i + 1) * ROW_H);
      ctx.lineTo(W - PAD, dataTop + (i + 1) * ROW_H);
      ctx.stroke();
    }
  });

  // 하단 메타
  ctx.font = "9px 'DM Mono', monospace";
  ctx.fillStyle = isDark ? 'rgba(90,91,94,0.8)' : 'rgba(120,120,120,0.8)';
  ctx.textAlign = 'left';
  ctx.fillText('분석: 전체 단어 기준'
    + (showCumul ? ' · 누적% = 전체 대비' : ''), PAD, H - 6);

  return off;
}

// ═══════════════════════════════════════════
// ★ P2 (v3.3 updated): renderMergedOffscreen
// WC + 빈도표 병합 — mergedLayoutConfig.wcRatio 기반 고정 비율 레이아웃
// 구분선 삽입, 그룹 오버뷰는 별도 경로(이 함수 미사용)
// ═══════════════════════════════════════════
function renderMergedOffscreen(wcCanvas, freqCanvas, bgMode) {
  var dim = getMergedDimensions();
  var TOTAL_H = Math.max(wcCanvas.height, freqCanvas.height, WC_H);

  var off = document.createElement('canvas');
  off.width  = dim.totalW;
  off.height = TOTAL_H;
  var ctx = off.getContext('2d');

  applyBg(ctx, dim.totalW, TOTAL_H, bgMode);

  // WC 영역 — 좌측
  ctx.drawImage(wcCanvas,
    0, Math.round((TOTAL_H - wcCanvas.height) / 2),
    dim.wcW, wcCanvas.height);

  // ★ 이슈2 수정: 선 대신 빈도표 영역 배경으로 자연스럽게 구분
  // — 흰 배경에서 가독성 저해하는 구분선 제거
  // — 빈도표 패널에 미세한 배경색 적용
  var freqX = dim.wcW + MERGED_DIVIDER_W;
  ctx.fillStyle = (bgMode === 'dark') ? FREQ_E_BG_DARK : FREQ_E_BG_LIGHT;
  ctx.fillRect(freqX, 0, dim.freqW, TOTAL_H);

  // 빈도표 렌더링 — 배경 위에 합성
  ctx.drawImage(freqCanvas,
    freqX, Math.round((TOTAL_H - freqCanvas.height) / 2),
    dim.freqW, freqCanvas.height);

  return off;
}

// ═══════════════════════════════════════════
// WC 생성 (전체 모드)
// ═══════════════════════════════════════════
function generateWC(){
  wordFreq=buildFreq(selectedCols);
  var sorted=Object.entries(wordFreq).sort((a,b)=>b[1]-a[1]);
  var maxW=parseInt(document.getElementById('maxWords').value);
  var top=sorted.slice(0,maxW);
  document.getElementById('wcPH').classList.add('hidden');
  document.getElementById('wcCanvas').style.display='none';
  document.getElementById('wcLoading').style.display='flex';
  document.getElementById('wcStatus').textContent='';
  document.getElementById('exportStatusAll').textContent='';
  setTimeout(function(){
    var canvas=document.getElementById('wcCanvas');
    var bgMode=document.getElementById('bgMode').value;
    var sizeRange=document.getElementById('sizeRange').value;
    var wcBody=document.getElementById('wcBody');
    wcBody.classList.toggle('transparent-mode',bgMode==='transparent');
    var count=drawWCOnCanvas(canvas,top,{bgMode,sizeRange,W:WC_W,H:WC_H,recordPlacements:true,palette:getActivePalette('all')});
    document.getElementById('wcLoading').style.display='none';
    canvas.style.display='block';
    canvas.classList.add('fade-in');
    document.getElementById('wcStatus').textContent=count+'개 단어 표시됨';
    updateExportUI('all');
  },100);
}

// ═══════════════════════════════════════════
// ★ v3.2: PALETTE — 스마트 토글 시스템
// ═══════════════════════════════════════════

/**
 * getActivePalette(mode)
 * mode: 'all' | 'group'
 * paletteSeparate=false → activePalette 공통 반환
 * paletteSeparate=true  → mode별 독립 인덱스 반환
 * 모든 drawWCOnCanvas 호출부에서 activePalette 대신 이 함수 사용
 */
function getActivePalette(mode) {
  if (!paletteSeparate) return activePalette;
  return (mode === 'group') ? paletteGroup : activePalette;
}

/**
 * buildPaletteUI()
 * PALETTES + PALETTE_META 기반으로 팔레트 UI 동적 생성
 * — 공통 팔레트 영역(#paletteShared) + 개별 탭(#paletteSeparateWrap) 렌더
 */
function buildPaletteUI() {
  _renderPaletteChips('paletteChipsAll',  activePalette,  'all');
  _renderPaletteChips('paletteChipsGroup', paletteGroup,  'group');
  _syncPaletteSeparateUI();
}

/**
 * _renderPaletteChips(containerId, selectedIdx, mode)
 * 팔레트 스와치 칩 목록 렌더 (재사용 가능)
 */
function _renderPaletteChips(containerId, selectedIdx, mode) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = PALETTES.map(function(p, i) {
    var meta = PALETTE_META[i];
    var isSelected = (i === selectedIdx);
    var sunBadge = meta.sunIcon
      ? '<span style="font-size:8px;margin-left:1px;opacity:0.8;" title="흰배경 가시성 우수">☀</span>'
      : '';
    return '<div onclick="setPalette(' + i + ',\'' + mode + '\')" id="pchip_' + mode + '_' + i + '"'
      + ' title="' + meta.name + (meta.sunIcon ? ' (흰배경 가시성 우수)' : '') + '"'
      + ' style="display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;'
      + 'padding:5px 4px;border-radius:8px;border:2px solid '
      + (isSelected ? 'var(--accent)' : 'transparent')
      + ';transition:border-color 0.15s,transform 0.15s;transform:'
      + (isSelected ? 'scale(1.08)' : 'scale(1)') + ';">'
      + '<div style="display:flex;gap:2px;">'
      + p.slice(0, 4).map(function(c) {
          return '<div style="width:8px;height:18px;background:' + c + ';border-radius:2px;"></div>';
        }).join('')
      + '</div>'
      + '<span style="font-size:8px;color:var(--text3);font-family:\'DM Mono\',monospace;line-height:1;">'
      + meta.name + sunBadge + '</span>'
      + '</div>';
  }).join('');
}

/**
 * setPalette(idx, mode)
 * idx:  팔레트 인덱스
 * mode: 'all' | 'group'
 *   — paletteSeparate=false 시 mode 무관하게 activePalette 갱신
 *   — paletteSeparate=true  시 mode별 독립 갱신
 */
function setPalette(idx, mode) {
  if (!paletteSeparate) {
    // 통일 모드: 두 상태 모두 같은 값으로
    activePalette = idx;
    paletteGroup  = idx;
  } else {
    if (mode === 'group') paletteGroup  = idx;
    else                  activePalette = idx;
  }
  _updatePaletteChipSelection();

  // 전체 모드 WC 즉시 갱신
  var canvas = document.getElementById('wcCanvas');
  if (canvas && canvas.style.display !== 'none' && Object.keys(wordFreq).length) {
    var sorted = Object.entries(wordFreq).sort(function(a,b){return b[1]-a[1];});
    var maxW = parseInt(document.getElementById('maxWords').value);
    drawWCOnCanvas(canvas, sorted.slice(0, maxW), {
      bgMode:    document.getElementById('bgMode').value,
      sizeRange: document.getElementById('sizeRange').value,
      W: WC_W, H: WC_H,
      palette: getActivePalette('all')
    });
  }
}

/**
 * _updatePaletteChipSelection()
 * 두 팔레트 컨테이너의 선택 테두리/스케일 갱신
 */
function _updatePaletteChipSelection() {
  PALETTES.forEach(function(_, i) {
    ['all', 'group'].forEach(function(mode) {
      var el = document.getElementById('pchip_' + mode + '_' + i);
      if (!el) return;
      var selectedIdx = (mode === 'group') ? paletteGroup : activePalette;
      var isSelected = (i === selectedIdx);
      el.style.borderColor = isSelected ? 'var(--accent)' : 'transparent';
      el.style.transform    = isSelected ? 'scale(1.08)' : 'scale(1)';
    });
  });
}

/**
 * onPaletteSeparateToggle()
 * 스마트 토글 체크박스 변경 핸들러
 */
function onPaletteSeparateToggle() {
  var chk = document.getElementById('paletteSeparateChk');
  paletteSeparate = chk.checked;
  if (!paletteSeparate) {
    // 통일 모드 전환 시: activePalette를 그룹에도 적용
    paletteGroup = activePalette;
    _updatePaletteChipSelection();
  }
  _syncPaletteSeparateUI();
}

/**
 * _syncPaletteSeparateUI()
 * paletteSeparate 상태에 따라 UI 레이아웃 전환
 *  — false: 공통 탭만 보임 (그룹 탭 숨김)
 *  — true:  전체/그룹 탭 분리 표시
 * 그룹 모드일 때만 토글 자체를 노출
 */
function _syncPaletteSeparateUI() {
  var toggleRow  = document.getElementById('paletteSeparateToggleRow');
  var tabAll     = document.getElementById('palTabAll');
  var tabGroup   = document.getElementById('palTabGroup');
  var panelAll   = document.getElementById('palPanelAll');
  var panelGroup = document.getElementById('palPanelGroup');
  var label      = document.getElementById('paletteSeparateLabel');
  var chk        = document.getElementById('paletteSeparateChk');
  if (!toggleRow) return;

  // 그룹 모드일 때만 토글 노출 — 전체 모드에서는 토글 불필요
  toggleRow.classList.toggle('hidden', analysisMode !== 'group');

  // 라벨 텍스트 갱신
  if (label) label.textContent = paletteSeparate ? '모드별 개별 설정 중' : '전체·그룹 동일';
  if (chk)   chk.checked = paletteSeparate;

  if (!paletteSeparate) {
    // 통일 모드: 탭 숨기고 전체 패널만 표시
    if (tabAll)    tabAll.classList.add('hidden');
    if (tabGroup)  tabGroup.classList.add('hidden');
    if (panelAll)  panelAll.classList.remove('hidden');
    if (panelGroup)panelGroup.classList.add('hidden');
  } else {
    // 개별 모드: 탭 노출 + 전체 탭 기본 활성
    if (tabAll)    tabAll.classList.remove('hidden');
    if (tabGroup)  tabGroup.classList.remove('hidden');
    _switchPaletteTab('all');
  }
}

/**
 * _switchPaletteTab(tab)
 * 개별 모드에서 전체/그룹 탭 전환
 */
function _switchPaletteTab(tab) {
  var tabAll    = document.getElementById('palTabAll');
  var tabGroup  = document.getElementById('palTabGroup');
  var panelAll  = document.getElementById('palPanelAll');
  var panelGroup= document.getElementById('palPanelGroup');
  if (!tabAll) return;
  var isAll = (tab === 'all');
  tabAll.classList.toggle('active',  isAll);
  tabGroup.classList.toggle('active', !isAll);
  if (panelAll)   panelAll.classList.toggle('hidden',  !isAll);
  if (panelGroup) panelGroup.classList.toggle('hidden',  isAll);
}

// 하위 호환 — 기존 buildPaletteUI 이후에도 동작 보장
function updateChipSelection() { _updatePaletteChipSelection(); }

// ═══════════════════════════════════════════
// START ANALYSIS
// ═══════════════════════════════════════════
function startAnalysis(){
  if(!selectedCols.size)return;
  // 도메인 레이어 규칙을 단일 진입점으로 사용
  resetSW();

  // ★ v3.1: 새 분석 시작 시 빈도표 설정 DOM을 freqTableConfig 초기값과 동기화
  // freqTableConfig 자체는 유지 (사용자 설정 보존) — DOM 칩만 맞춤
  _syncFreqConfigDOM();
  // ★ v3.4: 전체 단어 수 갱신 → input max 속성 + 안내 라벨 갱신
  _updateFreqTopNMax();

  show('s4Wrap');
  document.getElementById('sn4').classList.add('done');
  document.getElementById('sn4').textContent='✓';
  if(analysisMode==='group'&&groupCol){
    hide('s4aWrap'); show('s4bWrap');
    if(!buildGroupPanels._lastGroupCol||buildGroupPanels._lastGroupCol!==groupCol){
      dispatchAppAction('RESET_LOCAL_STOPWORDS');
      buildGroupPanels._lastGroupCol=groupCol;
    }
    buildGroupPanels();
    updateExportUI('group');
  } else {
    hide('s4bWrap'); show('s4aWrap');
    var title=[...selectedCols].length===1?`워드클라우드 · "${[...selectedCols][0]}"`:  `워드클라우드 · ${[...selectedCols].length}개 컬럼 합산`;
    document.getElementById('wcTitle').textContent=title;
    updateExportUI('all');
  }
  document.getElementById('s4Wrap').scrollIntoView({behavior:'smooth',block:'start'});
}

// ═══════════════════════════════════════════
// GROUP PANELS
// ═══════════════════════════════════════════
function buildGroupPanels(){
  var colList=[...selectedCols];
  var groupVals=[...new Set(csvRows.map(r=>(r[groupCol]||'').trim()).filter(v=>v))].sort();
  var counts={};
  groupVals.forEach(v=>{counts[v]=csvRows.filter(r=>(r[groupCol]||'').trim()===v).length;});
  groupVals.forEach(v=>{if(!localStopwords.has(v))localStopwords.set(v,new Set());});
  var grid=document.getElementById('groupPanelsGrid');
  grid.innerHTML=groupVals.map((val,idx)=>{
    var color=GROUP_PANEL_COLORS[idx%GROUP_PANEL_COLORS.length];
    var safeId='gp_'+idx;
    var escapedVal=escapeHtml(val);
    return`<div class="group-panel-card" id="card_${safeId}"><div class="group-panel-header"><div class="group-panel-title"><div class="group-panel-dot" style="background:${color}"></div>${escapedVal}</div><span class="group-panel-count">n=${counts[val].toLocaleString()}</span></div><div class="group-panel-body" id="body_${safeId}"><div class="group-panel-loading" id="loading_${safeId}" style="display:none;"><div class="loader" style="width:24px;height:24px;border-width:2px;"></div><span>생성 중...</span></div><div class="group-panel-empty" id="empty_${safeId}" style="display:none;">단어가 없습니다</div><canvas class="group-panel-canvas" id="canvas_${safeId}"></canvas></div><div class="group-panel-footer"><div class="panel-footer-actions"><span class="group-panel-words" id="words_${safeId}">—</span><div class="group-panel-btns"><button class="btn btn-ghost btn-sm" data-action="gen" data-idx="${idx}">⟳ 생성</button><button class="btn btn-ghost btn-sm" data-action="dl" data-idx="${idx}">↓ 저장</button></div></div><div class="local-sw-section" id="lsw_section_${safeId}"><div class="local-sw-toggle" id="lsw_toggle_${safeId}" data-target="lsw_body_${safeId}"><span class="lsw-caret">▶</span><span>이 그룹 추가 불용어</span><span class="lsw-badge" id="lsw_badge_${safeId}">0</span><span style="margin-left:auto;font-size:10px;color:var(--text3)">전체 WC에 영향 없음</span></div><div class="local-sw-body" id="lsw_body_${safeId}"><div class="local-sw-chips" id="lsw_chips_${safeId}"></div><div class="local-sw-input-row"><input class="local-sw-input" id="lsw_input_${safeId}" placeholder="단어 입력 (쉼표·Enter)" data-idx="${idx}"></div><div class="local-sw-hint">Global 불용어에 이미 있는 단어는 자동 제외됩니다.</div></div></div></div></div>`;
  }).join('');
  if (!grid._boundClickHandler) {
    grid.addEventListener('click',onGroupGridClick);
    grid._boundClickHandler = true;
  }
  grid.querySelectorAll('.local-sw-input').forEach(inp=>{
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addLocalSW(parseInt(inp.dataset.idx),groupVals);}});
  });
}

function onGroupGridClick(e){
  var groupVals=[...new Set(csvRows.map(r=>(r[groupCol]||'').trim()).filter(v=>v))].sort();
  var actionBtn=e.target.closest('[data-action]');
  if(actionBtn){
    var idx=parseInt(actionBtn.dataset.idx);
    var action=actionBtn.dataset.action;
    if(action==='gen')generateOneGroupWC(idx,groupVals[idx]);
    if(action==='dl')_exportGroupSingle(groupVals[idx],idx,exportState.group.content,exportState.group.bg,parseInt(document.getElementById('gmaxWords').value),document.getElementById('gsizeRange').value,exportState.group.scope||'single');
    if(action==='lsw-add')addLocalSW(idx,groupVals);
    if(action==='lsw-rm'){var word=actionBtn.dataset.word;removeLocalSW(idx,word,groupVals);}
    return;
  }
  var toggle=e.target.closest('.local-sw-toggle');
  if(toggle){var bodyId=toggle.dataset.target;var body=document.getElementById(bodyId);if(!body)return;var isOpen=body.classList.toggle('open');toggle.classList.toggle('open',isOpen);}
}

function addLocalSW(idx,groupVals){
  var gv=groupVals[idx]; var safeId='gp_'+idx;
  var inp=document.getElementById('lsw_input_'+safeId);if(!inp)return;
  var words=inp.value.split(/[\s,]+/).map(w=>w.trim().toLowerCase()).filter(w=>w.length>0);
  if(!words.length)return;
  var localSet=localStopwords.get(gv)||new Set();
  words.forEach(w=>{if(!stopwords.has(w))localSet.add(w);});
  localStopwords.set(gv,localSet); inp.value='';
  renderLocalSWChips(idx,gv);
}
function removeLocalSW(idx,word,groupVals){var gv=groupVals[idx];var ls=localStopwords.get(gv);if(ls){ls.delete(word);renderLocalSWChips(idx,gv);}}
function renderLocalSWChips(idx,groupValue){
  var safeId='gp_'+idx;
  var chipsEl=document.getElementById('lsw_chips_'+safeId);
  var badgeEl=document.getElementById('lsw_badge_'+safeId);
  if(!chipsEl||!badgeEl)return;
  var ls=localStopwords.get(groupValue)||new Set();
  badgeEl.textContent=ls.size;
  chipsEl.innerHTML=[...ls].sort().map(w=>`<span class="local-sw-chip">${escapeHtml(w)}<button class="local-sw-chip-x" data-action="lsw-rm" data-idx="${idx}" data-word="${escapeHtml(w)}">×</button></span>`).join('');
}

function generateOneGroupWC(idx,groupValue){
  var safeId='gp_'+idx;
  var canvas=document.getElementById('canvas_'+safeId);
  var loading=document.getElementById('loading_'+safeId);
  var empty=document.getElementById('empty_'+safeId);
  var body=document.getElementById('body_'+safeId);
  var wordsEl=document.getElementById('words_'+safeId);
  canvas.style.display='none'; empty.style.display='none'; loading.style.display='flex';
  var bgMode=document.getElementById('gbgMode').value;
  body.classList.toggle('transparent-mode',bgMode==='transparent');
  renderLocalSWChips(idx,groupValue);
  setTimeout(function(){
    var freq=buildGroupFreq(groupValue);
    var maxW=parseInt(document.getElementById('gmaxWords').value);
    var sizeRange=document.getElementById('gsizeRange').value;
    var sorted=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,maxW);
    loading.style.display='none';
    if(!sorted.length){empty.style.display='block';wordsEl.textContent='단어 0개';return;}
    var count=drawWCOnCanvas(canvas,sorted,{bgMode,sizeRange,W:GROUP_W,H:GROUP_H,palette:getActivePalette('group')});
    canvas.style.display='block';
    wordsEl.textContent=count+'개 단어';
  },30);
}

function generateAllGroupWC(){
  var groupVals=[...new Set(csvRows.map(r=>(r[groupCol]||'').trim()).filter(v=>v))].sort();
  var i=0;
  function next(){if(i>=groupVals.length)return;generateOneGroupWC(i,groupVals[i]);i++;setTimeout(next,60);}
  next();
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
function roundRect(ctx,x,y,w,h,r){
  if(typeof r==='number')r=[r,r,r,r];
  var[tl,tr,br,bl]=r;
  ctx.beginPath();
  ctx.moveTo(x+tl,y);ctx.lineTo(x+w-tr,y);ctx.quadraticCurveTo(x+w,y,x+w,y+tr);
  ctx.lineTo(x+w,y+h-br);ctx.quadraticCurveTo(x+w,y+h,x+w-br,y+h);
  ctx.lineTo(x+bl,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-bl);
  ctx.lineTo(x,y+tl);ctx.quadraticCurveTo(x,y,x+tl,y);
  ctx.closePath();
}
function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function show(id){document.getElementById(id).classList.remove('hidden');}
function hide(id){document.getElementById(id).classList.add('hidden');}

// ═══════════════════════════════════════════
// FILE
// ═══════════════════════════════════════════
function handleFile(file){
  if(!file||!file.name.endsWith('.csv')){alert('CSV 파일만 지원합니다.');return;}
  var reader=new FileReader();
  reader.onload=function(e){
    var {headers:h,data:d}=parseCSV(e.target.result);
    if(!h.length){alert('CSV 파싱 실패: 헤더를 찾을 수 없습니다.');return;}
    headers=h; csvRows=d;
    headers.forEach(col=>{colInfo[col]=analyzeCol(csvRows.map(r=>r[col]||''));});
    var zone=document.getElementById('uploadZone');
    zone.classList.add('done');
    document.getElementById('uploadIcon').textContent='✅';
    document.getElementById('uploadMain').innerHTML=`<span class="upload-filename">${file.name}</span>`;
    document.getElementById('uploadHint').innerHTML=`<span class="upload-stats">${csvRows.length.toLocaleString()}개 행 · ${headers.length}개 컬럼 로드 완료</span>`;
    renderAnalysis();
    document.getElementById('s2Wrap').scrollIntoView({behavior:'smooth',block:'start'});
  };
  reader.readAsText(file,'UTF-8');
}

document.getElementById('fi').addEventListener('change',e=>handleFile(e.target.files[0]));
var zone=document.getElementById('uploadZone');
zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag-over');});
zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag-over');handleFile(e.dataTransfer.files[0]);});
document.getElementById('swInput').addEventListener('keydown',e=>{if(e.key==='Enter')addSW();});

buildPaletteUI();
buildMergedRatioUI();
// ★ v3.6: 초기 scope(overview)에 맞춰 freq 칩 상태 동기화
_syncGroupFreqChipState();
