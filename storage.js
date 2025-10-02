// storage.js - Data Storage and Management

const Storage = {
    /**
     * Initialize storage
     */
    init() {
        this.ensureStorageStructure();
        Utils.log('Storage initialized', 'info');
    },

    /**
     * Ensure all storage keys exist
     */
    ensureStorageStructure() {
        const keys = ['ticks', 'trades', 'performance', 'models', 'settings'];
        keys.forEach(key => {
            const fullKey = `${CONFIG.storage.prefix}${key}`;
            if (!localStorage.getItem(fullKey)) {
                localStorage.setItem(fullKey, JSON.stringify(this.getDefaultValue(key)));
            }
        });
    },

    /**
     * Get default value for storage key
     */
    getDefaultValue(key) {
        const defaults = {
            ticks: [],
            trades: [],
            performance: {
                totalTrades: 0,
                wins: 0,
                losses: 0,
                totalPnL: 0,
                winRate: 0,
                profitFactor: 0,
                sharpeRatio: 0,
                maxDrawdown: 0
            },
            models: {
                statistical: { accuracy: 0, predictions: 0, correct: 0 },
                pattern: { accuracy: 0, predictions: 0, correct: 0 },
                ruleBased: { accuracy: 0, predictions: 0, correct: 0 },
                reinforcementLearning: { accuracy: 0, predictions: 0, correct: 0, qTable: {} }
            },
            settings: Utils.deepClone(CONFIG)
        };
        return defaults[key] || {};
    },

    /**
     * Save tick data
     */
    saveTick(tick) {
        try {
            const ticks = this.getTicks();
            const tickData = {
                id: Utils.generateId(),
                timestamp: tick.epoch,
                symbol: tick.symbol,
                quote: tick.quote,
                digit: Utils.getLastDigit(tick.quote),
                isEven: Utils.isEven(Utils.getLastDigit(tick.quote))
            };

            ticks.push(tickData);

            // Prune old ticks
            if (ticks.length > CONFIG.storage.maxHistorySize) {
                ticks.shift();
            }

            this.setItem('ticks', ticks);
            return tickData;
        } catch (e) {
            Utils.log('Failed to save tick', 'error', e);
            return null;
        }
    },

    /**
     * Get all ticks
     */
    getTicks() {
        return this.getItem('ticks') || [];
    },

    /**
     * Get recent ticks
     */
    getRecentTicks(count = 100) {
        const ticks = this.getTicks();
        return ticks.slice(-count);
    },

    /**
     * Save trade data
     */
    saveTrade(trade) {
        try {
            const trades = this.getTrades();
            const tradeData = {
                id: Utils.generateId(),
                timestamp: Date.now(),
                ...trade
            };

            trades.push(tradeData);

            // Prune old trades
            if (trades.length > CONFIG.storage.maxHistorySize) {
                trades.shift();
            }

            this.setItem('trades', trades);
            this.updatePerformance(tradeData);
            return tradeData;
        } catch (e) {
            Utils.log('Failed to save trade', 'error', e);
            return null;
        }
    },

    /**
     * Get all trades
     */
    getTrades() {
        return this.getItem('trades') || [];
    },

    /**
     * Get filtered trades
     */
    getFilteredTrades(filter = {}) {
        const trades = this.getTrades();
        return trades.filter(trade => {
            if (filter.type && filter.type !== 'all' && trade.result !== filter.type) {
                return false;
            }
            if (filter.date) {
                const tradeDate = new Date(trade.timestamp).toISOString().split('T')[0];
                if (tradeDate !== filter.date) {
                    return false;
                }
            }
            return true;
        });
    },

    /**
     * Update performance metrics
     */
    updatePerformance(trade) {
        try {
            const performance = this.getPerformance();
            
            performance.totalTrades++;
            
            if (trade.result === 'win') {
                performance.wins++;
                performance.totalPnL += trade.payout - trade.stake;
            } else if (trade.result === 'loss') {
                performance.losses++;
                performance.totalPnL -= trade.stake;
            }

            performance.winRate = performance.totalTrades > 0 
                ? (performance.wins / performance.totalTrades) * 100 
                : 0;

            // Calculate profit factor
            const grossProfit = this.getTrades()
                .filter(t => t.result === 'win')
                .reduce((sum, t) => sum + (t.payout - t.stake), 0);
            
            const grossLoss = this.getTrades()
                .filter(t => t.result === 'loss')
                .reduce((sum, t) => sum + t.stake, 0);

            performance.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

            // Calculate max drawdown
            performance.maxDrawdown = this.calculateMaxDrawdown();

            // Calculate Sharpe Ratio
            const returns = this.calculateReturns();
            performance.sharpeRatio = Utils.calculateSharpeRatio(returns);

            this.setItem('performance', performance);
        } catch (e) {
            Utils.log('Failed to update performance', 'error', e);
        }
    },

    /**
     * Get performance data
     */
    getPerformance() {
        return this.getItem('performance') || this.getDefaultValue('performance');
    },

    /**
     * Calculate max drawdown
     */
    calculateMaxDrawdown() {
        const trades = this.getTrades();
        if (trades.length === 0) return 0;

        let peak = 0;
        let maxDrawdown = 0;
        let cumulative = 0;

        trades.forEach(trade => {
            if (trade.result === 'win') {
                cumulative += trade.payout - trade.stake;
            } else if (trade.result === 'loss') {
                cumulative -= trade.stake;
            }

            if (cumulative > peak) {
                peak = cumulative;
            }

            const drawdown = peak - cumulative;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        });

        return maxDrawdown;
    },

    /**
     * Calculate returns array for Sharpe Ratio
     */
    calculateReturns() {
        const trades = this.getTrades();
        return trades.map(trade => {
            if (trade.result === 'win') {
                return (trade.payout - trade.stake) / trade.stake;
            } else if (trade.result === 'loss') {
                return -1;
            }
            return 0;
        });
    },

    /**
     * Update model performance
     */
    updateModelPerformance(modelName, prediction, actual) {
        try {
            const models = this.getModels();
            
            if (!models[modelName]) {
                models[modelName] = { accuracy: 0, predictions: 0, correct: 0 };
            }

            models[modelName].predictions++;
            
            if (prediction === actual) {
                models[modelName].correct++;
            }

            models[modelName].accuracy = models[modelName].predictions > 0
                ? (models[modelName].correct / models[modelName].predictions) * 100
                : 0;

            this.setItem('models', models);
        } catch (e) {
            Utils.log('Failed to update model performance', 'error', e);
        }
    },

    /**
     * Get model performance data
     */
    getModels() {
        return this.getItem('models') || this.getDefaultValue('models');
    },

    /**
     * Save Q-table for RL model
     */
    saveQTable(qTable) {
        try {
            const models = this.getModels();
            models.reinforcementLearning.qTable = qTable;
            this.setItem('models', models);
        } catch (e) {
            Utils.log('Failed to save Q-table', 'error', e);
        }
    },

    /**
     * Get Q-table for RL model
     */
    getQTable() {
        const models = this.getModels();
        return models.reinforcementLearning?.qTable || {};
    },

    /**
     * Save settings
     */
    saveSettings(settings) {
        this.setItem('settings', settings);
    },

    /**
     * Get settings
     */
    getSettings() {
        return this.getItem('settings') || this.getDefaultValue('settings');
    },

    /**
     * Generic set item with compression
     */
    setItem(key, value) {
        try {
            const fullKey = `${CONFIG.storage.prefix}${key}`;
            const data = CONFIG.storage.compressionEnabled 
                ? Utils.compressData(value)
                : JSON.stringify(value);
            localStorage.setItem(fullKey, data);
        } catch (e) {
            Utils.log(`Failed to set item: ${key}`, 'error', e);
        }
    },

    /**
     * Generic get item with decompression
     */
    getItem(key) {
        try {
            const fullKey = `${CONFIG.storage.prefix}${key}`;
            const data = localStorage.getItem(fullKey);
            
            if (!data) return null;

            return CONFIG.storage.compressionEnabled
                ? Utils.decompressData(data)
                : JSON.parse(data);
        } catch (e) {
            Utils.log(`Failed to get item: ${key}`, 'error', e);
            return null;
        }
    },

    /**
     * Backup all data
     */
    backupData() {
        try {
            const backup = {
                timestamp: Date.now(),
                ticks: this.getTicks(),
                trades: this.getTrades(),
                performance: this.getPerformance(),
                models: this.getModels(),
                settings: this.getSettings()
            };

            Utils.exportToJSON(backup, 'deriv_bot_backup');
            Utils.notify('Backup Complete', 'Data backed up successfully', 'success');
        } catch (e) {
            Utils.log('Failed to backup data', 'error', e);
            Utils.notify('Backup Failed', 'Failed to backup data', 'error');
        }
    },

    /**
     * Restore data from backup
     */
    restoreData(backupData) {
        try {
            if (backupData.ticks) this.setItem('ticks', backupData.ticks);
            if (backupData.trades) this.setItem('trades', backupData.trades);
            if (backupData.performance) this.setItem('performance', backupData.performance);
            if (backupData.models) this.setItem('models', backupData.models);
            if (backupData.settings) this.setItem('settings', backupData.settings);

            Utils.notify('Restore Complete', 'Data restored successfully', 'success');
            return true;
        } catch (e) {
            Utils.log('Failed to restore data', 'error', e);
            Utils.notify('Restore Failed', 'Failed to restore data', 'error');
            return false;
        }
    },

    /**
     * Clear all data
     */
    clearAll() {
        try {
            const keys = ['ticks', 'trades', 'performance', 'models', 'logs'];
            keys.forEach(key => {
                localStorage.removeItem(`${CONFIG.storage.prefix}${key}`);
            });
            this.ensureStorageStructure();
            Utils.notify('Data Cleared', 'All data has been cleared', 'success');
        } catch (e) {
            Utils.log('Failed to clear data', 'error', e);
        }
    },

    /**
     * Get storage size
     */
    getStorageSize() {
        let total = 0;
        for (let key in localStorage) {
            if (key.startsWith(CONFIG.storage.prefix)) {
                total += localStorage[key].length + key.length;
            }
        }
        return total;
    }
};

// Initialize storage on load
if (typeof window !== 'undefined') {
    Storage.init();
}

// Export storage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
}