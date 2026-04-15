// NLP policy config (shared runtime defaults)
var NLP_CONFIG = {
  tokenMinLength: 2,
  tokenPattern: /[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318Fa-z0-9]/g,
  urlPattern: /https?:\/\/\S+/g,
  josaMinStemLength: 2
};
