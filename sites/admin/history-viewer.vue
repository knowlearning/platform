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

        <div class="history-replay-options">
          <v-checkbox
            v-model="skipBrokenPatches"
            label="Skip broken patches while replaying"
            density="compact"
            hide-details
          />
          <v-chip
            v-if="skipBrokenPatches && skippedReplayFailures.length > 0"
            size="small"
          >
            {{ skippedReplayFailures.length }} skipped
          </v-chip>
        </div>

        <v-alert
          v-if="replayFailure"
          type="warning"
          class="mt-4"
        >
          Replay failed at step {{ replayFailure.step }}, operation {{ replayFailure.failedPosition === null ? '?' : replayFailure.failedPosition + 1 }} of {{ replayFailure.orderedPatch.length }}.
          {{ replayFailure.message }}
        </v-alert>

        <v-card
          v-if="skipBrokenPatches && skippedReplayFailuresWithEntries.length > 0"
          variant="outlined"
          class="mt-4"
        >
          <v-card-title>Skipped Broken Patches</v-card-title>
          <v-card-text>
            <div class="history-replay-actions">
              <v-chip>{{ skippedReplayFailures.length }} skipped through step {{ selectedStep }}</v-chip>
            </div>

            <div class="history-operation-list">
              <div
                v-for="failure in skippedReplayFailuresWithEntries"
                :key="`skipped:${failure.step}`"
                class="history-operation-item"
              >
                <div class="history-operation-toolbar">
                  <div class="history-operation-chips">
                    <v-chip size="small">Step {{ failure.step }}</v-chip>
                    <v-chip
                      v-if="failure.entry"
                      size="small"
                      variant="outlined"
                    >
                      {{ formatTimestamp(failure.entry.timestamp) }}
                    </v-chip>
                    <v-chip
                      size="small"
                      color="warning"
                    >
                      Operation {{ failure.failedPosition === null ? '?' : failure.failedPosition + 1 }}
                    </v-chip>
                  </div>

                  <div class="history-operation-buttons">
                    <v-btn
                      size="x-small"
                      variant="text"
                      @click="jumpToStep(failure.step)"
                    >
                      Jump
                    </v-btn>
                  </div>
                </div>

                <div class="history-failure-message">{{ failure.message }}</div>
                <pre class="history-code">{{ JSON.stringify(failure.orderedPatch, null, 2) }}</pre>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <v-card
          v-if="replayFailureEntry"
          variant="outlined"
          class="mt-4"
        >
          <v-card-title>Reorder Failing Operations</v-card-title>
          <v-card-text>
            <div class="history-replay-actions">
              <v-chip>Failing step {{ replayFailure.step }}</v-chip>
              <v-btn
                size="small"
                variant="tonal"
                @click="jumpToFailureStep"
              >
                Jump to step
              </v-btn>
              <v-btn
                size="small"
                variant="text"
                :disabled="!hasCustomOperationOrder(replayFailure.step)"
                @click="resetOperationOrder(replayFailure.step)"
              >
                Reset order
              </v-btn>
            </div>

            <div class="history-operation-list">
              <div
                v-for="(item, applyIndex) in replayFailureOperations"
                :key="`${replayFailure.step}:${item.originalIndex}:${applyIndex}`"
                class="history-operation-item"
              >
                <div class="history-operation-toolbar">
                  <div class="history-operation-chips">
                    <v-chip size="small">Apply {{ applyIndex + 1 }}</v-chip>
                    <v-chip
                      size="small"
                      variant="outlined"
                    >
                      Original {{ item.originalIndex + 1 }}
                    </v-chip>
                    <v-chip
                      v-if="replayFailure.failedPosition === applyIndex"
                      size="small"
                      color="warning"
                    >
                      Fails here
                    </v-chip>
                  </div>

                  <div class="history-operation-buttons">
                    <v-btn
                      size="x-small"
                      variant="text"
                      :disabled="applyIndex === 0"
                      @click="moveOperation(replayFailure.step, applyIndex, -1)"
                    >
                      Up
                    </v-btn>
                    <v-btn
                      size="x-small"
                      variant="text"
                      :disabled="applyIndex === replayFailureOperations.length - 1"
                      @click="moveOperation(replayFailure.step, applyIndex, 1)"
                    >
                      Down
                    </v-btn>
                  </div>
                </div>

                <pre class="history-code">{{ JSON.stringify(item.operation, null, 2) }}</pre>
              </div>
            </div>
          </v-card-text>
        </v-card>

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
              <v-card-title>{{ selectedSnapshotTitle }}</v-card-title>
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
import {
  defaultHistoryOperationOrder,
  inspectHistoryPatchApplication,
  orderHistoryPatch
} from './history-patch.js'

const CHECKPOINT_INTERVAL = 50

const route = useRoute()
const router = useRouter()

const inputId = ref('')
const historyId = ref('')
const loading = ref(false)
const error = ref('')
const historyEntries = ref([])
const selectedStep = ref(0)
const patchOperationOrders = ref({})
const skipBrokenPatches = ref(false)

let snapshotCache = new Map([[0, { snapshot: {}, skippedFailures: [] }]])

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

const selectedSnapshotResult = computed(() => getSnapshotResultAtStep(selectedStep.value))

const selectedSnapshot = computed(() => selectedSnapshotResult.value.snapshot)

const replayFailure = computed(() => selectedSnapshotResult.value.error)

const skippedReplayFailures = computed(() => selectedSnapshotResult.value.skippedFailures || [])

const replayFailureEntry = computed(() => {
  if (!replayFailure.value) return null
  return historyEntries.value[replayFailure.value.step - 1] || null
})

const skippedReplayFailuresWithEntries = computed(() => skippedReplayFailures.value.map(failure => ({
  ...failure,
  entry: historyEntries.value[failure.step - 1] || null
})))

const replayFailureOperations = computed(() => {
  if (!replayFailure.value || !replayFailureEntry.value) return []

  return getOperationOrder(replayFailure.value.step, replayFailureEntry.value.patch)
    .map((originalIndex, applyIndex) => ({
      applyIndex,
      originalIndex,
      operation: replayFailureEntry.value.patch[originalIndex]
    }))
})

const selectedPatchText = computed(() => {
  if (!selectedEntry.value) {
    return 'No patch selected yet. Move the scrubber to step 1 or later.'
  }

  return JSON.stringify(
    orderHistoryPatch(
      selectedEntry.value.patch,
      getOperationOrder(selectedStep.value, selectedEntry.value.patch)
    ),
    null,
    2
  )
})

const selectedSnapshotText = computed(() => JSON.stringify(selectedSnapshot.value, null, 2))

const selectedSnapshotTitle = computed(() => {
  if (!replayFailure.value) return 'State Snapshot'
  return `State Snapshot Through Step ${replayFailure.value.step - 1}`
})

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

watch(skipBrokenPatches, () => {
  resetSnapshotCache()
})

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
  patchOperationOrders.value = {}
  skipBrokenPatches.value = false
  resetSnapshotCache()
}

async function loadHistory(id) {
  loading.value = true
  error.value = ''
  historyId.value = id
  historyEntries.value = []
  selectedStep.value = 0
  patchOperationOrders.value = {}
  skipBrokenPatches.value = false
  resetSnapshotCache()

  try {
    const text = await Agent.download(id).then(response => response.text())
    const entries = parseHistory(text)

    historyEntries.value = entries
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

    const timestamp = Number(line.slice(0, separatorIndex))
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

function getSnapshotResultAtStep(step) {
  const normalizedStep = normalizeStep(step)
  if (snapshotCache.has(normalizedStep)) {
    return {
      ...snapshotCache.get(normalizedStep),
      error: null
    }
  }

  const cachedStep = getNearestCachedStep(normalizedStep)
  const cachedResult = snapshotCache.get(cachedStep) || { snapshot: {}, skippedFailures: [] }
  let snapshot = cachedResult.snapshot
  let skippedFailures = [...cachedResult.skippedFailures]

  for (let index = cachedStep; index < normalizedStep; index += 1) {
    const stepNumber = index + 1
    const entry = historyEntries.value[index]
    const result = inspectHistoryPatchApplication(
      snapshot,
      entry.patch,
      getOperationOrder(stepNumber, entry.patch)
    )

    if (!result.ok) {
      const failure = {
        step: stepNumber,
        orderedPatch: result.orderedPatch,
        operationOrder: result.operationOrder,
        ...result.error
      }

      if (skipBrokenPatches.value) {
        skippedFailures.push(failure)

        if (stepNumber % CHECKPOINT_INTERVAL === 0 || stepNumber === normalizedStep) {
          snapshotCache.set(stepNumber, {
            snapshot,
            skippedFailures: [...skippedFailures]
          })
        }

        continue
      }

      return {
        snapshot,
        skippedFailures,
        error: failure
      }
    }

    snapshot = result.snapshot

    if (stepNumber % CHECKPOINT_INTERVAL === 0 || stepNumber === normalizedStep) {
      snapshotCache.set(stepNumber, {
        snapshot,
        skippedFailures: [...skippedFailures]
      })
    }
  }

  return {
    snapshot,
    skippedFailures,
    error: null
  }
}

function getNearestCachedStep(step) {
  let nearest = 0

  snapshotCache.forEach((_, cachedStep) => {
    if (cachedStep <= step && cachedStep > nearest) nearest = cachedStep
  })

  return nearest
}

function getOperationOrder(step, patch=[]) {
  return patchOperationOrders.value[step] || defaultHistoryOperationOrder(patch)
}

function hasCustomOperationOrder(step) {
  return !!patchOperationOrders.value[step]
}

function moveOperation(step, applyIndex, offset) {
  const entry = historyEntries.value[step - 1]
  if (!entry) return

  const nextIndex = applyIndex + offset
  if (nextIndex < 0 || nextIndex >= entry.patch.length) return

  const nextOrder = [...getOperationOrder(step, entry.patch)]
  const [moved] = nextOrder.splice(applyIndex, 1)
  nextOrder.splice(nextIndex, 0, moved)

  patchOperationOrders.value = {
    ...patchOperationOrders.value,
    [step]: nextOrder
  }

  resetSnapshotCache()
}

function resetOperationOrder(step) {
  if (!patchOperationOrders.value[step]) return

  const nextOrders = { ...patchOperationOrders.value }
  delete nextOrders[step]
  patchOperationOrders.value = nextOrders

  resetSnapshotCache()
}

function jumpToFailureStep() {
  if (!replayFailure.value) return
  jumpToStep(replayFailure.value.step)
}

function jumpToStep(step) {
  selectedStep.value = normalizeStep(step)
}

function resetSnapshotCache() {
  snapshotCache = new Map([[0, { snapshot: {}, skippedFailures: [] }]])
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

.history-replay-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.history-replay-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 12px;
}

.history-operation-list {
  display: grid;
  gap: 12px;
}

.history-operation-item {
  padding: 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
}

.history-operation-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.history-operation-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-operation-buttons {
  display: flex;
  gap: 8px;
}

.history-failure-message {
  margin-bottom: 8px;
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
