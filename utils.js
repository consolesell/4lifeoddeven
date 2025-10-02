// utils.js - Utility Functions

const Utils = {
    /**
     * Debounce function to limit rate of function calls
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function to ensure function is called at most once per interval
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Format currency with proper decimal places
     */
    formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    },

    /**
     * Format percentage
     */
    formatPercentage(value, decimals = 1) {
        return `${(value * 100).toFixed(decimals)}%`;
    },

    /**
     * Format date and time
     */
    formatDateTime(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },

    /**
     * Format time only
     */
    formatTime(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },

    /**
     * Get last digit from number
     */
    getLastDigit(number) {
        return parseInt(number.toString().slice(-1));
    },

    /**
     * Check if digit is even
     */
    isEven(digit) {
        return digit % 2 === 0;
    },

    /**
     * Calculate percentage
     */
    calculatePercentage(part, total) {
        if (total === 0) return 0;
        return (part / total) * 100;
    },

    /**
     * Calculate moving average
     */
    calculateMovingAverage(data, period) {
        if (data.length < period) return null;
        const sum = data.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    },

    /**
     * Calculate exponential moving average
     */
    calculateEMA(data, period, alpha = null) {
        if (data.length === 0) return null;
        if (alpha === null) {
            alpha = 2 / (period + 1);
        }
        
        let ema = data[0];
        for (let i = 1; i < data.length; i++) {
            ema = alpha * data[i] + (1 - alpha) * ema;
        }
        return ema;
    },

    /**
     * Calculate standard deviation
     */
    calculateStdDev(data) {
        if (data.length === 0) return 0;
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const squaredDiffs = data.map(value => Math.pow(value - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / data.length;
        return Math.sqrt(variance);
    },

    /**
     * Calculate volatility from tick data
     */
    calculateVolatility(ticks, period = 20) {
        if (ticks.length < period) return 0;
        const recentTicks = ticks.slice(-period);
        const returns = [];
        
        for (let i = 1; i < recentTicks.length; i++) {
            const ret = (recentTicks[i].quote - recentTicks[i - 1].quote) / recentTicks[i - 1].quote;
            returns.push(ret);
        }
        
        return this.calculateStdDev(returns);
    },

    /**
     * Generate unique ID
     */
    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Deep clone object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Validate API token format
     */
    validateToken(token) {
        return token && token.length > 10 && /^[a-zA-Z0-9_-]+$/.test(token);
    },

    /**
     * Validate stake amount
     */
    validateStake(stake, min = 0.35, max = 100) {
        const amount = parseFloat(stake);
        return !isNaN(amount) && amount >= min && amount <= max;
    },

    /**
     * Calculate Kelly Criterion for optimal stake sizing
     */
    calculateKellyCriterion(winRate, profitFactor, edge) {
        if (winRate <= 0 || winRate >= 1) return 0;
        const q = 1 - winRate;
        const kelly = (winRate * profitFactor - q) / profitFactor;
        return Math.max(0, Math.min(kelly, 0.25)); // Cap at 25% of bankroll
    },

    /**
     * Calculate Sharpe Ratio
     */
    calculateSharpeRatio(returns, riskFreeRate = 0) {
        if (returns.length === 0) return 0;
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const stdDev = this.calculateStdDev(returns);
        if (stdDev === 0) return 0;
        return (avgReturn - riskFreeRate) / stdDev;
    },

    /**
     * Compress data using simple run-length encoding
     */
    compressData(data) {
        if (typeof data === 'object') {
            data = JSON.stringify(data);
        }
        // Simple compression - in production, use LZ-string library
        return btoa(data);
    },

    /**
     * Decompress data
     */
    decompressData(compressedData) {
        try {
            const data = atob(compressedData);
            return JSON.parse(data);
        } catch (e) {
            console.error('Decompression error:', e);
            return null;
        }
    },

    /**
     * Create notification
     */
    notify(title, message, type = 'info') {
        if (!CONFIG.ui.notificationsEnabled) return;
        
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'
            });
        }
        
        // Fallback to console
        console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    },

    /**
     * Request notification permission
     */
    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    },

    /**
     * Play sound notification
     */
    playSound(type = 'success') {
        if (!CONFIG.ui.soundEnabled) return;
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = type === 'success' ? 800 : type === 'error' ? 400 : 600;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    },

    /**
     * Log message with level
     */
    log(message, level = 'info', data = null) {
        if (!CONFIG.logging.enabled) return;
        
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };
        
        if (CONFIG.logging.console) {
            const consoleMethod = console[level] || console.log;
            consoleMethod(`[${timestamp}] ${message}`, data || '');
        }
        
        if (CONFIG.logging.storage) {
            this.saveLog(logEntry);
        }
    },

    /**
     * Save log to storage
     */
    saveLog(logEntry) {
        try {
            const logs = JSON.parse(localStorage.getItem(`${CONFIG.storage.prefix}logs`) || '[]');
            logs.push(logEntry);
            
            // Keep only last 1000 logs
            if (logs.length > 1000) {
                logs.shift();
            }
            
            localStorage.setItem(`${CONFIG.storage.prefix}logs`, JSON.stringify(logs));
        } catch (e) {
            console.error('Failed to save log:', e);
        }
    },

    /**
     * Export data to CSV
     */
    exportToCSV(data, filename) {
        if (data.length === 0) return;
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => JSON.stringify(row[header] || '')).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}_${Date.now()}.csv`;
        link.click();
    },

    /**
     * Export data to JSON
     */
    exportToJSON(data, filename) {
        const jsonContent = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}_${Date.now()}.json`;
        link.click();
    }
};

// Export utils
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}