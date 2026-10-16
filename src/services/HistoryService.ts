/**
 * Local Offline Calculation History Service (HistoryService)
 *
 * Shared between Voice Mode and Manual Calculator Mode.
 * Stores original command, interpreted expression, result, mode, and timestamp.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppMode, CalculationHistoryItem } from '../models/types';

const HISTORY_STORAGE_KEY = '@smartcalc_ai_history_v1';
const MAX_HISTORY_ITEMS = 200;

export class HistoryService {
  private items: CalculationHistoryItem[] = [];
  private listeners: Set<(items: CalculationHistoryItem[]) => void> = new Set();

  public async load(): Promise<CalculationHistoryItem[]> {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.items = parsed;
          this.notifyListeners();
        }
      }
    } catch {
      // Fallback to in-memory history
    }
    return this.getItems();
  }

  public getItems(): CalculationHistoryItem[] {
    return [...this.items];
  }

  public async addEntry(params: {
    originalCommand: string;
    interpretedExpression: string;
    result: string;
    numericResult?: number;
    unit?: string | null;
    mode: AppMode;
  }): Promise<CalculationHistoryItem> {
    const newItem: CalculationHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      originalCommand: params.originalCommand.trim(),
      interpretedExpression: params.interpretedExpression.trim(),
      result: params.result.trim(),
      numericResult: params.numericResult,
      unit: params.unit ?? null,
      mode: params.mode,
      timestamp: Date.now(),
    };

    this.items = [newItem, ...this.items].slice(0, MAX_HISTORY_ITEMS);
    this.notifyListeners();
    await this.persist();
    return newItem;
  }

  public async deleteItem(id: string): Promise<void> {
    this.items = this.items.filter((item) => item.id !== id);
    this.notifyListeners();
    await this.persist();
  }

  public async clearAll(): Promise<void> {
    this.items = [];
    this.notifyListeners();
    await this.persist();
  }

  public formatShareText(item: {
    interpretedExpression: string;
    result: string;
    originalCommand?: string;
  }): string {
    if (
      item.originalCommand &&
      item.originalCommand.toLowerCase() !==
        item.interpretedExpression.toLowerCase()
    ) {
      return `${item.interpretedExpression} = ${item.result} ("${item.originalCommand}")`;
    }
    return `${item.interpretedExpression} = ${item.result}`;
  }

  public subscribe(
    listener: (items: CalculationHistoryItem[]) => void
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify(this.items)
      );
    } catch {
      // Ignore storage errors in test/ephemeral environments
    }
  }

  private notifyListeners(): void {
    const snapshot = this.getItems();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const historyService = new HistoryService();
