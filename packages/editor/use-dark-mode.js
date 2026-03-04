import { ref, onMounted, onBeforeUnmount } from 'vue'

export default function useDarkMode() {
  const isDark = ref(false)

  onMounted(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => (isDark.value = mql.matches)
    sync()

    // Safari < 14 fallback
    if (mql.addEventListener) mql.addEventListener('change', sync)
    else mql.addListener(sync)

    onBeforeUnmount(() => {
      if (!mql) return
      if (mql.removeEventListener) mql.removeEventListener('change', sync)
      else mql.removeListener(sync)
    })
  })

  return isDark
}