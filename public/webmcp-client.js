/**
 * WebMCP Client v1.0
 * 
 * A pure WebMCP client that discovers and executes tools
 * via the navigator.modelContext API (W3C standard).
 * 
 * Loads the target page in a hidden iframe, then reads
 * registered tools from its WebMCP context.
 *
 * Usage:
 *   const client = new WebMCPClient();
 *   const discovery = await client.navigate('https://test12.net');
 *   console.log(discovery.tools);
 *   const result = await client.executeTool('postVoiceMessage', { text: 'hello', author: 'Seb' });
 */

class WebMCPClient {
  constructor() {
    this.tools = [];
    this.pageTitle = '';
    this.pageUrl = '';
    this.connected = false;
    this._iframe = null;
  }

  /**
   * Navigate to a URL and discover its WebMCP tools.
   * Loads the page in a hidden iframe and reads registered tools
   * from window.__webmcp_tools or navigator.modelContext.
   * @param {string} url - The URL to navigate to
   * @returns {Promise<Object>}
   */
  async navigate(url) {
    // Clean up previous iframe
    if (this._iframe) {
      this._iframe.remove();
      this._iframe = null;
    }

    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      this._iframe = iframe;

      const timeout = setTimeout(() => {
        reject(new Error('WebMCP navigation timed out'));
      }, 15000);

      iframe.onload = () => {
        clearTimeout(timeout);

        // Wait for scripts to register tools
        setTimeout(() => {
          try {
            const win = iframe.contentWindow;
            this.pageUrl = url;
            this.pageTitle = iframe.contentDocument?.title || '';

            // Try multiple discovery methods:
            // 1. window.__webmcp_tools (explicit registry)
            // 2. navigator.modelContext (official API)
            let rawTools = win?.__webmcp_tools || [];

            if (rawTools.length === 0 && win?.navigator?.modelContext) {
              const ctx = win.navigator.modelContext;
              // Try known property names from different polyfill versions
              rawTools = ctx.tools || ctx._tools || ctx.registeredTools || [];
              if (typeof ctx.listTools === 'function') {
                try { rawTools = ctx.listTools(); } catch(e) {}
              }
            }

            this.tools = rawTools.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              execute: t.execute || t.handler,
              parameters: t.inputSchema?.properties
                ? Object.entries(t.inputSchema.properties).map(([key, val]) => ({
                    name: key,
                    description: val.description || '',
                    type: val.type || 'string',
                    required: (t.inputSchema?.required || []).includes(key)
                  }))
                : []
            }));
            this.connected = this.tools.length > 0;

            resolve({
              tools: this.tools,
              pageTitle: this.pageTitle,
              compliant: this.connected,
              toolCount: this.tools.length,
              toolNames: this.tools.map(t => t.name)
            });
          } catch (err) {
            reject(new Error(`WebMCP discovery failed: ${err.message}`));
          }
        }, 1500);
      };

      iframe.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load page'));
      };
    });
  }

  /** Check if connected to a WebMCP-compliant page */
  isConnected() {
    return this.connected && this.tools.length > 0;
  }

  /** Get all discovered tools */
  getTools() {
    return this.tools;
  }

  /** Get tool names as comma-separated string */
  getToolNames() {
    return this.tools.map(t => t.name).join(', ');
  }

  /** Find a tool by name */
  findTool(name) {
    return this.tools.find(t => t.name === name) || null;
  }

  /**
   * Execute a tool by calling its registered handler directly.
   * The handler runs in the page's context with full session/auth.
   * @param {string} toolName
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async executeTool(toolName, params = {}) {
    const tool = this.findTool(toolName);
    if (!tool) throw new Error(`Tool "${toolName}" not found`);
    if (!tool.execute) throw new Error(`Tool "${toolName}" has no execute handler`);

    const result = await tool.execute(params);
    return { response: result, tool: toolName, params };
  }

  /** Generate TTS-friendly description of available tools */
  describeTools() {
    if (this.tools.length === 0) return 'No tools available on this page.';
    return `I found ${this.tools.length} tools available on this page: ${this.getToolNames()}. What would you like to do?`;
  }

  /** Disconnect and clean up */
  disconnect() {
    if (this._iframe) {
      this._iframe.remove();
      this._iframe = null;
    }
    this.tools = [];
    this.connected = false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebMCPClient;
}
