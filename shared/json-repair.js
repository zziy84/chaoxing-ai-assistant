/**
 * 学习通 AI 助手 - 大模型返回内容与 JSON 强容错解析器
 * 具备“序号幻觉自愈”、“特征关键词语义对齐”与“判断题对错精准对号入座”功能
 */

/**
 * 从分析文本或关键词中智能推断匹配的选项 key
 * 解决大模型分析中出现简写（如分析写“分为代数和演算”，而选项为“关系代数”和“关系演算”）时的选项匹配
 * @param {string} analysis
 * @param {Array<{key: string, text: string}>} options
 * @returns {string[]} 匹配到的选项 key 数组 (如 ['B', 'C'])
 */
export function matchOptionsFromAnalysis(analysis, options = []) {
  if (!analysis || !options || options.length === 0) return [];

  const cleanAnalysis = analysis.toLowerCase();

  // 1. 优先检测【选非题/排除式指定】（如：“不属于/不是/不包括/不用于某某，故选某某”）
  for (const opt of options) {
    const optText = (opt.text || '').trim();
    const optKey = (opt.key || '').toUpperCase();
    if (!optText || optText.length < 2) continue;

    const negPattern = new RegExp(
      `(?:不包括|不包含|不属于|不是|不具有|不用于|并非|非|排除|不符合)[^，。；\\n]*${optText}|${optText}[^，。；\\n]*(?:不是|不属于|不包括|不包含|不具有|不用于|错误|排除|不符)`,
      'i'
    );
    if (negPattern.test(analysis)) {
      // 在否定判断语境中，被指明为“不属于/不包含”的选项正是选非题的目标答案
      return [optKey];
    }
  }

  // 2. 检测显式指定的选项结论（如“应选A”、“故选B”、“答案为C”、“选择D”）
  for (const opt of options) {
    const optKey = (opt.key || '').toUpperCase();
    const explicitPattern = new RegExp(`(?:应选|故选|选择|答案(?:是|为)?)[：:\\s]*[【\\[\\(（]?${optKey}[】\\]\\)）]?`, 'i');
    if (explicitPattern.test(analysis)) {
      return [optKey];
    }
  }

  const directMatches = [];

  // 3. 完整选项文本匹配
  for (const opt of options) {
    const optText = (opt.text || '').trim();
    const optKey = (opt.key || '').toUpperCase();
    if (optText.length >= 2 && cleanAnalysis.includes(optText.toLowerCase())) {
      if (!directMatches.includes(optKey)) directMatches.push(optKey);
    }
  }

  if (directMatches.length >= 2) {
    return directMatches.sort();
  } else if (directMatches.length === 1) {
    return directMatches;
  }

  // 4. 提取特征关键词并打分匹配（处理模型简写，如“分为代数和演算”）
  const candidates = options.map(opt => {
    const raw = (opt.text || '').trim();
    const optKey = (opt.key || '').toUpperCase();
    const keywords = [];
    if (raw.length >= 2) {
      keywords.push(raw);
      // 去除常见前缀（如“关系”、“关于”、“基本”、“主要”）获取纯核心词
      const stripped = raw.replace(/^(关系|基本|关于|主要)/, '');
      if (stripped.length >= 2 && stripped !== raw) {
        keywords.push(stripped);
      }
      // 提取末尾或开头的双字核心词
      if (raw.length > 2) {
        keywords.push(raw.slice(-2));
        keywords.push(raw.slice(0, 2));
      }
    }
    return {
      key: optKey,
      text: raw,
      keywords: Array.from(new Set(keywords))
    };
  });

  const scores = {};
  for (const cand of candidates) {
    let score = 0;
    for (const kw of cand.keywords) {
      if (kw.length >= 2 && cleanAnalysis.includes(kw.toLowerCase())) {
        // 判断该关键词是否为本选项独占（其他选项未包含该词）
        const isExclusive = !options.some(o => {
          if (o.key === cand.key) return false;
          return (o.text || '').includes(kw);
        });
        score += isExclusive ? 4 : 1;
      }
    }
    if (score > 0) {
      scores[cand.key] = score;
    }
  }

  const scoredEntries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (scoredEntries.length >= 2) {
    // 选取得分 >= 2 的优势选项（过滤掉仅仅蹭到泛用单字的选项）
    const valid = scoredEntries
      .filter(([k, s]) => s >= 2)
      .map(([k]) => k);
    if (valid.length >= 2) {
      return valid.sort();
    }
  } else if (scoredEntries.length === 1 && scoredEntries[0][1] >= 3) {
    return [scoredEntries[0][0]];
  }

  return directMatches;
}

function cleanBlankPrefix(str) {
  if (!str) return '';
  return String(str)
    .replace(/^(?:第\s*\d+\s*(?:个)?空\s*[:：、\.\s]*|[\(（]\s*\d+\s*[\)）]\s*|\d+\s*[\.、:：]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*)+/i, '')
    .trim();
}

/**
 * 校验并修正大模型答案中的“序号幻觉”及判断题对错映射
 * @param {Object} parsed
 * @param {string[]} parsed.answer
 * @param {string[]} parsed.matched_options
 * @param {string} parsed.analysis
 * @param {number} parsed.confidence
 * @param {Array<{key: string, text: string}>} [options]
 * @param {string} [questionType]
 * @returns {Object} 修正后的解析对象
 */
export function reconcileAnswerWithOptions(parsed, options = [], questionType = '') {
  const rawAnswers = (parsed.answer || []).map(a => String(a).trim());
  const matchedOptions = (parsed.matched_options || []).map(m => String(m).trim()).filter(Boolean);
  const analysis = parsed.analysis || '';

  // 1. 填空题答案预处理与拆分自愈
  if (questionType === 'blank' && parsed.answer && parsed.answer.length > 0) {
    let flatAnswers = [];
    for (const item of parsed.answer) {
      const str = String(item).trim();
      if (parsed.answer.length === 1 && /[,，;；\n、]+/.test(str)) {
        const parts = str.split(/[,，;；\n、]+/)
          .map(cleanBlankPrefix)
          .filter(Boolean);
        flatAnswers.push(...parts);
      } else {
        const cleaned = cleanBlankPrefix(str);
        flatAnswers.push(cleaned || str);
      }
    }
    if (flatAnswers.length > 0) {
      parsed.answer = flatAnswers;
    }
    parsed.displayAnswer = parsed.answer.join(', ');
    return parsed;
  }

  // 2. 简答题长答案格式化保障
  const isEssay = questionType === 'essay' || (
    !options || options.length === 0
  );

  if (questionType === 'essay' || (parsed.answer && parsed.answer.length > 1 && parsed.answer.some(a => String(a).length > 15))) {
    const formatted = parsed.answer.map((ans, idx) => {
      const trimmed = String(ans).trim();
      const hasNum = /^[\(（]?\d+[\)）\.\、]/i.test(trimmed);
      return hasNum ? trimmed : `(${idx + 1}) ${trimmed}`;
    });
    parsed.displayAnswer = formatted.join('\n');
    return parsed;
  }

  if (!options || options.length === 0) {
    if (!parsed.displayAnswer) {
      parsed.displayAnswer = (parsed.answer || []).join(', ') || '无法确定';
    }
    return parsed;
  }

  // 2. 判断题专项核实与选项逆序自愈
  const isJudge = questionType === 'judge' || (
    options.length === 2 && options.some(o => {
      const t = (o.text || '').trim();
      return /^(对|错|正确|错误|是|否|T|F|TRUE|FALSE|√|×)$/i.test(t) || /对|错|正确|错误/.test(t);
    })
  );

  if (isJudge) {
    let intendedIsTrue = null;

    // 0. 优先深度分析 analysis 中的明确逻辑判词与否定结论（权重最高，彻底根治“解析明言错误/不保密/不同，答案却盲目给出 A/对”的顽疾）
    if (analysis) {
      const hasFalseVerdict = (
        /(?:说法|表述|观点|判断|题干|命题|结论|断言)+(?:是|为)?(?:完全|显然|明显|极其)?(?:错误|错|不正确|不属实|违背|不成立|荒谬|假|不符合)/i.test(analysis) ||
        /(?:此|该|上述|题中)+(?:判断|命题|表述|说法)+(?:是|为)?(?:完全|显然|明显)?(?:错误|不成立|不正确)/i.test(analysis) ||
        /(?:并不|并非|不能|无法|不会|不属于|不具有|不包含|不用于|不保密|不同于|不相等|不一致)(?:是|具有|属于|能够|作为|等于)?/i.test(analysis) ||
        /(?:结构不同|长度不同|最大长度不同|非病毒检测|本身不保密|非保密技术|不安全)/i.test(analysis) ||
        /(?:故|因此|所以)?(?:判断|结论|答案)?(?:为|是)?(?:错误|错|×|FALSE|F)(?:。|$|，)/i.test(analysis)
      ) && !/(?:说法|表述|观点|判断|题干|命题|结论)+(?:是|为)?(?:完全|确实|显然)?(?:正确|对|属实|无误|成立)/i.test(analysis);

      const hasTrueVerdict = (
        /(?:说法|表述|观点|判断|题干|命题|结论)+(?:是|为)?(?:完全|确实|显然|非常)?(?:正确|对|属实|无误|成立)/i.test(analysis) ||
        /(?:此|该|上述|题中)+(?:判断|命题|表述|说法)+(?:是|为)?(?:完全|确实|显然)?(?:正确|成立|属实|无误)/i.test(analysis) ||
        /(?:确实|确实是|正是|确实具有|完全符合题意)/i.test(analysis) ||
        /(?:故|因此|所以)?(?:判断|结论|答案)?(?:为|是)?(?:正确|对|√|TRUE|T)(?:。|$|，)/i.test(analysis)
      ) && !hasFalseVerdict;

      if (hasFalseVerdict) {
        intendedIsTrue = false;
      } else if (hasTrueVerdict) {
        intendedIsTrue = true;
      }
    }

    // A. 若解析未给出决断，从 answer 数组中的语义词判定真实意图
    if (intendedIsTrue === null) {
      for (const ans of rawAnswers) {
        if (/^(正确|对|T|TRUE|√|是)$/i.test(ans)) {
          intendedIsTrue = true;
          break;
        }
        if (/^(错误|错|F|FALSE|×|否)$/i.test(ans)) {
          intendedIsTrue = false;
          break;
        }
      }
    }

    // B. 若 answer 中没有显式语义词，检查 matched_options
    if (intendedIsTrue === null) {
      const hasTrueMatch = matchedOptions.some(m => /^(?:对|正确|√|TRUE|是)$/i.test(m.trim()));
      const hasFalseMatch = matchedOptions.some(m => /^(?:错|错误|×|FALSE|否)$/i.test(m.trim()));
      if (hasTrueMatch && !hasFalseMatch) intendedIsTrue = true;
      else if (hasFalseMatch && !hasTrueMatch) intendedIsTrue = false;
    }

    // C. 若仍未判定语义，但 answer 给出了选项字母（如 ["A"] 或 ["B"]）
    if (intendedIsTrue === null && rawAnswers.length > 0) {
      const firstLetter = rawAnswers[0].toUpperCase();
      const matchedOpt = options.find(o => (o.key || '').toUpperCase() === firstLetter);
      if (matchedOpt) {
        if (/对|正确|√|TRUE|T|是/i.test(matchedOpt.text)) intendedIsTrue = true;
        else if (/错|错误|×|FALSE|F|否/i.test(matchedOpt.text)) intendedIsTrue = false;
      }
    }

    // D. 根据已识别的真实正误意图，在页面的真实 options 中精准对号入座
    if (intendedIsTrue !== null) {
      const targetOpt = options.find(o => {
        const t = (o.text || '').trim();
        return intendedIsTrue ? /对|正确|√|TRUE|T|是/i.test(t) : /错|错误|×|FALSE|F|否/i.test(t);
      });

      if (targetOpt) {
        const semanticLabel = intendedIsTrue ? '对' : '错';
        parsed.answer = [targetOpt.key];
        parsed.matched_options = [targetOpt.text || semanticLabel];
        parsed.displayAnswer = `${targetOpt.key} (${targetOpt.text || semanticLabel})`;
        return parsed;
      }
    }
  }

  // 3. 选择题（多选题与单选题）序号幻觉修正
  // 检查 matched_options 对应在 options 中的真实 key 列表
  const keysFromMatchedOptions = [];
  if (matchedOptions.length > 0) {
    for (const m of matchedOptions) {
      for (const opt of options) {
        const optText = (opt.text || '').trim();
        if (!optText) continue;
        const optKey = (opt.key || '').toUpperCase();
        if (optText === m || (optText.length >= 2 && m.includes(optText)) || (m.length >= 2 && optText.includes(m))) {
          if (!keysFromMatchedOptions.includes(optKey)) {
            keysFromMatchedOptions.push(optKey);
          }
        }
      }
    }
  }

  // 若 matched_options 提取到了确切的选项 key
  if (keysFromMatchedOptions.length > 0) {
    const cleanRawAnswers = rawAnswers
      .map(a => a.toUpperCase())
      .filter(a => /^[A-G]$/.test(a));

    const isMismatch = cleanRawAnswers.length !== keysFromMatchedOptions.length ||
      cleanRawAnswers.some(k => !keysFromMatchedOptions.includes(k));

    if (isMismatch) {
      const hallucinatedKeys = cleanRawAnswers.filter(k => !keysFromMatchedOptions.includes(k));
      let isConfidentHallucination = false;

      if (hallucinatedKeys.length > 0) {
        isConfidentHallucination = hallucinatedKeys.every(k => {
          const opt = options.find(o => (o.key || '').toUpperCase() === k);
          if (!opt || !opt.text || opt.text.length < 2) return true;
          return !matchedOptions.some(m => m.includes(opt.text)) && !analysis.includes(opt.text);
        });
      }

      if (isConfidentHallucination || (questionType === 'multiple' && keysFromMatchedOptions.length >= 2) || (questionType === 'single' && keysFromMatchedOptions.length === 1)) {
        parsed.answer = keysFromMatchedOptions.sort();
        parsed.displayAnswer = parsed.answer.join(', ');
        return parsed;
      }
    }
  }

  // 4. 从 analysis 深度推导真实选项（处理模型 matched_options 缺失或简写，如“关键字定义”或“分为代数和演算”）
  if (analysis && options.length > 0) {
    const inferredKeys = matchOptionsFromAnalysis(analysis, options);
    if (inferredKeys.length >= 2 && questionType === 'multiple') {
      const cleanRawAnswers = rawAnswers.map(a => a.toUpperCase()).filter(a => /^[A-G]$/.test(a));
      // 若原 answer 存在序号幻觉（如回答 A, B，但推导为 B, C）
      const isMismatch = cleanRawAnswers.length !== inferredKeys.length || cleanRawAnswers.some(k => !inferredKeys.includes(k));
      if (isMismatch) {
        parsed.answer = inferredKeys;
        parsed.displayAnswer = parsed.answer.join(', ');
        return parsed;
      }
    } else if ((questionType === 'single' || options.length > 2) && inferredKeys.length === 1) {
      const cleanRawAnswers = rawAnswers.map(a => a.toUpperCase()).filter(a => /^[A-G]$/.test(a));
      const inferredKey = inferredKeys[0];
      const rightOpt = options.find(o => (o.key || '').toUpperCase() === inferredKey);
      if (rightOpt) {
        if (cleanRawAnswers.length === 0 || cleanRawAnswers[0] !== inferredKey) {
          parsed.answer = [inferredKey];
          parsed.displayAnswer = isJudge ? `${inferredKey} (${rightOpt.text || inferredKey})` : inferredKey;
          parsed.matched_options = [rightOpt.text || inferredKey];
          return parsed;
        } else if (!parsed.displayAnswer || (isJudge && !parsed.displayAnswer.includes('('))) {
          parsed.displayAnswer = isJudge ? `${inferredKey} (${rightOpt.text || inferredKey})` : inferredKey;
        }
      }
    }
  }

  // 5. 若 answer 中直接填入了选项的具体文本而非字母（如 answer: ["关系代数", "关系演算"]），自动翻译为对应字母
  const nonLetterAnswers = rawAnswers.filter(a => !/^[A-G]$/i.test(a));
  if (nonLetterAnswers.length > 0 && options.length > 0) {
    const textMappedKeys = [];
    for (const ansText of nonLetterAnswers) {
      for (const opt of options) {
        const optText = (opt.text || '').trim();
        const optKey = (opt.key || '').toUpperCase();
        if (optText && (optText === ansText || (optText.length >= 2 && ansText.includes(optText)) || (ansText.length >= 2 && optText.includes(ansText)))) {
          if (!textMappedKeys.includes(optKey)) {
            textMappedKeys.push(optKey);
          }
        }
      }
    }
    if (textMappedKeys.length > 0) {
      parsed.answer = textMappedKeys.sort();
      parsed.displayAnswer = parsed.answer.join(', ');
      return parsed;
    }
  }

  // 默认格式化 displayAnswer
  if (isJudge && parsed.answer && parsed.answer.length === 1 && options.length > 0) {
    const singleKey = String(parsed.answer[0]).toUpperCase();
    const opt = options.find(o => (o.key || '').toUpperCase() === singleKey);
    if (opt && opt.text && (!parsed.displayAnswer || !parsed.displayAnswer.includes('('))) {
      parsed.displayAnswer = `${singleKey} (${opt.text})`;
    }
  }
  if (!parsed.displayAnswer) {
    parsed.displayAnswer = (parsed.answer || []).join(', ') || '无法确定';
  }
  return parsed;
}

function tryParseJsonRobust(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const firstBrace = rawText.indexOf('{');
  if (firstBrace === -1) return null;

  let rawSlice = rawText.slice(firstBrace).trim();
  const lastBrace = rawSlice.lastIndexOf('}');
  let candidate = lastBrace !== -1 && lastBrace > 0 ? rawSlice.slice(0, lastBrace + 1) : rawSlice;

  function sanitize(str) {
    return str
      .replace(/,\s*([}\]])/g, '$1') // 去除尾随逗号
      .replace(/[\u201C\u201D]/g, '"') // 替换中文双引号
      .replace(/[\u2018\u2019]/g, "'"); // 替换中文单引号
  }

  // 1. 尝试直接常规解析
  try {
    return JSON.parse(sanitize(candidate));
  } catch {}

  // 2. 截断修复（针对 Token 耗尽导致的未闭合引号、数组、对象）
  let strToFix = sanitize(candidate);
  let inString = false;
  let escape = false;
  let openBrackets = 0;
  let openBraces = 0;

  for (let i = 0; i < strToFix.length; i++) {
    const ch = strToFix[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '[') openBrackets++;
      else if (ch === ']') openBrackets = Math.max(0, openBrackets - 1);
      else if (ch === '{') openBraces++;
      else if (ch === '}') openBraces = Math.max(0, openBraces - 1);
    }
  }

  if (inString) strToFix += '"';
  while (openBrackets > 0) {
    strToFix += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    strToFix += '}';
    openBraces--;
  }

  try {
    return JSON.parse(strToFix);
  } catch {}

  return null;
}

/**
 * 清洗并解析大模型返回的内容为结构化对象，并自动与题目选项进行交叉核对自愈
 * @param {string} rawText 
 * @param {Array<{key: string, text: string}>} [options] 可选的题目选项，用于辅助兜底匹配与序号核实
 * @param {string} [questionType=''] 题目类型 (single, multiple, judge, blank, essay)
 * @returns {{ answer: string[], matched_options: string[], confidence: number, analysis: string, displayAnswer: string }}
 */
export function extractStructuredAnswer(rawText, options = [], questionType = '') {
  if (!rawText || typeof rawText !== 'string') {
    return {
      answer: [],
      matched_options: [],
      confidence: 0,
      analysis: '未能获取有效回答',
      displayAnswer: '无法确定'
    };
  }

  let text = rawText.trim();

  // 1. 去除代码块包裹标记
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // 2. 强容错与截断自愈 JSON 解析
  const parsed = tryParseJsonRobust(text);
  if (parsed && typeof parsed === 'object') {
    let answers = [];
    if (Array.isArray(parsed.answer)) {
      answers = parsed.answer.map(String).filter(Boolean);
    } else if (parsed.answer !== undefined && parsed.answer !== null) {
      answers = [String(parsed.answer)].filter(Boolean);
    }

    if (answers.length > 0 || (parsed.matched_options && parsed.matched_options.length > 0)) {
      const candidate = {
        answer: answers,
        matched_options: Array.isArray(parsed.matched_options) ? parsed.matched_options : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        analysis: parsed.analysis || '暂无详细分析'
      };

      return reconcileAnswerWithOptions(candidate, options, questionType);
    }
  }

  // 3. 兜底策略：正则提取字母答案（如 "正确答案是 A" 或 "答案: [A, B]" 或 "判断：正确"）
  const answers = [];
  let confidence = 0.7;

  // 若为简答题，优先从截断文本中提取答案
  if (questionType === 'essay') {
    const answerFieldMatch = text.match(/"answer"\s*[:：]\s*(?:\[\s*"|")([^"\]]+)/i);
    if (answerFieldMatch && answerFieldMatch[1].trim()) {
      answers.push(answerFieldMatch[1].replace(/\\n/g, '\n').trim());
      confidence = 0.9;
    } else {
      const cleanEssay = text
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .replace(/[{}"\[\]]/g, '')
        .replace(/(?:matched_options|answer|confidence|analysis)\s*[:：]/gi, '')
        .trim();
      if (cleanEssay.length > 5) {
        answers.push(cleanEssay);
        confidence = 0.85;
      }
    }
  }

  // 正则寻找常见的客观题答案模式
  const answerRegexList = [
    /(?:正确答案|推荐答案|参考答案|答案)(?:是|为)?[：:\s]*([A-Ga-g对错正确错误√×]+)/i,
    /【(?:正确答案|参考答案|答案)】(?:是|为)?[：:\s]*([A-Ga-g对错正确错误√×]+)/i,
    /(?:应选|选择|故选)[：:\s]*([A-Ga-g])/i,
    /\b([A-D])\b(?=.*(?:是正确的|为正确选项))/i
  ];

  for (const reg of answerRegexList) {
    const match = text.match(reg);
    if (match && match[1]) {
      const val = match[1].trim();
      // 如果包含连续字母如 ABCD 或逗号隔开
      if (/^[A-Ga-g]+$/.test(val)) {
        val.split('').forEach(char => answers.push(char.toUpperCase()));
      } else if (val === '对' || val === '√') {
        answers.push('正确');
      } else if (val === '错' || val === '×') {
        answers.push('错误');
      } else {
        answers.push(val);
      }
      break;
    }
  }

  // 如果仍无答案，但 options 存在，尝试模糊比对文本
  let matched_options = [];
  if (answers.length === 0 && options && options.length > 0) {
    for (const opt of options) {
      if (opt.text && opt.text.length > 2 && text.includes(opt.text)) {
        if (opt.key) answers.push(opt.key);
        matched_options.push(opt.text);
      }
    }
  }

  const fallbackCandidate = {
    answer: Array.from(new Set(answers)),
    matched_options,
    confidence: answers.length > 0 ? confidence : 0.3,
    analysis: text
  };

  return reconcileAnswerWithOptions(fallbackCandidate, options, questionType);
}
