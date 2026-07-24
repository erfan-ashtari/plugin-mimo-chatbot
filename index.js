const { spawn } = require('child_process');
const path = require('path');

module.exports = {
  _state: null,

  activate(context) {
    // console.log('[mimo-chatbot] ===== ACTIVATED =====');

    const pluginDir = __dirname;
    const state = { chatHistory: [], isProcessing: false, currentProcess: null, sessionId: null };
    this._state = state;

    const push = (updates) => context.updateElementState({ 'chat-iframe': updates });
    const getFile = () => context.currentFile;

    const pushFileContext = () => {
      const f = getFile();
      push({ fileName: f ? f.fileName : null, dirPath: f ? f.dirPath : '' });
    };

    // ─── Register Panel ───────────────────────────────────────────
    context.registerSidebarPanel({
      id: 'mimo-chatbot',
      title: 'MiMo Chat',
      icon: 'MessageSquare',
      children: [
        {
          type: 'html',
          id: 'chat-iframe',
          src: `file://${path.join(pluginDir, 'chat.html').replace(/\\/g, '/')}`,
          height: 500,
        },
      ],
    });

    pushFileContext();
    context.onEvent('fileOpened', pushFileContext);
    context.onEvent('fileChanged', pushFileContext);

    // ─── Handle Iframe Messages ───────────────────────────────────
    context.onEvent('ui-event', ({ elementId, eventType, payload }) => {
      if (eventType !== 'iframe-message' || elementId !== 'chat-iframe') return;
      const msg = payload;
      if (!msg || !msg.type) return;

      if (msg.type === 'chat') handleQuery(msg.text);
      else if (msg.type === 'summarize') handleSummarize();
      else if (msg.type === 'stop') handleStop();
      else if (msg.type === 'clear') {
        state.chatHistory = [];
        state.sessionId = null;
        push({ clear: true });
      }
    });

    // ─── System Prompt ────────────────────────────────────────────

	const SYSTEM_PROMPT = `	You are a helpful assistant.
	Follow these rules strictly in this session:

1. Be concise. Give short, direct answers. No lengthy explanations unless asked.
2. Do NOT use any tools, skills, plugins, or file operations unless the user explicitly asks 
(e.g. "summarize", "search the web", "fetch this URL", "read that file", "run this code").
3. Do NOT analyze or reference attached files unless the user specifically asks about them.
4. Do NOT think too much. Answer from your knowledge directly.
5. Keep responses under 200 words unless the user asks for detail.
6. If the user just says hello or asks a simple question, give a simple answer. `;

    // Detect if user wants tools/research
    const wantsTools = (text) => {
      const lower = text.toLowerCase();
      return /\b(summarize|summary|summarise|search|web search|google|lookup|look up|fetch|scrape|browse|internet|online|website|url|http|research|find papers?|arxiv|read file|open file|analyze file|run code|execute)\b/i.test(lower);
    };

    // ─── Handle Query ─────────────────────────────────────────────
    const handleQuery = async (text) => {
      if (!text || state.isProcessing) return;

      const ts = new Date().toLocaleTimeString();
      const userMsg = { role: 'user', content: text, timestamp: ts };
      state.chatHistory.push(userMsg);

      // Show user message + create bot container immediately
      state.isProcessing = true;
      push({ userMessage: userMsg, isProcessing: true, stepStart: true });

      // Build full prompt — system prompt only on first message of session
      const useTools = wantsTools(text);
      const isFirstMessage = !state.sessionId;
      const fullPrompt = useTools
        ? `The user wants you to use tools/research. You may use file operations, web search, and other tools as needed.\n\nUser message: ${text}`
        : (isFirstMessage ? `${SYSTEM_PROMPT}\nUser message: ${text}` : text);

      // console.log('[mimo-chatbot] ── PROMPT ──');
      // console.log('[mimo-chatbot] User:', text);
      // console.log('[mimo-chatbot] Full prompt:', fullPrompt.substring(0, 500) + (fullPrompt.length > 500 ? '...' : ''));
      // console.log('[mimo-chatbot] Tools:', useTools ? 'FULL (--dangerously-skip-permissions)' : 'NONE (--pure)');

      try {
        const result = await executeMimo(fullPrompt, useTools);
        // console.log('[mimo-chatbot] ── RESPONSE ──');
        // console.log('[mimo-chatbot] Thinking:', result.thinking ? result.thinking.substring(0, 300) + (result.thinking.length > 300 ? '...' : '') : '(none)');
        // console.log('[mimo-chatbot] Answer:', result.text.substring(0, 500) + (result.text.length > 500 ? '...' : ''));
        const assistantMsg = { role: 'assistant', content: result.text, thinking: result.thinking, timestamp: new Date().toLocaleTimeString() };
        state.chatHistory.push(assistantMsg);
        push({ assistantMessage: assistantMsg, isProcessing: false });
      } catch (err) {
        console.error('[mimo-chatbot] Error:', err.message);
        const errMsg = { role: 'assistant', content: 'Error: ' + err.message, timestamp: new Date().toLocaleTimeString() };
        state.chatHistory.push(errMsg);
        push({ assistantMessage: errMsg, isProcessing: false });
      } finally {
        state.isProcessing = false;
        state.currentProcess = null;
      }
    };

    // ─── Handle Summarize ─────────────────────────────────────────
    const handleSummarize = async () => {
      if (state.isProcessing) return;
      const f = getFile();
      if (!f) {
        const m = { role: 'assistant', content: 'No file open.', timestamp: new Date().toLocaleTimeString() };
        state.chatHistory.push(m);
        push({ assistantMessage: m });
        return;
      }

      const ts = new Date().toLocaleTimeString();
      const userMsg = { role: 'user', content: '[Summarize] ' + f.fileName, timestamp: ts };
      state.chatHistory.push(userMsg);

      state.isProcessing = true;
      push({ userMessage: userMsg, isProcessing: true, stepStart: true });
	  
	  const cleanPath = /[\/\\]\.current-dir$/.test(f.filePath) ? f.filePath.replace(/[\/\\]\.current-dir$/, '').replace(/\\/g, '/') : f.filePath;
	  
      const prompt = 'Please provide a comprehensive summary of the file (or directory) at "' + cleanPath + '". Include: (1) Key points, (2) Structure, (3) Conclusions, (4) Notable code patterns if code. Be thorough but concise.';

      // console.log('[mimo-chatbot] ── SUMMARIZE ──');
      // console.log('[mimo-chatbot] File:', f.filePath);

      try {
        const result = await executeMimo(prompt, true);
        // console.log('[mimo-chatbot] ── RESPONSE ──');
        // console.log('[mimo-chatbot] Thinking:', result.thinking ? result.thinking.substring(0, 300) + '...' : '(none)');
        // console.log('[mimo-chatbot] Answer:', result.text.substring(0, 500) + (result.text.length > 500 ? '...' : ''));
        const assistantMsg = { role: 'assistant', content: result.text, thinking: result.thinking, timestamp: new Date().toLocaleTimeString() };
        state.chatHistory.push(assistantMsg);
        push({ assistantMessage: assistantMsg, isProcessing: false });
      } catch (err) {
        console.error('[mimo-chatbot] Error:', err.message);
        const errMsg = { role: 'assistant', content: 'Error: ' + err.message, timestamp: new Date().toLocaleTimeString() };
        state.chatHistory.push(errMsg);
        push({ assistantMessage: errMsg, isProcessing: false });
      } finally {
        state.isProcessing = false;
        state.currentProcess = null;
      }
    };

    // ─── Handle Stop ──────────────────────────────────────────────
    const handleStop = () => {
      if (state.currentProcess) {
        const pid = state.currentProcess.pid;
        // console.log('[mimo-chatbot] >>> STOP REQUESTED, pid:', pid);
        state.killed = true;
        try {
          if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            // console.log('[mimo-chatbot] Executing: taskkill /T /F /PID', pid);
            execSync('taskkill /T /F /PID ' + pid, { stdio: 'pipe' });
            // console.log('[mimo-chatbot] >>> PROCESS KILLED, pid:', pid);
          } else {
            process.kill(-pid, 'SIGTERM');
            // console.log('[mimo-chatbot] >>> PROCESS KILLED (SIGTERM), pid:', pid);
          }
        } catch (e) {
          console.warn('[mimo-chatbot] Kill failed, trying SIGKILL:', e.message);
          try {
            state.currentProcess.kill('SIGKILL');
            // console.log('[mimo-chatbot] >>> PROCESS KILLED (SIGKILL), pid:', pid);
          } catch (e2) {
            console.error('[mimo-chatbot] >>> KILL FAILED:', e2.message);
          }
        }
        state.currentProcess = null;
      } else {
        // console.log('[mimo-chatbot] No process to stop');
      }
    };

    // ─── Execute Mimo (streams thinking updates) ──────────────────
    const executeMimo = (userMessage, useTools = false) => {
      return new Promise((resolve, reject) => {
        const f = getFile();
        const args = ['run', '--format', 'json', '--thinking', '--agent', 'compose'];

        const workDir = (f && f.dirPath) || process.cwd();
        args.push('--dir', workDir);
		if (f&& !f.filePath.includes('.current-dir')) args.push('--file', f.filePath);
		
        if (useTools) {
          // Full experience: plugins, skills, file access
          args.push('--dangerously-skip-permissions');
          
        } else {
          // Fast mode: no plugins, no skills, no file overhead
          args.push('--pure');
		  args.push('--variant','minimal');
        }

        // Continue session if we have one
        if (state.sessionId) {
          args.push('-s', state.sessionId);
        }

		args.push(userMessage)
        // console.log('[mimo-chatbot] Spawning:', args.slice(0, 100).join(' '));

        const isWin = process.platform === 'win32';
        const proc = spawn(isWin ? 'cmd.exe' : 'mimo', isWin ? ['/c', 'mimo.cmd', ...args] : args, {
          shell: false, stdio: ['ignore', 'pipe', 'pipe'], cwd: workDir,
          detached: !isWin,
        });
        state.currentProcess = proc;

        let responseText = '';
        let thinkingText = '';
        let buffer = '';
        let activityLog = [];

        proc.stdout.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const ev = JSON.parse(trimmed);
              // console.log('[mimo-chatbot] JSON:', JSON.stringify(ev));

              // Extract session ID
              if (ev.sessionID && !state.sessionId) {
                state.sessionId = ev.sessionID;
                push({ sessionId: ev.sessionID });
              }

              if (ev.type === 'step_start') {
                // console.log('[mimo-chatbot] Step started');
                activityLog = [];
                push({ stepStart: true });
              } else if (ev.type === 'reasoning' && ev.part && ev.part.text) {
                thinkingText += ev.part.text;
                push({ thinkingUpdate: thinkingText });
              } else if (ev.type === 'text' && ev.part && ev.part.text) {
                responseText += ev.part.text;
                push({ textUpdate: responseText });
              } else if (ev.type === 'tool_use' && ev.part && ev.part.tool) {
                const toolName = ev.part.tool;
                // console.log('[mimo-chatbot] Tool:', toolName);
                activityLog.push(toolName);
                push({ activityUpdate: activityLog.slice() });
              } else if (ev.type === 'step_finish') {
                // console.log('[mimo-chatbot] Step finished');
                push({ stepFinish: true });
              }
            } catch (_) {}
          }
        });

        proc.stderr.on('data', (c) => {
          const t = c.toString().trim();
          // if (t) console.log('[mimo-chatbot] stderr:', t.substring(0, 200));
        });

        proc.on('close', (code) => {
          clearTimeout(timeout);
          if (buffer.trim()) {
            try {
              const ev = JSON.parse(buffer.trim());
              if (ev.type === 'text' && ev.part) responseText += ev.part.text || '';
              if (ev.type === 'reasoning' && ev.part) thinkingText += ev.part.text || '';
            } catch (_) {}
          }
          // User stopped the process — only show actual answer, not thinking
          if (state.killed) {
            state.killed = false;
            // console.log('[mimo-chatbot] >>> Process exited after kill, code:', code);
            resolve({ text: responseText ? responseText + '\n\n[Stopped]' : '[Stopped]', thinking: thinkingText });
            return;
          }
          if (code !== 0 && !responseText) {
            reject(new Error('mimo exited with code ' + code));
            return;
          }
          resolve({ text: responseText || '(No response)', thinking: thinkingText });
        });

        proc.on('error', (err) => {
          reject(err.code === 'ENOENT' ? new Error('mimo not found. Install MiMoCode.') : err);
        });

        const timeout = setTimeout(() => {
          if (state.currentProcess) { state.currentProcess.kill(); reject(new Error('Timed out (5 min)')); }
        }, 300000);
      });
    };

    // console.log('[mimo-chatbot] ===== INITIALIZED =====');
  },

  deactivate() {
    if (this._state) {
      if (this._state.currentProcess) try { this._state.currentProcess.kill(); } catch (_) {}
    }
    this._state = null;
    // console.log('[mimo-chatbot] Deactivated');
  },
};
