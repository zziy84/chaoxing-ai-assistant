/**
 * 学习通 AI 助手 - 配置持久化存储管理
 */
import { DEFAULT_CONFIG } from './constants.js';

const STORAGE_KEY = 'cx_ai_config';

/**
 * 读取用户配置（合并默认值）
 * @returns {Promise<typeof DEFAULT_CONFIG>}
 */
export async function getConfig() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve({ ...DEFAULT_CONFIG, ...(result[STORAGE_KEY] || {}) });
      });
    });
  } else if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * 保存用户配置
 * @param {Partial<typeof DEFAULT_CONFIG>} newConfig 
 * @returns {Promise<void>}
 */
export async function saveConfig(newConfig) {
  const current = await getConfig();
  const merged = { ...current, ...newConfig };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: merged }, () => {
        resolve(merged);
      });
    });
  } else if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }
  return merged;
}
