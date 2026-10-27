/**
 * 学习通 AI 助手 - Options 高级设置业务逻辑
 */

import { PROVIDER_PRESETS, DEFAULT_CONFIG } from '../shared/constants.js';
import { getConfig, saveConfig } from '../shared/storage.js';
import { getSystemPrompt } from '../shared/prompt.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 全局热重载接口
  window.__RELOAD_EXT__ = () => {
    console.log('[学习通 AI 助手] 正在热重载扩展...');
    chrome.runtime.reload();
  };

  if (window.location.search.includes('reload') || window.location.hash.includes('reload')) {
    window.__RELOAD_EXT__();
    setTimeout(() => {
      try { window.close(); } catch (_) {}
    }, 300);
    return;
  }
  // 获取 DOM 元素
  const chipsContainer = document.getElementById('providerChipsContainer');
  const baseUrlInput = document.getElementById('baseUrlInput');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const btnToggleKeyVisibility = document.getElementById('btnToggleKeyVisibility');
  const docLink = document.getElementById('docLink');
  const modelSelect = document.getElementById('modelSelect');
  const customModelGroup = document.getElementById('customModelGroup');
  const customModelInput = document.getElementById('customModelInput');
  const concurrencyInput = document.getElementById('concurrencyInput');
  const autoFillToggle = document.getElementById('autoFillToggle');
  const speedModeSelect = document.getElementById('speedModeSelect');
  const includeAnalysisToggle = document.getElementById('includeAnalysisToggle');
  const delayMinInput = document.getElementById('delayMinInput');
  const delayMaxInput = document.getElementById('delayMaxInput');
  const systemPromptText = document.getElementById('systemPromptText');
  const btnTestConn = document.getElementById('btnTestConn');
  const testStatusTag = document.getElementById('testStatusTag');
  const testPreviewBox = document.getElementById('testPreviewBox');
  const testPreviewContent = document.getElementById('testPreviewContent');
  const btnSaveOptions = document.getElementById('btnSaveOptions');
  const btnResetDefaults = document.getElementById('btnResetDefaults');

  // 2. 加载当前配置
  let config = await getConfig();
  let currentProvider = config.provider || 'deepseek';

  // 渲染厂商芯片按钮
  function renderProviderChips() {
    chipsContainer.innerHTML = '';
    Object.values(PROVIDER_PRESETS).forEach(p => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip-btn ${p.id === currentProvider ? 'active' : ''}`;
      chip.textContent = p.name;
      chip.addEventListener('click', () => {
        currentProvider = p.id;
        document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
        chip.classList.add('active');
        onProviderChanged(p.id);
      });
      chipsContainer.appendChild(chip);
    });
  }

  // 厂商变更处理
  function onProviderChanged(providerId, targetModel = '') {
    const preset = PROVIDER_PRESETS[providerId];
    if (preset.baseUrl) {
      baseUrlInput.value = preset.baseUrl;
    }

    if (preset.docsUrl) {
      docLink.href = preset.docsUrl;
      docLink.classList.remove('hidden');
    } else {
      docLink.classList.add('hidden');
    }

    modelSelect.innerHTML = '';
    if (preset.models && preset.models.length > 0) {
      preset.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} (${m.id})`;
        modelSelect.appendChild(opt);
      });

      const customOpt = document.createElement('option');
      customOpt.value = '__custom__';
      customOpt.textContent = '✏️ 手动输入其他模型...';
      modelSelect.appendChild(customOpt);

      if (targetModel && preset.models.some(m => m.id === targetModel)) {
        modelSelect.value = targetModel;
        customModelGroup.classList.add('hidden');
      } else if (targetModel) {
        modelSelect.value = '__custom__';
        customModelGroup.classList.remove('hidden');
        customModelInput.value = targetModel;
      } else {
        modelSelect.value = preset.defaultModel;
        customModelGroup.classList.add('hidden');
      }
    } else {
      modelSelect.innerHTML = '<option value="__custom__">自定义模型</option>';
      modelSelect.value = '__custom__';
      customModelGroup.classList.remove('hidden');
      customModelInput.value = targetModel || '';
    }
  }

  // 绑定基础表单值
  function populateForm(cfg) {
    baseUrlInput.value = cfg.baseUrl || '';
    apiKeyInput.value = cfg.apiKey || '';
    concurrencyInput.value = cfg.concurrency || 3;
    autoFillToggle.checked = Boolean(cfg.autoFill);
    if (speedModeSelect) speedModeSelect.value = cfg.speedMode || 'turbo';
    includeAnalysisToggle.checked = cfg.includeAnalysis !== false;
    systemPromptText.value = getSystemPrompt(includeAnalysisToggle.checked);
    delayMinInput.value = cfg.safeDelayMin || 1500;
    delayMaxInput.value = cfg.safeDelayMax || 3500;

    renderProviderChips();
    onProviderChanged(cfg.provider || 'deepseek', cfg.model);
  }

  populateForm(config);

  // 监听解析开关以动态刷新系统提示词预览
  includeAnalysisToggle.addEventListener('change', () => {
    systemPromptText.value = getSystemPrompt(includeAnalysisToggle.checked);
  });

  // 监听模型下拉变化
  modelSelect.addEventListener('change', () => {
    if (modelSelect.value === '__custom__') {
      customModelGroup.classList.remove('hidden');
      customModelInput.focus();
    } else {
      customModelGroup.classList.add('hidden');
    }
  });

  // 切换 API Key 显示/隐藏
  btnToggleKeyVisibility.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      btnToggleKeyVisibility.textContent = '🔒';
    } else {
      apiKeyInput.type = 'password';
      btnToggleKeyVisibility.textContent = '👁️';
    }
  });

  // 获取当前生效的模型名称
  function getCurrentModel() {
    if (modelSelect.value === '__custom__') {
      return customModelInput.value.trim();
    }
    return modelSelect.value;
  }

  // 测试连接
  btnTestConn.addEventListener('click', async () => {
    const baseUrl = baseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = getCurrentModel();

    if (!baseUrl) {
      alert('请填写有效的 API Base URL');
      return;
    }

    testStatusTag.textContent = '⏳ 正在测试...';
    testStatusTag.className = 'status-tag loading';
    testStatusTag.classList.remove('hidden');
    testPreviewBox.classList.add('hidden');
    btnTestConn.disabled = true;

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'TEST_CONNECTION',
        payload: { baseUrl, apiKey, model }
      });

      if (res && res.success) {
        testStatusTag.textContent = `✓ 连通成功 (延时: ${res.latency}ms)`;
        testStatusTag.className = 'status-tag success';
        testPreviewContent.textContent = res.preview || '(pong)';
        testPreviewBox.classList.remove('hidden');
      } else {
        testStatusTag.textContent = `❌ 失败: ${res?.error || '请求未响应'}`;
        testStatusTag.className = 'status-tag error';
      }
    } catch (err) {
      testStatusTag.textContent = `❌ 错误: ${err.message}`;
      testStatusTag.className = 'status-tag error';
    } finally {
      btnTestConn.disabled = false;
    }
  });

  // 保存全部设置
  btnSaveOptions.addEventListener('click', async () => {
    const newConfig = {
      provider: currentProvider,
      baseUrl: baseUrlInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: getCurrentModel(),
      temperature: 0.1, // 最佳学术答题采样参数（固定 0.1 确保确定性防幻觉）
      concurrency: parseInt(concurrencyInput.value, 10) || 3,
      includeAnalysis: includeAnalysisToggle.checked,
      autoFill: autoFillToggle.checked,
      speedMode: speedModeSelect ? speedModeSelect.value : 'turbo',
      safeDelayMin: parseInt(delayMinInput.value, 10) || 1500,
      safeDelayMax: parseInt(delayMaxInput.value, 10) || 3500
    };

    btnSaveOptions.textContent = '正在保存...';
    btnSaveOptions.disabled = true;

    try {
      await saveConfig(newConfig);
      // 安全通知活动页面（防止未捕获异常）
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        chrome.tabs.query({ url: ['*://*.chaoxing.com/*', '*://*.edu.cn/*'] }, (tabs) => {
          if (chrome.runtime.lastError) return;
          (tabs || []).forEach(tab => {
            try {
              chrome.tabs.sendMessage(tab.id, { action: 'CONFIG_UPDATED', config: newConfig }, () => {
                if (chrome.runtime.lastError) {} // 消费 lastError 杜绝扩展红标
              });
            } catch (_) {}
          });
        });
      }

      btnSaveOptions.textContent = '✓ 保存成功！';
      setTimeout(() => {
        btnSaveOptions.textContent = '💾 保存全部设置';
        btnSaveOptions.disabled = false;
      }, 1500);
    } catch (err) {
      alert(`保存失败: ${err.message}`);
      btnSaveOptions.disabled = false;
    }
  });

  // 热重载扩展代码
  const btnReloadExtension = document.getElementById('btnReloadExtension');
  if (btnReloadExtension) {
    btnReloadExtension.addEventListener('click', () => {
      btnReloadExtension.textContent = '⏳ 正在重载扩展...';
      btnReloadExtension.disabled = true;
      setTimeout(() => {
        chrome.runtime.reload();
      }, 100);
    });
  }

  // 恢复默认配置
  btnResetDefaults.addEventListener('click', async () => {
    if (confirm('确定要恢复为默认初始配置吗？此操作将清除已输入的 API Key。')) {
      await saveConfig(DEFAULT_CONFIG);
      populateForm(DEFAULT_CONFIG);
      alert('已成功恢复默认配置。');
    }
  });
});
