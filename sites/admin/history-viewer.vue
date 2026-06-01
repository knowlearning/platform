<template>
  <v-card>
    <v-card-title>State History</v-card-title>
    <v-card-text>
      <div class="history-controls">
        <v-text-field
          v-model="inputId"
          label="State UUID"
          hint="Load a state history by UUID."
          persistent-hint
          :error-messages="inputErrors"
          @keydown.enter.prevent="submit"
        />
        <div class="history-actions">
          <v-btn
            color="primary"
            :loading="loading"
            :disabled="loading"
            @click="submit"
          >
            Load history
          </v-btn>
          <v-btn
            variant="text"
            :disabled="loading || !historyId"
            @click="downloadRaw"
          >
            Download raw
          </v-btn>
        </div>
      </div>

      <v-progress-linear
        v-if="loading"
        color="primary"
        indeterminate
        class="mt-4"
      />

      <v-alert
        v-if="error"
        type="error"
        class="mt-4"
      >
        {{ error }}
      </v-alert>

      <div
        v-else-if="historyId && !loading"
        class="mt-4"
      >
        <div class="history-summary">
          <v-chip>{{ historyId }}</v-chip>
          <v-chip>{{ historyEntries.length }} patches</v-chip>
          <v-chip>{{ selectedStepLabel }}</v-chip>
          <v-chip v-if="selectedEntry">{{ formatTimestamp(selectedEntry.timestamp) }}</v-chip>
          <v-chip v-else>Before first patch</v-chip>
        </div>

        <div class="history-scrubber">
          <v-slider
            v-model="selectedStepInput"
            :min="0"
            :max="historyEntries.length"
            :step="1"
            :disabled="historyEntries.length === 0"
            thumb-label
            hide-details
          />
          <v-text-field
            v-model.number="selectedStepInput"
            class="history-step-field"
            label="Step"
            type="number"
            density="compact"
            hide-details
            :min="0"
            :max="historyEntries.length"
          />
        </div>

        <v-row class="mt-2">
          <v-col
            cols="12"
            md="5"
          >
            <v-card variant="outlined">
              <v-card-title>Selected Patch</v-card-title>
              <v-card-text>
                <pre class="history-code">{{ selectedPatchText }}</pre>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md="7"
          >
            <v-card variant="outlined">
              <v-card-title>State Snapshot</v-card-title>
              <v-card-text>
                <pre class="history-code">{{ selectedSnapshotText }}</pre>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { validate as isUUID } from 'uuid'
import { applyHistoryPatch } from './history-patch.js'

const CHECKPOINT_INTERVAL = 50

const route = useRoute()
const router = useRouter()

const inputId = ref('')
const historyId = ref('')
const loading = ref(false)
const error = ref('')
const historyEntries = ref([])
const selectedStep = ref(0)

let snapshotCache = new Map([[0, {}]])

const trimmedInput = computed(() => inputId.value.trim())

const inputErrors = computed(() => {
  if (!trimmedInput.value) return []
  return isUUID(trimmedInput.value) ? [] : ['Enter a valid UUID.']
})

const selectedStepInput = computed({
  get() {
    return selectedStep.value
  },
  set(value) {
    selectedStep.value = normalizeStep(value)
  }
})

const selectedEntry = computed(() => {
  if (selectedStep.value === 0) return null
  return historyEntries.value[selectedStep.value - 1] || null
})

const selectedSnapshot = computed(() => getSnapshotAtStep(selectedStep.value))

const selectedPatchText = computed(() => {
  if (!selectedEntry.value) {
    return 'No patch selected yet. Move the scrubber to step 1 or later.'
  }
  return JSON.stringify(selectedEntry.value.patch, null, 2)
})

const selectedSnapshotText = computed(() => JSON.stringify(selectedSnapshot.value, null, 2))

const selectedStepLabel = computed(() => {
  if (selectedStep.value === 0) return 'Step 0'
  return `Step ${selectedStep.value} of ${historyEntries.value.length}`
})

watch(
  () => route.query.id,
  async (value) => {
    const id = typeof value === 'string' ? value.trim() : ''
    inputId.value = id

    if (!id) {
      resetHistory()
      return
    }

    if (!isUUID(id)) {
      resetHistory(id)
      error.value = 'History view currently supports UUID lookups.'
      return
    }

    await loadHistory(id)
  },
  { immediate: true }
)

async function submit() {
  if (!trimmedInput.value) {
    await router.replace({ path: '/history' })
    return
  }

  if (!isUUID(trimmedInput.value)) {
    error.value = 'Enter a valid UUID to load history.'
    return
  }

  if (route.query.id === trimmedInput.value) {
    await loadHistory(trimmedInput.value)
    return
  }

  await router.replace({
    path: '/history',
    query: { id: trimmedInput.value }
  })
}

function resetHistory(id='') {
  historyId.value = id
  error.value = ''
  historyEntries.value = []
  selectedStep.value = 0
  snapshotCache = new Map([[0, {}]])
}

async function loadHistory(id) {
  loading.value = true
  error.value = ''
  historyId.value = id
  historyEntries.value = []
  selectedStep.value = 0
  snapshotCache = new Map([[0, {}]])

  try {
    const text = await Agent.download(id).then(response => response.text())
    const entries = parseHistory(text)

    historyEntries.value = entries
    seedCheckpoints(entries)
    selectedStep.value = entries.length
  }
  catch (caughtError) {
    resetHistory(id)
    error.value = caughtError?.message || String(caughtError)
  }
  finally {
    loading.value = false
  }
}

function parseHistory(text) {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  return lines.map((line, index) => {
    const separatorIndex = line.indexOf(' ')
    if (separatorIndex < 1) {
      throw new Error(`Could not parse history line ${index + 1}.`)
    }

    const timestamp = Number.parseInt(line.slice(0, separatorIndex), 10)
    if (!Number.isFinite(timestamp)) {
      throw new Error(`History line ${index + 1} has an invalid timestamp.`)
    }

    const patch = JSON.parse(line.slice(separatorIndex + 1))
    if (!Array.isArray(patch)) {
      throw new Error(`History line ${index + 1} does not contain a patch array.`)
    }

    return {
      timestamp,
      patch
    }
  })
}

function seedCheckpoints(entries) {
  let snapshot = {}
  snapshotCache = new Map([[0, snapshot]])

  entries.forEach((entry, index) => {
    snapshot = applyCustomPatch(snapshot, entry.patch)
    const step = index + 1

    if (step % CHECKPOINT_INTERVAL === 0 || step === entries.length) {
      snapshotCache.set(step, snapshot)
    }
  })
}

function getSnapshotAtStep(step) {
  const normalizedStep = normalizeStep(step)
  if (snapshotCache.has(normalizedStep)) {
    return snapshotCache.get(normalizedStep)
  }

  const checkpointStep = Math.floor(normalizedStep / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL
  let snapshot = structuredClone(snapshotCache.get(checkpointStep) || {})

  for (let index = checkpointStep; index < normalizedStep; index += 1) {
    snapshot = applyCustomPatch(snapshot, historyEntries.value[index].patch)
  }

  snapshotCache.set(normalizedStep, snapshot)
  return snapshot
}

function applyCustomPatch(snapshot, patch) {
  return applyHistoryPatch(snapshot, patch)
}

function normalizeStep(value) {
  const parsedValue = Number.parseInt(value, 10)
  if (!Number.isFinite(parsedValue)) return 0
  return Math.max(0, Math.min(parsedValue, historyEntries.value.length))
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString()
}

function downloadRaw() {
  if (!historyId.value) return
  Agent.download(historyId.value).direct()
}
</script>

<style scoped>
.history-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: start;
}

.history-controls > :first-child {
  flex: 1 1 360px;
}

.history-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 56px;
}

.history-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.history-scrubber {
  display: grid;
  gap: 12px;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) 120px;
}

.history-step-field {
  max-width: 120px;
}

.history-code {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: monospace;
}

@media (max-width: 720px) {
  .history-scrubber {
    grid-template-columns: 1fr;
  }

  .history-step-field {
    max-width: none;
  }
}
</style>
