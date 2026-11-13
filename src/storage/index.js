const DB_NAME = 'floro-ai-db';
const STORE_NAME = 'conversations';

function announceChange() {
  window.dispatchEvent(new CustomEvent('floro-data-changed'));
}

function addTombstone(key, id) {
  try {
    const ids = JSON.parse(localStorage.getItem(key) || '[]');
    const validIds = Array.isArray(ids) ? ids : [];
    if (!validIds.includes(id)) validIds.push(id);
    localStorage.setItem(key, JSON.stringify(validIds));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('floro-notice', {
      detail: { message: `Local delete could not be queued for cloud sync: ${error.message}`, type: 'error' },
    }));
  }
}

class StorageManager {
  constructor() {
    this.dbPromise = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async withStore(mode, callback) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const result = callback(store);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async getConversations() {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
      request.onerror = () => reject(request.error);
    });
  }

  async createConversation(title = 'New conversation') {
    let defaultModel = { provider: 'automatic', model: 'gpt-4o-mini' };
    try {
      defaultModel = JSON.parse(localStorage.getItem('floro:default-model') || 'null') || defaultModel;
    } catch {}
    const conversation = {
      id: crypto.randomUUID(),
      title,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
      provider: defaultModel.provider || 'automatic',
      model: defaultModel.model || 'gpt-4o-mini',
    };

    await this.withStore('readwrite', (store) => store.put(conversation));
    announceChange();
    return conversation;
  }

  async updateConversation(id, updates) {
    const conversations = await this.getConversations();
    const existing = conversations.find((item) => item.id === id);
    if (!existing) return null;
    const next = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.withStore('readwrite', (store) => store.put(next));
    announceChange();
    return next;
  }

  async addMessage(id, message) {
    const conversations = await this.getConversations();
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return null;
    const nextMessages = [...(conversation.messages || []), message];
    return this.updateConversation(id, { messages: nextMessages });
  }

  async deleteConversation(id) {
    addTombstone('floro:deleted-conversations', id);
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
      request.onsuccess = () => {
        announceChange();
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async importConversation(conversation) {
    const existing = (await this.getConversations()).some((item) => item.id === conversation.id);
    if (existing) return false;
    await this.withStore('readwrite', (store) => store.put(conversation));
    announceChange();
    return true;
  }

  async replaceConversation(conversation) {
    await this.withStore('readwrite', (store) => store.put(conversation));
    announceChange();
  }

  async mergeRemoteConversations(conversations) {
    const local = await this.getConversations();
    const localIds = new Set(local.map((conversation) => conversation.id));
    const missing = conversations.filter((conversation) => !localIds.has(conversation.id));
    if (missing.length) {
      await this.withStore('readwrite', (store) => {
        missing.forEach((conversation) => store.put(conversation));
      });
      announceChange();
    }
    return missing.length;
  }
}

export const storage = new StorageManager();
