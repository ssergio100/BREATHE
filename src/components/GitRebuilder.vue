<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { 
  RefreshCw, ArrowRight, Terminal,
  GitBranch, AlertTriangle,
  Trash2, Eye, EyeOff, Lock, Settings, Info, CloudLightning,
  Sun, Moon
} from 'lucide-vue-next';
import { useSettingsStore } from '../stores/settingsStore';
import BaseModal from './BaseModal.vue';
import AppInput from './base/AppInput.vue';
import TerminalConsole from './TerminalConsole.vue';
import BranchList from './BranchList.vue';
import ActionPanel from './ActionPanel.vue';

const settingsStore = useSettingsStore();

// --- ESTADOS DO PIPELINE DE RECONSTRUÇÃO ---
const pipelineActive = ref(false);
const pipelineTarget = ref(null); // 'dev' ou 'hml'
const pipelineStep = ref(0);
const pipelineLogs = ref([]);
const activeBranches = ref([]);
const totalBranchesCount = ref(0);

let resolveDestruction = null;
const waitingForDestruction = ref(false);

const confirmDestruction = () => {
  if (resolveDestruction) {
    resolveDestruction();
    resolveDestruction = null;
    waitingForDestruction.value = false;
  }
};

// --- ESTADOS DAS ABAS, MESCLAGEM E DELEÇÃO ---
const activeTab = ref('rebuilder'); // 'rebuilder' ou 'merges'
const mergeTarget = ref(null);      // Nome físico da branch selecionada (dev ou hml)
const mergeTargetType = ref(null);    // 'dev' ou 'hml'
const mergeLogs = ref([]);          // Logs da aba de mesclagem
const mergeLoadingMap = ref({});    // Mapeamento de branch -> boolean
const mergeStatusMap = ref({});     // Mapeamento de branch -> status string
const branchesFetched = ref(false);

// --- ESTADOS DE CONFIGURAÇÕES E MODAIS ---
const showSettingsModal = ref(false);
const diagnosticStatus = ref(null); // 'checking', 'success', 'error'
const diagnosticMessage = ref('');
const showToken = ref(false);

// Configurações locais para edição temporária
const editGitlabUrl = ref(settingsStore.gitlabUrl);
const editGitlabProjectId = ref(settingsStore.gitlabProjectId);
const editGitlabToken = ref(settingsStore.gitlabToken);
const editBranchMaster = ref(settingsStore.branchMaster);
const editBranchHomologacao = ref(settingsStore.branchHomologacao);
const editBranchDesenvolvimento = ref(settingsStore.branchDesenvolvimento);
const editConsoleFontSize = ref(settingsStore.consoleFontSize);
const editCardRadius = ref(settingsStore.cardRadius);
const editInputRadius = ref(settingsStore.inputRadius);

watch(editCardRadius, (newVal) => {
  document.documentElement.style.setProperty('--app-card-radius', `${newVal}px`);
});

watch(editInputRadius, (newVal) => {
  document.documentElement.style.setProperty('--app-input-radius', `${newVal}px`);
});

// Modal de deleção
const showDeleteConfirmModal = ref(false);
const branchToDelete = ref(null);
const deleteLoading = ref(false);

// Modal de Confirmação de Mesclagem
const showMergeConfirmModal = ref(false);
const mergeConfirmTargetBranch = ref('');
const mergeConfirmTargetType = ref('');
const mergeConfirmSourceBranch = ref('');

// Exclusão em lote (Bulk Delete)
const selectedBranches = ref([]);
const showBulkDeleteModal = ref(false);

const openSettings = () => {
  editGitlabUrl.value = settingsStore.gitlabUrl;
  editGitlabProjectId.value = settingsStore.gitlabProjectId;
  editGitlabToken.value = settingsStore.gitlabToken;
  editBranchMaster.value = settingsStore.branchMaster;
  editBranchHomologacao.value = settingsStore.branchHomologacao;
  editBranchDesenvolvimento.value = settingsStore.branchDesenvolvimento;
  editConsoleFontSize.value = settingsStore.consoleFontSize;
  editCardRadius.value = settingsStore.cardRadius;
  editInputRadius.value = settingsStore.inputRadius;
  diagnosticStatus.value = null;
  diagnosticMessage.value = '';
  showSettingsModal.value = true;
};

const saveSettings = async () => {
  settingsStore.gitlabUrl = editGitlabUrl.value;
  settingsStore.gitlabProjectId = editGitlabProjectId.value;
  settingsStore.gitlabToken = editGitlabToken.value;
  settingsStore.branchMaster = editBranchMaster.value;
  settingsStore.branchHomologacao = editBranchHomologacao.value;
  settingsStore.branchDesenvolvimento = editBranchDesenvolvimento.value;
  settingsStore.consoleFontSize = editConsoleFontSize.value;
  settingsStore.cardRadius = editCardRadius.value;
  settingsStore.inputRadius = editInputRadius.value;
  
  await settingsStore.saveAllSettings();
  showSettingsModal.value = false;
  
  // Atualiza listagem se aplicável
  if (mergeTarget.value) {
    const isMaster = mergeTarget.value === settingsStore.branchMaster;
    if (isMaster) {
      mergeTarget.value = null;
      mergeTargetType.value = null;
    } else {
      fetchBranches(mergeTarget.value, false);
    }
  }
};

const decreaseFontSize = () => {
  if (settingsStore.consoleFontSize > 10) {
    settingsStore.consoleFontSize--;
    settingsStore.saveSetting('consoleFontSize', settingsStore.consoleFontSize);
  }
};

const closeSettings = () => {
  // Reverte as CSS variables para os valores salvos na store
  document.documentElement.style.setProperty('--app-card-radius', `${settingsStore.cardRadius}px`);
  document.documentElement.style.setProperty('--app-input-radius', `${settingsStore.inputRadius}px`);
  showSettingsModal.value = false;
};

const increaseFontSize = () => {
  if (settingsStore.consoleFontSize < 18) {
    settingsStore.consoleFontSize++;
    settingsStore.saveSetting('consoleFontSize', settingsStore.consoleFontSize);
  }
};

const testConnection = async () => {
  diagnosticStatus.value = 'checking';
  diagnosticMessage.value = 'Testando conexão com o GitLab...';

  const token = editGitlabToken.value;
  const projectId = editGitlabProjectId.value;
  let apiBase = editGitlabUrl.value || 'https://gitlab.com';

  if (!projectId || !token) {
    diagnosticStatus.value = 'error';
    diagnosticMessage.value = 'Token e ID do Projeto são obrigatórios.';
    return;
  }

  try {
    if (!apiBase.includes('/api/v4')) {
      const urlObj = new URL(apiBase);
      apiBase = `${urlObj.protocol}//${urlObj.host}/api/v4`;
    }
    const safeProjectId = encodeURIComponent(decodeURIComponent(projectId));
    const url = `${apiBase}/projects/${safeProjectId}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'PRIVATE-TOKEN': token
      }
    });

    if (res.ok) {
      const data = await res.json();
      diagnosticStatus.value = 'success';
      diagnosticMessage.value = `Conectado com sucesso! Projeto: "${data.name_with_namespace}"`;
    } else {
      diagnosticStatus.value = 'error';
      diagnosticMessage.value = `GitLab respondeu com erro HTTP ${res.status}: ${res.statusText}`;
    }
  } catch (err) {
    diagnosticStatus.value = 'error';
    diagnosticMessage.value = `Erro de rede/resolução: ${err.message}`;
  }
};

const addPipelineLog = (text, type = 'info') => {
  pipelineLogs.value.push({
    time: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
    text,
    type
  });
};

const addMergeLog = (text, type = 'info') => {
  mergeLogs.value.push({
    time: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
    text,
    type
  });
};

const branchesLoading = ref(false);
const branchesError = ref('');
const searchQuery = ref('');
const branchesOrder = ref('desc'); // 'desc' (mais novo) ou 'asc' (mais antigo)

// Computed property para filtrar e ordenar as branches no frontend de forma instantânea
const filteredBranches = computed(() => {
  let list = [...activeBranches.value];
  
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(b => 
      b.name.toLowerCase().includes(q) || 
      (b.title && b.title.toLowerCase().includes(q))
    );
  }
  
  list.sort((a, b) => {
    const dateA = a.committedDate ? new Date(a.committedDate).getTime() : 0;
    const dateB = b.committedDate ? new Date(b.committedDate).getTime() : 0;
    if (branchesOrder.value === 'desc') {
      return dateB - dateA;
    } else {
      return dateA - dateB;
    }
  });
  
  return list;
});

const fetchBranches = async (target, isBackgroundSearch = false) => {
  // Impede listagem se tentar listar master
  if (target === settingsStore.branchMaster) {
    activeBranches.value = [];
    totalBranchesCount.value = 0;
    branchesError.value = '';
    return;
  }

  const useGitLab = !!(settingsStore.gitlabToken && settingsStore.gitlabProjectId);
  if (!useGitLab) {
    activeBranches.value = [];
    totalBranchesCount.value = 0;
    branchesError.value = 'Credenciais do GitLab não configuradas! Informe-as clicando em "Configurar Ambientes".';
    return;
  }

  branchesLoading.value = true;
  if (!isBackgroundSearch) {
    branchesError.value = '';
  }
  
  try {
    let apiBase = settingsStore.gitlabUrl || 'https://gitlab.com';
    if (!apiBase.includes('/api/v4')) {
      const urlObj = new URL(apiBase);
      apiBase = `${urlObj.protocol}//${urlObj.host}/api/v4`;
    }
    const safeProjectId = encodeURIComponent(decodeURIComponent(settingsStore.gitlabProjectId));
    
    const apiOrder = branchesOrder.value === 'desc' ? 'updated_desc' : 'updated_asc';
    let url = `${apiBase}/projects/${safeProjectId}/repository/branches?per_page=100&sort=${apiOrder}`;
    // Se for busca em background, envia o filtro também para a API do GitLab (trazendo resultados fora das top 100 mais recentes)
    if (searchQuery.value) {
      url += `&search=${encodeURIComponent(searchQuery.value)}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'PRIVATE-TOKEN': settingsStore.gitlabToken
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitLab HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    data.sort((a, b) => {
      const dateA = a.commit && a.commit.committed_date ? new Date(a.commit.committed_date) : 0;
      const dateB = b.commit && b.commit.committed_date ? new Date(b.commit.committed_date) : 0;
      return dateB - dateA;
    });

    const baseBranches = [
      settingsStore.branchMaster,
      settingsStore.branchHomologacao,
      settingsStore.branchDesenvolvimento,
      'master', 'main', 'develop'
    ];
    
    // Filtra para remover ramos base e releases padrão
    const filtered = data.filter(b => !baseBranches.includes(b.name) && !b.name.startsWith('release/'));
    
    activeBranches.value = filtered.map(b => ({
      name: b.name,
      mr: null,
      title: b.commit ? b.commit.title : 'Commit recente',
      status: 'waiting',
      committedDate: b.commit && b.commit.committed_date ? b.commit.committed_date : '',
      authorName: b.commit ? b.commit.author_name : ''
    }));

    const xTotal = response.headers.get('X-Total');
    if (xTotal) {
      totalBranchesCount.value = Math.max(filtered.length, parseInt(xTotal, 10) - (searchQuery.value ? 0 : baseBranches.length));
    } else {
      totalBranchesCount.value = filtered.length;
    }
  } catch (err) {
    console.error(err);
    if (!isBackgroundSearch) {
      branchesError.value = `Erro ao carregar branches: ${err.message}`;
      activeBranches.value = [];
      totalBranchesCount.value = 0;
    }
  } finally {
    branchesLoading.value = false;
  }
};

let searchTimeout = null;
const handleSearch = () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (mergeTarget.value) {
      fetchBranches(mergeTarget.value, true);
    }
  }, 400);
};

const selectMergeTarget = (target, type) => {
  searchQuery.value = '';
  branchesError.value = '';
  selectedBranches.value = []; // Reseta a seleção de branches
  mergeTarget.value = target;
  mergeTargetType.value = type;
  fetchBranches(target, false);
};

const listAllBranches = async () => {
  searchQuery.value = '';
  branchesError.value = '';
  selectedBranches.value = [];
  // Usamos Desenvolvimento por padrão para a chamada do GitLab
  mergeTarget.value = settingsStore.branchDesenvolvimento;
  mergeTargetType.value = 'dev';
  await fetchBranches(settingsStore.branchDesenvolvimento, false);
  branchesFetched.value = true;
};

const runMergeToTarget = (targetBranch, targetType) => {
  if (selectedBranches.value.length !== 1) return;
  const branchName = selectedBranches.value[0];
  
  mergeConfirmTargetBranch.value = targetBranch;
  mergeConfirmTargetType.value = targetType;
  mergeConfirmSourceBranch.value = branchName;
  showMergeConfirmModal.value = true;
};

const executeMergeAfterConfirm = async () => {
  showMergeConfirmModal.value = false;
  
  const branchName = mergeConfirmSourceBranch.value;
  const targetBranch = mergeConfirmTargetBranch.value;
  const targetType = mergeConfirmTargetType.value;
  
  if (!branchName || !targetBranch) return;
  
  mergeTarget.value = targetBranch;
  mergeTargetType.value = targetType;
  
  await runIndividualMerge(branchName);
};

const toggleOrderAndRefetch = async () => {
  branchesOrder.value = branchesOrder.value === 'desc' ? 'asc' : 'desc';
  if (branchesFetched.value) {
    await fetchBranches(settingsStore.branchDesenvolvimento, false);
  }
};


const runRebuildPipeline = async (type) => {
  if (pipelineActive.value) return;

  const target = type === 'dev' ? settingsStore.branchDesenvolvimento : settingsStore.branchHomologacao;
  
  // Impede qualquer ação se tentar atuar sobre a master
  if (target === settingsStore.branchMaster) {
    alert("Operação bloqueada! A branch Master é totalmente protegida.");
    return;
  }

  const useGitLab = !!(settingsStore.gitlabToken && settingsStore.gitlabProjectId);
  if (!useGitLab) {
    pipelineActive.value = true;
    pipelineTarget.value = type;
    pipelineStep.value = 1;
    pipelineLogs.value = [];
    addPipelineLog("[Erro] Credenciais do GitLab não configuradas! Por favor, clique em 'Configurar Ambientes' no topo para registrar o ID do Projeto e Token de Acesso.", "error");
    pipelineActive.value = false;
    return;
  }

  pipelineActive.value = true;
  pipelineTarget.value = type;
  pipelineStep.value = 1;
  pipelineLogs.value = [];
  activeBranches.value = [];
  totalBranchesCount.value = 0;
  searchQuery.value = '';

  let apiBase = settingsStore.gitlabUrl || 'https://gitlab.com';
  if (!apiBase.includes('/api/v4')) {
    const urlObj = new URL(apiBase);
    apiBase = `${urlObj.protocol}//${urlObj.host}/api/v4`;
  }
  const safeProjectId = encodeURIComponent(decodeURIComponent(settingsStore.gitlabProjectId));

  addPipelineLog(`Iniciando pipeline de recriação do ambiente '${target}'...`, 'info');
  
  addPipelineLog(`Consultando GitLab para listar branches de feature ativas...`, 'info');
  await fetchBranches(target);
  
  addPipelineLog(`Consulta concluída. Encontradas ${totalBranchesCount.value} branches ativas.`, 'success');
  
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Passo 1: Preparação e Backup
  pipelineStep.value = 1;
  const timestamp = new Date().toISOString().replace(/T/, '-').replace(/:/g, '').slice(0, 17);
  const backupBranchName = `archive/${target}-${timestamp}`;

  addPipelineLog(`[Fase 1: Backup] Criando branch de backup '${backupBranchName}' a partir de '${target}'...`, 'info');

  try {
    const backupUrl = `${apiBase}/projects/${safeProjectId}/repository/branches?branch=${encodeURIComponent(backupBranchName)}&ref=${encodeURIComponent(target)}`;
    const backupRes = await fetch(backupUrl, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': settingsStore.gitlabToken
      }
    });
    if (backupRes.ok) {
      addPipelineLog(`[Fase 1: Backup] Backup criado com sucesso como '${backupBranchName}'`, 'success');
    } else {
      const errorData = await backupRes.json().catch(() => ({}));
      addPipelineLog(`[Fase 1: Backup] Não foi possível criar backup remoto (${errorData.message || backupRes.statusText}). Prosseguindo.`, 'warning');
    }
  } catch (e) {
    addPipelineLog(`[Fase 1: Backup] Erro ao tentar criar backup: ${e.message}. Prosseguindo.`, 'warning');
  }

  // Passo 2: Destruição (Aguardando Confirmação)
  waitingForDestruction.value = true;
  addPipelineLog(`[Pausa] Aguardando autorização manual para excluir a branch '${target}'...`, 'warning');
  await new Promise(resolve => {
    resolveDestruction = resolve;
  });

  pipelineStep.value = 2;

  addPipelineLog(`[Fase 2: Destruição] Iniciando deleção da branch antiga '${target}'...`, 'info');
  try {
    const deleteUrl = `${apiBase}/projects/${safeProjectId}/repository/branches/${encodeURIComponent(target)}`;
    const deleteRes = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'PRIVATE-TOKEN': settingsStore.gitlabToken
      }
    });

    if (deleteRes.ok) {
      addPipelineLog(`[Fase 2: Destruição] Branch antiga '${target}' deletada com sucesso.`, 'success');
    } else if (deleteRes.status === 403) {
      addPipelineLog(`[Fase 2: Destruição] ERRO (403 Forbidden): A branch '${target}' é PROTEGIDA no GitLab. Por favor desproteja-a temporariamente e tente novamente.`, 'error');
      pipelineActive.value = false;
      return;
    } else {
      const errorData = await deleteRes.json().catch(() => ({}));
      addPipelineLog(`[Fase 2: Destruição] Aviso ao deletar: ${errorData.message || deleteRes.statusText}. Prosseguindo para criação.`, 'warning');
    }
  } catch (err) {
    addPipelineLog(`[Fase 2: Destruição] ERRO ao tentar deletar a branch: ${err.message}`, 'error');
    pipelineActive.value = false;
    return;
  }

  // Passo 3: Recriação (da Master Protegida)
  await new Promise(resolve => setTimeout(resolve, 1200));
  pipelineStep.value = 3;

  const baseRef = settingsStore.branchMaster;

  addPipelineLog(`[Fase 3: Recriação] Criando nova branch '${target}' a partir da master '${baseRef}'...`, 'info');
  try {
    const createUrl = `${apiBase}/projects/${safeProjectId}/repository/branches?branch=${encodeURIComponent(target)}&ref=${encodeURIComponent(baseRef)}`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': settingsStore.gitlabToken
      }
    });

    if (createRes.ok) {
      addPipelineLog(`[Fase 3: Recriação] Nova branch '${target}' recriada de forma limpa a partir da '${baseRef}'!`, 'success');
    } else {
      const errorData = await createRes.json().catch(() => ({}));
      throw new Error(errorData.message || createRes.statusText);
    }
  } catch (err) {
    addPipelineLog(`[Fase 3: Recriação] ERRO ao recriar branch: ${err.message}`, 'error');
    pipelineActive.value = false;
    return;
  }

  // Passo 4: Conclusão
  await new Promise(resolve => setTimeout(resolve, 1200));
  pipelineStep.value = 4;
  addPipelineLog(`=== PIPELINE DE RECONSTRUÇÃO CONCLUÍDO ===`, 'success');
  addPipelineLog(`Ambiente '${target}' reconstruído e limpo a partir de '${baseRef}'!`, 'success');
  pipelineActive.value = false;
};

const runIndividualMerge = async (branchName) => {
  if (mergeLoadingMap.value[branchName]) return;
  const target = mergeTarget.value;
  if (!target) return;

  // Garante proteção se de alguma forma tentar mesclar para master
  if (target === settingsStore.branchMaster) {
    alert("Operação bloqueada! A branch Master é protegida.");
    return;
  }

  const useGitLab = !!(settingsStore.gitlabToken && settingsStore.gitlabProjectId);
  if (!useGitLab) {
    addMergeLog("[Erro] Credenciais não configuradas. Cadastre seu token e ID do projeto nas configurações.", "error");
    return;
  }

  mergeLoadingMap.value[branchName] = true;
  mergeStatusMap.value[branchName] = null;

  const prefix = `[Merge: ${branchName} ➔ ${target}]`;
  addMergeLog(`Iniciando mesclagem de '${branchName}' no ambiente '${target}'...`, 'info');

  try {
    let apiBase = settingsStore.gitlabUrl || 'https://gitlab.com';
    if (!apiBase.includes('/api/v4')) {
      const urlObj = new URL(apiBase);
      apiBase = `${urlObj.protocol}//${urlObj.host}/api/v4`;
    }
    const safeProjectId = encodeURIComponent(decodeURIComponent(settingsStore.gitlabProjectId));

    addMergeLog(`${prefix} Criando Merge Request no GitLab...`, 'info');
    const mrUrl = `${apiBase}/projects/${safeProjectId}/merge_requests`;
    const mrRes = await fetch(mrUrl, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': settingsStore.gitlabToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_branch: branchName,
        target_branch: target,
        title: `Breathe Merge: ${branchName} em ${target} (${new Date().toLocaleDateString('pt-BR')})`,
        remove_source_branch: false
      })
    });

    if (!mrRes.ok) {
      const errorData = await mrRes.json().catch(() => ({}));
      throw new Error(errorData.message || mrRes.statusText);
    }

    const mrData = await mrRes.json();
    const mrIid = mrData.iid;
    addMergeLog(`${prefix} Merge Request #${mrIid} criado. Aceitando e executando mesclagem...`, 'info');

    const acceptUrl = `${apiBase}/projects/${safeProjectId}/merge_requests/${mrIid}/merge`;
    const acceptRes = await fetch(acceptUrl, {
      method: 'PUT',
      headers: {
        'PRIVATE-TOKEN': settingsStore.gitlabToken,
        'Content-Type': 'application/json'
      }
    });

    if (acceptRes.ok) {
      addMergeLog(`${prefix} Branch '${branchName}' integrada com SUCESSO no GitLab!`, 'success');
      mergeStatusMap.value[branchName] = 'success';
    } else if (acceptRes.status === 406 || acceptRes.status === 409) {
      addMergeLog(`${prefix} CONFLITO DE MESCLAGEM DETECTADO! É necessária resolução manual.`, 'error');
      mergeStatusMap.value[branchName] = 'conflict';
    } else {
      const errorData = await acceptRes.json().catch(() => ({}));
      throw new Error(errorData.message || acceptRes.statusText);
    }
  } catch (err) {
    addMergeLog(`${prefix} ERRO no merge: ${err.message}`, 'error');
    mergeStatusMap.value[branchName] = 'error';
  }

  mergeLoadingMap.value[branchName] = false;
};

// --- FLUXO DE DELEÇÃO COM CONFIRMAÇÃO ---
const requestDeleteBranch = (branchName) => {
  const useGitLab = !!(settingsStore.gitlabToken && settingsStore.gitlabProjectId);
  if (!useGitLab) {
    alert("Credenciais não configuradas. Cadastre seu token e ID do projeto nas configurações.");
    return;
  }
  branchToDelete.value = branchName;
  showDeleteConfirmModal.value = true;
};

const executeDeleteBranch = async () => {
  const branchName = branchToDelete.value;
  if (!branchName) return;

  // Garante que não é possível deletar branches principais
  const protectedBranches = [settingsStore.branchMaster, settingsStore.branchHomologacao, settingsStore.branchDesenvolvimento];
  if (protectedBranches.includes(branchName)) {
    alert("Não é possível deletar uma branch de ambiente principal!");
    showDeleteConfirmModal.value = false;
    return;
  }

  deleteLoading.value = true;
  addMergeLog(`Iniciando deleção da branch de feature '${branchName}'...`, 'info');

  try {
    let apiBase = settingsStore.gitlabUrl || 'https://gitlab.com';
    if (!apiBase.includes('/api/v4')) {
      const urlObj = new URL(apiBase);
      apiBase = `${urlObj.protocol}//${urlObj.host}/api/v4`;
    }
    const safeProjectId = encodeURIComponent(decodeURIComponent(settingsStore.gitlabProjectId));
    const deleteUrl = `${apiBase}/projects/${safeProjectId}/repository/branches/${encodeURIComponent(branchName)}`;

    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'PRIVATE-TOKEN': settingsStore.gitlabToken
      }
    });

    if (res.ok) {
      addMergeLog(`[Deleção] Branch '${branchName}' DELETADA do GitLab com sucesso!`, 'success');
      // Remove da lista exibida
      activeBranches.value = activeBranches.value.filter(b => b.name !== branchName);
    } else {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || res.statusText);
    }
  } catch (err) {
    addMergeLog(`[Deleção] ERRO ao deletar branch no GitLab: ${err.message}`, 'error');
  }

  deleteLoading.value = false;
  showDeleteConfirmModal.value = false;
  branchToDelete.value = null;
};

// --- LÓGICA DE EXCLUSÃO EM LOTE (BULK DELETE) ---
const requestBulkDelete = () => {
  if (selectedBranches.value.length === 0) return;
  showBulkDeleteModal.value = true;
};

const executeBulkDelete = async () => {
  showBulkDeleteModal.value = false;
  const branchesToExclude = [...selectedBranches.value];
  selectedBranches.value = []; // Limpa a seleção
  
  addMergeLog(`Iniciando exclusão em lote de ${branchesToExclude.length} branches...`, 'warning');
  
  for (const branchName of branchesToExclude) {
    // Garante que não é possível deletar branches principais
    const protectedBranches = [settingsStore.branchMaster, settingsStore.branchHomologacao, settingsStore.branchDesenvolvimento];
    if (protectedBranches.includes(branchName)) {
      addMergeLog(`[Lote] Ação abortada para '${branchName}' (branch protegida).`, 'error');
      continue;
    }
    
    addMergeLog(`[Lote] Removendo branch '${branchName}'...`, 'info');
    try {
      let apiBase = settingsStore.gitlabUrl || 'https://gitlab.com';
      if (!apiBase.includes('/api/v4')) {
        const urlObj = new URL(apiBase);
        apiBase = `${urlObj.protocol}//${urlObj.host}/api/v4`;
      }
      const safeProjectId = encodeURIComponent(decodeURIComponent(settingsStore.gitlabProjectId));
      const deleteUrl = `${apiBase}/projects/${safeProjectId}/repository/branches/${encodeURIComponent(branchName)}`;

      const res = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'PRIVATE-TOKEN': settingsStore.gitlabToken
        }
      });

      if (res.ok) {
        addMergeLog(`[Lote] Branch '${branchName}' DELETADA com sucesso!`, 'success');
        activeBranches.value = activeBranches.value.filter(b => b.name !== branchName);
      } else {
        const errorData = await res.json().catch(() => ({}));
        addMergeLog(`[Lote] Erro ao deletar '${branchName}': ${errorData.message || res.statusText}`, 'error');
      }
    } catch (err) {
      addMergeLog(`[Lote] Erro de rede ao deletar '${branchName}': ${err.message}`, 'error');
    }
  }
  
  addMergeLog(`Processo de exclusão em lote concluído.`, 'success');
};

const toggleBranchSelection = (branchName) => {
  const index = selectedBranches.value.indexOf(branchName);
  if (index > -1) {
    selectedBranches.value.splice(index, 1);
  } else {
    selectedBranches.value.push(branchName);
  }
};

// --- ROLAGEM AUTOMÁTICA DOS CONSOLES TRATADA INTERNAMENTE NOS SUBCOMPONENTES ---

const toggleTheme = () => {
  settingsStore.theme = settingsStore.theme === 'dark' ? 'light' : 'dark';
};
</script>

<template>
  <div class="flex-1 flex flex-col font-sans select-none animate-fadeIn">
    <!-- Header -->
    <header class="h-20 border-b border-slate-200 dark:border-white/[0.06] px-8 md:px-12 flex items-center justify-between shrink-0 bg-white/40 dark:bg-slate-950/20 backdrop-blur-md">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-indigo-500/10 rounded-xl">
          <GitBranch class="w-6 h-6 text-indigo-500" />
        </div>
        <div>
          <h1 class="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
            Breathe Git Rebuilder
          </h1>
          <p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Isolador e Simulador de Integrações e Ambientes</p>
        </div>
      </div>

      <!-- GitLab status info & Settings trigger -->
      <div class="flex items-center gap-4">
        <!-- Diagnóstico Rápido -->
        <div 
          class="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-[var(--app-input-radius)] border text-[10px] font-black uppercase tracking-wider"
          :class="settingsStore.gitlabToken && settingsStore.gitlabProjectId 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'"
        >
          <CloudLightning class="w-3.5 h-3.5" />
          {{ settingsStore.gitlabToken && settingsStore.gitlabProjectId ? 'GitLab Ativo' : 'Sem Conexão (Modo Offline)' }}
        </div>

        <!-- Botão Alternar Tema (Claro/Escuro) -->
        <button 
          @click="toggleTheme"
          class="btn-icon-secondary"
          :title="settingsStore.theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'"
        >
          <Sun v-if="settingsStore.theme === 'dark'" class="w-4 h-4 text-amber-400" />
          <Moon v-else class="w-4 h-4 text-indigo-400" />
        </button>

        <button 
          @click="openSettings"
          class="btn btn-primary flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-500/10 shrink-0"
        >
          <Settings class="w-4 h-4" />
          Configurar Ambientes
        </button>
      </div>
    </header>

    <!-- Tabs Navigation -->
    <div class="border-b border-slate-200 dark:border-white/[0.06] bg-slate-100/50 dark:bg-slate-950/10 px-8 md:px-12 flex gap-8 shrink-0">
      <button 
        @click="activeTab = 'rebuilder'"
        class="py-4 text-xs font-black uppercase tracking-wider relative cursor-pointer transition-colors"
        :class="activeTab === 'rebuilder' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
      >
        <span class="flex items-center gap-2">
          <RefreshCw class="w-4 h-4" />
          Limpeza e Recriação
        </span>
        <div v-if="activeTab === 'rebuilder'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full"></div>
      </button>
      <button 
        @click="activeTab = 'merges'"
        class="py-4 text-xs font-black uppercase tracking-wider relative cursor-pointer transition-colors"
        :class="activeTab === 'merges' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
      >
        <span class="flex items-center gap-2">
          <GitBranch class="w-4 h-4" />
          Mesclar e Excluir Branches
        </span>
        <div v-if="activeTab === 'merges'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full"></div>
      </button>
    </div>

    <main class="flex-1 md:overflow-hidden overflow-y-auto p-6 md:p-8 lg:py-6 lg:px-10 space-y-6 w-full max-w-full flex flex-col">
      <!-- ABA 1: LIMPEZA E RECRIAÇÃO -->
      <div v-if="activeTab === 'rebuilder'" class="space-y-8 animate-fadeIn">
        <!-- Top Cards: Branch Overview -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- MASTER (PROTEGIDA) -->
          <div data-test="master-card" class="p-6 bg-white dark:bg-slate-950/40 rounded-[var(--app-card-radius)] border border-slate-200 dark:border-emerald-500/20 flex flex-col justify-between shadow-md dark:shadow-none relative overflow-hidden">
            <div class="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-wider rounded-[var(--app-input-radius)] border border-emerald-500/20">
              <Lock class="w-3 h-3" />
              Protegida
            </div>
            <div>
              <div class="flex items-center justify-between mb-4">
                <span class="px-2.5 py-1 bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-wider rounded-[var(--app-input-radius)]">Master / Produção</span>
                <div class="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              </div>
              <h3 class="text-xl font-black text-slate-800 dark:text-white font-mono text-emerald-400 truncate pr-16" :title="settingsStore.branchMaster">
                {{ settingsStore.branchMaster }}
              </h3>
            </div>
            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-white/[0.04]">
              <p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Origem Estável</p>
              <p class="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">Nenhuma ação permitida. Serve como base de segurança e integridade.</p>
            </div>
          </div>

          <!-- HOMOLOGAÇÃO -->
          <div class="p-6 bg-white dark:bg-slate-950/40 rounded-[var(--app-card-radius)] border border-slate-200 dark:border-indigo-500/10 flex flex-col justify-between shadow-md dark:shadow-none">
            <div>
              <div class="flex items-center justify-between mb-4">
                <span class="px-2.5 py-1 bg-indigo-500/10 text-indigo-500 text-[8px] font-black uppercase tracking-wider rounded-[var(--app-input-radius)]">Homologação</span>
                <div class="w-3 h-3 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.3)]"></div>
              </div>
              <h3 class="text-xl font-black text-slate-800 dark:text-white font-mono truncate" :title="settingsStore.branchHomologacao">
                {{ settingsStore.branchHomologacao }}
              </h3>
            </div>
            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-white/[0.04]">
              <p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Ambiente de Testes Finais</p>
              <p class="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Código validado pronto para homologação.</p>
            </div>
          </div>

          <!-- DESENVOLVIMENTO -->
          <div class="p-6 bg-white dark:bg-slate-950/40 rounded-[var(--app-card-radius)] border border-slate-200 dark:border-amber-500/10 flex flex-col justify-between shadow-md dark:shadow-none">
            <div>
              <div class="flex items-center justify-between mb-4">
                <span class="px-2.5 py-1 bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase tracking-wider rounded-[var(--app-input-radius)]">Desenvolvimento</span>
                <div class="w-3 h-3 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.3)]"></div>
              </div>
              <h3 class="text-xl font-black text-slate-800 dark:text-white font-mono text-amber-400 truncate" :title="settingsStore.branchDesenvolvimento">
                {{ settingsStore.branchDesenvolvimento }}
              </h3>
            </div>
            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-white/[0.04]">
              <p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Ambiente de Integração Diária</p>
              <p class="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">Reunião contínua de funcionalidades em desenvolvimento.</p>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-col sm:flex-row gap-6">
          <button 
            @click="runRebuildPipeline('dev')"
            :disabled="pipelineActive"
            class="btn flex-1 flex items-center justify-center gap-3 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-[var(--app-card-radius)] text-xs font-black uppercase tracking-wider shadow-lg shadow-amber-500/10 cursor-pointer"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': pipelineActive && pipelineTarget === 'dev' }" />
            Recriar {{ settingsStore.branchDesenvolvimento }}
          </button>
          
          <button 
            @click="runRebuildPipeline('hml')"
            :disabled="pipelineActive"
            class="btn btn-primary flex-1 flex items-center justify-center gap-3 py-4 text-xs font-black uppercase tracking-wider rounded-[var(--app-card-radius)] shadow-lg shadow-indigo-500/10 cursor-pointer"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': pipelineActive && pipelineTarget === 'hml' }" />
            Recriar {{ settingsStore.branchHomologacao }}
          </button>
        </div>

        <!-- Pipeline Output Section -->
        <div v-if="pipelineTarget" class="p-6 md:p-8 bg-slate-950/40 rounded-[var(--app-card-radius)] border border-white/[0.06] space-y-8 animate-fadeIn">
          <!-- Pipeline Stepper -->
          <div class="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-6">
            <div class="flex items-center gap-2.5" :class="pipelineStep >= 1 ? 'text-indigo-400' : 'text-slate-500'">
              <span class="w-6 h-6 flex items-center justify-center rounded-full border text-[10px] font-black" :class="pipelineStep >= 1 ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-600'">1</span>
              <span class="text-[10px] font-black uppercase tracking-wider">Backup</span>
            </div>
            <ArrowRight class="w-4 h-4 text-slate-600 shrink-0" />
            <div class="flex items-center gap-2.5" :class="pipelineStep >= 2 ? 'text-indigo-400' : 'text-slate-500'">
              <span class="w-6 h-6 flex items-center justify-center rounded-full border text-[10px] font-black" :class="pipelineStep >= 2 ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-600'">2</span>
              <span class="text-[10px] font-black uppercase tracking-wider">Destruição</span>
            </div>
            <ArrowRight class="w-4 h-4 text-slate-600 shrink-0" />
            <div class="flex items-center gap-2.5" :class="pipelineStep >= 3 ? 'text-indigo-400' : 'text-slate-500'">
              <span class="w-6 h-6 flex items-center justify-center rounded-full border text-[10px] font-black" :class="pipelineStep >= 3 ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-600'">3</span>
              <span class="text-[10px] font-black uppercase tracking-wider">Recriação</span>
            </div>
            <ArrowRight class="w-4 h-4 text-slate-600 shrink-0" />
            <div class="flex items-center gap-2.5" :class="pipelineStep >= 4 ? 'text-emerald-400' : 'text-slate-500'">
              <span class="w-6 h-6 flex items-center justify-center rounded-full border text-[10px] font-black" :class="pipelineStep >= 4 ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-600'">✓</span>
              <span class="text-[10px] font-black uppercase tracking-wider">Concluído</span>
            </div>
          </div>

          <!-- Botão de Confirmação de Destruição -->
          <div v-if="waitingForDestruction" class="p-6 bg-red-500/10 border border-red-500/20 rounded-[var(--app-card-radius)] flex flex-col md:flex-row items-center justify-between gap-4 animate-pulse">
            <div class="flex items-center gap-4 text-left">
              <AlertTriangle class="w-8 h-8 text-red-500 shrink-0" />
              <div>
                <h4 class="text-sm font-black text-white">Ação Destrutiva Pendente</h4>
                <p class="text-[10px] text-slate-400 font-medium mt-1 mb-2">Você está prestes a excluir a branch antiga do GitLab para alinhá-la limpa com a master.</p>
                <code class="px-2.5 py-1 bg-black/40 text-red-400 rounded-[var(--app-input-radius)] text-[10px] font-mono border border-red-500/20 shadow-inner">
                  git push origin --delete {{ pipelineTarget === 'dev' ? settingsStore.branchDesenvolvimento : settingsStore.branchHomologacao }}
                </code>
              </div>
            </div>
            <button 
              @click="confirmDestruction"
              class="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-[var(--app-input-radius)] text-xs font-black uppercase tracking-wider transition-colors shadow-lg shadow-red-500/20 whitespace-nowrap"
            >
              Autorizar Exclusão
            </button>
          </div>

          <!-- Console Git -->
          <div class="space-y-4 text-left">
            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Terminal class="w-4 h-4 text-indigo-400" />
              Console de Logs Git
            </h4>
            <TerminalConsole
              :logs="pipelineLogs"
              :consoleFontSize="settingsStore.consoleFontSize"
              placeholder="Aguardando início..."
              @increase-font-size="increaseFontSize"
              @decrease-font-size="decreaseFontSize"
              class="min-h-[300px] max-h-[300px]"
            />
          </div>
      </div>
    </div>

      <!-- ABA 2: MESCLAR E EXCLUIR BRANCHES -->
      <div v-else class="space-y-6 animate-fadeIn flex-1 flex flex-col min-h-0 lg:overflow-hidden overflow-y-auto">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch w-full flex-1 min-h-0">

          <!-- Coluna 1 (Lado Esquerdo): Branches Disponíveis (5 colunas) -->
          <BranchList
            v-model:searchQuery="searchQuery"
            :branchesFetched="branchesFetched"
            :branchesLoading="branchesLoading"
            :branchesError="branchesError"
            :filteredBranches="filteredBranches"
            :selectedBranches="selectedBranches"
            :branchesOrder="branchesOrder"
            :totalBranchesCount="totalBranchesCount"
            :mergeLoadingMap="mergeLoadingMap"
            :mergeStatusMap="mergeStatusMap"
            @search="handleSearch"
            @toggle-order="toggleOrderAndRefetch"
            @toggle-selection="toggleBranchSelection"
            class="md:col-span-5"
          />

          <!-- Coluna 2 (Centro): Painel de Controle de Ambiente e Lote (3 colunas) -->
          <ActionPanel
            :selectedBranches="selectedBranches"
            :branchesLoading="branchesLoading"
            :branchDesenvolvimento="settingsStore.branchDesenvolvimento"
            :branchHomologacao="settingsStore.branchHomologacao"
            @list-all-branches="listAllBranches"
            @merge-to-target="runMergeToTarget"
            @bulk-delete="requestBulkDelete"
            class="md:col-span-3"
          />

          <!-- Coluna 3 (Lado Direito): Console de Operações (4 colunas) -->
          <div class="md:col-span-4 space-y-4 text-left flex flex-col lg:h-full min-h-0 min-w-0">
            <div class="flex items-center justify-between h-6 shrink-0">
              <h4 class="text-[10px] font-black text-app-muted uppercase tracking-widest flex items-center gap-2">
                <Terminal class="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                Console de Operações [TERMINAL DIREITO]
              </h4>
            </div>

            <TerminalConsole
              :logs="mergeLogs"
              :consoleFontSize="settingsStore.consoleFontSize"
              placeholder="Selecione DEV ou HML no centro para carregar as branches..."
              @increase-font-size="increaseFontSize"
              @decrease-font-size="decreaseFontSize"
              class="max-h-[calc(100vh-280px)]"
            />
          </div>

        </div>
      </div>

    </main>

    <!-- ========================================== -->
    <!-- MODAL: CONFIGURAÇÕES DE AMBIENTE (BaseModal) -->
    <!-- ========================================== -->
    <BaseModal 
      v-if="showSettingsModal"
      title="Configurações do Breathe"
      subtitle="Definição de Conexões do GitLab e Branches"
      :icon="Settings"
      okText="Salvar Configurações"
      cancelText="Cancelar"
      @close="closeSettings"
      @cancel="closeSettings"
      @ok="saveSettings"
    >
      <div class="space-y-5 text-left">
        <!-- GitLab Config Section -->
        <div class="space-y-4">
          <h4 class="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
            <CloudLightning class="w-3.5 h-3.5" />
            Conexão com GitLab API
          </h4>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-[9px] font-black text-app-muted uppercase tracking-widest mb-1.5 block">URL do GitLab</label>
              <AppInput v-model="editGitlabUrl" placeholder="https://gitlab.com" />
            </div>
            <div>
              <label class="text-[9px] font-black text-app-muted uppercase tracking-widest mb-1.5 block">ID do Projeto</label>
              <AppInput v-model="editGitlabProjectId" placeholder="ex: 12345" />
            </div>
          </div>

          <div>
            <label class="text-[9px] font-black text-app-muted uppercase tracking-widest mb-1.5 block">Token de Acesso Pessoal (Private Token)</label>
            <div class="relative">
              <input 
                v-model="editGitlabToken"
                :type="showToken ? 'text' : 'password'"
                placeholder="Insira seu private token..."
                class="app-input w-full pr-10"
              />
              <button 
                type="button"
                @click="showToken = !showToken"
                class="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <EyeOff v-if="showToken" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Diagnóstico de Conexão -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/[0.05] rounded-xl">
            <div class="text-left">
              <span class="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Verificar Credenciais</span>
              <p class="text-[9px] text-slate-450 dark:text-slate-500 mt-0.5">Testa a conexão com o GitLab sem salvar os dados ainda.</p>
            </div>
            <button 
              type="button" 
              @click="testConnection"
              class="btn-secondary text-[10px]"
            >
              Testar Conexão
            </button>
          </div>

          <!-- Mensagem de diagnóstico -->
          <div v-if="diagnosticStatus" class="p-3.5 rounded-xl text-[10px] font-bold flex items-center gap-2 border"
            :class="{
              'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400': diagnosticStatus === 'checking',
              'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400': diagnosticStatus === 'success',
              'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400': diagnosticStatus === 'error'
            }"
          >
            <Info class="w-4 h-4 shrink-0" />
            <span>{{ diagnosticMessage }}</span>
          </div>
        </div>

        <div class="w-full h-px bg-slate-200 dark:bg-white/[0.06] my-2"></div>

        <!-- Branches Config Section -->
        <div class="space-y-4">
          <h4 class="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
            <GitBranch class="w-3.5 h-3.5" />
            Nomes Físicos das Ramificações (Branches)
          </h4>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="text-[9px] font-black text-app-muted uppercase tracking-widest mb-1.5 block">Master (🔒 Protegida)</label>
              <AppInput v-model="editBranchMaster" placeholder="master-sistsocial" />
            </div>
            <div>
              <label class="text-[9px] font-black text-app-muted uppercase tracking-widest mb-1.5 block">Homologação</label>
              <AppInput v-model="editBranchHomologacao" placeholder="hml" />
            </div>
            <div>
              <label class="text-[9px] font-black text-app-muted uppercase tracking-widest mb-1.5 block">Desenvolvimento</label>
              <AppInput v-model="editBranchDesenvolvimento" placeholder="dev-06" />
            </div>
          </div>
        </div>

        <div class="w-full h-px bg-slate-200 dark:bg-white/[0.06] my-2"></div>

        <!-- Border Radius Config Section -->
        <div class="space-y-4">
          <h4 class="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
            <Settings class="w-3.5 h-3.5" />
            Ajuste de Arredondamento (Geometria Dinâmica)
          </h4>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Slider para Card Radius -->
            <div class="space-y-2">
              <div class="flex justify-between items-center">
                <label class="text-[9px] font-black text-app-muted uppercase tracking-widest">Arredondamento de Cards</label>
                <span class="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-[var(--app-input-radius)]">{{ editCardRadius }}px</span>
              </div>
              <input 
                type="range" 
                v-model.number="editCardRadius" 
                min="0" 
                max="32" 
                step="2"
                class="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
              />
            </div>

            <!-- Slider para Input Radius -->
            <div class="space-y-2">
              <div class="flex justify-between items-center">
                <label class="text-[9px] font-black text-app-muted uppercase tracking-widest">Arredondamento de Inputs/Botões</label>
                <span class="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-[var(--app-input-radius)]">{{ editInputRadius }}px</span>
              </div>
              <input 
                type="range" 
                v-model.number="editInputRadius" 
                min="0" 
                max="16" 
                step="1"
                class="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </BaseModal>

    <!-- ========================================== -->
    <!-- MODAL: CONFIRMAÇÃO DE MESCLAGEM (BaseModal) -->
    <!-- ========================================== -->
    <BaseModal 
      v-if="showMergeConfirmModal"
      title="Confirmar Mesclagem de Branch"
      subtitle="Mesclar código de feature no ambiente integrado"
      :icon="GitBranch"
      okText="Confirmar Mesclagem"
      cancelText="Cancelar"
      @close="showMergeConfirmModal = false"
      @cancel="showMergeConfirmModal = false"
      @ok="executeMergeAfterConfirm"
    >
      <div class="space-y-4 text-left">
        <div class="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-[var(--app-card-radius)] flex items-start gap-3">
          <Info class="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
          <div class="text-xs text-slate-600 dark:text-slate-350 leading-relaxed">
            <p class="font-bold text-indigo-700 dark:text-indigo-400 mb-1">Ação de Integração:</p>
            Você está prestes a mesclar a branch de feature 
            <span class="font-mono text-indigo-650 dark:text-indigo-300 font-bold bg-indigo-50 dark:bg-black/35 px-1.5 py-0.5 rounded-[var(--app-input-radius)]">{{ mergeConfirmSourceBranch }}</span> 
            no ambiente de destino 
            <span class="font-mono text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-black/35 px-1.5 py-0.5 rounded-[var(--app-input-radius)]">{{ mergeConfirmTargetBranch }}</span>.
          </div>
        </div>
      </div>
    </BaseModal>

    <!-- ========================================== -->
    <!-- MODAL: CONFIRMAÇÃO DE DELEÇÃO DOUBLE-CHECK -->
    <!-- ========================================== -->
    <BaseModal 
      v-if="showDeleteConfirmModal"
      title="Confirmar Exclusão de Branch"
      subtitle="ESTA AÇÃO É DESTRUTIVA E PERMANENTE"
      :icon="Trash2"
      iconBgColor="#ef4444"
      okText="Confirmar Deleção"
      cancelText="Cancelar"
      :okLoading="deleteLoading"
      @close="showDeleteConfirmModal = false"
      @cancel="showDeleteConfirmModal = false"
      @ok="executeDeleteBranch"
    >
      <div class="space-y-4 text-left">
        <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-[var(--app-card-radius)] flex items-start gap-3">
          <AlertTriangle class="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <p class="font-bold text-red-700 dark:text-white mb-1">Atenção Especial:</p>
            Você está prestes a excluir permanentemente a branch <span class="font-mono text-red-650 dark:text-red-400 font-bold bg-red-100 dark:bg-black/35 px-1.5 py-0.5 rounded-[var(--app-input-radius)]">{{ branchToDelete }}</span> do repositório remoto GitLab. Esta ação não poderá ser desfeita.
          </div>
        </div>


      </div>
    </BaseModal>

    <!-- ========================================== -->
    <!-- MODAL: CONFIRMAÇÃO DE DELEÇÃO EM LOTE -->
    <!-- ========================================== -->
    <BaseModal 
      v-if="showBulkDeleteModal"
      title="Excluir Branches em Lote"
      subtitle="ESTA AÇÃO REMOVERÁ VÁRIAS BRANCHES DE FEATURE"
      :icon="Trash2"
      iconBgColor="#ef4444"
      okText="Sim, Excluir Todas"
      cancelText="Cancelar"
      @close="showBulkDeleteModal = false"
      @cancel="showBulkDeleteModal = false"
      @ok="executeBulkDelete"
    >
      <div class="space-y-4 text-left">
        <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-[var(--app-card-radius)] flex items-start gap-3">
          <AlertTriangle class="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div class="text-xs text-slate-600 dark:text-slate-350 leading-relaxed">
            <p class="font-bold text-red-700 dark:text-white mb-1">Confirmação de Ação Destrutiva:</p>
            Você está prestes a excluir permanentemente as <span class="text-red-605 dark:text-red-400 font-bold font-mono">{{ selectedBranches.length }}</span> branches selecionadas abaixo do repositório remoto GitLab.
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-[9px] font-black text-slate-500 dark:text-app-muted uppercase tracking-widest block">
            Branches selecionadas para deleção:
          </label>
          <div class="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/[0.06] rounded-[var(--app-card-radius)] p-3 max-h-[160px] overflow-y-auto custom-scrollbar font-mono text-[10px] text-slate-650 dark:text-slate-400 space-y-1">
            <div v-for="name in selectedBranches" :key="name" class="truncate flex items-center gap-1.5 text-red-600 dark:text-red-300">
              <span class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
              {{ name }}
            </div>
          </div>
        </div>
      </div>
    </BaseModal>
  </div>
</template>

