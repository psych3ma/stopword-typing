// Domain/NLP and stopword logic

// STOPWORDS
// ═══════════════════════════════════════════
function _setStopwords(nextSet){
  stopwords = new Set(nextSet || []);
}

function renderSWTags(){
  var wrap=document.getElementById('swTagsWrap');
  wrap.innerHTML=[...stopwords].sort().map(w=>`<span class="sw-tag">${w}<button class="sw-tag-x" onclick="removeSW('${w.replace(/'/g,"\\'").replace(/\\/g,'\\\\')}')">×</button></span>`).join('');
  document.getElementById('swCount').textContent=`${stopwords.size}개 불용어 적용 중`;
}
function addSW(){var inp=document.getElementById('swInput');inp.value.split(/[\s,]+/).filter(w=>w).forEach(w=>stopwords.add(w.toLowerCase()));inp.value='';renderSWTags();}
function removeSW(w){stopwords.delete(w);renderSWTags();}
function resetSW(){
  var colList=[...selectedCols];
  var combined=csvRows.map(r=>colList.map(c=>r[c]||'').join(' ')).join(' ').toLowerCase();
  var next = new Set();
  if(/[\uAC00-\uD7A3]/.test(combined))SW_KO.forEach(w=>next.add(w));
  if(/[a-z]/.test(combined))SW_EN.forEach(w=>next.add(w));
  _setStopwords(next);
  renderSWTags();
}
function saveBulk(){_setStopwords(document.getElementById('bulkTA').value.split(/[\s,\n]+/).filter(w=>w).map(w=>w.toLowerCase()));renderSWTags();swTab('tags');}
function loadBulk(){document.getElementById('bulkTA').value=[...stopwords].sort().join('\n');}
function swTab(id){['tags','freq','bulk'].forEach(t=>{document.getElementById('sp-'+t).classList.toggle('hidden',t!==id);document.getElementById('st-'+t).classList.toggle('active',t===id);});if(id==='freq')renderFreqTable();if(id==='bulk')loadBulk();}

// ═══════════════════════════════════════════
// TOKENIZE & FREQ
// ═══════════════════════════════════════════
function tokenize(text){
  var cfg = (typeof NLP_CONFIG !== 'undefined') ? NLP_CONFIG : {};
  var tokenMinLength = cfg.tokenMinLength || 2;
  var urlPattern = cfg.urlPattern || /https?:\/\/\S+/g;
  var tokenPattern = cfg.tokenPattern || /[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318Fa-z0-9]/g;
  var tokens=text.toLowerCase().replace(urlPattern,' ').replace(tokenPattern,' ').split(/\s+/).filter(w=>w.length>=tokenMinLength);
  return useJosaStrip?tokens.map(w=>stripJosa(w)).filter(w=>w.length>=tokenMinLength):tokens;
}
function buildFreq(cols){
  var colList=Array.isArray(cols)?cols:[...cols];
  var allText=csvRows.map(r=>colList.map(c=>r[c]||'').join(' ')).join(' ');
  var freq={};
  tokenize(allText).forEach(w=>{if(!stopwords.has(w))freq[w]=(freq[w]||0)+1;});
  return freq;
}
function getEffectiveStopwords(groupValue){
  var local=localStopwords.get(groupValue)||new Set();
  if(!local.size)return stopwords;
  return new Set([...stopwords,...local]);
}
function buildGroupFreq(groupValue){
  var colList=[...selectedCols];
  var rows=csvRows.filter(r=>(r[groupCol]||'').trim()===groupValue);
  var allText=rows.map(r=>colList.map(c=>r[c]||'').join(' ')).join(' ');
  var effective=getEffectiveStopwords(groupValue);
  var freq={};
  tokenize(allText).forEach(w=>{if(!effective.has(w))freq[w]=(freq[w]||0)+1;});
  return freq;
}
// ═══════════════════════════════════════════
