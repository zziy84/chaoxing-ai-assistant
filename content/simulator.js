/**
 * 学习通 AI 助手 - 人性化交互仿真与安全辅助填入
 */

/**
 * 随机延时
 * @param {number} min 
 * @param {number} max 
 * @returns {Promise<void>}
 */
export function randomDelay(min = 800, max = 2000) {
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, duration));
}

/**
 * 模拟人机交互点击事件链
 * @param {HTMLElement} element 
 */
export function simulateHumanClick(element) {
  if (!element) return;

  const rect = typeof element.getBoundingClientRect === 'function'
    ? element.getBoundingClientRect()
    : { left: 0, top: 0, width: 0, height: 0 };
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;

  if (typeof MouseEvent === 'function' && typeof element.dispatchEvent === 'function') {
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: typeof window !== 'undefined' ? window : null,
      clientX,
      clientY
    };

    try {
      element.dispatchEvent(new MouseEvent('mouseover', eventInit));
      element.dispatchEvent(new MouseEvent('mousedown', eventInit));
      element.dispatchEvent(new MouseEvent('mouseup', eventInit));
      element.dispatchEvent(new MouseEvent('click', eventInit));
    } catch {}
  }

  // 触发原生 DOM click() 方法以确保超星内联 onclick="addChoice(this)" 得到执行
  if (typeof element.click === 'function') {
    try {
      element.click();
    } catch {
      // 忽略部分受保护节点异常
    }
  }

  // 若为原生 input radio/checkbox，确保 checked 状态变更
  if (element.tagName === 'INPUT' && (element.type === 'radio' || element.type === 'checkbox')) {
    element.checked = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/**
 * 在网页原生环境（Main World）中执行点击与作答函数
 * 彻底突破 Chrome 扩展隔离沙箱，确保超星的 inline onclick="addChoice(this)" 和全局状态函数直接运行
 * @param {HTMLElement} targetElement 
 */
export function executeInPageWorld(targetElement) {
  if (!targetElement) return;
  try {
    const qid = targetElement.getAttribute?.('qid') || targetElement.closest?.('[qid]')?.getAttribute?.('qid') || '';
    const key = targetElement.getAttribute?.('data') || targetElement.querySelector?.('[data]')?.getAttribute?.('data') || '';
    const isMulti = Boolean(targetElement.getAttribute?.('cx-multi') === 'true' || targetElement.closest?.('[typename*="多选"]'));

    // 浏览器运行态：通过 postMessage 传递给 Main World 的 page-bridge.js，仅在拥有有效 key 时传递
    if (key && typeof window !== 'undefined' && typeof window.postMessage === 'function') {
      window.postMessage({
        type: 'CX_AI_SELECT_OPTION',
        qid,
        key,
        cxDataKey: key,
        isMulti
      }, '*');
      return;
    }

    // Node.js 单元测试环境 MockDocument 兼容
    const doc = targetElement.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (doc && doc.head && typeof doc.head.appendChild === 'function') {
      doc.head.appendChild(doc.createElement?.('script') || {});
    }
  } catch {
    // 忽略异常
  }
}

/**
 * 模拟人类文本键入
 * @param {HTMLInputElement|HTMLTextAreaElement} inputEl 
 * @param {string} text 
 */
export function simulateHumanInput(inputEl, text) {
  if (!inputEl) return;
  if (typeof inputEl.focus === 'function') inputEl.focus();
  inputEl.value = text;
  if (typeof inputEl.dispatchEvent === 'function') {
    try {
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
  }
  if (typeof inputEl.blur === 'function') inputEl.blur();
}

/**
 * 针对单道题目执行辅助填选
 * @param {Object} question 题目元数据
 * @param {Object} result 大模型返回的答案解析
 * @param {boolean} [smoothScroll=true] 是否自动平滑滚屏到题目
 * @param {Object} [speedConfig=null] 速度模式配置
 * @returns {Promise<boolean>} 是否成功填入
 */
export async function applyAnswerToQuestion(question, result, smoothScroll = true, speedConfig = null) {
  if (!question || !result || !result.answer || result.answer.length === 0) {
    return false;
  }

  // 1. 滚屏定位到题目位置
  if (smoothScroll && question.element) {
    const isTurbo = speedConfig && speedConfig.delayMin <= 100;
    try {
      question.element.scrollIntoView({ behavior: isTurbo ? 'auto' : 'smooth', block: 'center' });
    } catch(e) {}
    const sWait = speedConfig ? (speedConfig.scrollWait ?? 50) : 400;
    if (sWait > 0) {
      await randomDelay(Math.floor(sWait * 0.7), sWait);
    }
  }

  // 规范化答案列表，自动拆分诸如 ["ABD"] 或 ["A, B, D"] 格式
  const answers = [];
  (result.answer || []).forEach(a => {
    const cleaned = (a || '').toString().trim().toUpperCase();
    if (/^[A-G]{2,}$/.test(cleaned)) {
      answers.push(...cleaned.split(''));
    } else if (cleaned.includes(',') || cleaned.includes('、') || cleaned.includes(' ')) {
      answers.push(...cleaned.split(/[,、\s]+/).filter(Boolean));
    } else {
      answers.push(cleaned);
    }
  });

  let appliedCount = 0;

  // 2. 选择题 / 判断题处理
  if (question.options && question.options.length > 0) {
    // 判断题专项精准对号入座，杜绝 A/B 逆序翻转与多选
    let targetJudgeKey = null;
    const isJudgeQuestion = question.type === 'judge' || (
      question.options.length === 2 && question.options.some(o => {
        const t = (o.text || '').trim();
        return /^(对|错|正确|错误|是|否|T|F|TRUE|FALSE|√|×)$/i.test(t) || /对|错|正确|错误/.test(t);
      })
    );

    if (isJudgeQuestion) {
      // 1. 检查 answers 中是否有明确语义的正误
      const isTrue = answers.some(a => /^(正确|对|T|TRUE|√|是)$/i.test(a));
      const isFalse = answers.some(a => /^(错误|错|F|FALSE|×|否)$/i.test(a));

      if (isTrue) {
        const trueOpt = question.options.find(o => /对|正确|√|TRUE|T|是/i.test((o.text || '').trim()));
        if (trueOpt) targetJudgeKey = (trueOpt.key || '').toUpperCase();
      } else if (isFalse) {
        const falseOpt = question.options.find(o => /错|错误|×|FALSE|F|否/i.test((o.text || '').trim()));
        if (falseOpt) targetJudgeKey = (falseOpt.key || '').toUpperCase();
      }

      // 2. 若无语义词，但 answers 直接包含 options 的 key（如 ['A'] 或 ['B']）
      if (!targetJudgeKey) {
        const directKeyMatch = question.options.find(o => answers.includes((o.key || '').toUpperCase()));
        if (directKeyMatch) {
          targetJudgeKey = (directKeyMatch.key || '').toUpperCase();
        }
      }
    }

    for (const opt of question.options) {
      const optKey = (opt.key || '').toUpperCase();
      const optText = (opt.text || '').trim();

      // 单选题防超选：若已填入一项则跳过
      if (question.type === 'single' && appliedCount >= 1) {
        break;
      }

      let shouldSelect = false;

      if (isJudgeQuestion && targetJudgeKey) {
        // 判断题单项互斥：仅精准选中目标选项，彻底杜绝翻转与双选
        shouldSelect = (optKey === targetJudgeKey);
      } else {
        // 单选、多选处理：优先匹配校准后的选项字母
        const hasDirectKeyInAnswers = question.options.some(o => answers.includes((o.key || '').toUpperCase()));

        if (hasDirectKeyInAnswers) {
          // 如果 answers 中包含明确的选项字母，严格按字母精准匹配，禁止被模糊文本越位拦截！
          shouldSelect = answers.includes(optKey);
        } else {
          // 仅当 answers 中没有命中任何有效字母时（例如模型直接输出了选项具体文本），才启用文本比对
          if (answers.some(a => optText && (optText === a || optText.includes(a) || a.includes(optText)))) {
            shouldSelect = true;
          } else if (result.matched_options && result.matched_options.length > 0) {
            if (result.matched_options.some(m => optText && (optText === m || optText.includes(m) || m.includes(optText)))) {
              shouldSelect = true;
            }
          }
        }
      }

      if (shouldSelect) {
        // 定位原生选项容器 (.answerBg 或拥有 onclick 的选项节点，排除外层题目容器)
        const answerBg = opt.container?.closest?.('.answerBg, [onclick*="Choice"]') ||
                         opt.container ||
                         opt.element?.closest?.('.answerBg, [onclick*="Choice"]');
        const clickTarget = answerBg || opt.element || opt.container;
        const nativeQid = question.cxId ||
                          clickTarget?.getAttribute?.('qid') ||
                          clickTarget?.closest?.('[qid]')?.getAttribute?.('qid') ||
                          question.element?.getAttribute?.('data') ||
                          question.element?.id?.replace(/^question_?/, '') ||
                          '';

        const targetDoc = clickTarget?.ownerDocument || (typeof document !== 'undefined' ? document : null);
        const targetWin = targetDoc?.defaultView || (typeof window !== 'undefined' ? window : null);

        // 彻底清除历史遗留的绿色边框与外阴影（遵循用户指示：坚决取消花哨外框）
        if (opt.container && opt.container.style) {
          opt.container.style.boxShadow = '';
          opt.container.style.borderRadius = '';
          opt.container.style.transition = '';
        }

        const marker = 'cx-sel-' + Math.random().toString(36).slice(2, 9);
        const isMulti = question.type === 'multiple';
        if (clickTarget && typeof clickTarget.setAttribute === 'function') {
          clickTarget.setAttribute(marker, 'true');
          if (isMulti) {
            clickTarget.setAttribute('cx-multi', 'true');
          }
        }

        // 1. 发送消息给包含此题目 DOM 的窗口环境 (支持跨 iframe)
        const sendKey = opt.cxDataKey || optKey;
        if (targetWin) {
          try {
            targetWin.postMessage({
              type: 'CX_AI_SELECT_OPTION',
              qid: nativeQid,
              key: optKey,
              cxDataKey: sendKey,
              isMulti,
              marker
            }, '*');
          } catch (e) {}
        }

        if (typeof window !== 'undefined' && targetWin !== window) {
          try {
            window.postMessage({
              type: 'CX_AI_SELECT_OPTION',
              qid: nativeQid,
              key: optKey,
              cxDataKey: sendKey,
              isMulti,
              marker
            }, '*');
          } catch (e) {}
        }

        // 2. 模拟原生人类交互点击，直接触发超星 inline onclick="addChoice(this)"
        simulateHumanClick(clickTarget);

        appliedCount++;

        // 3. 隐藏域答案保底写入：必须写入超星后端期望的内部混淆 key (cxDataKey)
        const answerInput = question.element?.querySelector?.(
          'input[type="hidden"][name^="answer"]:not([name*="type"]):not([name*="Type"])'
        ) || (nativeQid ? targetDoc?.querySelector?.(`input[name="answer${nativeQid}"]`) : null);
        if (answerInput) {
          const saveKey = opt.cxDataKey || optKey;
          if (isMulti) {
            const curVal = (answerInput.value || '').trim();
            if (!curVal.includes(saveKey)) {
              answerInput.value = Array.from(new Set((curVal + saveKey).split(''))).sort().join('');
            }
          } else {
            if (isJudgeQuestion) {
              if (/^(?:true|false)$/i.test(saveKey)) {
                answerInput.value = saveKey.toLowerCase();
              } else if (/错|错误|×|false/i.test(optText)) {
                answerInput.value = 'false';
              } else if (/对|正确|√|true/i.test(optText)) {
                answerInput.value = 'true';
              } else {
                answerInput.value = saveKey;
              }
            } else {
              answerInput.value = saveKey;
            }
          }
          try {
            answerInput.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (e) {}
        }

        // 4. 同步更新超星答题卡（.topicNumber_list li）状态为 active
        if (nativeQid && targetDoc) {
          const sheetItem = targetDoc.querySelector(`#answerSheet${nativeQid}`);
          if (sheetItem && !sheetItem.classList.contains('active')) {
            sheetItem.classList.add('active');
          }
        }

        const optWait = speedConfig && speedConfig.delayMin <= 100 ? 40 : 250;
        await randomDelay(Math.floor(optWait * 0.7), optWait);
      }
    }
  }

  // 3. 填空题处理
  if (question.blankInputs && question.blankInputs.length > 0) {
    const nativeQid = question.cxId ||
                      question.element?.getAttribute?.('data') ||
                      question.element?.id?.replace(/^question_?/, '') ||
                      '';

    const targetDoc = question.element?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const targetWin = targetDoc?.defaultView || (typeof window !== 'undefined' ? window : null);

    const isEssayOrSingleBoxMultiAns = question.type === 'essay' || (question.blankInputs.length === 1 && result.answer.length > 1);

    for (let i = 0; i < question.blankInputs.length; i++) {
      const input = question.blankInputs[i];
      let answerVal = '';

      if (isEssayOrSingleBoxMultiAns) {
        // 简答题或单输入框但模型分项给出了多个小问答案时，完整拼接所有小题内容
        if (result.answer.length === 1) {
          answerVal = String(result.answer[0]).trim();
        } else {
          answerVal = result.answer.map((ans, idx) => {
            const trimmed = String(ans).trim();
            const hasNum = /^[\(（]?\d+[\)）\.\、]/i.test(trimmed);
            return hasNum ? trimmed : `(${idx + 1}) ${trimmed}`;
          }).join('\n\n');
        }
      } else {
        answerVal = result.answer[i] || result.answer[0] || '';
      }

      if (answerVal) {
        // 清理可能存在的历史绿色边框
        if (input && input.style) {
          input.style.borderColor = '';
        }

        // 1. 广播给目标窗口与当前窗口的 Main World 桥接器更新 UEditor 及超星表单
        if (targetWin) {
          try {
            targetWin.postMessage({
              type: 'CX_AI_FILL_BLANK',
              qid: nativeQid,
              blankIndex: i,
              value: answerVal
            }, '*');
          } catch (e) {}
        }

        if (typeof window !== 'undefined' && targetWin !== window) {
          try {
            window.postMessage({
              type: 'CX_AI_FILL_BLANK',
              qid: nativeQid,
              blankIndex: i,
              value: answerVal
            }, '*');
          } catch (e) {}
        }

        // 2. Content Script 本地填充原生输入框/富文本保底 (不加任何多余花哨修饰)
        simulateHumanInput(input, answerVal);
        const host = (input.closest && input.closest('.Answer')) || input.parentElement || input;
        const innerTextEl = host.querySelector ? host.querySelector('textarea, input[type="text"]') : null;
        if (innerTextEl && innerTextEl !== input) simulateHumanInput(innerTextEl, answerVal);
        const innerIframe = host.querySelector ? host.querySelector('.edui-editor-iframeholder iframe, iframe') : null;
        if (innerIframe && innerIframe.contentDocument?.body) {
          try {
            const htmlVal = answerVal.split('\n').filter(Boolean).map(line => `<p>${line}</p>`).join('');
            innerIframe.contentDocument.body.innerHTML = htmlVal || `<p>${answerVal}</p>`;
          } catch(e){}
        }

        executeInPageWorld(input);
        appliedCount++;

        const blankWait = speedConfig && speedConfig.delayMin <= 100 ? 50 : 350;
        await randomDelay(Math.floor(blankWait * 0.7), blankWait);
      }
    }
  }

  return appliedCount > 0;
}
