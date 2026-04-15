// PNG export and QA folder writer logic

// ★ exportPNG — 통합 저장 함수 (버전C)
// target: 'all' | 'group'
// ═══════════════════════════════════════════
function dispatchExportAction(type, payload) {
  var p = payload || {};
  if (type === 'TOGGLE_CONTENT') {
    var set = exportState[p.mode].content;
    if (p.enabled) set.add(p.key); else set.delete(p.key);
    return;
  }
  if (type === 'SET_BG') {
    exportState[p.mode].bg = p.bg;
    return;
  }
  if (type === 'SET_SCOPE') {
    exportState.group.scope = p.scope;
    return;
  }
  if (type === 'SET_SELECTED_GROUP') {
    exportState.group.selectedGroup = p.groupValue || '';
  }
}

function _listGroupValues() {
  return [...new Set(csvRows.map(function(r){ return (r[groupCol]||'').trim(); }).filter(function(v){ return v; }))].sort();
}

function onSingleGroupPick(groupValue) {
  dispatchExportAction('SET_SELECTED_GROUP', { groupValue: groupValue });
  updateExportUI('group');
}

function _syncSingleGroupPickUI() {
  var wrap = document.getElementById('singleGroupPickWrap');
  var sel = document.getElementById('singleGroupPick');
  if (!wrap || !sel) return;
  var isSingle = exportState.group.scope === 'single';
  wrap.classList.toggle('hidden', !isSingle);
  if (!isSingle) return;

  var vals = _listGroupValues();
  var preferred = exportState.group.selectedGroup;
  if (!preferred || vals.indexOf(preferred) === -1) {
    preferred = vals.length ? vals[0] : '';
    dispatchExportAction('SET_SELECTED_GROUP', { groupValue: preferred });
  }
  sel.innerHTML = vals.map(function(v){
    var esc = escapeHtml(v);
    return '<option value="' + esc + '"' + (v===preferred?' selected':'') + '>' + esc + '</option>';
  }).join('');
}

function exportPNG(target) {
  var state = exportState[target];
  var content = state.content;     // Set {'wc','freq'}
  var bg = state.bg;               // 'white'|'transparent'|'dark'
  var scope = state.scope || 'overview'; // 그룹모드

  if (content.size === 0) return;
  document.getElementById('exportStatus' + (target==='all'?'All':'Group')).textContent = '처리 중…';

  setTimeout(function() {
    try {
      if (target === 'all') {
        _exportAll(content, bg);
      } else {
        _exportGroup(content, bg, scope);
      }
    } catch(e) {
      console.error('exportPNG error:', e);
      document.getElementById('exportStatusGroup').textContent = '오류 발생';
    }
  }, 30);
}

function _exportAll(content, bg) {
  var freq = buildFreq(selectedCols);
  var sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]);
  var maxW = parseInt(document.getElementById('maxWords').value);
  var sizeRange = document.getElementById('sizeRange').value;
  var colLabel = [...selectedCols].slice(0,2).join('_') + (selectedCols.size>2?'_etc':'');

  var wcOff = null, freqOff = null;

  // ★ v3.3: 병합 저장 시 비율 기반 동적 폭 적용
  var dim = (content.has('wc') && content.has('freq'))
    ? getMergedDimensions()
    : { wcW: WC_W, freqW: FREQ_W, totalW: WC_W };

  if (content.has('wc')) {
    // WC: 병합 시 dim.wcW 사용, 단독 저장 시 WC_W 유지
    var wcW = content.has('freq') ? dim.wcW : WC_W;
    wcOff = document.createElement('canvas');
    drawWCOnCanvas(wcOff, sorted.slice(0, maxW), {
      bgMode: bg==='white'?'light':bg==='dark'?'dark':'transparent',
      sizeRange, W: wcW, H: WC_H,
      palette: getActivePalette('all'), recordPlacements: true
    });
    var finalWC = document.createElement('canvas');
    finalWC.width = wcW; finalWC.height = WC_H;
    var fCtx = finalWC.getContext('2d');
    applyBg(fCtx, wcW, WC_H, bg);
    lastPlacedWords.forEach(function(p) {
      fCtx.font = p.size + "px 'Noto Sans KR',sans-serif";
      fCtx.fillStyle = p.color;
      fCtx.fillText(p.word, p.x, p.y);
    });
    wcOff = finalWC;
  }

  if (content.has('freq')) {
    // ★ v3.3: freqW 동적 전달 — 잘림 수정 + 비율 반영
    var freqW = content.has('wc') ? dim.freqW : FREQ_W;
    freqOff = renderFreqCanvas(freq, bg,
      freqTableConfig.topN, freqTableConfig.cols, freqW);
  }

  var finalCanvas = (content.has('wc') && content.has('freq'))
    ? renderMergedOffscreen(wcOff, freqOff, bg)
    : (wcOff || freqOff);

  var suffix = content.has('wc') && content.has('freq') ? 'merged' : content.has('wc') ? 'wc' : 'freq';
  _downloadCanvas(finalCanvas, 'wordlens_' + colLabel + '_' + suffix + '_' + bg, {
    target: 'all',
    scope: 'all',
    content: content,
    bg: bg
  });
  document.getElementById('exportStatusAll').textContent = '저장 완료';
}

function _exportGroup(content, bg, scope) {
  var groupVals = _listGroupValues();
  var maxW = parseInt(document.getElementById('gmaxWords').value);
  var sizeRange = document.getElementById('gsizeRange').value;
  var safeName = groupCol.replace(/[^\w가-힣]/g,'_');

  if (scope === 'overview') {
    // ★ 오버뷰는 항상 투명 배경
    _exportGroupOverview(groupVals, content, bg, 'transparent', maxW, sizeRange, safeName);

  } else if (scope === 'all_singles') {
    // 개별 전체 — 순차 저장
    groupVals.forEach(function(val, idx) {
      setTimeout(function() {
        _exportGroupSingle(val, idx, content, bg, maxW, sizeRange, scope);
      }, idx * 80);
    });
    document.getElementById('exportStatusGroup').textContent = groupVals.length + '개 파일 저장 중…';

  } else if (scope === 'single') {
    var picked = exportState.group.selectedGroup;
    var targetVal = (picked && groupVals.indexOf(picked) >= 0) ? picked : (groupVals[0] || '');
    var targetIdx = groupVals.indexOf(targetVal);
    if (targetIdx >= 0) _exportGroupSingle(targetVal, targetIdx, content, bg, maxW, sizeRange, scope);
  }
}

function _exportGroupSingle(val, idx, content, bg, maxW, sizeRange, scope) {
  var freq = buildGroupFreq(val);
  var sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]);
  var safeName = val.replace(/[^\w가-힣]/g,'_').slice(0,30);
  var wcOff = null, freqOff = null;

  if (content.has('wc') && sorted.length) {
    var tmpCanvas = document.createElement('canvas');
    drawWCOnCanvas(tmpCanvas, sorted.slice(0, maxW), {
      bgMode: 'transparent', sizeRange, W: GROUP_W, H: GROUP_H,
      palette: getActivePalette('group'), recordPlacements: true
    });
    wcOff = document.createElement('canvas');
    wcOff.width = GROUP_W; wcOff.height = GROUP_H;
    var ctx = wcOff.getContext('2d');
    applyBg(ctx, GROUP_W, GROUP_H, bg);
    // ① WC 합성
    lastPlacedWords.forEach(function(p) {
      ctx.font = p.size + "px 'Noto Sans KR',sans-serif";
      ctx.fillStyle = p.color;
      ctx.fillText(p.word, p.x, p.y);
    });
    // ★ v3.7: 그룹명은 헤더 영역(_drawGroupLabel)에서만 표시
    // 패널 하단 중복 출력 제거 (v3.6에서 _drawGroupLabel이 패널 내부에 중복)
  }

  if (content.has('freq')) {
    var gDim = (content.has('wc'))
      ? getMergedDimensions()
      : { freqW: FREQ_W };
    // ★ v3.6 P0: paletteMode 'group' 전달 → WC 팔레트 색상 일치
    freqOff = renderFreqCanvas(freq, bg,
      freqTableConfig.topN, freqTableConfig.cols, gDim.freqW, 'group');
  }

  var finalCanvas = (wcOff && freqOff)
    ? renderMergedOffscreen(wcOff, freqOff, bg)
    : (wcOff || freqOff);

  if (!finalCanvas) return;
  var suffix = content.has('wc') && content.has('freq') ? 'merged' : content.has('wc') ? 'wc' : 'freq';
  _downloadCanvas(finalCanvas, 'wc_' + safeName + '_' + suffix + '_' + bg, {
    target: 'group',
    scope: scope || 'single',
    content: content,
    bg: bg
  });
  document.getElementById('exportStatusGroup').textContent = '저장 완료';
}

/**
 * _drawGroupLabel(ctx, val, x, y, PW, HDR, color)
 * ★ v3.7: 그룹명을 헤더 영역에 한 번만, 항상 보이도록 그림
 *
 * 이전 v3.6 문제:
 *   - 헤더(ctx 2506줄) + 패널하단(_drawGroupLabel) 두 곳에서 중복 출력
 *   - GROUP_LABEL_TEXT_COLOR = '#f0f0ee' 고정 → 밝은 배경에서 안 보임
 *
 * v3.7 수정:
 *   - 헤더 영역에서만 한 번 그림 (패널 하단 중복 제거)
 *   - 헤더 배경색(color)을 기반으로 텍스트 명도 자동 결정
 *   - 밝은 헤더 → 진한 텍스트, 어두운 헤더 → 밝은 텍스트
 *
 * @param ctx       오버뷰 메인 캔버스 context
 * @param val       그룹명 문자열
 * @param x, y      패널 좌상단 좌표
 * @param PW, HDR   패널 폭, 헤더 높이
 * @param color     그룹 액센트 색상 (헤더 배경에 사용됨)
 */
function _drawGroupLabel(ctx, val, x, y, PW, HDR, color) {
  var label = val.length > 28 ? val.slice(0, 27) + '…' : val;

  // 헤더 배경 (액센트 색상 + 낮은 투명도)
  ctx.fillStyle = color + '28';
  roundRect(ctx, x, y, PW, HDR, [10, 10, 0, 0]);
  ctx.fill();

  // 액센트 닷
  ctx.beginPath();
  ctx.arc(x + 14, y + HDR / 2, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // 그룹명 텍스트 — 액센트 색상 기반 명도 판정
  // 색상이 어두우면(luminance<0.4) 밝은 텍스트, 밝으면 진한 텍스트
  var textColor = _getContrastText(color);
  ctx.font = "500 12px 'Noto Sans KR', sans-serif";
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 26, y + HDR / 2 + 5);
}

/**
 * _getContrastText(hexColor)
 * hex 색상의 상대 명도를 계산해 대비 텍스트 색상 반환
 * WCAG 기준 — luminance > 0.35 이면 어두운 텍스트, 아니면 밝은 텍스트
 */
function _getContrastText(hex) {
  // '#RRGGBB' 또는 '#RGB' 파싱
  var c = hex.replace('#', '');
  if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  var r = parseInt(c.substring(0,2),16)/255;
  var g = parseInt(c.substring(2,4),16)/255;
  var b = parseInt(c.substring(4,6),16)/255;
  // sRGB 상대 명도
  var luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35 ? '#1a1a1a' : '#f0f0ee';
}

function _exportGroupOverview(groupVals, content, bg, overviewBg, maxW, sizeRange, safeName) {
  // ─────────────────────────────────────────
  // 설계 원칙 (v3.6 업데이트)
  // ─────────────────────────────────────────
  // overviewBg = 항상 'transparent'
  // bg         = 사용자 선택 (개별 패널 배경)
  //
  // ★ P0 합성 순서 수정:
  //   1) panelOff  에 applyBg(bg)
  //   2) wcOnly    에 WC 픽셀만 그리기 (transparent)
  //   3) panelOff  에 wcOnly 합성
  //   4) _drawGroupLabel → WC 위에 마지막으로 그룹명 표시
  //   5) 오버뷰 ctx 에 panelOff 배치
  //
  // ★ P1 오버뷰 + 빈도표: 오버뷰 scope에서 freq 칩 무시
  //   (UI에서 이미 disabled 처리 — 방어 코드로도 추가)
  // ─────────────────────────────────────────

  var COLS = Math.min(3, groupVals.length);
  var ROWS = Math.ceil(groupVals.length / COLS);
  var PW = GROUP_W, PH = GROUP_H;
  var HDR = 36, PAD = 16, TITLE_H = 56, MARGIN = 24;
  var OW = COLS * PW + (COLS-1) * PAD + MARGIN*2;
  var OH = TITLE_H + ROWS * (PH+HDR) + (ROWS-1)*PAD + MARGIN*2;

  var off = document.createElement('canvas');
  off.width = OW; off.height = OH;
  var ctx = off.getContext('2d');
  applyBg(ctx, OW, OH, overviewBg); // 항상 투명

  groupVals.forEach(function(val, idx) {
    var col = idx % COLS, row = Math.floor(idx/COLS);
    var x = MARGIN + col*(PW+PAD);
    var y = MARGIN + TITLE_H + row*(PH+HDR+PAD);
    var color = GROUP_PANEL_COLORS[idx % GROUP_PANEL_COLORS.length];

    // ─── 패널 캔버스 생성 + 배경 ───
    var panelOff = document.createElement('canvas');
    panelOff.width = PW; panelOff.height = PH;
    var pCtx = panelOff.getContext('2d');
    applyBg(pCtx, PW, PH, bg);

    var freq = buildGroupFreq(val);
    var sorted = Object.entries(freq).sort(function(a,b){return b[1]-a[1];});

    // ─── ① WC 합성 ───
    if (content.has('wc') && sorted.length) {
      var wcOnly = document.createElement('canvas');
      wcOnly.width = PW; wcOnly.height = PH;
      drawWCOnCanvas(wcOnly, sorted.slice(0, maxW), {
        bgMode: 'transparent',
        sizeRange: sizeRange,
        W: PW, H: PH,
        palette: getActivePalette('group'),
        recordPlacements: false
      });
      pCtx.drawImage(wcOnly, 0, 0);
    }

    // ─── ② ★ v3.7: 그룹명은 패널 내부가 아닌 헤더 영역에만 그림 (중복 제거) ───

    // ─── ③ ★ v3.6 P1: 오버뷰에서는 빈도표 무시 ───
    // content.has('freq')가 true여도 오버뷰 패널에는 포함하지 않음
    // (UI에서 disabled 처리가 1차 방어, 여기는 2차 방어)

    // ─── ④ 헤더 영역 — _drawGroupLabel로 통합 ───
    // v3.7: 헤더 배경+닷+텍스트를 한 함수에서 처리, 자동 대비 텍스트 색상 적용
    _drawGroupLabel(ctx, val, x, y, PW, HDR, color);

    // ─── ⑤ 완성된 패널을 오버뷰에 배치 ───
    ctx.drawImage(panelOff, x, y+HDR);

    // ─── ⑥ 테두리 ───
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, PW, PH+HDR, 10); ctx.stroke();
  });

  var colLabel = [...selectedCols].slice(0,2).join('_');
  _downloadCanvas(off, 'overview_' + safeName + '_' + colLabel + '_transparent', {
    target: 'group',
    scope: 'overview',
    content: content,
    bg: bg
  });
  document.getElementById('exportStatusGroup').textContent = '오버뷰 저장 완료';
}

function _downloadCanvas(canvas, filename, meta) {
  if (qaSaveConfig.useFolder && qaSaveConfig.rootHandle) {
    _saveCanvasToQAFolder(canvas, filename, meta || {}).catch(function(err) {
      console.error('QA folder save failed:', err);
      _downloadCanvasBrowser(canvas, filename);
    });
    return;
  }
  _downloadCanvasBrowser(canvas, filename);
}

function _downloadCanvasBrowser(canvas, filename) {
  var a = document.createElement('a');
  a.download = filename + '_' + Date.now() + '.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

function _makeRunId() {
  var d = new Date();
  var p2 = function(n){ return String(n).padStart(2, '0'); };
  return ''
    + d.getFullYear()
    + p2(d.getMonth() + 1)
    + p2(d.getDate())
    + '-'
    + p2(d.getHours())
    + p2(d.getMinutes())
    + p2(d.getSeconds());
}

function _safeSegment(v) {
  return String(v || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60) || 'unknown';
}

function _contentKey(content) {
  var hasWC = content && content.has && content.has('wc');
  var hasFreq = content && content.has && content.has('freq');
  if (hasWC && hasFreq) return 'merged';
  if (hasWC) return 'wc';
  if (hasFreq) return 'freq';
  return 'none';
}

function _resolveScenarioId(meta) {
  var ck = _contentKey(meta.content || new Set());
  var bg = meta.bg || 'white';
  var scope = meta.scope || 'all';
  var cfg = (typeof WORDLENS_RUNTIME_CONFIG !== 'undefined') ? WORDLENS_RUNTIME_CONFIG : {};
  var matrix = cfg.scenarioMatrix || {};
  var codeMapAll = matrix.all || {};
  var group = matrix.group || {};
  var codeMapGroupOverview = group.overview || {};
  var codeMapGroupSingles = group.singles || {};

  if (meta.target === 'all') {
    return ((codeMapAll[ck] || {})[bg]) || 'A-XX';
  }
  if (scope === 'overview') {
    return codeMapGroupOverview[bg] || 'G-OV-XX';
  }
  if (scope === 'all_singles') {
    return 'G-AS-' + (((codeMapGroupSingles[ck] || {})[bg]) || 'XX');
  }
  return 'G-SG-' + (((codeMapGroupSingles[ck] || {})[bg]) || 'XX');
}

function _resolveScenarioPath(meta) {
  var target = meta.target === 'group' ? 'group' : 'all';
  var scope = target === 'group' ? (meta.scope || 'single') : 'all';
  var scenarioId = _resolveScenarioId(meta);
  var content = _contentKey(meta.content || new Set());
  var bg = meta.bg || 'white';
  return [
    'qa_exports',
    'run_' + qaSaveConfig.runId,
    target,
    scope,
    scenarioId + '_' + content + '_' + bg
  ];
}

async function _ensureDir(baseHandle, dirName) {
  return baseHandle.getDirectoryHandle(_safeSegment(dirName), { create: true });
}

async function _saveCanvasToQAFolder(canvas, filename, meta) {
  var blob = await new Promise(function(resolve){ canvas.toBlob(resolve, 'image/png'); });
  if (!blob) throw new Error('PNG blob 생성 실패');

  if (!qaSaveConfig.runId) qaSaveConfig.runId = _makeRunId();
  var path = _resolveScenarioPath(meta || {});

  var dir = qaSaveConfig.rootHandle;
  for (var i = 0; i < path.length; i++) {
    dir = await _ensureDir(dir, path[i]);
  }

  var scenarioKey = path.join('/');
  qaSaveConfig.seqByScenario[scenarioKey] = (qaSaveConfig.seqByScenario[scenarioKey] || 0) + 1;
  var seq = String(qaSaveConfig.seqByScenario[scenarioKey]).padStart(2, '0');
  var fileName = seq + '_' + _safeSegment(filename) + '.png';

  var fileHandle = await dir.getFileHandle(fileName, { create: true });
  var writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function pickQASaveFolder() {
  if (!window.showDirectoryPicker) {
    alert('이 브라우저는 폴더 저장 API를 지원하지 않습니다. 기본 다운로드를 사용하세요.');
    return;
  }
  try {
    var handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    qaSaveConfig.rootHandle = handle;
    qaSaveConfig.useFolder = true;
    qaSaveConfig.runId = _makeRunId();
    qaSaveConfig.seqByScenario = {};
    var msg = 'QA 폴더 모드 ON · run_' + qaSaveConfig.runId;
    document.getElementById('exportStatusAll').textContent = msg;
    document.getElementById('exportStatusGroup').textContent = msg;
  } catch (e) {
    console.warn('pickQASaveFolder cancelled or failed:', e);
  }
}

// ═══════════════════════════════════════════
// ★ 버전C UI — 내보내기 상태 업데이트
// ═══════════════════════════════════════════
function toggleExportChip(el, mode) {
  el.classList.toggle('on');
  var ck = el.querySelector('.ck');
  ck.textContent = el.classList.contains('on') ? '✓' : '';
  var key = el.dataset.key;
  dispatchExportAction('TOGGLE_CONTENT', { mode: mode, key: key, enabled: el.classList.contains('on') });
  updateExportUI(mode);
}

function selectExportBg(el, mode) {
  el.closest('.export-bg-row').querySelectorAll('.export-bg-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  dispatchExportAction('SET_BG', { mode: mode, bg: el.dataset.bg });
  updateExportUI(mode);
}

function selectExportScope(el) {
  el.closest('.export-scope-row').querySelectorAll('.export-scope-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  dispatchExportAction('SET_SCOPE', { scope: el.dataset.scope });
  // ★ v3.6 P1: scope 변경 시 freq 칩 비활성 동기화
  _syncGroupFreqChipState();
  updateExportUI('group');
}

/**
 * _syncGroupFreqChipState()
 * ★ v3.6 P1: 오버뷰 scope 선택 시 빈도표 칩 disabled + 안내 표시
 * 개별/일괄 scope 시 다시 활성화
 */
function _syncGroupFreqChipState() {
  var isOverview = exportState.group.scope === 'overview';
  var freqChip   = document.getElementById('exportChipFreqGroup');
  var note       = document.getElementById('exportOverviewFreqNote');

  if (!freqChip || !note) return;

  if (isOverview) {
    // 빈도표 칩 비활성 + 선택 해제
    freqChip.classList.add('disabled');
    if (freqChip.classList.contains('on')) {
      freqChip.classList.remove('on');
      freqChip.querySelector('.ck').textContent = '';
      exportState.group.content.delete('freq');
    }
    note.classList.add('visible');
  } else {
    // 빈도표 칩 다시 활성화
    freqChip.classList.remove('disabled');
    note.classList.remove('visible');
  }
}

function updateExportUI(mode) {
  var state = exportState[mode];
  var isAll = mode === 'all';
  var suffix = isAll ? 'All' : 'Group';
  var content = state.content;
  var bg = state.bg;
  var scope = state.scope;

  // 저장 버튼 활성화 조건
  var btn = document.getElementById('exportBtn' + suffix);
  var hasWC = (mode === 'all')
    ? document.getElementById('wcCanvas').style.display !== 'none'
    : true;
  btn.disabled = content.size === 0 || !hasWC;

  // ★ v3.3: 비율 UI 노출/숨김 동기화 (WC+빈도표 동시 선택 시만)
  _syncMergedRatioVisibility(mode);
  if (!isAll) _syncSingleGroupPickUI();

  // ★ v3.1+v3.3: 빈도표 설정 요약 — freqTableConfig + 비율 반영
  function _freqSummary() {
    var topLabel = freqTableConfig.topN === 0
      ? 'Top전체(≤' + MAX_FREQ_DISPLAY + ')'
      : 'Top' + freqTableConfig.topN;
    var colNames = { rank:'순위', word:'단어', count:'빈도', ratio:'비율', cumul:'누적' };
    var activeCols = ['rank','word','count','ratio','cumul']
      .filter(function(c){ return freqTableConfig.cols.has(c); })
      .map(function(c){ return colNames[c]; })
      .join('·');
    // WC+빈도표 병합 시에만 비율 힌트 표시
    var isMerged = content.has('wc') && content.has('freq');
    var ratioHint = isMerged
      ? ' · WC ' + Math.round(mergedLayoutConfig.wcRatio * 100)
        + '% : 빈도표 ' + (100 - Math.round(mergedLayoutConfig.wcRatio * 100)) + '%'
      : '';
    return '빈도표 ' + topLabel + ' [' + activeCols + ']' + ratioHint;
  }

  var hints = [];
  if (content.has('wc'))   hints.push('워드클라우드');
  if (content.has('freq')) hints.push(_freqSummary());
  var contentStr = hints.join(' + ') || '(선택 없음)';

  var bgLabel = { white: '흰색 배경', transparent: '투명 배경', dark: '검정 배경' }[bg] || bg;
  var scopeStr = '';
  if (!isAll) {
    var scopeLabels = { overview: '오버뷰 1장 (배경: 항상 투명)', all_singles: '개별 전체 ZIP', single: '개별 선택' };
    scopeStr = ' · ' + (scopeLabels[scope] || scope);
    if (scope === 'overview') bgLabel = '개별: ' + bgLabel;
  }

  document.getElementById('exportHintText' + suffix).textContent =
    content.size === 0 ? '항목을 하나 이상 선택하세요' : contentStr + ' · ' + bgLabel + scopeStr;

  // 썸네일 (빈도표 TopN 표시 포함)
  var thumbEl = document.getElementById('exportThumbs' + suffix);
  thumbEl.innerHTML = '';
  if (content.has('wc'))   thumbEl.innerHTML += '<div class="export-thumb">WC</div>';
  if (content.has('freq')) {
    var topLabel = freqTableConfig.topN === 0 ? 'ALL' : 'T' + freqTableConfig.topN;
    thumbEl.innerHTML += '<div class="export-thumb" style="font-size:8px;line-height:1.4;">FREQ<br>' + topLabel + '</div>';
  }
}

// ═══════════════════════════════════════════
