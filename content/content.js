/**
 * 学习通 AI 助手 - Content Script 页面注入主入口
 */

(async () => {
  try {
    // 动态导入 ES 模块（兼容 Chrome MV3 Content Script 规范）
    const srcConstants = chrome.runtime.getURL('shared/constants.js');
    const srcParser = chrome.runtime.getURL('content/parser.js');
    const srcUI = chrome.runtime.getURL('content/ui-panel.js');
    const srcSimulator = chrome.runtime.getURL('content/simulator.js');
    const srcJsonRepair = chrome.runtime.getURL('shared/json-repair.js');
    const srcStorage = chrome.runtime.getURL('shared/storage.js');

    const { SPEED_PRESETS, DEFAULT_CONFIG } = await import(srcConstants);
    const { extractQuestionsFromPage, isQuestionAnswered } = await import(srcParser);
    const { AssistantUIPanel } = await import(srcUI);
    const { applyAnswerToQuestion, randomDelay } = await import(srcSimulator);
    const { reconcileAnswerWithOptions } = await import(srcJsonRepair);
    const { getConfig } = await import(srcStorage);

    // 1. 获取用户配置（优先直接从 storage 读取，规避后台 Service Worker 休眠引起的通信中断）
    let config = { ...DEFAULT_CONFIG, speedMode: 'turbo' };
    try {
      config = await getConfig();
    } catch (cfgErr) {
      console.warn('[学习通 AI 助手] getConfig 异常，回退默认配置:', cfgErr);
    }

  let panel = null;
  let questions = [];
  let isCancelled = false;

  function getSpeedConfig() {
    const mode = panel?.config?.speedMode || config.speedMode || 'turbo';
    return SPEED_PRESETS[mode] || SPEED_PRESETS.turbo;
  }

  // 解析并解答单个题目
  async function solveSingleQuestion(q, isBatch = false) {
    if (!q) return;
    panel.setQuestionStatus(q.id, 'loading');

    // 格式化题目 payload，去掉 DOM 节点引用以供跨进程序列化通信
    const serializableQuestion = {
      id: q.id,
      index: q.index,
      type: q.type,
      title: q.title,
      options: (q.options || []).map(opt => ({ key: opt.key, text: opt.text }))
    };

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'SOLVE_QUESTION',
        payload: { question: serializableQuestion }
      });

      if (res && res.success) {
        // 前端强制二次校验自愈：确保即便后台工作者未重载，也能在展示与勾选前执行最新版自愈逻辑
        if (res.result) {
          res.result = reconcileAnswerWithOptions(res.result, q.options, q.type);
        }
        panel.setQuestionStatus(q.id, 'success', res);

        // 如果开启了自动辅助填入
        if (panel.config.autoFill) {
          const speed = getSpeedConfig();
          if (speed.autoFillDelayMax > 0 && !isBatch) {
            await randomDelay(speed.autoFillDelayMin, speed.autoFillDelayMax);
          }
          // 在并发批量作答模式下，关闭频繁滚屏以防画面抖动与延迟累加
          const shouldScroll = !isBatch && speed.scrollWait > 0;
          await applyAnswerToQuestion(q, res.result, shouldScroll, speed);
        }
      } else {
        panel.setQuestionStatus(q.id, 'error', { error: res?.error || '模型接口请求失败' });
      }
    } catch (err) {
      panel.setQuestionStatus(q.id, 'error', { error: err.message || '通信中断' });
    }
  }

  // 批量并发解答所有题目（带自适应并发池与速度自适应，支持中途随时停止）
  async function solveAllQuestions() {
    if (panel.isBatchSolving) return;

    // 答题前先刷新一次当前题库状态
    scanQuestions();

    if (questions.length === 0) {
      alert('未在当前页面识别到有效题目，请确认是否处于题目作答区域。');
      return;
    }

    isCancelled = false;
    const speed = getSpeedConfig();
    const rawConcurrency = panel.config.concurrency || config.concurrency || 3;
    // 安全模式下强制单并发以模拟人类；匀速/极速模式启用多并发通道（1 ~ 8）
    const concurrency = (panel.config.speedMode === 'safe' || speed.id === 'safe')
      ? 1
      : Math.max(1, Math.min(8, rawConcurrency));

    // 过滤出真正需要作答的题目
    const pendingQuestions = [];
    const enabledTypes = panel.config.enabledQuestionTypes || ['single', 'multiple', 'judge', 'blank', 'essay'];

    for (const q of questions) {
      // 核心判断 1：检查该题型是否在用户勾选的自动解答题型列表中
      const isEnabled = enabledTypes.includes(q.type) || (
        (q.type === 'single' || q.type === 'multiple') && (enabledTypes.includes('single') || enabledTypes.includes('multiple') || enabledTypes.includes('choice'))
      );
      if (!isEnabled) {
        console.log(`[学习通 AI 助手] 题目 #${q.index} (${q.type}) 未勾选自动解答，跳过此题`);
        panel.setQuestionStatus(q.id, 'skipped', { reason: '未勾选题型，无需作答' });
        continue;
      }

      // 核心判断 2：跳过已作答题目
      if (panel.config.skipAnswered !== false && isQuestionAnswered(q)) {
        console.log(`[学习通 AI 助手] 题目 #${q.index} (${q.title.slice(0, 15)}...) 已检测到作答，跳过此题`);
        panel.setQuestionStatus(q.id, 'skipped', { reason: '已作答，自动跳过' });
        continue;
      }

      // 已经解答成功的跳过
      const cur = panel.results.get(q.id);
      if (cur && cur.status === 'success') continue;

      pendingQuestions.push(q);
    }

    if (pendingQuestions.length === 0) {
      panel.setSolvingState(false);
      return;
    }

    let completedCount = questions.length - pendingQuestions.length;
    let nextIndex = 0;
    panel.setSolvingState(true, `(${completedCount}/${questions.length})`);

    async function worker() {
      while (nextIndex < pendingQuestions.length && !isCancelled) {
        const q = pendingQuestions[nextIndex++];
        if (!q) break;

        // 单并发模式时适度滚屏聚焦当前题；多并发模式下免滚屏以避免屏幕狂跳
        if (concurrency === 1 && q.element && speed.scrollWait > 0) {
          try {
            q.element.scrollIntoView({
              behavior: speed.delayMin <= 100 ? 'auto' : 'smooth',
              block: 'center'
            });
          } catch(e){}
        }

        await solveSingleQuestion(q, concurrency > 1);

        completedCount++;
        panel.setSolvingState(true, `(${completedCount}/${questions.length})`);

        if (isCancelled) break;

        // 依据速度模式执行间隔微延时
        if (speed.delayMin > 0) {
          await randomDelay(speed.delayMin, speed.delayMax);
        }
      }
    }

    try {
      const actualWorkers = Math.min(concurrency, pendingQuestions.length);
      const workers = [];
      for (let i = 0; i < actualWorkers; i++) {
        workers.push(worker());
      }
      await Promise.all(workers);
    } finally {
      panel.setSolvingState(false);
    }
  }

  // 扫描页面题目
  function scanQuestions() {
    questions = extractQuestionsFromPage(document);
    // 严格基于 DOM 元素实例进行去重，避免类似前缀题干被误过滤
    const seenElements = new Set();
    questions = questions.filter(q => {
      if (q.element && seenElements.has(q.element)) return false;
      if (q.element) seenElements.add(q.element);
      return true;
    });

    questions.forEach((q, idx) => {
      q.index = idx + 1;
    });

    if (panel) {
      panel.setQuestions(questions);
    }
  }

  // 初始化悬浮控制面板
  panel = new AssistantUIPanel({
    config,
    onRescan: () => scanQuestions(),
    onSolveQuestion: (q) => solveSingleQuestion(q),
    onSolveAll: () => solveAllQuestions(),
    onStop: () => { isCancelled = true; }
  });

  // 首次扫描
  scanQuestions();

  // 页面加载完全后再次复检（针对动态渲染延迟）
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      setTimeout(scanQuestions, 1000);
    });
  }

  // 监听来自 Popup 或后台的消息
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'CONFIG_UPDATED') {
      panel.updateConfig(msg.config);
      sendResponse({ success: true });
      return true;
    }

    // 响应 Popup 触发的“开始答题”指令
    if (msg.action === 'START_ANSWERING') {
      panel.toggleSidebar(true);
      if (questions.length === 0) {
        scanQuestions();
      }
      solveAllQuestions();
      sendResponse({ success: true, count: questions.length });
      return true;
    }

    // 响应 Popup 触发的“停止答题”指令
    if (msg.action === 'STOP_ANSWERING') {
      isCancelled = true;
      panel.setSolvingState(false);
      sendResponse({ success: true });
      return true;
    }

    // 查询当前页面状态
    if (msg.action === 'GET_PAGE_STATUS') {
      sendResponse({
        isXuexitong: true,
        questionCount: questions.length,
        isSolving: panel.isBatchSolving
      });
      return true;
    }
  });

    console.log('[学习通 AI 助手] 插件已成功注入，识别到题目数:', questions.length);
  } catch (fatalErr) {
    console.error('[学习通 AI 助手] 插件初始化发生致命异常:', fatalErr);
  }
})();
