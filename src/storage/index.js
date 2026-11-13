import { getActiveProfileId, getProfileStorageKey } from '../profile.js';

const DB_NAME = 'floro-ai-db';
const STORE_NAME = 'conversations';

class StorageManager {
  constructor() {
    this.dbPromise = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('profileId', 'profileId', { unique: false });
        } else {
          const store = event.target.transaction.objectStore(STORE_NAME);
          if (!store.indexNames.contains('profileId')) store.createIndex('profileId', 'profileId', { unique: false });
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

  async getAllConversations() {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
      request.onerror = () => reject(request.error);
    });
  }

  async getConversations(profileId = getActiveProfileId()) {
    if (!profileId) return [];
    const conversations = await this.getAllConversations();
    return conversations.filter((conversation) => conversation.profileId === profileId);
  }

  async assignUnownedConversations(profileId) {
    if (!profileId) throw new Error('Select a local profile before migrating chats.');
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      let assigned = 0;
      request.onsuccess = () => {
        request.result.filter((conversation) => !conversation.profileId).forEach((conversation) => {
          store.put({ ...conversation, profileId });
          assigned += 1;
        });
      };
      transaction.oncomplete = () => resolve(assigned);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      request.onerror = () => transaction.abort();
    });
  }

  async createConversation(title = 'New conversation') {
    const profileId = getActiveProfileId();
    if (!profileId) throw new Error('Select a local profile before creating a conversation.');
    let defaultModel = { provider: 'ollama', model: 'gemma3:1b' };
    try {
      defaultModel = JSON.parse(localStorage.getItem(getProfileStorageKey('default-model', profileId)) || 'null') || defaultModel;
    } catch {}
    const conversation = {
      id: crypto.randomUUID(),
      profileId,
      title,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
      provider: defaultModel.provider || 'ollama',
      model: defaultModel.model || 'gemma3:1b',
    };

    await this.withStore('readwrite', (store) => store.put(conversation));
    return conversation;
  }

  async updateConversation(id, updates) {
    const conversations = await this.getConversations();
    const existing = conversations.find((item) => item.id === id);
    if (!existing) return null;
    const next = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.withStore('readwrite', (store) => store.put(next));
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
    const conversations = await this.getConversations();
    if (!conversations.some((conversation) => conversation.id === id)) return false;
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
      request.onsuccess = () => {
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAllConversationsForProfile(profileId) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      let deleted = 0;
      request.onsuccess = () => {
        request.result.filter((conversation) => conversation.profileId === profileId).forEach((conversation) => {
          store.delete(conversation.id);
          deleted += 1;
        });
      };
      transaction.oncomplete = () => resolve(deleted);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      request.onerror = () => transaction.abort();
    });
  }
}

export const storage = new StorageManager();
