/**
 * Donna Paulsen OKF Knowledge Graph & Document Reader
 * Single Page Application Logic
 */

(() => {
  'use strict';

  // ==========================================================================
  // Global Constants & State
  // ==========================================================================
  let GOOGLE_CLIENT_ID = '603017672414-snngu7phn977qp54cnkuohf4heil31j4.apps.googleusercontent.com';
  const ALLOWED_EMAIL = 'lutfidmz@gmail.com';

  const TYPE_COLORS = {
    'Persona': '#d2a8ff',
    'Decision': '#e3b341',
    'Commitment': '#3fb950',
    'Knowledge': '#58a6ff',
    'Project': '#f0883e',
    'Toolbox': '#79c0ff',
    'Journal': '#a5d6ff',
    'Preferences': '#ff7b72',
    'Playbook': '#d29922'
  };

  const state = {
    currentUser: null,
    graphData: null,
    vaultTree: null,
    activeViewMode: 'explorer',
    expandedFolders: new Set(),
    treeFilterQuery: '',
    activeConceptId: null,
    activeConcept: null,
    fuseIndex: null,
    cy: null,
    activeFilterType: 'all',
    activeLayout: 'cose',
    activeTab: 'explorer',
    tts: {
      active: false,
      conceptId: null,
      sentences: [],
      sentenceElements: [],
      currentSentenceIndex: 0,
      voice: localStorage.getItem('donna_tts_voice') || 'id-ID-GadisNeural',
      rate: localStorage.getItem('donna_tts_rate') || '+0%',
      isPlaying: false,
      audioEl: null
    },
    search: {
      results: [],
      selectedIndex: -1,
      selectedFilter: 'all'
    }
  };

  // Restore expanded folders from localStorage
  try {
    const savedFolders = localStorage.getItem('donna_expanded_folders');
    if (savedFolders) {
      const parsed = JSON.parse(savedFolders);
      if (Array.isArray(parsed)) {
        state.expandedFolders = new Set(parsed);
      }
    }
  } catch (_) {}

  // ==========================================================================
  // DOM Elements Cache
  // ==========================================================================
  const el = {
    // Header & User
    searchTriggerBtn: document.getElementById('search-trigger-btn'),
    statsBadge: document.getElementById('stats-counter'),
    statConcepts: document.getElementById('stat-concepts'),
    statEdges: document.getElementById('stat-edges'),
    userProfile: document.getElementById('user-profile'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),
    logoutBtn: document.getElementById('logout-btn'),
    syncStatus: document.getElementById('sync-status'),

    // Main views & Sidebar
    viewSidebar: document.getElementById('view-sidebar') || document.getElementById('view-graph'),
    viewGraph: document.getElementById('view-graph') || document.getElementById('view-sidebar'),
    viewReader: document.getElementById('view-reader'),

    // View Switcher & Containers
    btnSwitchExplorer: document.getElementById('btn-switch-explorer'),
    btnSwitchGraph: document.getElementById('btn-switch-graph'),
    containerExplorer: document.getElementById('container-explorer'),
    containerGraph: document.getElementById('container-graph'),

    // Explorer Tree Elements
    explorerFilterInput: document.getElementById('explorer-filter-input'),
    btnCollapseAll: document.getElementById('btn-collapse-all'),
    btnExpandAll: document.getElementById('btn-expand-all'),
    vaultTreeRoot: document.getElementById('vault-tree-root'),
    // Graph Controls
    graphLayoutSelect: document.getElementById('graph-layout-select'),
    graphFilterSelect: document.getElementById('graph-filter-select'),
    btnFitGraph: document.getElementById('btn-fit-graph'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    cyContainer: document.getElementById('cy'),
    graphLegend: document.getElementById('graph-legend'),

    // Reader elements
    readerEmpty: document.getElementById('reader-empty'),
    readerContent: document.getElementById('reader-content'),
    emptySearchBtn: document.getElementById('empty-search-btn'),
    conceptTypeBadge: document.getElementById('concept-type-badge'),
    conceptTrustBadge: document.getElementById('concept-trust-badge'),
    conceptStalenessBadge: document.getElementById('concept-staleness-badge'),
    conceptIdBadge: document.getElementById('concept-id-badge'),
    conceptTitle: document.getElementById('concept-title'),
    conceptDescription: document.getElementById('concept-description'),
    btnReadAloud: document.getElementById('btn-read-aloud'),
    conceptTagsList: document.getElementById('concept-tags-list'),
    markdownBody: document.getElementById('markdown-body'),
    outgoingLinksList: document.getElementById('outgoing-links-list'),
    backlinksList: document.getElementById('backlinks-list'),

    // Mobile Tabs
    tabExplorer: document.getElementById('tab-explorer'),
    tabGraph: document.getElementById('tab-graph'),
    tabReader: document.getElementById('tab-reader'),
    tabSearch: document.getElementById('tab-search'),
    // Floating TTS Dock
    ttsDock: document.getElementById('tts-dock'),
    ttsChunkStatus: document.getElementById('tts-chunk-status'),
    ttsCurrentText: document.getElementById('tts-current-text'),
    ttsBtnPrev: document.getElementById('tts-btn-prev'),
    ttsBtnPlay: document.getElementById('tts-btn-play'),
    ttsIconPlay: document.getElementById('tts-icon-play'),
    ttsIconPause: document.getElementById('tts-icon-pause'),
    ttsBtnNext: document.getElementById('tts-btn-next'),
    ttsVoiceSelect: document.getElementById('tts-voice-select'),
    ttsRateSelect: document.getElementById('tts-rate-select'),
    ttsBtnClose: document.getElementById('tts-btn-close'),
    ttsAudioElement: document.getElementById('tts-audio-element'),

    // Search Dialog
    searchDialog: document.getElementById('search-dialog'),
    searchInput: document.getElementById('search-input'),
    searchCloseBtn: document.getElementById('search-close-btn'),
    searchTypeFilters: document.getElementById('search-type-filters'),
    searchResultsList: document.getElementById('search-results-list'),
    searchResultsCount: document.getElementById('search-results-count'),

    // Auth Dialog
    authDialog: document.getElementById('auth-dialog'),
    googleSigninBtn: document.getElementById('google-signin-btn'),
    authErrorMsg: document.getElementById('auth-error-msg'),
    authLoading: document.getElementById('auth-loading'),
    // Toast Container
    toastContainer: document.getElementById('toast-container')
  };

  state.tts.audioEl = el.ttsAudioElement;

  // ==========================================================================
  // Utility Helpers
  // ==========================================================================
  function getTypeColor(type) {
    return TYPE_COLORS[type] || '#8b949e';
  }

  function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return isoStr;
    }
  }
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function saveExpandedFolders() {
    try {
      localStorage.setItem('donna_expanded_folders', JSON.stringify(Array.from(state.expandedFolders)));
    } catch (_) {}
  }

  // ==========================================================================
  // TTS Sentence Segmentation & Preparation
  // ==========================================================================
  const sentenceSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('id', { granularity: 'sentence' })
    : null;

  function splitIntoSentences(text) {
    if (!text || typeof text !== 'string') return [];
    if (sentenceSegmenter) {
      return Array.from(sentenceSegmenter.segment(text))
        .map(s => s.segment.trim())
        .filter(s => s.length > 2);
    }
    const matches = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
    return matches ? matches.map(s => s.trim()).filter(s => s.length > 2) : [text.trim()];
  }

  function prepareSentencesForReading(markdownBodyEl) {
    const blocks = markdownBodyEl.querySelectorAll('p, li, blockquote, h1, h2, h3, h4');
    const sentences = [];
    const sentenceElements = [];

    blocks.forEach(block => {
      if (block.closest('pre') || block.closest('code') || block.closest('table')) return;

      const rawText = (block.innerText || block.textContent || '').trim();
      if (rawText.length <= 2) return;

      const sentenceList = splitIntoSentences(rawText);
      if (sentenceList.length === 0) return;

      if (block.children.length === 0) {
        block.innerHTML = sentenceList.map(sentence => {
          const idx = sentences.length;
          sentences.push(sentence);
          return `<span class="tts-sentence" data-sentence-idx="${idx}">${escapeHtml(sentence)}</span>`;
        }).join(' ');

        block.querySelectorAll('.tts-sentence').forEach(span => {
          sentenceElements.push(span);
        });
      } else {
        let blockHtml = block.innerHTML;
        let allReplaced = true;

        for (const sentence of sentenceList) {
          if (blockHtml.includes(sentence)) {
            const idx = sentences.length;
            sentences.push(sentence);
            blockHtml = blockHtml.replace(sentence, `<span class="tts-sentence" data-sentence-idx="${idx}">${sentence}</span>`);
          } else {
            allReplaced = false;
            break;
          }
        }

        if (allReplaced) {
          block.innerHTML = blockHtml;
          block.querySelectorAll('.tts-sentence').forEach(span => {
            sentenceElements.push(span);
          });
        } else {
          const idx = sentences.length;
          sentences.push(rawText);
          block.classList.add('tts-sentence');
          block.setAttribute('data-sentence-idx', String(idx));
          sentenceElements.push(block);
        }
      }
    });

    return { sentences, sentenceElements };
  }

  // ==========================================================================
  // Vault Folder Explorer & Tree Navigation
  // ==========================================================================

  /**
   * Filter tree recursively by search query
   */
  function filterTree(nodes, query) {
    if (!query) return nodes;
    const filtered = [];

    for (const node of nodes) {
      if (node.type === 'directory') {
        const dirName = (node.name || '').toLowerCase();
        const dirPath = (node.path || '').toLowerCase();
        const nameMatches = dirName.includes(query) || dirPath.includes(query);

        const filteredChildren = filterTree(node.children || [], query);
        if (nameMatches || filteredChildren.length > 0) {
          filtered.push({
            ...node,
            children: (nameMatches && filteredChildren.length === 0) ? (node.children || []) : filteredChildren,
            _forceExpanded: true
          });
        }
      } else {
        const title = (node.title || node.name || '').toLowerCase();
        const id = (node.conceptId || node.id || '').toLowerCase();
        const type = (node.conceptType || '').toLowerCase();
        if (title.includes(query) || id.includes(query) || type.includes(query)) {
          filtered.push(node);
        }
      }
    }

    return filtered;
  }

  /**
   * Render recursive Vault Tree into container
   */
  function renderVaultTree(treeData, container, filterText = '') {
    if (!container || !treeData) return;

    const query = (filterText || '').toLowerCase().trim();
    const nodesToRender = query ? filterTree(treeData, query) : treeData;

    if (!nodesToRender || nodesToRender.length === 0) {
      container.innerHTML = `
        <div class="tree-empty-state">
          <p class="tree-empty-text">${query ? 'Tidak ada berkas yang cocok.' : 'Vault kosong.'}</p>
        </div>
      `;
      return;
    }

    function renderNodes(nodes, depth = 0) {
      let html = '';
      for (const node of nodes) {
        if (node.type === 'directory') {
          const isExpanded = node._forceExpanded || state.expandedFolders.has(node.path || node.id);
          const children = node.children || [];
          const folderPath = node.path || node.id || node.name;
          const count = node.count !== undefined ? node.count : children.length;

          html += `
            <div class="tree-folder" data-path="${escapeHtml(folderPath)}">
              <div class="tree-folder-row" data-path="${escapeHtml(folderPath)}" aria-expanded="${isExpanded ? 'true' : 'false'}" style="--depth: ${depth}; padding-left: calc(${depth} * 16px + 10px);" role="treeitem">
                <svg class="tree-chevron ${isExpanded ? 'is-expanded' : ''}" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
                  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                </svg>
                <svg class="tree-icon tree-folder-icon" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                </svg>
                <span class="tree-folder-name">${escapeHtml(node.name)}</span>
                <span class="tree-count-badge">${count}</span>
              </div>
              <div class="tree-folder-children" style="display: ${isExpanded ? 'block' : 'none'};" role="group">
                ${renderNodes(children, depth + 1)}
              </div>
            </div>
          `;
        } else {
          const conceptId = node.conceptId || node.id;
          const isActive = state.activeConceptId === conceptId;
          const conceptType = node.conceptType || '';
          const typeColor = getTypeColor(conceptType);
          const title = node.title || node.name || conceptId;

          html += `
            <div class="tree-file-row ${isActive ? 'is-active' : ''}" data-id="${escapeHtml(conceptId)}" data-concept-type="${escapeHtml(conceptType)}" style="--depth: ${depth}; padding-left: calc(${depth} * 16px + 28px);" role="treeitem" tabindex="0">
              <svg class="tree-icon tree-file-icon" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
                <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/>
              </svg>
              <span class="tree-file-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
              ${conceptType ? `<span class="tree-type-badge" style="color: ${typeColor}; border-color: ${typeColor};"><span class="tree-type-dot" style="background-color: ${typeColor};"></span>${escapeHtml(conceptType)}</span>` : ''}
            </div>
          `;
        }
      }
      return html;
    }

    container.innerHTML = renderNodes(nodesToRender, 0);
  }

  /**
   * Collapse all folders
   */
  function collapseAllFolders() {
    state.expandedFolders.clear();
    saveExpandedFolders();
    if (!el.vaultTreeRoot) return;
    const folderRows = el.vaultTreeRoot.querySelectorAll('.tree-folder-row');
    folderRows.forEach(row => {
      row.setAttribute('aria-expanded', 'false');
      const chevron = row.querySelector('.tree-chevron');
      if (chevron) chevron.classList.remove('is-expanded');
    });
    const childrenContainers = el.vaultTreeRoot.querySelectorAll('.tree-folder-children');
    childrenContainers.forEach(container => {
      container.style.display = 'none';
    });
  }

  /**
   * Expand all folders
   */
  function expandAllFolders() {
    function collectPaths(nodes) {
      if (!nodes) return;
      for (const n of nodes) {
        if (n.type === 'directory') {
          const p = n.path || n.id || n.name;
          if (p) state.expandedFolders.add(p);
          if (n.children) collectPaths(n.children);
        }
      }
    }
    if (state.vaultTree) {
      collectPaths(state.vaultTree);
    }
    saveExpandedFolders();
    if (!el.vaultTreeRoot) return;
    const folderRows = el.vaultTreeRoot.querySelectorAll('.tree-folder-row');
    folderRows.forEach(row => {
      row.setAttribute('aria-expanded', 'true');
      const chevron = row.querySelector('.tree-chevron');
      if (chevron) chevron.classList.add('is-expanded');
    });
    const childrenContainers = el.vaultTreeRoot.querySelectorAll('.tree-folder-children');
    childrenContainers.forEach(container => {
      container.style.display = 'block';
    });
  }

  /**
   * Sync active concept highlighting in Explorer tree and scroll into view
   */
  function syncExplorerActiveConcept(conceptId) {
    if (!el.vaultTreeRoot || !conceptId) return;

    // 1. Remove active class from all file rows
    const activeRows = el.vaultTreeRoot.querySelectorAll('.tree-file-row.is-active');
    activeRows.forEach(row => row.classList.remove('is-active'));

    // 2. Find row matching conceptId
    let targetRow = null;
    const allFileRows = el.vaultTreeRoot.querySelectorAll('.tree-file-row');
    for (const row of allFileRows) {
      const id = row.getAttribute('data-id');
      if (id === conceptId || id === decodeURIComponent(conceptId) || encodeURIComponent(id) === conceptId) {
        targetRow = row;
        break;
      }
    }

    if (targetRow) {
      targetRow.classList.add('is-active');

      // 3. Auto-expand all ancestor folder rows leading to that file
      let ancestor = targetRow.parentElement;
      let expandedAny = false;
      while (ancestor && ancestor !== el.vaultTreeRoot) {
        if (ancestor.classList && ancestor.classList.contains('tree-folder-children')) {
          ancestor.style.display = 'block';
          const folderRow = ancestor.previousElementSibling;
          if (folderRow && folderRow.classList.contains('tree-folder-row')) {
            folderRow.setAttribute('aria-expanded', 'true');
            const chevron = folderRow.querySelector('.tree-chevron');
            if (chevron) chevron.classList.add('is-expanded');
            const path = folderRow.getAttribute('data-path');
            if (path && !state.expandedFolders.has(path)) {
              state.expandedFolders.add(path);
              expandedAny = true;
            }
          }
        }
        ancestor = ancestor.parentElement;
      }

      if (expandedAny) {
        saveExpandedFolders();
      }

      // 4. Scroll active item into view inside tree panel smoothly
      try {
        targetRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (_) {
        targetRow.scrollIntoView(false);
      }
    }
  }

  /**
   * Switch view mode between Explorer and Graph
   */
  function switchViewMode(mode) {
    state.activeViewMode = mode;

    if (mode === 'explorer') {
      if (el.btnSwitchExplorer) {
        el.btnSwitchExplorer.classList.add('is-active');
        el.btnSwitchExplorer.setAttribute('aria-selected', 'true');
      }
      if (el.btnSwitchGraph) {
        el.btnSwitchGraph.classList.remove('is-active');
        el.btnSwitchGraph.setAttribute('aria-selected', 'false');
      }
      if (el.containerExplorer) el.containerExplorer.hidden = false;
      if (el.containerGraph) el.containerGraph.hidden = true;

      // Scroll active item into view if selected
      if (state.activeConceptId) {
        syncExplorerActiveConcept(state.activeConceptId);
      }
    } else if (mode === 'graph') {
      if (el.btnSwitchGraph) {
        el.btnSwitchGraph.classList.add('is-active');
        el.btnSwitchGraph.setAttribute('aria-selected', 'true');
      }
      if (el.btnSwitchExplorer) {
        el.btnSwitchExplorer.classList.remove('is-active');
        el.btnSwitchExplorer.setAttribute('aria-selected', 'false');
      }
      if (el.containerGraph) el.containerGraph.hidden = false;
      if (el.containerExplorer) el.containerExplorer.hidden = true;

      // Cytoscape resize and fit
      if (state.cy) {
        state.cy.resize();
        if (state.activeConceptId) {
          focusNodeInGraph(state.activeConceptId);
        } else {
          state.cy.fit();
        }
      }
    }
  }

  // ==========================================================================
  // Authentication Management
  // ==========================================================================
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          state.currentUser = data.user;
          onAuthSuccess(data.user);
          return true;
        }
      }
    } catch (err) {
      console.warn('Gagal memeriksa sesi pengguna:', err);
    }

    showAuthModal();
    return false;
  }

  function onAuthSuccess(user) {
    if (el.authDialog.open) {
      el.authDialog.close();
    }
    el.userProfile.hidden = false;
    el.userAvatar.src = user.picture || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%2358a6ff"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
    el.userName.textContent = user.name || user.email.split('@')[0];
    el.userAvatar.alt = user.name || 'User Avatar';

    // Start loading main app features
    initApp();
  }

  function showAuthModal() {
    el.authErrorMsg.hidden = true;
    el.authLoading.hidden = true;
    if (!el.authDialog.open) {
      el.authDialog.showModal();
    }

    initGoogleSignIn();
  }

  async function initGoogleSignIn() {
    if (typeof window.google === 'undefined' || !window.google.accounts) {
      // Retry in 200ms if script is still loading
      setTimeout(initGoogleSignIn, 200);
      return;
    }

    try {
      try {
        const res = await fetch('/api/auth/config');
        if (res.ok) {
          const cfg = await res.json();
          if (cfg.clientId) GOOGLE_CLIENT_ID = cfg.clientId;
        }
      } catch (_) {}

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        auto_select: false
      });

      window.google.accounts.id.renderButton(el.googleSigninBtn, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        shape: 'rectangular',
        text: 'signin_with',
        logo_alignment: 'left',
        width: 280
      });
    } catch (err) {
      console.error('Error saat inisialisasi Google GIS:', err);
    }
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
      showAuthError('Gagal menerima kredensial dari Google.');
      return;
    }

    el.authLoading.hidden = false;
    el.authErrorMsg.hidden = true;

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
        credentials: 'include'
      });

      const data = await res.json();
      el.authLoading.hidden = true;

      if (res.ok && data.ok && data.user) {
        state.currentUser = data.user;
        onAuthSuccess(data.user);
      } else {
        const errorMsg = data.message || 'Akses ditolak: Akun Anda tidak memiliki otorisasi (hanya lutfidmz@gmail.com yang diizinkan).';
        showAuthError(errorMsg);
      }
    } catch (err) {
      el.authLoading.hidden = true;
      showAuthError('Terjadi kesalahan jaringan saat memvalidasi login.');
    }
  }

  function showAuthError(message) {
    el.authErrorMsg.textContent = message;
    el.authErrorMsg.hidden = false;
  }


  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.warn('Logout network error:', e);
    }
    state.currentUser = null;
    el.userProfile.hidden = true;
    showAuthModal();
  }

  // ==========================================================================
  // Vault Data & Cytoscape Graph
  // ==========================================================================
  async function loadVaultGraph() {
    try {
      const res = await fetch('/api/vault/graph', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) {
          showAuthModal();
          return;
        }
        throw new Error(`HTTP ${res.status}: Gagal memuat graf vault`);
      }

      const graph = await res.json();
      state.graphData = graph;

      // Update counters
      el.statConcepts.textContent = graph.stats ? graph.stats.concepts : graph.nodes.length;
      el.statEdges.textContent = graph.stats ? graph.stats.edges : graph.edges.length;

      // Check if data.tree is returned, or fetch /api/vault/tree
      if (graph.tree && Array.isArray(graph.tree)) {
        state.vaultTree = graph.tree;
      } else {
        try {
          const treeRes = await fetch('/api/vault/tree', { credentials: 'include' });
          if (treeRes.ok) {
            state.vaultTree = await treeRes.json();
          }
        } catch (treeErr) {
          console.warn('Gagal memuat /api/vault/tree:', treeErr);
        }
      }

      // Expand top-level folders on initial load if no user preferences are saved
      if (state.expandedFolders.size === 0 && state.vaultTree && Array.isArray(state.vaultTree)) {
        state.vaultTree.forEach(node => {
          if (node.type === 'directory') {
            const p = node.path || node.id || node.name;
            if (p) state.expandedFolders.add(p);
          }
        });
        saveExpandedFolders();
      }

      // Render Vault Tree
      if (state.vaultTree && el.vaultTreeRoot) {
        renderVaultTree(state.vaultTree, el.vaultTreeRoot, state.treeFilterQuery);
      }

      // Populate filter dropdowns & legend
      populateTypeFilters(graph.stats.types || []);
      renderGraphLegend(graph.stats.types || []);

      // Build Fuse.js index
      initFuseSearch(graph.nodes);

      // Render or update Cytoscape
      renderCytoscapeGraph(graph);

      // Deep link navigation
      handleHashNavigation();

      // Sync active concept if selected
      if (state.activeConceptId) {
        syncExplorerActiveConcept(state.activeConceptId);
      }
    } catch (err) {
      console.error('Error loadVaultGraph:', err);
      showToast('Gagal memuat graf pengetahuan.');
    }
  }

  function populateTypeFilters(types) {
    // Graph filter select
    const currentGraphVal = el.graphFilterSelect.value;
    el.graphFilterSelect.innerHTML = '<option value="all">Semua Tipe</option>';
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = `${t}`;
      el.graphFilterSelect.appendChild(opt);
    });
    el.graphFilterSelect.value = currentGraphVal || 'all';

    // Search dialog filter pills
    el.searchTypeFilters.innerHTML = '';
    const allPill = createFilterPill('all', 'Semua', state.search.selectedFilter === 'all');
    el.searchTypeFilters.appendChild(allPill);

    types.forEach(t => {
      const pill = createFilterPill(t, t, state.search.selectedFilter === t);
      el.searchTypeFilters.appendChild(pill);
    });
  }

  function createFilterPill(typeValue, label, isActive) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `filter-pill ${isActive ? 'is-active' : ''}`;
    btn.textContent = label;
    btn.setAttribute('data-type', typeValue);
    btn.addEventListener('click', () => {
      state.search.selectedFilter = typeValue;
      document.querySelectorAll('.search-type-filters .filter-pill').forEach(p => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      performSearch(el.searchInput.value.trim());
    });
    return btn;
  }

  function renderGraphLegend(types) {
    el.graphLegend.innerHTML = '';
    types.forEach(type => {
      const item = document.createElement('div');
      item.className = 'legend-item';

      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.backgroundColor = getTypeColor(type);

      const label = document.createElement('span');
      label.textContent = type;

      item.appendChild(dot);
      item.appendChild(label);
      el.graphLegend.appendChild(item);
    });
  }

  function renderCytoscapeGraph(graph) {
    const elements = [];

    // Map Nodes
    graph.nodes.forEach(node => {
      const bodyLen = (node.body || '').length;
      const nodeSize = Math.min(52, Math.max(26, 26 + Math.log2((bodyLen || 100) / 40) * 3));

      elements.push({
        data: {
          id: node.id,
          label: node.title.length > 24 ? node.title.slice(0, 22) + '…' : node.title,
          fullTitle: node.title,
          type: node.type,
          nodeColor: getTypeColor(node.type),
          nodeSize: nodeSize,
          rawConcept: node
        }
      });
    });

    // Map Edges
    graph.edges.forEach((edge, idx) => {
      elements.push({
        data: {
          id: `e_${edge.source}_${edge.target}_${idx}`,
          source: edge.source,
          target: edge.target
        }
      });
    });

    if (state.cy) {
      state.cy.destroy();
    }

    state.cy = cytoscape({
      container: el.cyContainer,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(nodeColor)',
            'width': 'data(nodeSize)',
            'height': 'data(nodeSize)',
            'label': 'data(label)',
            'color': '#f0f6fc',
            'font-family': 'Atkinson Hyperlegible, sans-serif',
            'font-size': '11px',
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'text-outline-color': '#0d1117',
            'text-outline-width': 2,
            'text-outline-opacity': 0.9,
            'border-width': 1.5,
            'border-color': '#30363d',
            'transition-property': 'background-color, border-color, border-width, width, height',
            'transition-duration': '0.15s'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#58a6ff',
            'border-width': 3.5,
            'shadow-blur': 14,
            'shadow-color': '#58a6ff',
            'shadow-opacity': 0.8
          }
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-color': '#58a6ff',
            'border-width': 3
          }
        },
        {
          selector: 'node.dimmed',
          style: {
            'opacity': 0.25
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': '#30363d',
            'target-arrow-color': '#30363d',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8,
            'transition-property': 'line-color, target-arrow-color, width, opacity',
            'transition-duration': '0.15s'
          }
        },
        {
          selector: 'edge.highlighted',
          style: {
            'width': 2.5,
            'line-color': '#58a6ff',
            'target-arrow-color': '#58a6ff',
            'opacity': 1
          }
        },
        {
          selector: 'edge.dimmed',
          style: {
            'opacity': 0.1
          }
        }
      ],
      layout: getLayoutConfig(state.activeLayout),
      boxSelectionEnabled: false,
      autoungrabify: false
    });

    // Node Interaction Events
    state.cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const conceptId = node.id();
      highlightNeighborhood(node);
      selectConcept(conceptId);

      // On mobile viewports, automatically switch tab to Reader
      if (window.innerWidth <= 1023) {
        switchMobileTab('reader');
      }
    });

    state.cy.on('tap', (evt) => {
      if (evt.target === state.cy) {
        resetGraphHighlights();
      }
    });
  }

  function getLayoutConfig(name) {
    switch (name) {
      case 'concentric':
        return {
          name: 'concentric',
          concentric: (node) => node.degree(),
          levelWidth: () => 2,
          animate: true,
          animationDuration: 400
        };
      case 'circle':
        return {
          name: 'circle',
          animate: true,
          animationDuration: 400
        };
      case 'breadthfirst':
        return {
          name: 'breadthfirst',
          directed: true,
          spacingFactor: 1.25,
          animate: true,
          animationDuration: 400
        };
      case 'grid':
        return {
          name: 'grid',
          animate: true,
          animationDuration: 400
        };
      case 'cose':
      default:
        return {
          name: 'cose',
          animate: false,
          randomize: false,
          componentSpacing: 60,
          nodeOverlap: 20,
          idealEdgeLength: () => 60,
          nodeRepulsion: () => 4500
        };
    }
  }

  function applyLayout(layoutName) {
    state.activeLayout = layoutName;
    if (state.cy) {
      const layout = state.cy.layout(getLayoutConfig(layoutName));
      layout.run();
    }
  }

  function applyFilter(type) {
    state.activeFilterType = type;
    if (!state.cy) return;

    if (type === 'all') {
      state.cy.elements().removeClass('dimmed');
    } else {
      state.cy.batch(() => {
        state.cy.nodes().forEach(n => {
          if (n.data('type') === type) {
            n.removeClass('dimmed');
            n.connectedEdges().removeClass('dimmed');
          } else {
            n.addClass('dimmed');
          }
        });
      });
    }
  }

  function highlightNeighborhood(node) {
    if (!state.cy) return;
    state.cy.batch(() => {
      state.cy.elements().removeClass('highlighted dimmed');
      const neighborhood = node.neighborhood().add(node);
      state.cy.elements().not(neighborhood).addClass('dimmed');
      neighborhood.addClass('highlighted');
    });
  }

  function resetGraphHighlights() {
    if (!state.cy) return;
    state.cy.batch(() => {
      state.cy.elements().removeClass('highlighted dimmed');
    });
    if (state.activeFilterType !== 'all') {
      applyFilter(state.activeFilterType);
    }
  }

  function focusNodeInGraph(nodeId) {
    if (!state.cy || !nodeId) return;
    const node = state.cy.$id(nodeId);
    if (node && node.length > 0) {
      state.cy.nodes().unselect();
      node.select();
      highlightNeighborhood(node);
      state.cy.animate({
        center: { eles: node },
        zoom: 1.4
      }, { duration: 400 });
    }
  }

  // ==========================================================================
  // Concept Reader & Markdown Rendering
  // ==========================================================================
  async function selectConcept(conceptId, updateHash = true) {
    if (!conceptId) return;

    state.activeConceptId = conceptId;

    if (updateHash) {
      window.location.hash = '#' + encodeURIComponent(conceptId);
    }

    // Stop current TTS if reading a different concept
    if (state.tts.active && state.tts.conceptId !== conceptId) {
      stopTTS();
    }

    // Find locally in cached graph nodes first for speed
    let concept = null;
    if (state.graphData && state.graphData.nodes) {
      concept = state.graphData.nodes.find(n => n.id === conceptId || n.slug === conceptId || n.path === conceptId);
    }

    // Fetch full concept if not in memory or to refresh
    if (!concept || !concept.body) {
      try {
        const res = await fetch(`/api/vault/concept/${encodeURIComponent(conceptId)}`, { credentials: 'include' });
        if (res.ok) {
          concept = await res.json();
        }
      } catch (err) {
        console.warn('Gagal memuat detail konsep:', err);
      }
    }

    if (!concept) {
      showToast('Konsep tidak ditemukan');
      return;
    }

    state.activeConcept = concept;
    renderConceptView(concept);
    focusNodeInGraph(concept.id);
    syncExplorerActiveConcept(concept.id);
  }

  function renderConceptView(concept) {
    el.readerEmpty.hidden = true;
    el.readerEmpty.style.display = 'none';
    el.readerEmpty.classList.add('is-hidden');
    el.readerContent.hidden = false;
    el.readerContent.style.display = 'block';
    el.readerContent.classList.remove('is-hidden');

    // Scroll reader panel to top
    el.viewReader.scrollTop = 0;

    // Header Metadata
    el.conceptTitle.textContent = concept.title;
    el.conceptIdBadge.textContent = concept.id;

    // Type Badge
    el.conceptTypeBadge.textContent = concept.type;
    el.conceptTypeBadge.style.color = getTypeColor(concept.type);
    el.conceptTypeBadge.style.borderColor = getTypeColor(concept.type);

    // Trust Badge (OKF standard verification tiers)
    const status = (concept.status || 'unverified').toLowerCase();
    el.conceptTrustBadge.className = `trust-badge ${status}`;
    if (status === 'human-reviewed') {
      el.conceptTrustBadge.innerHTML = '✓ Human-Reviewed';
    } else if (status === 'machine-confirmed') {
      el.conceptTrustBadge.innerHTML = '⚡ Machine-Confirmed';
    } else {
      el.conceptTrustBadge.innerHTML = '⚠️ Unverified';
    }

    // Staleness warning
    if (concept.stale_after) {
      const isStale = new Date(concept.stale_after) < new Date();
      if (isStale) {
        el.conceptStalenessBadge.hidden = false;
        el.conceptStalenessBadge.textContent = `⚠️ Kadaluarsa sejak ${formatDate(concept.stale_after)}`;
      } else {
        el.conceptStalenessBadge.hidden = true;
      }
    } else {
      el.conceptStalenessBadge.hidden = true;
    }

    // Description
    if (concept.description) {
      el.conceptDescription.hidden = false;
      el.conceptDescription.textContent = concept.description;
    } else {
      el.conceptDescription.hidden = true;
    }

    // Tags list
    el.conceptTagsList.innerHTML = '';
    const tags = concept.tags || [];
    tags.forEach(tag => {
      const tagChip = document.createElement('button');
      tagChip.type = 'button';
      tagChip.className = 'tag-chip';
      tagChip.textContent = `#${tag}`;
      tagChip.title = `Cari konsep dengan tag #${tag}`;
      tagChip.addEventListener('click', () => {
        openSearchDialog(`#${tag}`);
      });
      el.conceptTagsList.appendChild(tagChip);
    });

    // Render Markdown body with marked + DOMPurify
    renderMarkdownContent(concept.body || '');

    // Render Outgoing Links & Backlinks
    renderRelations(concept);
  }

  function renderMarkdownContent(rawMarkdown) {
    // Custom renderer for marked to transform wikilinks and internal links
    const renderer = new marked.Renderer();

    // Custom link renderer
    const originalLink = renderer.link.bind(renderer);
    renderer.link = function (linkObj) {
      const href = linkObj.href || '';
      const text = linkObj.text || '';
      const title = linkObj.title ? ` title="${linkObj.title}"` : '';

      // Internal link handling (e.g., target.md, decisions/foo.md, etc.)
      if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:')) {
        const cleanHref = href.replace(/\.md$/, '').replace(/^\.\//, '');
        return `<a href="#${encodeURIComponent(cleanHref)}" class="internal-link"${title}>${text}</a>`;
      }
      return originalLink(linkObj);
    };

    // Pre-process wikilinks: [[concept]] or [[concept|label]]
    let processed = rawMarkdown.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, label) => {
      const display = label ? label.trim() : target.trim();
      const href = encodeURIComponent(target.trim());
      return `[${display}](#${href})`;
    });

    marked.setOptions({
      renderer: renderer,
      gfm: true,
      breaks: true
    });

    const dirtyHtml = marked.parse(processed);
    const cleanHtml = DOMPurify.sanitize(dirtyHtml, {
      ADD_ATTR: ['target', 'data-tts-chunk']
    });

    el.markdownBody.innerHTML = cleanHtml;

    // Prepare sentence-level wrapping for interactive reading & precise highlighting
    const { sentences, sentenceElements } = prepareSentencesForReading(el.markdownBody);
    state.tts.sentences = sentences;
    state.tts.sentenceElements = sentenceElements;

    // Interactive Click-to-Read on any sentence
    sentenceElements.forEach((span, idx) => {
      span.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'A') return;
        e.stopPropagation();
        startTTS(idx);
      });
    });

    // Intercept clicks on internal markdown links
    el.markdownBody.querySelectorAll('a.internal-link, a[href^="#"]').forEach(a => {
      a.addEventListener('click', (e) => {
        const hash = a.getAttribute('href');
        if (hash && hash.startsWith('#')) {
          e.preventDefault();
          const targetId = decodeURIComponent(hash.slice(1));
          selectConcept(targetId);
        }
      });
    });
  }

  function renderRelations(concept) {
    // Outgoing Links
    el.outgoingLinksList.innerHTML = '';
    const links = concept.links || [];
    if (links.length === 0) {
      el.outgoingLinksList.innerHTML = '<span class="empty-hint">Tidak ada tautan keluar</span>';
    } else {
      links.forEach(targetId => {
        const targetNode = state.graphData?.nodes?.find(n => n.id === targetId || n.slug === targetId);
        const card = createRelationCard(targetId, targetNode);
        el.outgoingLinksList.appendChild(card);
      });
    }

    // Backlinks (Incoming)
    el.backlinksList.innerHTML = '';
    const backlinks = concept.backlinks || [];
    if (backlinks.length === 0) {
      el.backlinksList.innerHTML = '<span class="empty-hint">Tidak ada konsep yang menautkan ke sini</span>';
    } else {
      backlinks.forEach(sourceId => {
        const sourceNode = state.graphData?.nodes?.find(n => n.id === sourceId || n.slug === sourceId);
        const card = createRelationCard(sourceId, sourceNode);
        el.backlinksList.appendChild(card);
      });
    }
  }

  function createRelationCard(id, conceptNode) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link-card';

    const titleText = conceptNode ? conceptNode.title : id;
    const typeText = conceptNode ? conceptNode.type : 'Konsep';

    btn.innerHTML = `
      <span class="link-card-type">[${typeText}]</span>
      <span class="link-card-title">${titleText}</span>
    `;

    btn.addEventListener('click', () => {
      selectConcept(id);
    });

    return btn;
  }

  function handleHashNavigation() {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const conceptId = decodeURIComponent(hash.slice(1));
      selectConcept(conceptId, false);
    }
  }

  window.addEventListener('hashchange', handleHashNavigation);

  // ==========================================================================
  // Instant Fuzzy Search (Fuse.js)
  // ==========================================================================
  function initFuseSearch(nodes) {
    const options = {
      keys: [
        { name: 'title', weight: 0.4 },
        { name: 'tags', weight: 0.3 },
        { name: 'description', weight: 0.15 },
        { name: 'id', weight: 0.1 },
        { name: 'body', weight: 0.05 }
      ],
      threshold: 0.35,
      ignoreLocation: true,
      includeScore: true
    };

    state.fuseIndex = new Fuse(nodes, options);
  }

  function openSearchDialog(initialQuery = '') {
    if (!el.searchDialog.open) {
      el.searchDialog.showModal();
    }
    el.searchInput.value = initialQuery;
    el.searchInput.focus();
    performSearch(initialQuery);
  }

  function closeSearchDialog() {
    if (el.searchDialog.open) {
      el.searchDialog.close();
    }
  }

  function performSearch(query) {
    if (!state.fuseIndex) return;

    let results = [];
    if (!query) {
      // Default: show all or top recent items
      results = (state.graphData?.nodes || []).slice(0, 25).map(node => ({ item: node }));
    } else if (query.startsWith('#')) {
      // Tag-specific search
      const tagQuery = query.slice(1).toLowerCase();
      results = (state.graphData?.nodes || [])
        .filter(n => (n.tags || []).some(t => t.toLowerCase().includes(tagQuery)))
        .map(node => ({ item: node }));
    } else {
      results = state.fuseIndex.search(query).slice(0, 30);
    }

    // Filter by type if a type pill is selected
    if (state.search.selectedFilter !== 'all') {
      results = results.filter(r => r.item.type === state.search.selectedFilter);
    }

    state.search.results = results;
    state.search.selectedIndex = results.length > 0 ? 0 : -1;
    renderSearchResults(results);
  }

  function renderSearchResults(results) {
    el.searchResultsList.innerHTML = '';
    el.searchResultsCount.textContent = `${results.length} hasil`;

    if (results.length === 0) {
      el.searchResultsList.innerHTML = '<div class="search-empty">Tidak ada konsep yang cocok dengan pencarian</div>';
      return;
    }

    results.forEach((res, index) => {
      const node = res.item;
      const itemEl = document.createElement('div');
      itemEl.className = 'search-result-item';
      itemEl.setAttribute('role', 'option');
      itemEl.setAttribute('aria-selected', index === state.search.selectedIndex ? 'true' : 'false');
      itemEl.setAttribute('data-index', index);

      const typeColor = getTypeColor(node.type);

      itemEl.innerHTML = `
        <div class="result-top-line">
          <span class="result-title">${node.title}</span>
          <span class="result-type" style="color: ${typeColor}; border-color: ${typeColor}">${node.type}</span>
        </div>
        ${node.description ? `<p class="result-desc">${node.description}</p>` : ''}
      `;

      itemEl.addEventListener('click', () => {
        selectSearchResult(index);
      });

      el.searchResultsList.appendChild(itemEl);
    });

    scrollSelectedSearchResultIntoView();
  }

  function selectSearchResult(index) {
    const result = state.search.results[index];
    if (result && result.item) {
      closeSearchDialog();
      selectConcept(result.item.id);
      if (window.innerWidth <= 1023) {
        switchMobileTab('reader');
      }
    }
  }

  function updateSearchSelection(newIndex) {
    const items = el.searchResultsList.querySelectorAll('.search-result-item');
    if (items.length === 0) return;

    if (state.search.selectedIndex >= 0 && items[state.search.selectedIndex]) {
      items[state.search.selectedIndex].setAttribute('aria-selected', 'false');
    }

    state.search.selectedIndex = Math.max(0, Math.min(items.length - 1, newIndex));
    if (items[state.search.selectedIndex]) {
      items[state.search.selectedIndex].setAttribute('aria-selected', 'true');
      scrollSelectedSearchResultIntoView();
    }
  }

  function scrollSelectedSearchResultIntoView() {
    const items = el.searchResultsList.querySelectorAll('.search-result-item');
    const selected = items[state.search.selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  // ==========================================================================
  // Edge-TTS Read Aloud Player Dock
  // ==========================================================================
  function startTTS(fromIdx = 0) {
    if (!state.activeConcept || state.tts.sentences.length === 0) {
      showToast('Tidak ada kalimat untuk dibaca');
      return;
    }

    state.tts.active = true;
    state.tts.conceptId = state.activeConcept.id;
    state.tts.currentSentenceIndex = Math.max(0, Math.min(state.tts.sentences.length - 1, fromIdx));
    el.ttsDock.hidden = false;
    el.ttsDock.classList.remove('is-paused');

    playCurrentSentence();
  }

  function stopTTS() {
    if (state.tts.audioEl) {
      state.tts.audioEl.pause();
      state.tts.audioEl.src = '';
    }
    state.tts.active = false;
    state.tts.isPlaying = false;
    el.ttsDock.hidden = true;
    el.ttsDock.classList.remove('is-paused');
    updatePlayPauseIcons(false);
    clearTTSHighlights();
  }

  function playCurrentSentence() {
    if (state.tts.currentSentenceIndex >= state.tts.sentences.length) {
      showToast('Selesai membaca konsep');
      stopTTS();
      return;
    }

    const sentenceText = state.tts.sentences[state.tts.currentSentenceIndex];
    state.tts.isPlaying = true;
    el.ttsDock.classList.remove('is-paused');
    updatePlayPauseIcons(true);

    // Update status & text snippet
    el.ttsChunkStatus.textContent = `Kalimat ${state.tts.currentSentenceIndex + 1} dari ${state.tts.sentences.length}`;
    el.ttsCurrentText.textContent = sentenceText;

    // Highlight the active sentence in reader view
    highlightTTSSentence(state.tts.currentSentenceIndex);

    // Prepare audio URL with Edge-TTS parameters
    const params = new URLSearchParams({
      text: sentenceText,
      voice: state.tts.voice,
      rate: state.tts.rate
    });

    state.tts.audioEl.src = `/api/tts?${params.toString()}`;
    state.tts.audioEl.play().catch(err => {
      console.warn('Autoplay audio dicegah oleh peramban:', err);
      state.tts.isPlaying = false;
      updatePlayPauseIcons(false);
      el.ttsDock.classList.add('is-paused');
    });

    // Prefetch next sentence audio into browser cache
    if (state.tts.currentSentenceIndex + 1 < state.tts.sentences.length) {
      const nextText = state.tts.sentences[state.tts.currentSentenceIndex + 1];
      const nextParams = new URLSearchParams({
        text: nextText,
        voice: state.tts.voice,
        rate: state.tts.rate
      });
      fetch(`/api/tts?${nextParams.toString()}`).catch(() => {});
    }
  }

  function toggleTTSPlayPause() {
    if (!state.tts.active) {
      startTTS(0);
      return;
    }

    if (state.tts.audioEl.paused) {
      state.tts.audioEl.play().then(() => {
        state.tts.isPlaying = true;
        el.ttsDock.classList.remove('is-paused');
        updatePlayPauseIcons(true);
      }).catch(console.warn);
    } else {
      state.tts.audioEl.pause();
      state.tts.isPlaying = false;
      el.ttsDock.classList.add('is-paused');
      updatePlayPauseIcons(false);
    }
  }

  function nextTTSSentence() {
    if (state.tts.currentSentenceIndex + 1 < state.tts.sentences.length) {
      state.tts.currentSentenceIndex++;
      playCurrentSentence();
    } else {
      showToast('Ini kalimat terakhir');
    }
  }

  function prevTTSSentence() {
    if (state.tts.currentSentenceIndex > 0) {
      state.tts.currentSentenceIndex--;
      playCurrentSentence();
    }
  }

  function updatePlayPauseIcons(isPlaying) {
    el.ttsIconPlay.hidden = isPlaying;
    el.ttsIconPause.hidden = !isPlaying;
  }

  function highlightTTSSentence(sentenceIdx) {
    clearTTSHighlights();
    const elem = state.tts.sentenceElements[sentenceIdx];
    if (elem) {
      elem.classList.add('is-reading');
      elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function clearTTSHighlights() {
    document.querySelectorAll('.markdown-body .tts-sentence.is-reading').forEach(el => {
      el.classList.remove('is-reading');
    });
  }

  // Audio Event Listeners: advance to next sentence on audio end
  el.ttsAudioElement.addEventListener('ended', () => {
    if (state.tts.active && state.tts.isPlaying) {
      nextTTSSentence();
    }
  });

  el.ttsAudioElement.addEventListener('error', (e) => {
    console.error('Audio playback error:', e);
    showToast('Gagal memuat streaming audio Edge-TTS');
    state.tts.isPlaying = false;
    updatePlayPauseIcons(false);
    el.ttsDock.classList.add('is-paused');
  });

  // ==========================================================================
  // Live Auto-Sync (Server-Sent Events)
  // ==========================================================================
  function initLiveSync() {
    try {
      const eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        el.syncStatus.classList.remove('is-syncing');
        el.syncStatus.querySelector('.sync-text').textContent = 'Live Sync';
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.type === 'vault_updated') {
            handleVaultUpdateEvent(payload);
          }
        } catch {}
      };

      eventSource.addEventListener('vault_updated', () => {
        handleVaultUpdateEvent({ type: 'vault_updated' });
      });

      eventSource.onerror = (err) => {
        console.warn('SSE Error / Reconnecting...', err);
        el.syncStatus.querySelector('.sync-text').textContent = 'Reconnecting';
      };
    } catch (err) {
      console.warn('Gagal menghubungkan SSE:', err);
    }
  }

  function handleVaultUpdateEvent(payload) {
    el.syncStatus.classList.add('is-syncing');
    setTimeout(() => {
      el.syncStatus.classList.remove('is-syncing');
    }, 1500);

    // Refresh graph data in background
    loadVaultGraph();

    // If currently reading a concept, re-fetch and update content
    if (state.activeConceptId) {
      selectConcept(state.activeConceptId, false);
    }
  }

  // ==========================================================================
  // Mobile Tab Switching (≤1023px)
  // ==========================================================================
  function switchMobileTab(tab) {
    state.activeTab = tab;

    if (el.tabExplorer) {
      el.tabExplorer.classList.toggle('is-active', tab === 'explorer');
      el.tabExplorer.setAttribute('aria-selected', tab === 'explorer' ? 'true' : 'false');
    }
    if (el.tabGraph) {
      el.tabGraph.classList.toggle('is-active', tab === 'graph');
      el.tabGraph.setAttribute('aria-selected', tab === 'graph' ? 'true' : 'false');
    }
    if (el.tabReader) {
      el.tabReader.classList.toggle('is-active', tab === 'reader');
      el.tabReader.setAttribute('aria-selected', tab === 'reader' ? 'true' : 'false');
    }

    const sidebar = el.viewSidebar || el.viewGraph;
    if (tab === 'explorer') {
      if (sidebar) sidebar.classList.remove('is-hidden');
      if (el.viewReader) el.viewReader.classList.add('is-hidden');
      switchViewMode('explorer');
    } else if (tab === 'graph') {
      if (sidebar) sidebar.classList.remove('is-hidden');
      if (el.viewReader) el.viewReader.classList.add('is-hidden');
      switchViewMode('graph');
    } else if (tab === 'reader') {
      if (sidebar) sidebar.classList.add('is-hidden');
      if (el.viewReader) el.viewReader.classList.remove('is-hidden');
    }
  }

  // ==========================================================================
  // Event Listeners & Wiring
  // ==========================================================================
  function wireEventListeners() {
    // Search Dialog Triggers
    el.searchTriggerBtn.addEventListener('click', () => openSearchDialog());
    el.emptySearchBtn?.addEventListener('click', () => openSearchDialog());
    el.searchCloseBtn.addEventListener('click', () => closeSearchDialog());

    // Search input keystrokes
    el.searchInput.addEventListener('input', (e) => {
      performSearch(e.target.value.trim());
    });

    el.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateSearchSelection(state.search.selectedIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateSearchSelection(state.search.selectedIndex - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.search.selectedIndex >= 0) {
          selectSearchResult(state.search.selectedIndex);
        }
      } else if (e.key === 'Escape') {
        closeSearchDialog();
      }
    });

    // Global keyboard shortcut: Cmd+K / Ctrl+K
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (el.searchDialog.open) {
          closeSearchDialog();
        } else {
          openSearchDialog();
        }
      }
    });
    // View Switcher (Explorer vs Graph)
    if (el.btnSwitchExplorer) {
      el.btnSwitchExplorer.addEventListener('click', () => switchViewMode('explorer'));
    }
    if (el.btnSwitchGraph) {
      el.btnSwitchGraph.addEventListener('click', () => switchViewMode('graph'));
    }

    // Tree Collapse/Expand All Buttons
    if (el.btnCollapseAll) {
      el.btnCollapseAll.addEventListener('click', () => collapseAllFolders());
    }
    if (el.btnExpandAll) {
      el.btnExpandAll.addEventListener('click', () => expandAllFolders());
    }

    // Explorer Filter Input
    if (el.explorerFilterInput) {
      el.explorerFilterInput.addEventListener('input', (e) => {
        state.treeFilterQuery = e.target.value.trim();
        if (state.vaultTree && el.vaultTreeRoot) {
          renderVaultTree(state.vaultTree, el.vaultTreeRoot, state.treeFilterQuery);
          if (state.activeConceptId) {
            syncExplorerActiveConcept(state.activeConceptId);
          }
        }
      });
    }

    // Explorer Tree Event Delegation
    if (el.vaultTreeRoot) {
      el.vaultTreeRoot.addEventListener('click', (e) => {
        // Folder row toggle
        const folderRow = e.target.closest('.tree-folder-row');
        if (folderRow) {
          const path = folderRow.getAttribute('data-path');
          const isExpanded = folderRow.getAttribute('aria-expanded') === 'true';
          const nextState = !isExpanded;
          folderRow.setAttribute('aria-expanded', nextState ? 'true' : 'false');
          const chevron = folderRow.querySelector('.tree-chevron');
          if (chevron) chevron.classList.toggle('is-expanded', nextState);

          const children = folderRow.nextElementSibling;
          if (children) {
            children.style.display = nextState ? 'block' : 'none';
          }
          if (nextState) {
            state.expandedFolders.add(path);
          } else {
            state.expandedFolders.delete(path);
          }
          saveExpandedFolders();
          return;
        }

        // File row click -> selectConcept
        const fileRow = e.target.closest('.tree-file-row');
        if (fileRow) {
          const conceptId = fileRow.getAttribute('data-id');
          if (conceptId) {
            selectConcept(conceptId);
            if (window.innerWidth <= 1023) {
              switchMobileTab('reader');
            }
          }
        }
      });

      // Keyboard selection on tree file rows
      el.vaultTreeRoot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const fileRow = e.target.closest('.tree-file-row');
          if (fileRow) {
            e.preventDefault();
            const conceptId = fileRow.getAttribute('data-id');
            if (conceptId) {
              selectConcept(conceptId);
              if (window.innerWidth <= 1023) {
                switchMobileTab('reader');
              }
            }
          }
        }
      });
    }

    // Graph Controls
    el.graphLayoutSelect.addEventListener('change', (e) => {
      applyLayout(e.target.value);
    });

    el.graphFilterSelect.addEventListener('change', (e) => {
      applyFilter(e.target.value);
    });

    el.btnFitGraph.addEventListener('click', () => {
      if (state.cy) {
        state.cy.fit(undefined, 30);
      }
    });

    el.btnZoomIn.addEventListener('click', () => {
      if (state.cy) {
        state.cy.zoom({
          level: state.cy.zoom() * 1.25,
          renderedPosition: { x: el.cyContainer.clientWidth / 2, y: el.cyContainer.clientHeight / 2 }
        });
      }
    });

    el.btnZoomOut.addEventListener('click', () => {
      if (state.cy) {
        state.cy.zoom({
          level: state.cy.zoom() / 1.25,
          renderedPosition: { x: el.cyContainer.clientWidth / 2, y: el.cyContainer.clientHeight / 2 }
        });
      }
    });

    // Read Aloud / TTS Dock Controls
    el.btnReadAloud.addEventListener('click', () => {
      startTTS();
    });

    el.ttsBtnPlay.addEventListener('click', () => {
      toggleTTSPlayPause();
    });

    el.ttsBtnNext.addEventListener('click', () => {
      nextTTSSentence();
    });

    el.ttsBtnPrev.addEventListener('click', () => {
      prevTTSSentence();
    });

    el.ttsVoiceSelect.addEventListener('change', (e) => {
      state.tts.voice = e.target.value;
      try { localStorage.setItem('donna_tts_voice', state.tts.voice); } catch (_) {}
      if (state.tts.active) {
        playCurrentSentence();
      }
    });

    el.ttsRateSelect.addEventListener('change', (e) => {
      state.tts.rate = e.target.value;
      try { localStorage.setItem('donna_tts_rate', state.tts.rate); } catch (_) {}
      if (state.tts.active) {
        playCurrentSentence();
      }
    });

    el.ttsBtnClose.addEventListener('click', () => {
      stopTTS();
    });

    // Mobile Tabs
    if (el.tabExplorer) {
      el.tabExplorer.addEventListener('click', () => switchMobileTab('explorer'));
    }
    if (el.tabGraph) {
      el.tabGraph.addEventListener('click', () => switchMobileTab('graph'));
    }
    if (el.tabReader) {
      el.tabReader.addEventListener('click', () => switchMobileTab('reader'));
    }
    if (el.tabSearch) {
      el.tabSearch.addEventListener('click', () => openSearchDialog());
    }
    // User logout
    el.logoutBtn.addEventListener('click', () => handleLogout());


    // Window resize handler for Cytoscape
    window.addEventListener('resize', () => {
      if (state.cy) {
        state.cy.resize();
      }
    });
  }

  // ==========================================================================
  // App Entry Point
  async function loadTTSVoices() {
    try {
      const res = await fetch('/api/tts/voices');
      if (res.ok) {
        const voices = await res.json();
        if (Array.isArray(voices) && voices.length > 0) {
          // Group by language
          const indonesian = voices.filter(v => v.lang.startsWith('id'));
          const regional = voices.filter(v => v.lang.startsWith('jv') || v.lang.startsWith('su'));
          const global = voices.filter(v => !v.lang.startsWith('id') && !v.lang.startsWith('jv') && !v.lang.startsWith('su'));

          el.ttsVoiceSelect.innerHTML = `
            <optgroup label="Bahasa Indonesia">
              ${indonesian.map(v => `<option value="${escapeHtml(v.id)}" ${v.id === state.tts.voice ? 'selected' : ''}>${escapeHtml(v.name)} (${escapeHtml(v.description)})</option>`).join('')}
            </optgroup>
            <optgroup label="Bahasa Daerah">
              ${regional.map(v => `<option value="${escapeHtml(v.id)}" ${v.id === state.tts.voice ? 'selected' : ''}>${escapeHtml(v.name)} (${escapeHtml(v.description)})</option>`).join('')}
            </optgroup>
            <optgroup label="Multilingual & Global">
              ${global.map(v => `<option value="${escapeHtml(v.id)}" ${v.id === state.tts.voice ? 'selected' : ''}>${escapeHtml(v.name)} (${escapeHtml(v.description)})</option>`).join('')}
            </optgroup>
          `;
        }
      }
    } catch (_) {}
  }

  // ==========================================================================
  async function initApp() {
    wireEventListeners();
    loadTTSVoices();
    await loadVaultGraph();
    initLiveSync();
  }

  // On initial DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
  });

})();
