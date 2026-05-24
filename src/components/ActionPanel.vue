<script setup>
import { Settings, RefreshCw } from 'lucide-vue-next';

defineProps({
  selectedBranches: {
    type: Array,
    required: true
  },
  branchesLoading: {
    type: Boolean,
    required: true
  },
  branchDesenvolvimento: {
    type: String,
    required: true
  },
  branchHomologacao: {
    type: String,
    required: true
  }
});

defineEmits([
  'list-all-branches',
  'merge-to-target',
  'bulk-delete'
]);
</script>

<template>
  <div class="space-y-4 text-left flex flex-col lg:h-full min-h-0 min-w-0">
    <div class="flex items-center justify-between h-6 shrink-0">
      <h4 class="text-[10px] font-black text-app-muted uppercase tracking-widest flex items-center gap-2">
        <Settings class="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        Controle
      </h4>
    </div>

    <!-- Painel de Controle de Ambiente e Ações -->
    <div class="app-card-panel flex flex-col justify-between gap-4 max-h-[calc(100vh-280px)] flex-1 min-h-0">

      <!-- Botões de Ações Centralizados e Harmonizados em Tamanho -->
      <div class="flex-1 flex flex-col gap-3 justify-center">
        <!-- Botão Listar branches (sempre visível e ativo) -->
        <button
          @click="$emit('list-all-branches')"
          :disabled="branchesLoading"
          class="btn btn-primary w-full py-4 px-2 flex-col gap-1 border border-indigo-500/20 cursor-pointer text-center shrink-0 shadow-lg shadow-indigo-500/10"
        >
          <span class="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': branchesLoading }" />
            Listar branches
          </span>
        </button>

        <!-- Divisor Visual caso tenhamos seleção -->
        <div v-if="selectedBranches.length > 0" class="w-full h-px bg-app-border-light my-1"></div>

        <!-- Botões DEV e HML (Habilitados apenas se exatamente 1 branch selecionada) -->
        <template v-if="selectedBranches.length === 1">
          <!-- Botão DEV (Desenvolvimento) -->
          <button
            @click="$emit('merge-to-target', branchDesenvolvimento || 'dev-06', 'dev')"
            class="btn w-full py-4 px-2 flex-col gap-1 border border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 cursor-pointer text-center shrink-0"
          >
            <span class="text-[11px] font-black uppercase tracking-wider">Mesclar com {{ branchDesenvolvimento || 'dev-06' }}</span>
          </button>

          <!-- Botão HML (Homologação) -->
          <button
            @click="$emit('merge-to-target', branchHomologacao || 'hml', 'hml')"
            class="btn w-full py-4 px-2 flex-col gap-1 border border-indigo-500 bg-indigo-500/10 text-indigo-655 dark:text-indigo-400 hover:bg-indigo-500/20 cursor-pointer text-center shrink-0"
          >
            <span class="text-[11px] font-black uppercase tracking-wider">Mesclar com {{ branchHomologacao || 'hml' }}</span>
          </button>
        </template>

        <!-- Botão Excluir (Habilitado se pelo menos 1 branch selecionada) -->
        <template v-if="selectedBranches.length >= 1">
          <button
            @click="$emit('bulk-delete')"
            class="btn w-full py-4 px-2 flex-col gap-1 border border-red-500 bg-red-500/10 text-red-650 dark:text-red-400 hover:bg-red-500/20 cursor-pointer text-center shrink-0 shadow-md"
          >
            <span class="text-[11px] font-black uppercase tracking-wider text-center">Excluir</span>
            <span class="text-[8px] font-bold">
              Marcadas: {{ selectedBranches.length }}
            </span>
          </button>
        </template>
      </div>

      <div class="pt-2 border-t border-app-border-light text-center shrink-0">
        <span class="text-[8px] font-black text-app-muted uppercase tracking-widest">Git</span>
      </div>
    </div>
  </div>
</template>
