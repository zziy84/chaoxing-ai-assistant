/**
 * 学习通 AI 助手 - 网页原生主环境桥接器 (Main World Bridge)
 * 运行在网页自身全局上下文，直接调用超星原生 addChoice, loadAnswerSheet, answerContentChange 及 UEditor
 */
(function() {
  if (window.__CX_AI_BRIDGE_READY__) return;
  window.__CX_AI_BRIDGE_READY__ = true;

  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;

    // 1. 选择题 / 判断题原生作答
    if (event.data.type === 'CX_AI_SELECT_OPTION') {
      const { qid, key, cxDataKey, marker, isMulti } = event.data;

      try {
        let target = null;

        // 优先级 A：通过前台植入的唯一标记定位
        if (marker) {
          const marked = document.querySelector(`[${marker}="true"]`);
          if (marked) {
            marked.removeAttribute(marker);
            target = marked;
          }
        }

        // 优先级 B：通过 qid 与选项属性（优先 cxDataKey / data 属性）定位
        if (!target && qid) {
          const matchKey = cxDataKey || key;
          target = (cxDataKey ? document.querySelector(`.answerBg[qid="${qid}"][data="${cxDataKey}"]`) : null) ||
                   (cxDataKey ? document.querySelector(`.answerBg[qid="${qid}"][aria-label*="${cxDataKey} "]`) : null) ||
                   (cxDataKey ? document.querySelector(`.answerBg[qid="${qid}"] span[data="${cxDataKey}"]`)?.closest('.answerBg') : null) ||
                   document.querySelector(`.choice${qid}[data="${matchKey}"]`)?.closest('.answerBg') ||
                   document.querySelector(`.choice${qid}[data="${matchKey}"]`) ||
                   document.querySelector(`[qid="${qid}"][data="${matchKey}"]`) ||
                   document.querySelector(`#question${qid} .answerBg[data="${matchKey}"]`) ||
                   document.querySelector(`[data="${qid}"] .answerBg[data="${matchKey}"]`);
        }

        // 精准定位单项选项容器：优先获取 .answerBg 或带 onclick Choice 的节点，排除整题大外层
        let optionTarget = null;
        if (target) {
          optionTarget = target.closest?.('.answerBg, [onclick*="Choice"], [role="radio"], [role="checkbox"], li') ||
                         (target.classList?.contains?.('answerBg') ? target : target);
          if (optionTarget && (optionTarget.classList?.contains?.('singleQuesId') || optionTarget.classList?.contains?.('questionLi') || optionTarget.classList?.contains?.('padBom50'))) {
            optionTarget = target.querySelector?.('.answerBg, [onclick*="Choice"], [role="radio"], [role="checkbox"]') || target;
          }
        }

        const effectiveQid = qid ||
                             optionTarget?.getAttribute?.('qid') ||
                             optionTarget?.closest?.('[qid]')?.getAttribute?.('qid') ||
                             target?.getAttribute?.('qid') ||
                             (window.$ ? (window.$(optionTarget).attr('qid') || window.$(target).attr('qid')) : null);

        if (optionTarget) {
          if (effectiveQid && !optionTarget.getAttribute('qid')) {
            optionTarget.setAttribute('qid', effectiveQid);
          }

          const numOpt = optionTarget.querySelector('.num_option, .num_option_dx, [class*="num_option"]') || optionTarget.querySelector('span[data]');
          const onclickStr = (optionTarget.getAttribute('onclick') || '') + (target.getAttribute('onclick') || '');
          const isMultiple = Boolean(
            isMulti ||
            onclickStr.includes('addMultipleChoice') ||
            optionTarget.querySelector('.num_option_dx') ||
            optionTarget.classList.contains('num_option_dx') ||
            optionTarget.getAttribute('qtype') === '1' ||
            optionTarget.getAttribute('cx-multi') === 'true' ||
            optionTarget.closest('[typename*="多选"]') ||
            (effectiveQid && document.querySelector(`input[name="answertype${effectiveQid}"][value="1"]`))
          );
          if (isMultiple && !optionTarget.getAttribute('qtype')) {
            optionTarget.setAttribute('qtype', '1');
          }

          const isChecked = Boolean(
            (numOpt && (numOpt.classList.contains('check_answer') || numOpt.classList.contains('check_answer_dx') || /check_answer/i.test(numOpt.className))) ||
            optionTarget.classList.contains('check_answer') ||
            optionTarget.classList.contains('check_answer_dx') ||
            /check_answer/i.test(optionTarget.className) ||
            optionTarget.getAttribute('aria-checked') === 'true'
          );

          if (!isChecked) {
            if (isMultiple) {
              // 多选题优先执行超星原生 addMultipleChoice
              if (typeof window.addMultipleChoice === 'function') {
                try {
                  window.addMultipleChoice(optionTarget);
                } catch (e) {
                  console.warn('[学习通 AI 助手 Bridge] 原生调用 addMultipleChoice 报错:', e);
                }
              }
              // 检查调用后是否已成功选中，若未选中则尝试调用 click()
              const isNowChecked = Boolean(
                (numOpt && (numOpt.classList.contains('check_answer_dx') || numOpt.classList.contains('check_answer'))) ||
                optionTarget.classList.contains('check_answer_dx') ||
                optionTarget.getAttribute('aria-checked') === 'true'
              );
              if (!isNowChecked && typeof optionTarget.click === 'function') {
                try { optionTarget.click(); } catch(e) {}
              }
              // 超星原生多选样式 check_answer_dx 与 aria-checked 保底
              if (numOpt && !numOpt.classList.contains('check_answer_dx') && !numOpt.classList.contains('check_answer')) {
                numOpt.classList.add('check_answer_dx');
              }
              optionTarget.setAttribute('aria-checked', 'true');
            } else {
              // 单选/判断题优先执行超星原生 addChoice
              if (typeof window.addChoice === 'function') {
                try {
                  window.addChoice(optionTarget);
                } catch (e) {
                  console.warn('[学习通 AI 助手 Bridge] 原生调用 addChoice 报错:', e);
                }
              } else if (typeof optionTarget.click === 'function') {
                try { optionTarget.click(); } catch(e) {}
              } else if (typeof target.click === 'function') {
                try { target.click(); } catch(e) {}
              }
            }
          }
        }

        // 后端保底同步：提取真实题目 qid，更新隐藏域并联动超星答题卡与保存钩子
        if (effectiveQid) {
          const ansInput = document.getElementById(`answer${effectiveQid}`) ||
                           document.querySelector(`input[name="answer${effectiveQid}"]`);
          
          if (ansInput) {
            const currentVal = (ansInput.value || '').trim();
            const onclickStr = (optionTarget?.getAttribute?.('onclick') || '') + (target?.getAttribute?.('onclick') || '');
            const isMultiple = Boolean(
              isMulti ||
              onclickStr.includes('addMultipleChoice') ||
              optionTarget?.querySelector?.('.num_option_dx') ||
              optionTarget?.classList?.contains?.('num_option_dx') ||
              optionTarget?.getAttribute?.('qtype') === '1' ||
              optionTarget?.getAttribute?.('cx-multi') === 'true' ||
              optionTarget?.closest?.('[typename*="多选"]') ||
              document.querySelector(`input[name="answertype${effectiveQid}"][value="1"]`)
            );

            // 核心注意：超星的隐藏域 value 和 loadAnswerSheet 必须是选项的 data 属性值（cxDataKey）！
            // 绝不能写入视觉字母（key）！因为超星的 loadAnswerSheet 会通过该值寻找对应 data 属性的选项并高亮它！
            const isJudge = Boolean(
              optionTarget?.closest?.('[typename*="判断"]') ||
              document.querySelector(`input[name="answertype${effectiveQid}"][value="3"]`) ||
              (ansInput && (ansInput.value === 'true' || ansInput.value === 'false'))
            );

            let actualBackendVal = optionTarget?.getAttribute?.('data') ||
                                   optionTarget?.querySelector?.('[data]')?.getAttribute?.('data') ||
                                   cxDataKey || key;

            // 判断题必须写入真实的 "true" 或 "false"，根据当前选中的选项语义确定，严禁被历史值锁死或被字母 A/B 覆盖
            if (isJudge) {
              const optText = (optionTarget?.innerText || optionTarget?.textContent || '').trim();
              if (/错|错误|×|false/i.test(optText)) {
                actualBackendVal = 'false';
              } else if (/对|正确|√|true/i.test(optText)) {
                actualBackendVal = 'true';
              } else if (/^(?:true|false)$/i.test(actualBackendVal)) {
                actualBackendVal = actualBackendVal.toLowerCase();
              } else if (cxDataKey && /^(?:true|false)$/i.test(cxDataKey)) {
                actualBackendVal = cxDataKey.toLowerCase();
              }
            }

            if (actualBackendVal) {
              if (isMultiple) {
                if (!currentVal.includes(actualBackendVal)) {
                  // 字母去重并升序排列，例如 "AB"
                  ansInput.value = Array.from(new Set((currentVal + actualBackendVal).split(''))).sort().join('');
                }
              } else {
                ansInput.value = actualBackendVal;
              }
            }

            if (window.$) {
              window.$(ansInput).trigger('change').trigger('input');
            } else {
              ansInput.dispatchEvent(new Event('change', { bubbles: true }));
              ansInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }

          // 触发超星核心保存与答题卡渲染函数
          if (typeof window.answerContentChange === 'function') {
            try { window.answerContentChange(); } catch(e){}
          }
          if (typeof window.loadAnswerSheet === 'function') {
            try {
              const finalAns = (ansInput && ansInput.value) ? ansInput.value : (actualBackendVal || optionTarget?.getAttribute?.('data') || cxDataKey || key);
              if (finalAns && String(finalAns).trim().length > 0) {
                window.loadAnswerSheet(effectiveQid, finalAns);
              }
            } catch(e){}
          }
        }
      } catch (err) {
        console.warn('[学习通 AI 助手 Bridge] 选择题调用异常:', err);
      }
    }

    // 2. 填空题 / 简答题原生写入
    if (event.data.type === 'CX_AI_FILL_BLANK') {
      const { qid, blankIndex, value } = event.data;
      try {
        const questionEl = document.getElementById('question' + qid) ||
                           document.querySelector(`[data="${qid}"]`) ||
                           document.querySelector(`[qid="${qid}"]`) ||
                           document.querySelector(`.singleQuesId[data="${qid}"]`);

        // 1. 同步百度 UEditor 富文本编辑器 (超星填空题主用 answerEditor${qid}${blankIndex + 1}，简答题用 answer${qid})
        const editorId = 'answerEditor' + qid + (blankIndex + 1);
        let editor = null;

        // 优先在 UE.instants 中按 key 严格对齐查找
        if (window.UE && window.UE.instants) {
          for (const instId in window.UE.instants) {
            const inst = window.UE.instants[instId];
            if (inst && (inst.key === editorId || (blankIndex === 0 && inst.key === 'answer' + qid))) {
              editor = inst;
              break;
            }
          }
        }

        // 若 getEditor 未命中，尝试 UE.getEditor 获取已有实例（严禁对填空题调用 answer+qid 避免生成僵尸实例）
        if (!editor && window.UE && typeof window.UE.getEditor === 'function') {
          try {
            const candidate = window.UE.getEditor(editorId);
            if (candidate && candidate.body) {
              editor = candidate;
            }
          } catch (e) {}

          if (!editor && blankIndex === 0 && document.getElementById('answer' + qid)) {
            try {
              const candidate = window.UE.getEditor('answer' + qid);
              if (candidate && candidate.body) {
                editor = candidate;
              }
            } catch (e) {}
          }
        }

        const htmlContent = String(value).split('\n').filter(Boolean).map(line => `<p>${line}</p>`).join('');

        if (editor) {
          try {
            if (typeof editor.setContent === 'function') {
              editor.setContent(htmlContent || `<p>${value}</p>`);
            } else if (editor.body) {
              editor.body.innerHTML = htmlContent || `<p>${value}</p>`;
            }
            if (typeof editor.sync === 'function') {
              editor.sync();
            }
            if (typeof editor.fireEvent === 'function') {
              editor.fireEvent('contentChange');
            }
          } catch(e) {}
        }

        // 2. 填充原生 textarea 或 input
        const specificInput = document.getElementById(editorId) ||
                              document.querySelector(`textarea[name="${editorId}"]`) ||
                              document.querySelector(`input[name="${editorId}"]`) ||
                              (document.getElementById('answer' + qid) ? document.getElementById('answer' + qid) : null) ||
                              document.querySelector(`textarea[name="answer${qid}_${blankIndex}"]`) ||
                              document.querySelector(`input[name="answer${qid}_${blankIndex}"]`);
        if (specificInput) {
          specificInput.value = value;
          try {
            specificInput.dispatchEvent(new Event('input', { bubbles: true }));
            specificInput.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (e) {}
        }

        // 3. 填充内部 iframe（严禁使用混杂选择器导致索引错位）
        if (questionEl) {
          let answerBoxes = Array.from(questionEl.querySelectorAll('.Answer'));
          if (answerBoxes.length === 0) {
            answerBoxes = Array.from(questionEl.querySelectorAll('.divText'));
          }
          if (answerBoxes.length === 0) {
            answerBoxes = Array.from(questionEl.querySelectorAll('.textDIV'));
          }
          const targetBox = answerBoxes[blankIndex] || (blankIndex === 0 ? questionEl : null);
          if (targetBox) {
            const iframes = targetBox.querySelectorAll('.edui-editor-iframeholder iframe, iframe');
            if (iframes.length > 0) {
              try {
                const body = iframes[0].contentDocument?.body;
                if (body) {
                  body.innerHTML = htmlContent || `<p>${value}</p>`;
                }
              } catch(e) {}
            }
          }
        }

        // 4. 联动通知超星后端保存并更新答题卡
        // 超星原生填空题答题卡检测函数: loadEditorAnswerd(qid, 2)
        // 超星原生简答题答题卡检测函数: loadEditorAnswerd(qid, 4)
        if (typeof window.loadEditorAnswerd === 'function') {
          try { window.loadEditorAnswerd(qid, 2); } catch (e) {}
          try { window.loadEditorAnswerd(qid, 4); } catch (e) {}
        }
        if (typeof window.answerContentChange === 'function') {
          try { window.answerContentChange(); } catch(e){}
        }
        if (typeof window.loadAnswerSheet === 'function') {
          try { window.loadAnswerSheet(qid, value); } catch(e){}
        }
      } catch (err) {
        console.warn('[学习通 AI 助手 Bridge] 填空题调用异常:', err);
      }
    }
  });

  console.log('[学习通 AI 助手] Main World 原生桥接器就绪');
})();
