import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { db } from '../db.js';

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref('dark');
  const gitlabUrl = ref('https://git.lliege.com.br/POCS/ci');
  const gitlabProjectId = ref('');
  const gitlabToken = ref('');
  
  // Customizações dos nomes físicos das branches
  const branchMaster = ref('master-sistsocial');
  const branchHomologacao = ref('hml');
  const branchDesenvolvimento = ref('dev-06');
  
  const consoleFontSize = ref(11); // Tamanho em pixels
  const cardRadius = ref(16); // Em pixels
  const inputRadius = ref(8); // Em pixels

  const isInitialized = ref(false);

  // Carrega configurações do IndexedDB
  const loadSettings = async () => {
    try {
      const allSettings = await db.settings.toArray();
      const settingsMap = Object.fromEntries(allSettings.map(s => [s.key, s.value]));

      if (settingsMap['theme'] !== undefined) theme.value = settingsMap['theme'];
      if (settingsMap['gitlabUrl'] !== undefined) gitlabUrl.value = settingsMap['gitlabUrl'];
      if (settingsMap['gitlabProjectId'] !== undefined) gitlabProjectId.value = settingsMap['gitlabProjectId'];
      if (settingsMap['gitlabToken'] !== undefined) gitlabToken.value = settingsMap['gitlabToken'];
      if (settingsMap['branchMaster'] !== undefined) branchMaster.value = settingsMap['branchMaster'];
      if (settingsMap['branchHomologacao'] !== undefined) branchHomologacao.value = settingsMap['branchHomologacao'];
      if (settingsMap['branchDesenvolvimento'] !== undefined) branchDesenvolvimento.value = settingsMap['branchDesenvolvimento'];
      if (settingsMap['consoleFontSize'] !== undefined) consoleFontSize.value = parseInt(settingsMap['consoleFontSize'], 10);
      if (settingsMap['cardRadius'] !== undefined) cardRadius.value = parseInt(settingsMap['cardRadius'], 10);
      if (settingsMap['inputRadius'] !== undefined) inputRadius.value = parseInt(settingsMap['inputRadius'], 10);

      // Aplicar tema e raios carregados
      applyTheme(theme.value);
      applyRadius(cardRadius.value, inputRadius.value);

      isInitialized.value = true;
    } catch (error) {
      console.error("Erro ao carregar configurações do BreatheDB", error);
    }
  };

  // Salva uma única configuração
  const saveSetting = async (key, value) => {
    try {
      await db.settings.put({ key, value });
    } catch (error) {
      console.error(`Erro ao salvar configuração ${key}`, error);
    }
  };

  // Salva todas as configurações de uma vez
  const saveAllSettings = async () => {
    const settingsToSave = [
      { key: 'theme', value: theme.value },
      { key: 'gitlabUrl', value: gitlabUrl.value },
      { key: 'gitlabProjectId', value: gitlabProjectId.value },
      { key: 'gitlabToken', value: gitlabToken.value },
      { key: 'branchMaster', value: branchMaster.value },
      { key: 'branchHomologacao', value: branchHomologacao.value },
      { key: 'branchDesenvolvimento', value: branchDesenvolvimento.value },
      { key: 'consoleFontSize', value: consoleFontSize.value },
      { key: 'cardRadius', value: cardRadius.value },
      { key: 'inputRadius', value: inputRadius.value }
    ];

    try {
      await db.settings.bulkPut(settingsToSave);
      console.log("[BreatheStore] Configurações persistidas no IndexedDB");
    } catch (error) {
      console.error("Erro ao salvar lote de configurações no IndexedDB", error);
    }
  };

  const applyTheme = (val) => {
    if (val === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  };

  const applyRadius = (cardRad, inputRad) => {
    document.documentElement.style.setProperty('--app-card-radius', `${cardRad}px`);
    document.documentElement.style.setProperty('--app-input-radius', `${inputRad}px`);
  };

  // Observa mudanças de tema
  watch(theme, (newTheme) => {
    applyTheme(newTheme);
    saveSetting('theme', newTheme);
  });

  watch(cardRadius, (newVal) => {
    document.documentElement.style.setProperty('--app-card-radius', `${newVal}px`);
    saveSetting('cardRadius', newVal);
  });

  watch(inputRadius, (newVal) => {
    document.documentElement.style.setProperty('--app-input-radius', `${newVal}px`);
    saveSetting('inputRadius', newVal);
  });

  return {
    theme,
    gitlabUrl,
    gitlabProjectId,
    gitlabToken,
    branchMaster,
    branchHomologacao,
    branchDesenvolvimento,
    consoleFontSize,
    cardRadius,
    inputRadius,
    isInitialized,
    loadSettings,
    saveSetting,
    saveAllSettings
  };
});
