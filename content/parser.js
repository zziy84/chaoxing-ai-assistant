/**
 * 学习通 AI 助手 - 页面 DOM 题目精准提取与分析器 (超星全版本深度适配版)
 */

import { QUESTION_TYPES } from '../shared/constants.js';

/**
 * 清洗字符串，去除多余空白与隐藏字符
 * @param {string} str 
 * @returns {string}
 */
function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // 去除零宽字符
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 识别题型
 * @param {string} text 
 * @returns {string} QUESTION_TYPES
 */
function detectQuestionType(text) {
  if (/多选题|多项选择|多选/i.test(text)) return QUESTION_TYPES.MULTIPLE;
  if (/单选题|单项选择|单选/i.test(text)) return QUESTION_TYPES.SINGLE;
  if (/判断题|判断/i.test(text)) return QUESTION_TYPES.JUDGE;
  if (/填空题|填空/i.test(text)) return QUESTION_TYPES.BLANK;
  if (/简答题|论述题|名词解释|计算题|简答/i.test(text)) return QUESTION_TYPES.ESSAY;
  return QUESTION_TYPES.UNKNOWN;
}

/**
 * 从页面或指定根节点中精准提取题目列表
 * @param {Document|HTMLElement} root
 * @returns {Array<Object>} 题目列表
 */
export function extractQuestionsFromPage(root = document) {
  const questions = [];

  // 1. 如果当前文档嵌套了同源 iframe（学习通典型架构：外层包裹作业标题，iframe 内才是题目）
  // 优先尝试从 iframe 中检索题目
  try {
    const iframes = root.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        if (iframe.contentDocument && iframe.contentDocument.body) {
          const iframeQuestions = extractQuestionsFromPage(iframe.contentDocument);
          if (iframeQuestions.length > 0) {
            questions.push(...iframeQuestions);
          }
        }
      } catch {
        // 跨域 iframe 忽略
      }
    }
    if (questions.length > 0) {
      return questions;
    }
  } catch {
    // 忽略
  }

  // 2. 寻找真正的单题容器（必须排除整卷大外层容器）
  // 核心原则：题目容器不能为整卷总外壳 (fanyaMarking)，不能包含 iframe，且必须具备选项或输入框
  let candidateContainers = [];

  // 优先级 A：最明确的单题容器类名（将新版单题容器提至最高优先级，避免外层 TiMu 拦截）
  const itemSelectors = [
    '.singleQuesId',                          // 移动端及新版做题页单题容器 (如 .padBom50.questionLi.fontLabel.singleQuesId)
    '.questionLi',                            // 列表型题目
    '.padBom50.questionLi',                   // 新版超星作业题块
    'div[id^="question"][class*="clearfix"]', // 具名题目容器
    '.padContent720 > .clearfix',             // 试卷内题块
    '.TiMu'                                   // 经典超星题目块
  ];

  for (const selector of itemSelectors) {
    const list = Array.from(root.querySelectorAll(selector));
    const valid = list.filter(el => {
      // 必须排除整卷/页面总外壳
      if (el.id === 'fanyaMarking' || el.classList?.contains?.('fanyaMarking') || el.classList?.contains?.('mark_table')) {
        return false;
      }
      // 必须排除作业总框架外层 iframe（如 frame_content），但允许题目内部富文本编辑器 UEditor 的 iframe
      const outerIframe = el.querySelector('iframe#frame_content, iframe[name="frame_content"], iframe.ans-job-icon');
      if (outerIframe) return false;

      // 必须包含选项列表或输入框（兼容填空题 .Answer, .divText, .edui-editor 等容器）
      const hasOptions = el.querySelector(
        '.Zy_ulTop, .Zy_ulBottom, ul.ulTop, .answerBg, .stem_answer, [role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"], [class*="choice"]'
      );
      const hasInputs = el.querySelector(
        'input[type="text"], textarea, .Answer, .divText, .textDIV, [typename*="填空"], input[name^="tiankongsize"], .edui-editor'
      ) || (el.getAttribute?.('typename') && el.getAttribute('typename').includes('填空')) || el.classList?.contains?.('singleQuesId');
      
      // 不能包含多个题目标题或子题目（防止误抓外层总容器）
      const titles = el.querySelectorAll('.Zy_TItle, .Cy_TItle, h3.mark_name');
      const subQuestions = el.querySelectorAll('.singleQuesId, .questionLi');
      return (hasOptions || hasInputs) && titles.length <= 1 && subQuestions.length <= 1;
    });

    if (valid.length > 0) {
      candidateContainers = valid;
      break;
    }
  }

  // 优先级 B：如果未找到上述容器，通过具体题目题干向上定位
  if (candidateContainers.length === 0) {
    const titleNodes = Array.from(root.querySelectorAll('h3.mark_name, .Zy_TItle, .Cy_TItle, .fontLabel'));
    titleNodes.forEach(tNode => {
      const rawTitle = cleanText(tNode.innerText || tNode.textContent || '');
      // 剔除作业名称（如单纯的“作业2”、“章节测验”等非题干文本）
      if (!rawTitle || rawTitle === '作业' || /^作业\s*\d+$/i.test(rawTitle)) return;

      // 向上寻找最小的题目包含块
      let container = tNode.closest('.singleQuesId, .questionLi, .padBom50, .TiMu, .clearfix, li');
      if (!container || container === root.body || container.id === 'fanyaMarking' || container.querySelectorAll('h3.mark_name, .Zy_TItle').length > 1) {
        container = tNode.parentElement;
      }
      if (container && !candidateContainers.includes(container) && !container.querySelector('iframe')) {
        const hasOptOrInput = container.querySelector('input, textarea, .Zy_ulTop, .answerBg, .stem_answer, li');
        if (hasOptOrInput) {
          candidateContainers.push(container);
        }
      }
    });
  }

  // 3. 逐一提取每道题目的详细信息
  candidateContainers.forEach((container, index) => {
    try {
      // 提取标题区域（支持超星新版 h3.mark_name 与经典 .Zy_TItle）
      const titleEl = container.querySelector('h3.mark_name, .mark_name, .Zy_TItle, .Cy_TItle, .fontLabel, .workTextWrap, h3') || container;
      const fullTitleText = cleanText(titleEl.innerText || titleEl.textContent || '');

      // 过滤掉误抓的非题目内容（如纯页面标题“作业2”）
      if (!fullTitleText || /^作业\s*\d+$/i.test(fullTitleText)) {
        return;
      }

      // 提取真实超星原生题目 ID (qid)
      const cxId = container.getAttribute?.('data') ||
                   container.id?.replace(/^question_?/, '') ||
                   container.querySelector?.('[qid]')?.getAttribute?.('qid') ||
                   container.querySelector?.('input[name^="answer"]')?.name?.replace(/^answer(type)?/, '') ||
                   '';

      // 提取题型：优先从容器原生 typename 或 qtype 属性识别（超星标准: typename="多选题" / qtype="1"）
      const typeAttr = container.getAttribute?.('typename') || '';
      const qtypeAttr = container.getAttribute?.('qtype') || '';
      let type = QUESTION_TYPES.UNKNOWN;
      if (qtypeAttr === '1' || /多选/i.test(typeAttr)) type = QUESTION_TYPES.MULTIPLE;
      else if (qtypeAttr === '0' || /单选/i.test(typeAttr)) type = QUESTION_TYPES.SINGLE;
      else if (qtypeAttr === '3' || /判断/i.test(typeAttr)) type = QUESTION_TYPES.JUDGE;
      else if (qtypeAttr === '2' || /填空/i.test(typeAttr)) type = QUESTION_TYPES.BLANK;
      else if (/简答|论述/i.test(typeAttr)) type = QUESTION_TYPES.ESSAY;

      if (type === QUESTION_TYPES.UNKNOWN) {
        type = detectQuestionType(fullTitleText);
      }

      // 如果题干未标明题型，通过选项多选特征精确识别
      if (type === QUESTION_TYPES.UNKNOWN && container.querySelector('.num_option_dx, [onclick*="addMultipleChoice"]')) {
        type = QUESTION_TYPES.MULTIPLE;
      }

      // 去除题目前缀标记，如 "1. 【单选题】" 或 "1. (单选题)" 或 "1、"
      let cleanTitle = fullTitleText
        .replace(/^\d+[\.、\s]*/, '')
        .replace(/[【\(（](?:单选题|多选题|判断题|填空题|简答题|论述题|名词解释|计算题)[】\)）]/g, '')
        .trim();

      const options = [];
      const blankInputs = [];

      // 提取选项 (选择题 & 判断题)
      // 兼容经典 ul li 以及新版 .stem_answer .answerBg 单项 div
      const rawOptions = Array.from(container.querySelectorAll(
        '.stem_answer .answerBg, ' +
        '.answerBg, ' +
        '.Zy_ulTop li, ' +
        '.Zy_ulBottom li, ' +
        'ul.ulTop li, ' +
        'ul.Zy_ulTop li, ' +
        '.stem_answer [role="radio"], ' +
        '.stem_answer [role="checkbox"]'
      ));

      // 去重并排除嵌套：保留独立的选项容器
      const optionNodes = [];
      for (const node of rawOptions) {
        if (!node) continue;
        if (node === titleEl || titleEl.contains(node)) continue;
        if (optionNodes.some(existing => existing.contains(node))) continue;
        if (!optionNodes.includes(node)) {
          optionNodes.push(node);
        }
      }

      const seenOptionTexts = new Set();
      optionNodes.forEach(optNode => {
        const fullText = cleanText(optNode.innerText || optNode.textContent || '');
        if (!fullText || seenOptionTexts.has(fullText)) return;

        // 1. 提取选项视觉标签 A, B, C, D 或 对, 错
        // 核心原则：选项 key 必须是用户和界面上肉眼可见的“视觉标签”（Visual Label）！
        // 超星页面上 options 的 data 属性常常是后台乱序混淆 ID（例如视觉 A 对应 data="C"），绝不能当作视觉标签！
        let key = '';

        // 优先从界面可见的选项标记元素提取 (如 .num_option, .num_option_dx, a.fl, i.fl)
        const keyEl = optNode.querySelector('.num_option, .num_option_dx, [class*="num_option"], a.fl, i.fl, .option-key, label');
        if (keyEl) {
          const k = cleanText(keyEl.innerText || keyEl.textContent || '').replace(/[\.、\:\s\)\-\—]+$/, '');
          if (/^[A-Ga-g对错正确错误√×]$/.test(k)) {
            key = k.toUpperCase();
          }
        }

        // 其次从文本前缀提取 (如 "A. 域" 或 "A\n域")
        if (!key) {
          const keyMatch = fullText.match(/^([A-Ga-g对错正确错误√×])[\.、\s\:\)\-\—\n]/);
          if (keyMatch) {
            key = keyMatch[1].toUpperCase();
          }
        }

        // 兜底：按出现顺序推导视觉字母 (第1个为 A, 第2个为 B...)
        if (!key) {
          key = String.fromCharCode(65 + options.length);
        }

        // 保存超星内部打乱的 data 属性（用于表单隐藏域与底层通信保底，兼容单选混淆字母及判断题 true/false）
        const rawDataAttr = optNode.getAttribute?.('data') || optNode.querySelector?.('[data]')?.getAttribute?.('data') || '';
        const trimmedAttr = (rawDataAttr || '').trim();
        const cxDataKey = trimmedAttr && /^(?:true|false|[A-Ga-g对错正确错误√×])$/i.test(trimmedAttr)
          ? (/^(?:true|false)$/i.test(trimmedAttr) ? trimmedAttr.toLowerCase() : trimmedAttr.toUpperCase())
          : key;

        // 2. 提取选项纯文本描述 (优先取 .answer_p, .answer_text，否则以 fullText 兜底并彻底剔除字母前缀)
        let optionContent = '';
        const pDescEl = optNode.querySelector('.answer_p, .answer_text, p');
        if (pDescEl) {
          optionContent = cleanText(pDescEl.innerText || pDescEl.textContent || '');
        }
        if (!optionContent) {
          optionContent = fullText;
        }
        // 彻底去除可能遗留的选项字母前缀（必须紧随分隔符，如 "A. 域" 或 "A 域" 或 "A\n域"，严禁误伤 "CPU" 或 "Diffie"）
        if (key) {
          optionContent = optionContent.replace(new RegExp(`^${key}[\\.、\\s\\:\\)\\-\\—\\n]+`, 'i'), '').trim();
        }
        optionContent = optionContent.replace(/^[A-Ga-g对错正确错误√×][\\.、\\s\\:\\)\\-\\—\\n]+/, '').trim();
        if (!optionContent && key) optionContent = key;

        // 3. 点击响应目标 (若 .answerBg 自身绑定了 onclick="addChoice(this)"，则以其为主)
        const clickable = optNode.querySelector('input[type="radio"], input[type="checkbox"], [data], a') || optNode;

        seenOptionTexts.add(fullText);
        options.push({
          key: key,
          cxDataKey: cxDataKey,
          text: optionContent || fullText,
          element: clickable,
          container: optNode
        });
      });

      // 判断题额外适配：如果选项只有 2 个，且没有明确题型，推测为判断题
      if (type === QUESTION_TYPES.UNKNOWN && options.length === 2) {
        const optText = options.map(o => o.text).join('');
        if (/对|错|正确|错误/.test(optText)) {
          type = QUESTION_TYPES.JUDGE;
        }
      }

      // 多选题额外适配：检查是否包含复选框
      if (type === QUESTION_TYPES.UNKNOWN && container.querySelector('input[type="checkbox"], [role="checkbox"]')) {
        type = QUESTION_TYPES.MULTIPLE;
      }

      // 如果选项大于 2 且未定题型，默认为单选题
      if (type === QUESTION_TYPES.UNKNOWN && options.length > 2) {
        type = QUESTION_TYPES.SINGLE;
      }

      // 提取填空题输入框与富文本填空块
      if (type === QUESTION_TYPES.BLANK || /填空/i.test(typeAttr) || /填空/i.test(fullTitleText)) {
        type = QUESTION_TYPES.BLANK;
        // 超星新版每个空包裹在独立的 .Answer 容器中，内部包含 .divText 和 .textDIV
        // 必须按独立空层级提取，严禁同时 querySelectorAll('.Answer, .divText, .textDIV') 导致同一个空的内部子节点被当成多个空！
        let answerBlocks = Array.from(container.querySelectorAll('.Answer'));
        if (answerBlocks.length === 0) {
          answerBlocks = Array.from(container.querySelectorAll('[id^="answerEditor"]'));
        }
        if (answerBlocks.length === 0) {
          answerBlocks = Array.from(container.querySelectorAll('.divText'));
        }
        if (answerBlocks.length > 0) {
          answerBlocks.forEach(ab => {
            const inner = ab.querySelector('textarea, input[type="text"]') || ab;
            if (!blankInputs.includes(inner)) {
              blankInputs.push(inner);
            }
          });
        }
        // 如果未通过 .Answer 找到，检索直接输入框或 UEditor 编辑器
        if (blankInputs.length === 0) {
          const tInputs = Array.from(container.querySelectorAll('input[type="text"]:not([style*="display: none"]), textarea, .edui-editor, [id^="answerEditor"]'));
          tInputs.forEach(input => blankInputs.push(input));
        }
        // 若依然为空，但页面存在 tiankongsize 隐藏字段说明确有填空
        const tkSizeEl = container.querySelector('input[name^="tiankongsize"]');
        const tkSize = tkSizeEl ? parseInt(tkSizeEl.value, 10) : 0;
        if (blankInputs.length === 0 && tkSize > 0) {
          for (let k = 0; k < tkSize; k++) {
            blankInputs.push(container);
          }
        }
        // 兜底：填空题至少压入容器自身作为占位，确保 blankInputs 不为空
        if (blankInputs.length === 0) {
          blankInputs.push(container);
        }
      } else {
        const textInputs = Array.from(container.querySelectorAll(
          'textarea, input[type="text"]:not([style*="display: none"]), .edui-editor, .Answer, .divText, .textDIV, [id^="answerEditor"]'
        ));
        if (textInputs.length > 0) {
          textInputs.forEach(input => {
            if (!blankInputs.includes(input)) blankInputs.push(input);
          });
          if (type === QUESTION_TYPES.UNKNOWN) {
            type = QUESTION_TYPES.BLANK;
          }
        }
        if (blankInputs.length === 0 && (type === QUESTION_TYPES.ESSAY || type === QUESTION_TYPES.BLANK)) {
          blankInputs.push(container);
        }
      }

      // 真实题目必须具备选项或填空输入框，且题干长度合理
      const hasValidInteraction = options.length >= 2 || blankInputs.length > 0 || type === QUESTION_TYPES.BLANK || type === QUESTION_TYPES.ESSAY;
      if (cleanTitle.length > 1 && hasValidInteraction) {
        const qObj = {
          id: `q_${index + 1}_${Date.now()}`,
          cxId: cxId,
          index: index + 1,
          type,
          title: cleanTitle,
          options,
          blankInputs,
          element: container
        };
        qObj.isAnswered = isQuestionAnswered(qObj);
        questions.push(qObj);
      }
    } catch (err) {
      console.warn('[学习通 AI 助手] 解析单题出错:', err);
    }
  });

  return questions;
}

/**
 * 动态检测某道题是否已经被作答（防误判增强版）
 * 严格针对该题目本身的选项状态进行核验，杜绝页面导航、标题样式干扰
 * @param {Object} question 
 * @returns {boolean}
 */
export function isQuestionAnswered(question) {
  if (!question || !question.element) return false;

  const container = question.element;

  // 1. 原生 Radio / Checkbox 选中检测（只在题目容器范围内寻找）
  const checkedInput = container.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked');
  if (checkedInput) return true;

  // 2. 检查选项列表中是否被标记为选中（学习通核心类名：check_answer / check_answer_dx / aria-checked="true"）
  if (question.options && question.options.length > 0) {
    for (const opt of question.options) {
      // 检查原生 input 或 aria 属性 (role="radio" aria-checked="true")
      if (opt.element && (opt.element.checked === true || opt.element.getAttribute?.('aria-checked') === 'true')) {
        return true;
      }
      if (opt.container && opt.container.getAttribute?.('aria-checked') === 'true') {
        return true;
      }

      // 检查超星专用选中样式类名（精准判定：check_answer / check_answer_dx / check_answer_active）
      const elClass = opt.element?.className || '';
      const contClass = opt.container?.className || '';
      if (/\b(?:check_answer|check_answer_dx|check_answer_active)\b/i.test(elClass) || 
          /\b(?:check_answer|check_answer_dx|check_answer_active)\b/i.test(contClass)) {
        return true;
      }

      // 检查选项容器内部是否包含特定的选中标记节点 (如 span.num_option.check_answer)
      if (opt.container?.querySelector?.('.check_answer, .check_answer_dx, .check_answer_active, [class*="check_answer"]')) {
        return true;
      }
    }
  }

  // 3. 检查题目的隐藏域答案输入（严格排除 answertype / type / editor 等题型配置，严禁将纯数字题型代码误判为答案）
  const answerInputs = container.querySelectorAll('input[type="hidden"][name^="answer"], input[type="hidden"][id^="answer"]');
  for (const hidden of answerInputs) {
    const name = (hidden.name || hidden.id || '').toLowerCase();
    if (name.includes('type') || name.includes('editor') || name.includes('node') || name.includes('obj')) {
      continue;
    }
    const val = (hidden.value || '').trim();
    // 纯数字（如 0, 1, 2, 3）是超星内部题型代码，严禁误判为答案！
    if (/^\d+$/.test(val)) {
      continue;
    }
    // 必须是选项键 (选择题: A, B, C, D, A,B, 对, 错; 判断题: true, false)
    if (/^(?:true|false|[A-Ga-g对错正确错误√×]+(?:[,、\s][A-Ga-g对错正确错误√×]+)*)$/i.test(val)) {
      return true;
    }
  }

  // 4. 填空题检测：检查所有输入框是否已有非空文字
  if (question.blankInputs && question.blankInputs.length > 0) {
    const hasValue = question.blankInputs.some(input => {
      if (input.value !== undefined && input.value !== null) {
        return (input.value || '').trim().length > 0;
      }
      // 若为容器节点，检查内部输入框或富文本
      const subInput = input.querySelector?.('textarea, input[type="text"]');
      if (subInput && (subInput.value || '').trim().length > 0) return true;
      const iframeBody = input.querySelector?.('.edui-editor-iframeholder iframe, iframe')?.contentDocument?.body;
      if (iframeBody && (iframeBody.innerText || '').trim().length > 0) return true;
      return false;
    });
    if (hasValue) return true;
  }

  // 5. 简答题 textarea 检测
  const textarea = container.querySelector('textarea');
  if (textarea && (textarea.value || '').trim().length > 0) {
    return true;
  }

  return false;
}
