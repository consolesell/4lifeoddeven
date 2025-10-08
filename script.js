// script.js - Main Application Logic

class DerivBot {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isTrading = false;
    this.currentSymbol = null;
    this.authToken = null;
    this.tickBuffer = [];
    this.tradeQueue = [];
    this.lastTradeTime = 0;
    this.consecutiveLosses = 0;
    this.dailyLoss = 0;
    this.emergencyStop = false;
    this.charts = {};
    
    // Martingale properties
    this.initialStake = CONFIG.trading.baseStake;
    this.currentStake = CONFIG.trading.baseStake;
    this.martingaleMultiplier = 2.0; // Double stake after loss
    this.martingaleResetThreshold = 4; // Reset after 4 consecutive losses
    this.martingaleEnabled = true; // Can be toggled
    this.martingaleHistory = [];
    this.consecutiveWins = 0;
    
    // Reconnection properties
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.reconnectTimer = null;
    this.isReconnecting = false;
    this.shouldReconnect = true;
    this.lastAppId = null;
    this.pingInterval = null;
    this.pongTimeout = null;
    this.connectionHealth = 100;
    this.missedPongs = 0;
    this.maxMissedPongs = 3;

    this.init();  
  }  

  /**  
   * Initialize the bot  
   */  
  init() {  
    Utils.log('Deriv Bot initializing...', 'info');  
    this.setupEventListeners();  
    this.setupCharts();  
    this.loadSavedSettings();  
    this.updateUI();  
    Utils.requestNotificationPermission();  
    Utils.log('Deriv Bot ready', 'info');  
  }  

  /**  
   * Setup event listeners  
   */  
  setupEventListeners() {  
    // Connection controls  
    document.getElementById('connectBtn').addEventListener('click', () => this.connect());  
    document.getElementById('emergencyStop').addEventListener('click', () => this.handleEmergencyStop());  

    // Navigation  
    document.querySelectorAll('.nav-btn').forEach(btn => {  
      btn.addEventListener('click', (e) => this.switchView(e.target.dataset.view));  
    });  

    // Theme toggle  
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());  

    // Notifications toggle  
    document.getElementById('notificationsToggle').addEventListener('click', () => this.toggleNotifications());  

    // Trade controls  
    document.getElementById('autoTrade').addEventListener('change', (e) => {  
      CONFIG.trading.autoTrade = e.target.checked;  
      this.updateUI();  
    });  

    document.getElementById('simulationMode').addEventListener('change', (e) => {  
      CONFIG.trading.simulationMode = e.target.checked;  
      this.updateUI();  
    });  

    document.getElementById('adaptiveStaking').addEventListener('change', (e) => {  
      CONFIG.trading.adaptiveStaking = e.target.checked;  
    });  

    document.getElementById('manualTrade').addEventListener('click', () => this.executeManualTrade());  

    // Confidence slider  
    const confidenceSlider = document.getElementById('minConfidence');  
    confidenceSlider.addEventListener('input', (e) => {  
      CONFIG.trading.minConfidence = parseInt(e.target.value);  
      document.getElementById('minConfidenceValue').textContent = `${e.target.value}%`;  
    });  

    // Base stake input  
    document.getElementById('baseStake').addEventListener('change', (e) => {  
      const stake = parseFloat(e.target.value);  
      if (Utils.validateStake(stake)) {  
        CONFIG.trading.baseStake = stake;
        this.initialStake = stake;
        this.currentStake = stake;
        this.resetMartingale();
      }  
    });  

    // Martingale toggle (if you want to add a UI control for this)
    const martingaleToggle = document.getElementById('martingaleEnabled');
    if (martingaleToggle) {
      martingaleToggle.addEventListener('change', (e) => {
        this.martingaleEnabled = e.target.checked;
        if (!this.martingaleEnabled) {
          this.resetMartingale();
        }
        Utils.log(`Martingale ${this.martingaleEnabled ? 'enabled' : 'disabled'}`, 'info');
      });
    }

    // Model toggles  
    ['statistical', 'pattern', 'ruleBased', 'RL'].forEach(model => {  
      const checkbox = document.getElementById(`model${model.charAt(0).toUpperCase() + model.slice(1)}`);  
      if (checkbox) {  
        checkbox.addEventListener('change', (e) => {  
          const modelKey = model === 'RL' ? 'reinforcementLearning' : model;  
          CONFIG.models[modelKey].enabled = e.target.checked;  
        });  
      }  
    });  

    // History controls  
    document.getElementById('exportCSV')?.addEventListener('click', () => this.exportHistory('csv'));  
    document.getElementById('clearHistory')?.addEventListener('click', () => this.clearHistory());  

    // Settings controls  
    document.getElementById('backupData')?.addEventListener('click', () => Storage.backupData());  
    document.getElementById('resetAll')?.addEventListener('click', () => this.resetAll());  

    // Filter controls  
    document.getElementById('filterType')?.addEventListener('change', () => this.updateHistoryTable());  
    document.getElementById('filterDate')?.addEventListener('change', () => this.updateHistoryTable());  

    // Strategy selector  
    document.getElementById('strategyType')?.addEventListener('change', (e) => {  
      this.applyStrategyPreset(e.target.value);  
    });  

    // Modal controls  
    document.querySelector('.modal-close')?.addEventListener('click', () => this.hideModal());  
    document.getElementById('modalConfirm')?.addEventListener('click', () => this.handleModalConfirm());  
    document.getElementById('modalCancel')?.addEventListener('click', () => this.hideModal());  
  }  

  /**
   * Reset martingale to initial stake
   */
  resetMartingale() {
    this.currentStake = this.initialStake;
    this.consecutiveLosses = 0;
    this.consecutiveWins = 0;
    Utils.log(`Martingale reset. Current stake: ${Utils.formatCurrency(this.currentStake)}`, 'info');
    this.updateMartingaleDisplay();
  }

  /**
   * Apply martingale after loss
   */
  applyMartingaleAfterLoss() {
    if (!this.martingaleEnabled) {
      return;
    }

    this.consecutiveLosses++;
    this.consecutiveWins = 0;

    // Check if we need to reset after threshold
    if (this.consecutiveLosses >= this.martingaleResetThreshold) {
      Utils.log(`Martingale threshold reached (${this.martingaleResetThreshold} losses). Resetting to base stake.`, 'warn');
      Utils.notify('Martingale Reset', `Stake reset to ${Utils.formatCurrency(this.initialStake)} after ${this.martingaleResetThreshold} losses`, 'warning');
      this.resetMartingale();
      return;
    }

    // Calculate new stake with martingale multiplier
    const previousStake = this.currentStake;
    this.currentStake = this.currentStake * this.martingaleMultiplier;

    // Enforce maximum stake limit
    if (this.currentStake > CONFIG.trading.maxStake) {
      this.currentStake = CONFIG.trading.maxStake;
      Utils.log('Martingale stake capped at maximum allowed stake', 'warn');
    }

    // Log martingale progression
    this.martingaleHistory.push({
      timestamp: Date.now(),
      consecutiveLosses: this.consecutiveLosses,
      previousStake: previousStake,
      newStake: this.currentStake,
      multiplier: this.martingaleMultiplier
    });

    Utils.log(`Martingale applied. Loss #${this.consecutiveLosses}. Stake: ${Utils.formatCurrency(previousStake)} → ${Utils.formatCurrency(this.currentStake)}`, 'warn');
    Utils.notify('Martingale Active', `Stake increased to ${Utils.formatCurrency(this.currentStake)} (Loss #${this.consecutiveLosses})`, 'warning');
    
    this.updateMartingaleDisplay();
  }

  /**
   * Handle win - reset martingale
   */
  handleMartingaleAfterWin() {
    if (this.consecutiveLosses > 0) {
      const recoveredAmount = this.calculateRecoveredAmount();
      Utils.log(`Martingale recovery successful! Recovered from ${this.consecutiveLosses} losses. Amount recovered: ${Utils.formatCurrency(recoveredAmount)}`, 'success');
      Utils.notify('Martingale Recovery', `Successfully recovered from ${this.consecutiveLosses} consecutive losses!`, 'success');
    }

    this.consecutiveWins++;
    this.resetMartingale();
  }

  /**
   * Calculate amount recovered with martingale
   */
  calculateRecoveredAmount() {
    if (this.martingaleHistory.length === 0) {
      return 0;
    }

    // Sum all losses from the streak
    let totalLoss = 0;
    for (let i = 0; i < this.consecutiveLosses; i++) {
      if (this.martingaleHistory[i]) {
        totalLoss += this.martingaleHistory[i].previousStake;
      }
    }

    // Current stake payout minus total losses
    const currentPayout = this.currentStake * 1.95; // Assuming 95% payout
    return currentPayout - totalLoss - this.currentStake;
  }

  /**
   * Update martingale display in UI
   */
  updateMartingaleDisplay() {
    // Update current stake display
    const currentStakeEl = document.getElementById('currentStakeDisplay');
    if (currentStakeEl) {
      currentStakeEl.textContent = Utils.formatCurrency(this.currentStake);
      
      // Highlight if martingale is active
      if (this.consecutiveLosses > 0) {
        currentStakeEl.style.color = '#f59e0b';
        currentStakeEl.style.fontWeight = 'bold';
      } else {
        currentStakeEl.style.color = '';
        currentStakeEl.style.fontWeight = '';
      }
    }

    // Update martingale status
    const martingaleStatusEl = document.getElementById('martingaleStatus');
    if (martingaleStatusEl) {
      if (this.consecutiveLosses > 0) {
        martingaleStatusEl.textContent = `Active (Loss #${this.consecutiveLosses}/${this.martingaleResetThreshold})`;
        martingaleStatusEl.className = 'status-badge warning';
      } else {
        martingaleStatusEl.textContent = 'Inactive';
        martingaleStatusEl.className = 'status-badge';
      }
    }

    // Update consecutive losses display
    const lossStreakEl = document.getElementById('lossStreak');
    if (lossStreakEl) {
      lossStreakEl.textContent = this.consecutiveLosses;
      if (this.consecutiveLosses >= 3) {
        lossStreakEl.style.color = '#ef4444';
      } else if (this.consecutiveLosses >= 2) {
        lossStreakEl.style.color = '#f59e0b';
      } else {
        lossStreakEl.style.color = '';
      }
    }

    // Update next stake preview
    const nextStakeEl = document.getElementById('nextStakePreview');
    if (nextStakeEl) {
      const nextStake = this.consecutiveLosses > 0 && this.consecutiveLosses < this.martingaleResetThreshold - 1
        ? Math.min(this.currentStake * this.martingaleMultiplier, CONFIG.trading.maxStake)
        : this.initialStake;
      nextStakeEl.textContent = Utils.formatCurrency(nextStake);
    }
  }

  /**
   * Get martingale statistics
   */
  getMartingaleStats() {
    return {
      enabled: this.martingaleEnabled,
      initialStake: this.initialStake,
      currentStake: this.currentStake,
      consecutiveLosses: this.consecutiveLosses,
      consecutiveWins: this.consecutiveWins,
      multiplier: this.martingaleMultiplier,
      resetThreshold: this.martingaleResetThreshold,
      historyLength: this.martingaleHistory.length,
      isActive: this.consecutiveLosses > 0
    };
  }

  /**  
   * Connect to Deriv WebSocket with reconnection support
   */  
  async connect() {  
    const appId = document.getElementById('appId').value.trim();  
    const token = document.getElementById('apiToken').value.trim();  
    const symbol = document.getElementById('symbol').value;  

    if (!appId) {  
      this.showModal('error', 'Validation Error', 'Please enter App ID');  
      return;  
    }  

    if (!token || !Utils.validateToken(token)) {  
      this.showModal('error', 'Validation Error', 'Please enter a valid API token');  
      return;  
    }  

    // Store credentials for reconnection
    this.lastAppId = appId;
    this.authToken = token;
    this.currentSymbol = symbol;
    this.shouldReconnect = true;
    
    // Reset martingale on new connection
    this.resetMartingale();
    
    this.establishConnection();
  }

  /**
   * Establish WebSocket connection
   */
  establishConnection() {
    if (this.isReconnecting) {
      Utils.log('Connection attempt already in progress', 'debug');
      return;
    }

    this.isReconnecting = true;
    this.showLoading('Connecting to Deriv...');  

    try {  
      const wsUrl = `${CONFIG.api.wsUrl}?app_id=${this.lastAppId}`;  
      
      // Close existing connection if any
      if (this.ws) {
        this.cleanupConnection();
      }
      
      this.ws = new WebSocket(wsUrl);  

      this.ws.onopen = () => {  
        Utils.log('WebSocket connected', 'info');  
        this.onConnectionOpen();
      };  

      this.ws.onmessage = (msg) => this.handleMessage(msg);  

      this.ws.onerror = (error) => {  
        Utils.log('WebSocket error', 'error', error);  
        this.handleConnectionError(error);
      };  

      this.ws.onclose = (event) => {  
        Utils.log('WebSocket closed', 'info', { 
          code: event.code, 
          reason: event.reason,
          wasClean: event.wasClean 
        });  
        this.handleConnectionClose(event);
      };  

    } catch (error) {  
      Utils.log('Connection failed', 'error', error);  
      this.hideLoading();  
      this.handleConnectionError(error);
    }  
  }

  /**
   * Handle successful connection
   */
  onConnectionOpen() {
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.connectionHealth = 100;
    this.missedPongs = 0;
    
    // Clear any reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Start connection health monitoring
    this.startHeartbeat();
    
    // Authorize
    this.authorize(this.authToken, this.currentSymbol);
    
    Utils.log('Connection established successfully', 'info');
  }

  /**
   * Handle connection error
   */
  handleConnectionError(error) {
    this.hideLoading();
    this.connectionHealth = Math.max(0, this.connectionHealth - 20);
    
    if (!this.shouldReconnect || this.emergencyStop) {
      this.showModal('error', 'Connection Error', 'Failed to connect to Deriv API');
      return;
    }
    
    this.attemptReconnection('Connection error occurred');
  }

  /**
   * Handle connection close
   */
  handleConnectionClose(event) {
    this.isReconnecting = false;
    this.stopHeartbeat();
    
    // Don't reconnect if it was a clean close or emergency stop
    if (event.wasClean || !this.shouldReconnect || this.emergencyStop) {
      this.handleDisconnect();
      return;
    }
    
    // Determine if we should attempt reconnection
    const shouldAttemptReconnect = 
      event.code !== 1000 && // Normal closure
      event.code !== 1001 && // Going away
      this.reconnectAttempts < this.maxReconnectAttempts;
    
    if (shouldAttemptReconnect) {
      this.attemptReconnection(`Connection closed (code: ${event.code})`);
    } else {
      this.handleDisconnect();
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.showModal('error', 'Connection Failed', 
          `Failed to reconnect after ${this.maxReconnectAttempts} attempts. Please check your connection and try again.`);
      }
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  attemptReconnection(reason) {
    if (!this.shouldReconnect || this.emergencyStop) {
      return;
    }
    
    this.reconnectAttempts++;
    
    // Calculate delay with exponential backoff and jitter
    const baseDelay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const delay = baseDelay + jitter;
    
    Utils.log(
      `Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay/1000)}s`, 
      'warn',
      { reason }
    );
    
    // Update UI with reconnection status
    this.updateConnectionStatus(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    // Show notification for first reconnection attempt
    if (this.reconnectAttempts === 1) {
      Utils.notify('Connection Lost', 'Attempting to reconnect...', 'warning');
    }
    
    // Clear existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    // Schedule reconnection
    this.reconnectTimer = setTimeout(() => {
      Utils.log(`Executing reconnection attempt ${this.reconnectAttempts}`, 'info');
      this.establishConnection();
    }, delay);
  }

  /**
   * Start heartbeat/ping mechanism
   */
  startHeartbeat() {
    this.stopHeartbeat();
    
    // Send ping every 30 seconds
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendPing();
      }
    }, 30000);
    
    Utils.log('Heartbeat monitoring started', 'debug');
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  /**
   * Send ping to server
   */
  sendPing() {
    try {
      this.sendMessage({ ping: 1 });
      
      // Set timeout for pong response
      this.pongTimeout = setTimeout(() => {
        this.missedPongs++;
        this.connectionHealth = Math.max(0, this.connectionHealth - 15);
        
        Utils.log(`Missed pong response (${this.missedPongs}/${this.maxMissedPongs})`, 'warn');
        
        if (this.missedPongs >= this.maxMissedPongs) {
          Utils.log('Connection appears unhealthy, forcing reconnection', 'error');
          this.forceReconnect('Too many missed pong responses');
        }
      }, 10000); // Wait 10 seconds for pong
      
    } catch (error) {
      Utils.log('Failed to send ping', 'error', error);
    }
  }

  /**
   * Handle pong response
   */
  handlePong() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    
    this.missedPongs = 0;
    this.connectionHealth = Math.min(100, this.connectionHealth + 5);
    
    Utils.log('Pong received, connection healthy', 'debug');
  }

  /**
   * Force reconnection
   */
  forceReconnect(reason) {
    Utils.log('Forcing reconnection', 'warn', { reason });
    
    this.cleanupConnection();
    
    if (this.shouldReconnect && !this.emergencyStop) {
      this.attemptReconnection(reason);
    }
  }

  /**
   * Cleanup connection resources
   */
  cleanupConnection() {
    this.stopHeartbeat();
    
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'Client cleanup');
        }
      } catch (error) {
        Utils.log('Error during connection cleanup', 'error', error);
      }
      
      this.ws = null;
    }
  }

  /**
   * Update connection status in UI
   */
  updateConnectionStatus(status) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
      statusEl.textContent = status;
      
      // Update class based on connection health
      if (this.connectionHealth > 70) {
        statusEl.className = 'status-badge connected';
      } else if (this.connectionHealth > 30) {
        statusEl.className = 'status-badge warning';
      } else {
        statusEl.className = 'status-badge disconnected';
      }
    }
  }

  /**  
   * Authorize with API token  
   */  
  authorize(token, symbol) {  
    this.authToken = token;  
    this.currentSymbol = symbol;  
      
    this.sendMessage({  
      authorize: token  
    });  
  }  

  /**  
   * Handle incoming WebSocket messages  
   */  
  handleMessage(msg) {  
    try {  
      const data = JSON.parse(msg.data);  
      Utils.log('Received message', 'debug', data);  

      if (data.error) {  
        this.handleError(data.error);  
        return;  
      }  

      switch(data.msg_type) {  
        case 'authorize':  
          this.handleAuthorize(data);  
          break;  
        case 'tick':  
          this.handleTick(data.tick);  
          break;  
        case 'buy':  
          this.handleBuyResponse(data);  
          break;  
        case 'proposal_open_contract':  
          this.handleContractUpdate(data);  
          break;
        case 'ping':
          this.handlePong();
          break;
        default:  
          Utils.log(`Unhandled message type: ${data.msg_type}`, 'debug');  
      }  
    } catch (error) {  
      Utils.log('Failed to parse message', 'error', error);  
    }  
  }  

  /**  
   * Handle authorization response  
   */  
  handleAuthorize(data) {  
    this.hideLoading();  
    this.isConnected = true;  
      
    Utils.log('Authorized successfully', 'info', data.authorize);  
    Utils.notify('Connected', 'Successfully connected to Deriv', 'success');  

    // Update UI  
    this.updateConnectionStatus('Connected');
    document.getElementById('connectBtn').disabled = true;  

    // Subscribe to ticks  
    this.subscribeTicks(this.currentSymbol);
    
    // Notify successful reconnection if this was a reconnect
    if (this.reconnectAttempts > 0) {
      Utils.notify('Reconnected', 'Connection restored successfully', 'success');
      this.reconnectAttempts = 0;
    }
  }  

  /**  
   * Subscribe to tick stream  
   */  
  subscribeTicks(symbol) {  
    this.sendMessage({  
      ticks: symbol,  
      subscribe: 1  
    });  
    Utils.log(`Subscribed to ${symbol}`, 'info');  
  }  

  /**  
   * Handle tick data  
   */  
  async handleTick(tick) {  
    // Save tick to storage  
    const tickData = Storage.saveTick(tick);  
      
    if (!tickData) return;  

    // Update UI  
    this.updateTickDisplay(tickData);  
    this.updateCharts(tickData);  

    // Add to buffer  
    this.tickBuffer.push(tickData);  

    // Run prediction engine  
    if (this.tickBuffer.length >= 20 && !this.emergencyStop) {  
      const prediction = Analysis.predict(this.tickBuffer);  
      this.updatePredictionDisplay(prediction);  

      // Auto-trade if enabled  
      if (CONFIG.trading.autoTrade && prediction.shouldTrade) {  
        await this.executeTrade(prediction);  
      }  
    }  

    // Dispatch custom event  
    window.dispatchEvent(new CustomEvent('tickReceived', { detail: tickData }));  
  }  

  /**  
   * Update tick display in UI  
   */  
  updateTickDisplay(tick) {  
    document.getElementById('currentDigit').textContent = tick.digit;  
    document.getElementById('currentQuote').textContent = tick.quote.toFixed(4);  
    document.getElementById('tickTime').textContent = Utils.formatTime(tick.timestamp);  
      
    const label = document.getElementById('digitLabel');  
    label.textContent = tick.isEven ? 'EVEN' : 'ODD';  
    label.className = `digit-label ${tick.isEven ? 'even' : 'odd'}`;  

    // Update volatility  
    const volatility = Utils.calculateVolatility(this.tickBuffer, 20);  
    document.getElementById('volatility').textContent = (volatility * 100).toFixed(2) + '%';  

    // Update history display  
    this.updateDigitHistory(tick);  
  }  

  /**  
   * Update digit history display  
   */  
  updateDigitHistory(tick) {  
    const historyContainer = document.getElementById('digitHistory');  
    const digitEl = document.createElement('div');  
    digitEl.className = `history-digit ${tick.isEven ? 'even' : 'odd'}`;  
    digitEl.textContent = tick.digit;  
      
    historyContainer.insertBefore(digitEl, historyContainer.firstChild);  

    // Keep only last 20  
    while (historyContainer.children.length > 20) {  
      historyContainer.removeChild(historyContainer.lastChild);  
    }  
  }  

  /**  
   * Update prediction display  
   */  
  updatePredictionDisplay(prediction) {  
    document.getElementById('predictionValue').textContent = prediction.finalPrediction || '-';  
    document.getElementById('confidenceText').textContent =   
      `${(prediction.confidence * 100).toFixed(1)}%`;  
      
    const confidenceFill = document.getElementById('confidenceFill');  
    confidenceFill.style.width = `${prediction.confidence * 100}%`;  

    document.getElementById('tradeReason').textContent = prediction.reason;  

    // Update model breakdown  
    const modelVotesContainer = document.getElementById('modelVotes');  
    modelVotesContainer.innerHTML = '';  

    prediction.modelBreakdown?.forEach(model => {  
      const voteEl = document.createElement('div');  
      voteEl.className = 'model-vote';  
      voteEl.innerHTML = `  
        <span class="model-name">${model.model}</span>  
        <span class="model-prediction ${model.prediction?.toLowerCase() || 'neutral'}">  
          ${model.prediction || 'N/A'} (${(model.confidence * 100).toFixed(0)}%)  
        </span>  
      `;  
      modelVotesContainer.appendChild(voteEl);  
    });  

    // Enable/disable manual trade button  
    document.getElementById('manualTrade').disabled = !prediction.shouldTrade || this.emergencyStop;  
  }  

  /**  
   * Execute trade with martingale stake
   */  
  async executeTrade(prediction) {  
    // Check if connected
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      Utils.log('Cannot execute trade: not connected', 'warn');
      return;
    }
    
    // Check risk management rules  
    if (!this.checkRiskManagement()) {  
      Utils.log('Trade blocked by risk management', 'warn');  
      return;  
    }  

    // Check cooldown period  
    const now = Date.now();  
    if (now - this.lastTradeTime < CONFIG.risk.cooldownPeriod * 1000) {  
      Utils.log('Trade blocked by cooldown period', 'warn');  
      return;  
    }  

    // Use current stake (which includes martingale)
    let stake = this.currentStake;

    // Apply adaptive staking if enabled (but not if martingale is active)
    if (CONFIG.trading.adaptiveStaking && this.consecutiveLosses === 0) {
      stake = this.calculateAdaptiveStake();
    }

    if (!Utils.validateStake(stake)) {  
      Utils.log('Invalid stake amount', 'error');  
      return;
    }  

    // Simulation mode  
    if (CONFIG.trading.simulationMode) {  
      this.simulateTrade(prediction, stake);  
      return;  
    }  

    // Send buy request  
    const contractType = prediction.finalPrediction === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD';  
      
    this.showLoading('Placing trade...');  

    try {  
      this.sendMessage({  
        buy: 1,  
        subscribe: 1,  
        price: stake,  
        parameters: {  
          amount: stake,  
          basis: 'stake',  
          contract_type: contractType,  
          currency: 'USD',  
          duration: CONFIG.trading.contractDuration,  
          duration_unit: 't',  
          symbol: this.currentSymbol  
        }  
      });  

      this.lastTradeTime = now;  
      Utils.log('Trade executed', 'info', { 
        prediction: prediction.finalPrediction, 
        stake,
        martingaleActive: this.consecutiveLosses > 0,
        consecutiveLosses: this.consecutiveLosses
      });  

    } catch (error) {  
      this.hideLoading();  
      Utils.log('Trade execution failed', 'error', error);  
      this.showModal('error', 'Trade Failed', error.message);  
    }  
  }  

  /**  
   * Execute manual trade  
   */  
  executeManualTrade() {  
    const predictionValue = document.getElementById('predictionValue').textContent;  
    if (predictionValue === '-') {  
      this.showModal('warning', 'No Prediction', 'Wait for a prediction before trading manually');  
      return;  
    }  

    const confidence = parseFloat(document.getElementById('confidenceText').textContent) / 100;  
    const prediction = {  
      finalPrediction: predictionValue,  
      confidence,  
      shouldTrade: true,  
      reason: 'Manual trade executed by user'  
    };  

    this.executeTrade(prediction);  
  }  

  /**  
   * Handle buy response  
   */  
  handleBuyResponse(data) {  
    this.hideLoading();  

    if (data.buy) {  
      Utils.log('Contract purchased', 'info', data.buy);  
      
      const martingaleInfo = this.consecutiveLosses > 0 
        ? ` (Martingale: Loss #${this.consecutiveLosses})`
        : '';
      
      Utils.notify('Trade Placed', `Contract ID: ${data.buy.contract_id}${martingaleInfo}`, 'success');  
      Utils.playSound('success');  

      // Subscribe to contract updates  
      this.sendMessage({  
        proposal_open_contract: 1,  
        contract_id: data.buy.contract_id,  
        subscribe: 1  
      });  
    }  
  }  

  /**  
   * Handle contract updates  
   */  
  handleContractUpdate(data) {  
    const contract = data.proposal_open_contract;  
      
    if (contract.is_sold) {  
      this.handleContractSettlement(contract);  
    }  
  }  

  /**  
   * Handle contract settlement with martingale logic
   */  
  handleContractSettlement(contract) {  
    const stake = parseFloat(contract.buy_price);  
    const payout = parseFloat(contract.sell_price) || 0;  
    const profit = payout - stake;  
    const result = profit > 0 ? 'win' : 'loss';  

    // Save trade with martingale info
    const trade = {  
      contractId: contract.contract_id,  
      contractType: contract.contract_type,  
      stake,  
      payout,  
      profit,  
      result,  
      prediction: contract.contract_type.includes('EVEN') ? 'EVEN' : 'ODD',  
      actualDigit: contract.exit_tick,  
      confidence: parseFloat(document.getElementById('confidenceText').textContent) / 100,
      martingaleActive: this.consecutiveLosses > 0,
      martingaleLevel: this.consecutiveLosses,
      initialStake: this.initialStake
    };  

    Storage.saveTrade(trade);  

    // Apply martingale logic based on result
    if (result === 'loss') {  
      this.dailyLoss += stake;
      this.applyMartingaleAfterLoss();
    } else {  
      this.handleMartingaleAfterWin();
    }  

    // Update RL model if enabled  
    if (CONFIG.models.reinforcementLearning.enabled && this.tickBuffer.length > 5) {  
      const state = Analysis.getState(this.tickBuffer.slice(-5));  
      const action = trade.prediction;  
      const reward = result === 'win' ? 1 : -1;  
      const newState = Analysis.getState(this.tickBuffer);  
      Analysis.updateQLearning(state, action, reward, newState);  
    }  

    // Update UI  
    this.updateStatsDisplay();  
    this.updateHistoryTable();  

    // Enhanced notifications with martingale info
    if (result === 'win') {  
      const martingaleMsg = trade.martingaleActive 
        ? ` (Recovered from ${trade.martingaleLevel} losses!)` 
        : '';
      Utils.notify('Trade Won! 🎉', `Profit: ${Utils.formatCurrency(profit)}${martingaleMsg}`, 'success');  
      Utils.playSound('success');  
    } else {  
      const martingaleMsg = this.consecutiveLosses < this.martingaleResetThreshold
        ? ` (Next stake: ${Utils.formatCurrency(this.currentStake)})`
        : ` (Resetting to base stake)`;
      Utils.notify('Trade Lost', `Loss: ${Utils.formatCurrency(stake)}${martingaleMsg}`, 'error');  
      Utils.playSound('error');  
    }  

    Utils.log('Contract settled', 'info', trade);  

    // Dispatch event  
    window.dispatchEvent(new CustomEvent('tradeCompleted', { detail: trade }));  
  }  

  /**  
   * Simulate trade (for testing) with martingale
   */  
  simulateTrade(prediction, stake) {  
    const actualDigit = this.tickBuffer[this.tickBuffer.length - 1].digit;  
    const actualIsEven = actualDigit % 2 === 0;  
    const predictedIsEven = prediction.finalPrediction === 'EVEN';  
      
    const result = actualIsEven === predictedIsEven ? 'win' : 'loss';  
    const payout = result === 'win' ? stake * 1.95 : 0;  
    const profit = payout - stake;  

    const trade = {  
      contractId: 'SIM_' + Utils.generateId(),  
      contractType: prediction.finalPrediction,  
      stake,  
      payout,  
      profit,  
      result,  
      prediction: prediction.finalPrediction,  
      actualDigit,  
      confidence: prediction.confidence,  
      simulated: true,
      martingaleActive: this.consecutiveLosses > 0,
      martingaleLevel: this.consecutiveLosses,
      initialStake: this.initialStake
    };  

    Storage.saveTrade(trade);  

    // Apply martingale logic
    if (result === 'loss') {  
      this.applyMartingaleAfterLoss();
    } else {  
      this.handleMartingaleAfterWin();
    }  

    this.updateStatsDisplay();  
    this.updateHistoryTable();  

    const martingaleInfo = trade.martingaleActive 
      ? ` (Martingale Level ${trade.martingaleLevel})` 
      : '';

    Utils.notify(  
      result === 'win' ? 'Simulated Win' : 'Simulated Loss',  
      `${result === 'win' ? 'Profit' : 'Loss'}: ${Utils.formatCurrency(Math.abs(profit))}${martingaleInfo}`,  
      result  
    );  

    Utils.log('Simulated trade completed', 'info', trade);  
  }  

  /**  
   * Calculate stake with adaptive sizing (used when martingale is not active)
   */  
  calculateAdaptiveStake() {  
    let stake = CONFIG.trading.baseStake;  

    if (CONFIG.trading.adaptiveStaking && this.consecutiveLosses === 0) {  
      const performance = Storage.getPerformance();  
      const winRate = performance.winRate / 100;  

      if (winRate > 0.5) {  
        // Use Kelly Criterion  
        const edge = winRate - 0.5;  
        const kelly = Utils.calculateKellyCriterion(winRate, 1.95, edge);  
        stake = CONFIG.trading.baseStake * (1 + kelly * 2); // Conservative Kelly  
      }  
    }  

    // Enforce limits  
    stake = Math.max(CONFIG.trading.minStake, Math.min(stake, CONFIG.trading.maxStake));  
      
    return parseFloat(stake.toFixed(2));  
  }

  /**  
   * Calculate stake - now uses martingale or adaptive
   */  
  calculateStake() {  
    // If martingale is active (we have consecutive losses), use current martingale stake
    if (this.martingaleEnabled && this.consecutiveLosses > 0) {
      return this.currentStake;
    }

    // Otherwise, use adaptive staking if enabled
    if (CONFIG.trading.adaptiveStaking) {
      return this.calculateAdaptiveStake();
    }

    // Default to base stake
    return CONFIG.trading.baseStake;
  }  

  /**  
   * Check risk management rules  
   */  
  checkRiskManagement() {  
    // Check emergency stop  
    if (this.emergencyStop) {  
      return false;  
    }  

    // Check if current stake exceeds maximum allowed
    if (this.currentStake > CONFIG.trading.maxStake) {
      this.showModal('warning', 'Stake Too High',
        `Current stake ${Utils.formatCurrency(this.currentStake)} exceeds maximum allowed. Resetting.`);
      this.resetMartingale();
      return false;
    }

    // Check consecutive losses (in addition to martingale reset)
    if (this.consecutiveLosses >= CONFIG.risk.maxConsecutiveLosses) {  
      this.showModal('warning','Risk Limit Reached',   
        `Max consecutive losses (${CONFIG.risk.maxConsecutiveLosses}) reached. Trading paused.`);  
      CONFIG.trading.autoTrade = false;  
      document.getElementById('autoTrade').checked = false;
      this.resetMartingale();
      return false;  
    }  

    // Check daily loss limit  
    if (this.dailyLoss >= CONFIG.risk.maxDailyLoss) {  
      this.showModal('warning', 'Daily Loss Limit',   
        `Daily loss limit of ${Utils.formatCurrency(CONFIG.risk.maxDailyLoss)} reached. Trading paused.`);  
      CONFIG.trading.autoTrade = false;  
      document.getElementById('autoTrade').checked = false;
      this.resetMartingale();
      return false;  
    }  

    return true;  
  }  

  /**  
   * Handle emergency stop  
   */  
  handleEmergencyStop() {  
    this.emergencyStop = true;  
    this.shouldReconnect = false;
    CONFIG.trading.autoTrade = false;  
    document.getElementById('autoTrade').checked = false;
    
    // Reset martingale on emergency stop
    this.resetMartingale();
      
    this.showModal('warning', 'Emergency Stop Activated',   
      'All trading has been stopped. Reconnect to resume.');  
      
    Utils.notify('Emergency Stop', 'Trading stopped by user', 'warning');  
    Utils.log('Emergency stop activated', 'warn');
    
    // Disconnect WebSocket
    this.disconnect();
  }  

  /**
   * Manual disconnect
   */
  disconnect() {
    this.shouldReconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.cleanupConnection();
    this.handleDisconnect();
  }

  /**  
   * Update stats display with martingale info
   */  
  updateStatsDisplay() {  
    const performance = Storage.getPerformance();  

    document.getElementById('totalTrades').textContent = performance.totalTrades;  
    document.getElementById('winCount').textContent = performance.wins;  
    document.getElementById('lossCount').textContent = performance.losses;  
    document.getElementById('winRate').textContent = `${performance.winRate.toFixed(1)}%`;  
    document.getElementById('totalPnL').textContent = Utils.formatCurrency(performance.totalPnL);  
    document.getElementById('accuracy').textContent = `${performance.winRate.toFixed(1)}%`;  

    // Update martingale display
    this.updateMartingaleDisplay();

    // Update chart  
    this.updateModelChart();  
  }  

  /**  
   * Update history table with martingale info
   */  
  updateHistoryTable() {  
    const filterType = document.getElementById('filterType')?.value || 'all';  
    const filterDate = document.getElementById('filterDate')?.value || null;  

    const trades = Storage.getFilteredTrades({ type: filterType, date: filterDate });  
    const tbody = document.getElementById('historyTableBody');  
      
    if (!tbody) return;  

    tbody.innerHTML = '';  

    trades.slice(-50).reverse().forEach(trade => {  
      const row = tbody.insertRow();
      
      // Add martingale indicator
      const martingaleIndicator = trade.martingaleActive 
        ? `<span style="color: #f59e0b; font-weight: bold;" title="Martingale Level ${trade.martingaleLevel}">⚡${trade.martingaleLevel}</span> `
        : '';
      
      row.innerHTML = `  
        <td>${Utils.formatDateTime(trade.timestamp / 1000)}</td>  
        <td>${martingaleIndicator}${trade.contractType || trade.prediction}</td>  
        <td>${Utils.formatCurrency(trade.stake)}</td>  
        <td>${trade.prediction}</td>  
        <td><span class="trade-result ${trade.result}">${trade.result.toUpperCase()}</span></td>  
        <td class="${trade.profit >= 0 ? 'text-success' : 'text-danger'}">  
          ${Utils.formatCurrency(trade.profit)}  
        </td>  
        <td>${(trade.confidence * 100).toFixed(1)}%</td>  
      `;  
    });  
  }  

  /**  
   * Setup charts  
   */  
  setupCharts() {  
    // Tick chart  
    const tickCtx = document.getElementById('tickChart')?.getContext('2d');  
    if (tickCtx) {  
      this.charts.tick = new Chart(tickCtx, {  
        type: 'line',  
        data: {  
          labels: [],  
          datasets: [{  
            label: 'Digit Stream',  
            data: [],  
            borderColor: 'rgb(102, 126, 234)',  
            backgroundColor: 'rgba(102, 126, 234, 0.1)',  
            tension: 0.4  
          }]  
        },  
        options: {  
          responsive: true,  
          maintainAspectRatio: false,  
          scales: {  
            y: { min: 0, max: 9 }  
          },  
          plugins: {  
            legend: { display: false }  
          }  
        }  
      });  
    }  

    // Model performance chart  
    const modelCtx = document.getElementById('modelChart')?.getContext('2d');  
    if (modelCtx) {  
      this.charts.model = new Chart(modelCtx, {  
        type: 'bar',  
        data: {  
          labels: ['Statistical', 'Pattern', 'Rule-Based', 'RL'],  
          datasets: [{  
            label: 'Accuracy (%)',  
            data: [0, 0, 0, 0],  
            backgroundColor: [  
              'rgba(102, 126, 234, 0.8)',  
              'rgba(16, 185, 129, 0.8)',  
              'rgba(245, 158, 11, 0.8)',  
              'rgba(239, 68, 68, 0.8)'  
            ]  
          }]  
        },  
        options: {  
          responsive: true,  
          maintainAspectRatio: false,  
          scales: {  
            y: { min: 0, max: 100 }  
          }  
        }  
      });  
    }  
  }  

  /**  
   * Update charts with new data  
   */  
  updateCharts(tick) {  
    if (this.charts.tick) {  
      const chart = this.charts.tick;  
      chart.data.labels.push(Utils.formatTime(tick.timestamp));  
      chart.data.datasets[0].data.push(tick.digit);  

      // Keep only last 50 points  
      if (chart.data.labels.length > 50) {  
        chart.data.labels.shift();  
        chart.data.datasets[0].data.shift();  
      }  

      chart.update('none'); // Update without animation for performance  
    }  
  }  

  /**  
   * Update model performance chart  
   */  
  updateModelChart() {  
    if (this.charts.model) {  
      const models = Storage.getModels();  
      this.charts.model.data.datasets[0].data = [  
        models.statistical?.accuracy || 0,  
        models.pattern?.accuracy || 0,  
        models.ruleBased?.accuracy || 0,  
        models.reinforcementLearning?.accuracy || 0  
      ];  
      this.charts.model.update();  
    }  
  }  

  /**  
   * Send message through WebSocket with retry capability
   */  
  sendMessage(message) {  
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {  
      try {
        this.ws.send(JSON.stringify(message));  
        Utils.log('Sent message', 'debug', message);
      } catch (error) {
        Utils.log('Failed to send message', 'error', error);
        
        // Check if we need to reconnect
        if (this.shouldReconnect && !this.emergencyStop) {
          this.forceReconnect('Failed to send message');
        }
      }
    } else {  
      Utils.log('WebSocket not connected, cannot send message', 'warn');
      
      // Attempt to reconnect if appropriate
      if (this.shouldReconnect && !this.emergencyStop && !this.isReconnecting) {
        Utils.log('Attempting to reconnect to send message', 'info');
        this.attemptReconnection('WebSocket not connected');
      }
    }  
  }  

  /**  
   * Handle disconnect  
   */  
  handleDisconnect() {  
    this.isConnected = false;  
    this.isTrading = false;  
    
    if (!this.emergencyStop) {
      this.emergencyStop = false;
    }

    this.updateConnectionStatus('Disconnected');
    document.getElementById('connectBtn').disabled = false;  

    Utils.notify('Disconnected', 'Connection to Deriv closed', 'info');  
    
    // Disable auto-trading when disconnected
    if (CONFIG.trading.autoTrade) {
      CONFIG.trading.autoTrade = false;
      document.getElementById('autoTrade').checked = false;
      Utils.log('Auto-trading disabled due to disconnection', 'warn');
    }
  }  

  /**  
   * Handle errors  
   */  
  handleError(error) {  
    Utils.log('API Error', 'error', error);  
    this.showModal('error', 'API Error', error.message);  
      
    if (error.code === 'InvalidToken') {  
      this.shouldReconnect = false;
      this.handleDisconnect();  
    } else if (error.code === 'DisconnectClientError') {
      // Server is asking us to disconnect
      this.shouldReconnect = false;
      this.disconnect();
    } else if (error.code === 'RateLimit') {
      // Rate limited - wait before reconnecting
      Utils.log('Rate limited, will retry after delay', 'warn');
      this.reconnectDelay = Math.max(this.reconnectDelay, 5000);
    }
  }  

  /**  
   * Export history  
   */  
  exportHistory(format) {  
    const trades = Storage.getTrades();  
    if (trades.length === 0) {  
      this.showModal('info', 'No Data', 'No trade history to export');  
      return;  
    }  

    if (format === 'csv') {  
      Utils.exportToCSV(trades, 'deriv_bot_history');  
    } else {  
      Utils.exportToJSON(trades, 'deriv_bot_history');  
    }  

    Utils.notify('Export Complete', `History exported as ${format.toUpperCase()}`, 'success');  
  }  

  /**  
   * Clear history  
   */  
  clearHistory() {  
    this.showModal('confirm', 'Clear History',   
      'Are you sure you want to clear all trade history? This cannot be undone.',  
      () => {  
        Storage.clearAll();
        this.resetMartingale();
        this.updateStatsDisplay();  
        this.updateHistoryTable();  
        Utils.notify('History Cleared', 'All data has been cleared', 'success');  
      }  
    );  
  }  

  /**  
   * Reset all data  
   */  
  resetAll() {  
    this.showModal('confirm', 'Reset Everything',   
      'This will clear ALL data including settings, history, and model performance. Continue?',  
      () => {  
        Storage.clearAll();  
        localStorage.clear();  
        location.reload();  
      }  
    );  
  }  

  /**  
   * Apply strategy preset  
   */  
  applyStrategyPreset(preset) {  
    if (STRATEGY_PRESETS[preset]) {  
      const settings = STRATEGY_PRESETS[preset];  
      CONFIG.trading.minConfidence = settings.minConfidence;  
      CONFIG.risk.maxConsecutiveLosses = settings.maxConsecutiveLosses;  
      CONFIG.risk.cooldownPeriod = settings.cooldownPeriod;  
      CONFIG.trading.adaptiveStaking = settings.adaptiveStaking;  

      // Update UI  
      document.getElementById('minConfidence').value = settings.minConfidence;  
      document.getElementById('minConfidenceValue').textContent = `${settings.minConfidence}%`;  

      // Reset martingale when changing strategy
      this.resetMartingale();

      Utils.notify('Strategy Applied', `${preset.charAt(0).toUpperCase() + preset.slice(1)} strategy activated`, 'success');  
    }  
  }  

  /**  
   * Switch view  
   */  
  switchView(viewName) {  
    document.querySelectorAll('.view-panel').forEach(panel => {  
      panel.classList.remove('active');  
    });  
    document.querySelectorAll('.nav-btn').forEach(btn => {  
      btn.classList.remove('active');  
    });
    wsReadyState: this.ws ? this.ws.readyState : null
    };
  }

  /** 
   * Cleanup and destroy 
   */ 
  destroy() {
    Utils.log('Destroying bot instance', 'info');
    
    // Disable reconnection
    this.shouldReconnect = false;
    
    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Cleanup connection
    this.cleanupConnection();

    // Destroy charts 
    Object.values(this.charts).forEach(chart => { 
      if (chart) chart.destroy(); 
    });
    
    // Save final martingale state
    const finalState = {
      ...CONFIG,
      martingale: {
        initialStake: this.initialStake,
        lastConsecutiveLosses: this.consecutiveLosses,
        enabled: this.martingaleEnabled
      }
    };
    Storage.saveSettings(finalState);

    Utils.log('Bot destroyed', 'info'); 
  } 
} 

// Initialize bot when DOM is ready 
let bot; 
document.addEventListener('DOMContentLoaded', () => { 
  bot = new DerivBot(); 
  
  // Auto-save settings periodically (including martingale state)
  setInterval(() => { 
    const currentState = {
      ...CONFIG,
      martingale: {
        initialStake: bot.initialStake,
        currentStake: bot.currentStake,
        consecutiveLosses: bot.consecutiveLosses,
        enabled: bot.martingaleEnabled,
        multiplier: bot.martingaleMultiplier,
        resetThreshold: bot.martingaleResetThreshold
      }
    };
    Storage.saveSettings(currentState); 
  }, 60000); // Every minute 

  // Reset daily loss at midnight 
  const now = new Date(); 
  const tomorrow = new Date(now); 
  tomorrow.setDate(tomorrow.getDate() + 1); 
  tomorrow.setHours(0, 0, 0, 0); 
  const msUntilMidnight = tomorrow.getTime() - now.getTime(); 

  setTimeout(() => { 
    bot.dailyLoss = 0;
    bot.resetMartingale(); // Reset martingale at midnight
    Utils.notify('Daily Reset', 'Daily loss counter and martingale have been reset', 'info'); 

    // Set up daily interval   
    setInterval(() => {   
      bot.dailyLoss = 0;
      bot.resetMartingale();
    }, 86400000); // 24 hours 

  }, msUntilMidnight);
  
  // Monitor connection health and display
  setInterval(() => {
    if (bot) {
      bot.updateUI();
      
      // Log connection status periodically for debugging
      if (bot.isConnected) {
        Utils.log('Connection health check', 'debug', {
          ...bot.getConnectionStatus(),
          martingale: bot.getMartingaleStats()
        });
      }
    }
  }, 10000); // Every 10 seconds
  
  // Log martingale status every minute when active
  setInterval(() => {
    if (bot && bot.consecutiveLosses > 0) {
      const stats = bot.getMartingaleStats();
      Utils.log('Martingale Status Update', 'info', stats);
    }
  }, 60000); // Every minute
}); 

// Cleanup on page unload 
window.addEventListener('beforeunload', () => { 
  if (bot) { 
    // Save final state including martingale
    const finalState = {
      ...CONFIG,
      martingale: {
        initialStake: bot.initialStake,
        currentStake: bot.currentStake,
        consecutiveLosses: bot.consecutiveLosses,
        consecutiveWins: bot.consecutiveWins,
        enabled: bot.martingaleEnabled,
        multiplier: bot.martingaleMultiplier,
        resetThreshold: bot.martingaleResetThreshold,
        history: bot.martingaleHistory.slice(-10) // Save last 10 entries
      }
    };
    Storage.saveSettings(finalState); 
    bot.destroy(); 
  } 
}); 

// Handle visibility change (pause when tab is hidden) 
document.addEventListener('visibilitychange', () => { 
  if (document.hidden) { 
    Utils.log('Tab hidden - connection maintained but consider pausing trades', 'info'); 
  } else { 
    Utils.log('Tab visible - resuming', 'info'); 
    
    // Check connection health when tab becomes visible again
    if (bot && bot.isConnected && bot.ws) {
      if (bot.ws.readyState !== WebSocket.OPEN) {
        Utils.log('Connection lost while tab was hidden, attempting reconnect', 'warn');
        bot.forceReconnect('Tab regained focus, connection lost');
      }
    }
    
    // Update martingale display when tab becomes visible
    if (bot) {
      bot.updateMartingaleDisplay();
    }
  } 
}); 

// Handle online/offline events
window.addEventListener('online', () => {
  Utils.log('Network connection restored', 'info');
  Utils.notify('Online', 'Network connection restored', 'success');
  
  if (bot && !bot.isConnected && bot.shouldReconnect && !bot.emergencyStop) {
    Utils.log('Attempting to reconnect after network restoration', 'info');
    setTimeout(() => {
      bot.attemptReconnection('Network connection restored');
    }, 1000);
  }
});

window.addEventListener('offline', () => {
  Utils.log('Network connection lost', 'warn');
  Utils.notify('Offline', 'Network connection lost', 'error');
  
  if (bot && bot.isConnected) {
    bot.connectionHealth = 0;
    bot.updateUI();
  }
});

// Global error handler 
window.addEventListener('error', (event) => { 
  Utils.log('Global error caught', 'error', { 
    message: event.message, 
    filename: event.filename, 
    lineno: event.lineno, 
    colno: event.colno 
  }); 
}); 

// Unhandled promise rejection handler 
window.addEventListener('unhandledrejection', (event) => { 
  Utils.log('Unhandled promise rejection', 'error', event.reason); 
}); 

// Export bot instance for debugging 
if (typeof window !== 'undefined') { 
  window.DerivBot = bot;
  
  // Expose martingale controls for debugging
  window.getMartingaleStats = () => bot ? bot.getMartingaleStats() : null;
  window.resetMartingale = () => bot ? bot.resetMartingale() : null;
  window.getMartingaleHistory = () => bot ? bot.martingaleHistory : [];
}

// Custom event listeners for martingale events
window.addEventListener('tradeCompleted', (event) => {
  const trade = event.detail;
  
  // Log martingale progression
  if (bot && trade.martingaleActive) {
    Utils.log('Martingale Trade Completed', 'info', {
      result: trade.result,
      level: trade.martingaleLevel,
      stake: trade.stake,
      profit: trade.profit,
      nextStake: bot.currentStake
    });
  }
  
  // Check if martingale reset occurred
  if (bot && bot.consecutiveLosses === 0 && trade.result === 'win' && trade.martingaleActive) {
    Utils.log('Martingale Cycle Completed Successfully', 'success', {
      recovered: true,
      finalProfit: trade.profit
    });
  }
});

// Periodic martingale health check
setInterval(() => {
  if (bot && bot.martingaleEnabled && bot.consecutiveLosses > 0) {
    const stats = bot.getMartingaleStats();
    
    // Warn if approaching reset threshold
    if (stats.consecutiveLosses >= stats.resetThreshold - 1) {
      Utils.log('Martingale approaching reset threshold', 'warn', stats);
      
      if (CONFIG.ui.notificationsEnabled) {
        Utils.notify(
          'Martingale Warning', 
          `Next loss will reset stake to ${Utils.formatCurrency(bot.initialStake)}`, 
          'warning'
        );
      }
    }
    
    // Check if current stake is safe
    const potentialLoss = stats.currentStake;
    const remainingDailyBudget = CONFIG.risk.maxDailyLoss - bot.dailyLoss;
    
    if (potentialLoss > remainingDailyBudget * 0.5) {
      Utils.log('Martingale stake approaching daily loss limit', 'warn', {
        currentStake: stats.currentStake,
        remainingBudget: remainingDailyBudget,
        percentage: (potentialLoss / remainingDailyBudget * 100).toFixed(1)
      });
    }
  }
}, 30000); // Every 30 seconds

// Add console helpers for martingale debugging
if (typeof window !== 'undefined') {
  window.martingaleDebug = {
    getStats: () => bot ? bot.getMartingaleStats() : null,
    getHistory: () => bot ? bot.martingaleHistory : [],
    reset: () => bot ? bot.resetMartingale() : null,
    setMultiplier: (multiplier) => {
      if (bot && multiplier > 0) {
        bot.martingaleMultiplier = multiplier;
        Utils.log(`Martingale multiplier set to ${multiplier}`, 'info');
        return true;
      }
      return false;
    },
    setResetThreshold: (threshold) => {
      if (bot && threshold > 0) {
        bot.martingaleResetThreshold = threshold;
        Utils.log(`Martingale reset threshold set to ${threshold}`, 'info');
        return true;
      }
      return false;
    },
    toggle: () => {
      if (bot) {
        bot.martingaleEnabled = !bot.martingaleEnabled;
        if (!bot.martingaleEnabled) {
          bot.resetMartingale();
        }
        Utils.log(`Martingale ${bot.martingaleEnabled ? 'enabled' : 'disabled'}`, 'info');
        return bot.martingaleEnabled;
      }
      return null;
    },
    simulate: (results) => {
      // Simulate a series of wins/losses to test martingale
      if (!bot || !Array.isArray(results)) {
        console.error('Invalid input. Usage: martingaleDebug.simulate(["win", "loss", "loss", "win"])');
        return;
      }
      
      console.log('Starting martingale simulation...');
      const initialStake = bot.currentStake;
      let totalProfit = 0;
      
      results.forEach((result, index) => {
        const stake = bot.currentStake;
        console.log(`Trade ${index + 1}: ${result.toUpperCase()} - Stake: ${Utils.formatCurrency(stake)}`);
        
        if (result === 'loss') {
          totalProfit -= stake;
          bot.applyMartingaleAfterLoss();
        } else if (result === 'win') {
          const payout = stake * 1.95;
          const profit = payout - stake;
          totalProfit += profit;
          bot.handleMartingaleAfterWin();
        }
      });
      
      console.log('Simulation complete:');
      console.log(`Initial stake: ${Utils.formatCurrency(initialStake)}`);
      console.log(`Final stake: ${Utils.formatCurrency(bot.currentStake)}`);
      console.log(`Total P&L: ${Utils.formatCurrency(totalProfit)}`);
      console.log(`Current consecutive losses: ${bot.consecutiveLosses}`);
    }
  };
  
  // Log available debug commands
  console.log('%c🤖 Deriv Bot Enhanced with Smart Martingale', 'font-size: 16px; font-weight: bold; color: #667eea;');
  console.log('%cMartingale Debug Commands Available:', 'font-size: 12px; font-weight: bold; color: #10b981;');
  console.log('  martingaleDebug.getStats()        - Get current martingale statistics');
  console.log('  martingaleDebug.getHistory()      - View martingale progression history');
  console.log('  martingaleDebug.reset()           - Manually reset martingale to base stake');
  console.log('  martingaleDebug.setMultiplier(n)  - Change multiplier (default: 2.0)');
  console.log('  martingaleDebug.setResetThreshold(n) - Change reset threshold (default: 4)');
  console.log('  martingaleDebug.toggle()          - Enable/disable martingale');
  console.log('  martingaleDebug.simulate([...])   - Simulate win/loss sequence');
  console.log('  Example: martingaleDebug.simulate(["loss", "loss", "loss", "win"])');
}
